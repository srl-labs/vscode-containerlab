// file: KeyboardManager.ts
// Manages keyboard shortcuts and handlers for the topology viewer

import type cytoscape from "cytoscape";
import { log } from "../../platform/logging/logger";
import type { GroupManager } from "../groups/GroupManager";
import type { CopyPasteManager } from "../nodes/CopyPasteManager";
import type { FreeTextManager } from "../annotations/FreeTextManager";
import type { FreeShapesManager } from "../annotations/FreeShapesManager";
import type { SaveManager } from "../../core/SaveManager";

export interface KeyboardManagerDependencies {
  cy: cytoscape.Core;
  getGroupManager: () => GroupManager;
  getCopyPasteManager: () => CopyPasteManager;
  getFreeTextManager: () => FreeTextManager | undefined;
  getFreeShapesManager: () => FreeShapesManager | undefined;
  getSaveManager: () => SaveManager;
  isLocked: () => boolean;
  isEditorMode: () => boolean;
  getCurrentMode: () => "edit" | "view";
  showLockedMessage: () => void;
}

// eslint-disable-next-line no-unused-vars
type KeyHandler = (event: KeyboardEvent) => void;

export class KeyboardManager {
  private static readonly CLASS_PANEL_OVERLAY = "panel-overlay" as const;

  private cy: cytoscape.Core;
  private deps: KeyboardManagerDependencies;
  private keyHandlers: Record<string, KeyHandler>;

  constructor(deps: KeyboardManagerDependencies) {
    this.cy = deps.cy;
    this.deps = deps;

    this.keyHandlers = {
      delete: (event) => {
        event.preventDefault();
        this.handleDeleteKeyPress();
      },
      backspace: (event) => {
        event.preventDefault();
        this.handleDeleteKeyPress();
      },
      g: () => {
        this.deps.getGroupManager().viewportButtonsAddGroup();
      },
      "ctrl+a": (event) => {
        event.preventDefault();
        this.handleSelectAll();
      },
      "ctrl+c": (event) => {
        event.preventDefault();
        this.deps.getCopyPasteManager().handleCopy();
      },
      "ctrl+v": (event) => {
        if (!this.deps.isEditorMode()) {
          return;
        }
        event.preventDefault();
        this.deps.getCopyPasteManager().handlePaste();
      },
      "ctrl+x": (event) => {
        if (!this.deps.isEditorMode()) {
          return;
        }
        event.preventDefault();
        this.handleCutKeyPress();
      },
      "ctrl+d": (event) => {
        if (!this.deps.isEditorMode()) {
          return;
        }
        event.preventDefault();
        this.deps.getCopyPasteManager().handleDuplicate();
      }
    };
  }

  public registerEditModeKeyboardEvents(): void {
    document.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  public registerViewModeKeyboardEvents(): void {
    document.addEventListener("keydown", (event) => {
      if (this.deps.getCurrentMode() !== "view") {
        return;
      }
      if (!this.shouldHandleKeyboardEvent(event)) {
        return;
      }
      if (event.ctrlKey && event.key === "a") {
        event.preventDefault();
        this.handleSelectAll();
      }
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.shouldHandleKeyboardEvent(event)) {
      return;
    }
    if (this.deps.isLocked()) {
      this.deps.showLockedMessage();
      return;
    }
    const key = event.key.toLowerCase();
    const combo = `${event.ctrlKey ? "ctrl+" : ""}${key}`;
    const handler = this.keyHandlers[combo] || this.keyHandlers[key];
    if (handler) {
      handler(event);
    }
  }

  public shouldHandleKeyboardEvent(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;

    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.contentEditable === "true" ||
      target.isContentEditable
    ) {
      return false;
    }

    if (target.tagName === "SELECT") {
      return false;
    }

    const isInDialog = target.closest(
      `.free-text-dialog, .${KeyboardManager.CLASS_PANEL_OVERLAY}, .dropdown-menu`
    );
    const isInOurConfirmDialog = target.closest(".delete-confirmation-dialog");

    if (isInDialog && !isInOurConfirmDialog) {
      return false;
    }

    const cyContainer = document.getElementById("cy");
    const isInCyContainer = cyContainer && (target === cyContainer || cyContainer.contains(target));
    const isDocumentBody = target === document.body;

    return isDocumentBody || isInCyContainer || target.tagName === "CANVAS";
  }

  public handleSelectAll(): void {
    const selectableElements = this.cy.$("node, edge").filter((element) => {
      return element.selectable();
    });

    this.cy.$(":selected").unselect();
    selectableElements.select();

    log.debug(`Selected ${selectableElements.length} elements with Ctrl+A`);
  }

  public async handleDeleteKeyPress(): Promise<void> {
    const selectedElements = this.cy.$(":selected");

    if (selectedElements.length === 0) {
      return;
    }

    if (selectedElements.length > 1) {
      const result = await (window as any).showDeleteConfirm(null, selectedElements.length);
      if (!result) {
        return;
      }
    }

    const selectedNodes = selectedElements.nodes();
    selectedNodes.forEach((node) => {
      const topoViewerRole = node.data("topoViewerRole");

      if (topoViewerRole === "freeText") {
        this.deps.getFreeTextManager()?.removeFreeTextAnnotation(node.id());
      } else if (topoViewerRole === "freeShape") {
        this.deps.getFreeShapesManager()?.removeFreeShapeAnnotation(node.id());
      } else if (topoViewerRole === "group") {
        if (this.deps.isEditorMode()) {
          log.debug(`Delete key: removing group ${node.id()}`);
          this.deps.getGroupManager()?.directGroupRemoval(node.id());
        }
      } else {
        const isNodeInEditMode = node.data("editor") === "true";
        if (this.deps.isEditorMode() && isNodeInEditMode) {
          log.debug(`Delete key: removing node ${node.data("extraData")?.longname || node.id()}`);
          node.remove();
        }
      }
    });

    const selectedEdges = selectedElements.edges();
    selectedEdges.forEach((edge) => {
      if (this.deps.isEditorMode()) {
        log.debug(`Delete key: removing edge ${edge.id()}`);
        edge.remove();
      }
    });
  }

  public async handleCutKeyPress(): Promise<void> {
    this.deps.getCopyPasteManager().handleCopy();

    const selectedElements = this.cy.$(":selected");
    if (selectedElements.length === 0) {
      return;
    }

    const selectedNodes = selectedElements.nodes();
    selectedNodes.forEach((node) => {
      const topoViewerRole = node.data("topoViewerRole");

      if (topoViewerRole === "freeText") {
        this.deps.getFreeTextManager()?.removeFreeTextAnnotation(node.id());
      } else if (topoViewerRole === "group") {
        if (this.deps.isEditorMode()) {
          this.deps.getGroupManager()?.directGroupRemoval(node.id());
        }
      } else {
        const isNodeInEditMode = this.deps.getCurrentMode() === "edit";
        if (this.deps.isEditorMode() && isNodeInEditMode) {
          node.remove();
        }
      }
    });

    const selectedEdges = selectedElements.edges();
    selectedEdges.forEach((edge) => {
      if (this.deps.isEditorMode()) {
        edge.remove();
      }
    });

    await this.deps.getSaveManager().saveTopo(this.cy, true);
  }
}
