// file: ModeManager.ts
// Manages mode switching between viewer and editor modes

import { log } from "../platform/logging/logger";
import topoViewerState from "../app/state";

type ViewerParamsPayload = {
  lockLabByDefault?: boolean;
  currentLabPath?: string;
  deploymentState?: string;
  viewerMode?: string;
};

type EditorParamsPayload = {
  lockLabByDefault?: boolean;
  imageMapping?: Record<string, string>;
  ifacePatternMapping?: Record<string, string>;
  defaultKind?: string;
  defaultType?: string;
  updateLinkEndpointsOnKindChange?: boolean;
  customNodes?: any[];
  defaultNode?: string;
  topologyDefaults?: Record<string, unknown>;
  topologyKinds?: Record<string, unknown>;
  topologyGroups?: Record<string, unknown>;
  dockerImages?: string[];
  currentLabPath?: string;
  customIcons?: Record<string, string>;
};

export interface ModeSwitchPayload {
  mode: "viewer" | "editor" | string;
  deploymentState?: string;
  viewerParams?: ViewerParamsPayload;
  editorParams?: EditorParamsPayload;
}

export interface ModeManagerDependencies {
  getCurrentMode: () => "edit" | "view";
  setCurrentMode: (mode: "edit" | "view") => void;
  setIsViewportDrawerClabEditorChecked: (checked: boolean) => void;
  applyLockState: (locked: boolean) => void;
  setLabLocked: (locked: boolean) => void;
  getLabLocked: () => boolean;
  fetchAndLoadData: () => Promise<void>;
  isInitialGraphLoaded: () => boolean;
  setInitialGraphLoaded: (loaded: boolean) => void;
  ensureModeResources: (mode: "edit" | "view") => Promise<void>;
  clearEdgeLinkStates: () => void;
  initializeContextMenu: () => Promise<void>;
}

export class ModeManager {
  private deps: ModeManagerDependencies;
  private modeTransitionInProgress = false;

  constructor(deps: ModeManagerDependencies) {
    this.deps = deps;
  }

  public isTransitionInProgress(): boolean {
    return this.modeTransitionInProgress;
  }

  public async handleModeSwitchMessage(payload: ModeSwitchPayload): Promise<void> {
    if (!payload) {
      return;
    }

    if (this.modeTransitionInProgress) {
      log.warn("Mode transition already in progress; ignoring new mode switch request");
      return;
    }

    this.modeTransitionInProgress = true;
    try {
      const { normalized, target } = this.normalizeModeFromPayload(payload);

      this.setGlobalModeState(normalized, target, payload.deploymentState);
      this.applyViewerParameters(payload.viewerParams);
      this.applyEditorParameters(payload.editorParams);

      const resolvedLock = this.resolveLockPreference(payload);

      if (!this.deps.isInitialGraphLoaded()) {
        await this.deps.fetchAndLoadData();
        this.deps.setInitialGraphLoaded(true);
      }
      await this.deps.ensureModeResources(target);
      if (target === "edit") {
        this.deps.clearEdgeLinkStates();
        window.writeTopoDebugLog?.(
          "handleModeSwitchMessage: cleared link state classes for edit mode"
        );
      }

      if (typeof resolvedLock === "boolean") {
        this.deps.setLabLocked(resolvedLock);
      }
      this.deps.applyLockState(this.deps.getLabLocked());

      this.finalizeModeChange(normalized);
      log.info(`Mode switched to ${target}`);
    } catch (error) {
      log.error(
        `Error handling mode switch: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.modeTransitionInProgress = false;
    }
  }

  public normalizeModeFromPayload(payload: ModeSwitchPayload): {
    normalized: "viewer" | "editor";
    target: "edit" | "view";
  } {
    const normalized = payload.mode === "viewer" ? "viewer" : "editor";
    const target: "edit" | "view" = normalized === "viewer" ? "view" : "edit";
    return { normalized, target };
  }

  public setGlobalModeState(
    normalized: "viewer" | "editor",
    target: "edit" | "view",
    deploymentState?: string
  ): void {
    (window as any).topoViewerMode = normalized;
    (topoViewerState as any).currentMode = target;
    this.deps.setCurrentMode(target);
    this.deps.setIsViewportDrawerClabEditorChecked(target === "edit");
    if (typeof deploymentState === "string") {
      topoViewerState.deploymentType = deploymentState;
    }
  }

  public resolveLockPreference(payload: ModeSwitchPayload): boolean | undefined {
    if (typeof payload.editorParams?.lockLabByDefault === "boolean") {
      return payload.editorParams.lockLabByDefault;
    }
    if (typeof payload.viewerParams?.lockLabByDefault === "boolean") {
      return payload.viewerParams.lockLabByDefault;
    }
    return undefined;
  }

  public applyViewerParameters(params?: ViewerParamsPayload): void {
    if (!params) {
      return;
    }
    this.assignWindowValue("lockLabByDefault", params.lockLabByDefault);
    this.assignWindowValue("currentLabPath", params.currentLabPath);
  }

  public applyEditorParameters(params?: EditorParamsPayload): void {
    if (!params) {
      return;
    }
    this.assignWindowValue("lockLabByDefault", params.lockLabByDefault);
    this.assignWindowValue("imageMapping", params.imageMapping, {});
    this.assignWindowValue("ifacePatternMapping", params.ifacePatternMapping, {});
    this.assignWindowValue("defaultKind", params.defaultKind, "nokia_srlinux");
    this.assignWindowValue("defaultType", params.defaultType, "");
    this.assignWindowValue("updateLinkEndpointsOnKindChange", params.updateLinkEndpointsOnKindChange);
    this.assignWindowValue("customNodes", params.customNodes, []);
    this.assignWindowValue("defaultNode", params.defaultNode, "");
    this.assignWindowValue("topologyDefaults", params.topologyDefaults, {});
    this.assignWindowValue("topologyKinds", params.topologyKinds, {});
    this.assignWindowValue("topologyGroups", params.topologyGroups, {});
    this.assignWindowValue("dockerImages", params.dockerImages, []);
    this.assignWindowValue("currentLabPath", params.currentLabPath);
    this.assignWindowValue("customIcons", params.customIcons, {});
  }

  private assignWindowValue<T>(key: string, value: T | undefined, fallback?: T): void {
    if (value !== undefined) {
      (window as any)[key] = value;
      return;
    }
    if (fallback !== undefined && (window as any)[key] === undefined) {
      (window as any)[key] = fallback;
    }
  }

  public finalizeModeChange(normalized: "viewer" | "editor"): void {
    this.updateModeIndicator(normalized);
    document.dispatchEvent(new CustomEvent("topo-mode-changed"));
  }

  public updateModeIndicator(mode: "viewer" | "editor"): void {
    const indicator = document.getElementById("mode-indicator");
    if (indicator) {
      indicator.textContent = mode;
      indicator.classList.remove("mode-viewer", "mode-editor");
      indicator.classList.add(`mode-${mode}`);
    } else {
      log.warn("Mode indicator element not found");
    }
    document.title = mode === "editor" ? "TopoViewer Editor" : "TopoViewer";
  }
}
