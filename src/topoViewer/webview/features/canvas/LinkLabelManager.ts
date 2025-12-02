// file: LinkLabelManager.ts

import cytoscape from 'cytoscape';
import { log } from '../../platform/logging/logger';
import topoViewerState from '../../app/state';
import { normalizeLinkLabelMode, type LinkLabelMode, linkLabelModeLabel } from '../../types/linkLabelMode';

const EDGE_HIGHLIGHT_CLASS = 'link-label-highlight-edge';
const NODE_HIGHLIGHT_CLASS = 'link-label-highlight-node';
const STYLE_TEXT_OPACITY = 'text-opacity';
const STYLE_TEXT_BACKGROUND_OPACITY = 'text-background-opacity';
const LINK_LABEL_BUTTON_ID = 'viewport-link-label-button';
const LINK_LABEL_MENU_ID = 'viewport-link-label-menu';

/**
 * Manages link label visibility and highlighting behaviour for edges.
 */
export class ManagerLabelEndpoint {
  private cy: cytoscape.Core | null = null;
  private currentMode: LinkLabelMode = topoViewerState.linkLabelMode;
  private readonly selectionHandler: () => void;

  public constructor() {
    this.selectionHandler = () => {
      if (this.currentMode === 'on-select') {
        this.applyMode(this.currentMode);
      }
    };
  }

  /**
   * Bind the manager to a Cytoscape instance.
   */
  public initialize(cy: cytoscape.Core): void {
    if (this.cy === cy) {
      this.applyMode(this.currentMode);
      this.syncMenu();
      return;
    }

    if (this.cy) {
      this.detachEventHandlers(this.cy);
    }

    this.cy = cy;
    this.currentMode = topoViewerState.linkLabelMode;
    this.attachEventHandlers(cy);
    this.applyMode(this.currentMode);
    this.syncMenu();
    log.debug(`Link label manager initialized with mode: ${this.currentMode}`);
  }

  /**
   * Update the active link label mode.
   */
  public setMode(mode: string | LinkLabelMode): void {
    const normalized = normalizeLinkLabelMode(mode);
    if (normalized === this.currentMode && topoViewerState.linkLabelMode === normalized) {
      this.syncMenu();
      return;
    }

    this.currentMode = normalized;
    topoViewerState.linkLabelMode = normalized;

    log.info(`Link label mode set to: ${normalized}`);
    if (this.cy) {
      this.applyMode(normalized);
    }
    this.syncMenu();
  }

  /**
   * Re-apply the mode after Cytoscape styles are refreshed.
   */
  public refreshAfterStyle(): void {
    if (!this.cy) {
      return;
    }
    this.applyMode(this.currentMode);
    this.syncMenu();
  }

  private attachEventHandlers(cy: cytoscape.Core): void {
    cy.on('select', 'node,edge', this.selectionHandler);
    cy.on('unselect', 'node,edge', this.selectionHandler);
  }

  private detachEventHandlers(cy: cytoscape.Core): void {
    cy.off('select', 'node,edge', this.selectionHandler);
    cy.off('unselect', 'node,edge', this.selectionHandler);
  }

  private applyMode(mode: LinkLabelMode): void {
    const cy = this.cy;
    if (!cy) {
      return;
    }

    cy.nodes().removeClass(NODE_HIGHLIGHT_CLASS);
    cy.edges().removeClass(EDGE_HIGHLIGHT_CLASS);

    if (mode === 'hide') {
      cy.edges().forEach(edge => {
        edge.style(STYLE_TEXT_OPACITY, 0);
        edge.style(STYLE_TEXT_BACKGROUND_OPACITY, 0);
      });
      return;
    }

    if (mode === 'show-all') {
      cy.edges().forEach(edge => {
        edge.style(STYLE_TEXT_OPACITY, 1);
        edge.style(STYLE_TEXT_BACKGROUND_OPACITY, 0.7);
      });
      return;
    }

    // on-select behaviour
    cy.edges().forEach(edge => {
      edge.style(STYLE_TEXT_OPACITY, 0);
      edge.style(STYLE_TEXT_BACKGROUND_OPACITY, 0);
    });

    const selectedNodes = cy.nodes(':selected');
    const selectedEdges = cy.edges(':selected');

    const edgesToHighlight = selectedEdges.union(selectedNodes.connectedEdges());
    edgesToHighlight.forEach(edge => {
      edge.addClass(EDGE_HIGHLIGHT_CLASS);
      edge.style(STYLE_TEXT_OPACITY, 1);
      edge.style(STYLE_TEXT_BACKGROUND_OPACITY, 0.7);
    });

    const nodesToHighlight = selectedNodes.union(selectedEdges.connectedNodes());
    nodesToHighlight.forEach(node => {
      node.addClass(NODE_HIGHLIGHT_CLASS);
    });
  }

  private syncMenu(): void {
    const menu = document.getElementById(LINK_LABEL_MENU_ID);
    if (menu) {
      const options = menu.querySelectorAll<HTMLButtonElement>('[data-mode]');
      options.forEach(option => {
        const optionMode = normalizeLinkLabelMode(option.dataset.mode ?? '');
        const isSelected = optionMode === this.currentMode;
        option.dataset.selected = isSelected ? 'true' : 'false';
        option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      });
    }

    const trigger = document.getElementById(LINK_LABEL_BUTTON_ID) as HTMLButtonElement | null;
    if (trigger) {
      const label = linkLabelModeLabel(this.currentMode);
      const description = `Link labels: ${label}`;
      trigger.dataset.mode = this.currentMode;
      trigger.setAttribute('aria-label', description);
      trigger.setAttribute('title', description);
    }
  }
}
