/**
 * DevState - Minimal state for dev mode
 *
 * Only holds state that doesn't exist on the server:
 * - currentFilePath: which file is loaded
 * - customNodes: node template config (with setDefault flag on nodes)
 * - mode/deploymentState: for lifecycle simulation
 *
 * Elements and annotations are fetched from server - no local cache.
 * Clipboard is handled locally by useUnifiedClipboard (React refs).
 */

import type { CustomNodeTemplate } from "../../src/reactTopoViewer/webview/context/TopoViewerContext";

// ============================================================================
// Types
// ============================================================================

export type TopoMode = "edit" | "view";
export type DeploymentState = "deployed" | "undeployed" | "unknown";

export interface DevState {
  /** Currently loaded topology file path */
  currentFilePath: string | null;
  /** Custom node templates (default is marked with setDefault: true) */
  customNodes: CustomNodeTemplate[];
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
      customNodes: [],
      mode: "edit",
      deploymentState: "undeployed",
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

  getCustomNodes(): CustomNodeTemplate[] {
    return this.state.customNodes;
  }

  /** Get default custom node name (from node with setDefault: true) */
  getDefaultCustomNode(): string {
    const defaultNode = this.state.customNodes.find((n) => n.setDefault === true);
    return defaultNode?.name || "";
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

  setCustomNodes(customNodes: CustomNodeTemplate[]): void {
    this.state = { ...this.state, customNodes };
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
  // Custom Node CRUD (matches production CustomNodeConfigManager behavior)
  // --------------------------------------------------------------------------

  /** Save or update a custom node template */
  saveCustomNode(data: CustomNodeTemplate & { oldName?: string }): void {
    let nodes = [...this.state.customNodes];

    // If setDefault is true, clear setDefault on all other nodes first
    if (data.setDefault) {
      nodes = nodes.map((n) => ({ ...n, setDefault: false }));
    }

    // Remove oldName from data before storing
    const { oldName, ...nodeData } = data;

    if (oldName) {
      // Update existing node (find by oldName)
      const idx = nodes.findIndex((n) => n.name === oldName);
      if (idx >= 0) {
        nodes[idx] = nodeData;
      } else {
        nodes.push(nodeData);
      }
    } else {
      // Add new or update existing (find by name)
      const idx = nodes.findIndex((n) => n.name === data.name);
      if (idx >= 0) {
        nodes[idx] = nodeData;
      } else {
        nodes.push(nodeData);
      }
    }

    this.state = { ...this.state, customNodes: nodes };
    this.notify();
  }

  /** Set a node as default (updates setDefault flag on all nodes) */
  setDefaultCustomNodeByName(name: string): void {
    const nodes = this.state.customNodes.map((n) => ({
      ...n,
      setDefault: n.name === name
    }));
    this.state = { ...this.state, customNodes: nodes };
    this.notify();
  }

  /** Delete a custom node template by name */
  deleteCustomNode(name: string): void {
    const nodes = this.state.customNodes.filter((n) => n.name !== name);
    this.state = { ...this.state, customNodes: nodes };
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
      customNodes: [],
      mode: "edit",
      deploymentState: "undeployed"
    };
    this.notify();
  }
}
