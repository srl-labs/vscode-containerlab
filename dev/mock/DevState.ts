/**
 * DevState - Minimal state for dev mode
 *
 * Only holds state that doesn't exist on the server:
 * - currentFilePath: which file is loaded
 * - clipboard: copy/paste storage
 * - customNodes: node template config
 * - mode/deploymentState: for lifecycle simulation
 *
 * Elements and annotations are fetched from server - no local cache.
 */

import type { CyElement, TopologyAnnotations } from '../../src/reactTopoViewer/shared/types/topology';
import type { CustomNodeTemplate } from '../../src/reactTopoViewer/webview/context/TopoViewerContext';

// ============================================================================
// Types
// ============================================================================

export type TopoMode = 'edit' | 'view';
export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

export interface DevState {
  /** Currently loaded topology file path */
  currentFilePath: string | null;
  /** Clipboard data for copy/paste */
  clipboard: unknown | null;
  /** Custom node templates */
  customNodes: CustomNodeTemplate[];
  /** Default custom node name */
  defaultCustomNode: string | null;
  /** Editor mode (for lifecycle simulation) */
  mode: TopoMode;
  /** Lab deployment state (for lifecycle simulation) */
  deploymentState: DeploymentState;
}

export type StateListener = (state: Readonly<DevState>) => void;

/** Helper to create empty annotations object */
export function createDefaultAnnotations() {
  return {
    freeTextAnnotations: [],
    freeShapeAnnotations: [],
    groupStyleAnnotations: [],
    nodeAnnotations: [],
    cloudNodeAnnotations: [],
    networkNodeAnnotations: [],
    aliasEndpointAnnotations: []
  };
}

// ============================================================================
// DevStateManager Class
// ============================================================================

export class DevStateManager {
  private state: DevState;
  private listeners: Set<StateListener> = new Set();

  constructor(initialState?: Partial<DevState>) {
    this.state = {
      currentFilePath: null,
      clipboard: null,
      customNodes: [],
      defaultCustomNode: null,
      mode: 'edit',
      deploymentState: 'undeployed',
      ...initialState
    };
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getState(): Readonly<DevState> {
    return this.state;
  }

  getCurrentFilePath(): string | null {
    return this.state.currentFilePath;
  }

  getClipboard(): unknown | null {
    return this.state.clipboard;
  }

  getCustomNodes(): CustomNodeTemplate[] {
    return this.state.customNodes;
  }

  getMode(): TopoMode {
    return this.state.mode;
  }

  getDeploymentState(): DeploymentState {
    return this.state.deploymentState;
  }

  // --------------------------------------------------------------------------
  // Setters
  // --------------------------------------------------------------------------

  setCurrentFilePath(filePath: string | null): void {
    this.state = { ...this.state, currentFilePath: filePath };
    this.notify();
  }

  setClipboard(data: unknown | null): void {
    this.state = { ...this.state, clipboard: data };
    // Don't notify for clipboard changes
  }

  setCustomNodes(customNodes: CustomNodeTemplate[]): void {
    this.state = { ...this.state, customNodes };
    this.notify();
  }

  setDefaultCustomNode(name: string | null): void {
    this.state = { ...this.state, defaultCustomNode: name };
    this.notify();
  }

  setMode(mode: TopoMode): void {
    this.state = { ...this.state, mode };
    this.notify();
  }

  setDeploymentState(deploymentState: DeploymentState): void {
    this.state = { ...this.state, deploymentState };
    this.notify();
  }

  // --------------------------------------------------------------------------
  // File Loading (just sets the path, server has the data)
  // --------------------------------------------------------------------------

  /** Record that a file was loaded */
  setLoadedFile(filePath: string): void {
    this.state = { ...this.state, currentFilePath: filePath };
    this.notify();
  }

  // --------------------------------------------------------------------------
  // Pub/Sub
  // --------------------------------------------------------------------------

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  reset(): void {
    this.state = {
      currentFilePath: null,
      clipboard: null,
      customNodes: [],
      defaultCustomNode: null,
      mode: 'edit',
      deploymentState: 'undeployed'
    };
    this.notify();
  }
}
