/**
 * DevState - Centralized state management for dev mode
 *
 * Provides a pub/sub state manager that tracks the current topology,
 * annotations, clipboard, and UI state during development.
 */

import type { CyElement, TopologyAnnotations, NodeAnnotation, NetworkNodeAnnotation } from '../../src/reactTopoViewer/shared/types/topology';
import type { CustomNodeTemplate } from '../../src/reactTopoViewer/webview/context/TopoViewerContext';

// ============================================================================
// Types
// ============================================================================

export type TopoMode = 'edit' | 'view';
export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

export interface DevState {
  /** Current topology elements (nodes and edges) */
  currentElements: CyElement[];
  /** Current annotations (text, shapes, groups, positions) */
  currentAnnotations: TopologyAnnotations;
  /** Editor mode */
  mode: TopoMode;
  /** Lab deployment state */
  deploymentState: DeploymentState;
  /** Clipboard data for copy/paste */
  clipboard: unknown | null;
  /** Batch operation depth counter */
  graphBatchDepth: number;
  /** Whether a topology broadcast is pending (deferred during batch) */
  pendingTopologyBroadcast: boolean;
  /** Custom node templates */
  customNodes: CustomNodeTemplate[];
  /** Default custom node name */
  defaultCustomNode: string | null;
  /** Whether split view panel is open */
  splitViewOpen: boolean;
  /** Lab name for YAML generation */
  labName: string;
}

export type StateListener = (state: Readonly<DevState>) => void;

// ============================================================================
// Default State Factory
// ============================================================================

export function createDefaultAnnotations(): TopologyAnnotations {
  return {
    freeTextAnnotations: [],
    freeShapeAnnotations: [],
    groupStyleAnnotations: [],
    cloudNodeAnnotations: [],
    nodeAnnotations: [],
    aliasEndpointAnnotations: []
  };
}

export function createDefaultState(): DevState {
  return {
    currentElements: [],
    currentAnnotations: createDefaultAnnotations(),
    mode: 'edit',
    deploymentState: 'undeployed',
    clipboard: null,
    graphBatchDepth: 0,
    pendingTopologyBroadcast: false,
    customNodes: [],
    defaultCustomNode: null,
    splitViewOpen: false,
    labName: 'dev-topology'
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
      ...createDefaultState(),
      ...initialState
    };
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  /** Get the full state (readonly) */
  getState(): Readonly<DevState> {
    return this.state;
  }

  /** Get current elements */
  getElements(): CyElement[] {
    return this.state.currentElements;
  }

  /** Get current annotations */
  getAnnotations(): TopologyAnnotations {
    return this.state.currentAnnotations;
  }

  /** Get current mode */
  getMode(): TopoMode {
    return this.state.mode;
  }

  /** Get deployment state */
  getDeploymentState(): DeploymentState {
    return this.state.deploymentState;
  }

  /** Get clipboard data */
  getClipboard(): unknown | null {
    return this.state.clipboard;
  }

  /** Check if currently in a batch */
  isInBatch(): boolean {
    return this.state.graphBatchDepth > 0;
  }

  /** Get custom nodes */
  getCustomNodes(): CustomNodeTemplate[] {
    return this.state.customNodes;
  }

  /** Check if split view is open */
  isSplitViewOpen(): boolean {
    return this.state.splitViewOpen;
  }

  // --------------------------------------------------------------------------
  // State Updates
  // --------------------------------------------------------------------------

  /** Update elements */
  updateElements(elements: CyElement[]): void {
    this.state = { ...this.state, currentElements: elements };
    this.notify();
  }

  /** Update annotations (partial update) */
  updateAnnotations(annotations: Partial<TopologyAnnotations>): void {
    this.state = {
      ...this.state,
      currentAnnotations: {
        ...this.state.currentAnnotations,
        ...annotations
      }
    };
    this.notify();
  }

  /** Set full annotations object */
  setAnnotations(annotations: TopologyAnnotations): void {
    this.state = { ...this.state, currentAnnotations: annotations };
    this.notify();
  }

  /** Set mode */
  setMode(mode: TopoMode): void {
    this.state = { ...this.state, mode };
    this.notify();
  }

  /** Set deployment state */
  setDeploymentState(deploymentState: DeploymentState): void {
    this.state = { ...this.state, deploymentState };
    this.notify();
  }

  /** Set clipboard data */
  setClipboard(data: unknown | null): void {
    this.state = { ...this.state, clipboard: data };
    // Don't notify for clipboard changes (internal only)
  }

  /** Set custom nodes */
  setCustomNodes(customNodes: CustomNodeTemplate[]): void {
    this.state = { ...this.state, customNodes };
    this.notify();
  }

  /** Set default custom node */
  setDefaultCustomNode(name: string | null): void {
    this.state = { ...this.state, defaultCustomNode: name };
    this.notify();
  }

  /** Toggle split view */
  setSplitViewOpen(open: boolean): void {
    this.state = { ...this.state, splitViewOpen: open };
    this.notify();
  }

  /** Set lab name */
  setLabName(labName: string): void {
    this.state = { ...this.state, labName };
    this.notify();
  }

  // --------------------------------------------------------------------------
  // Batching
  // --------------------------------------------------------------------------

  /** Begin a batch operation */
  beginBatch(): void {
    this.state = {
      ...this.state,
      graphBatchDepth: this.state.graphBatchDepth + 1
    };
  }

  /** End a batch operation */
  endBatch(): boolean {
    const newDepth = Math.max(0, this.state.graphBatchDepth - 1);
    const wasPending = this.state.pendingTopologyBroadcast;

    this.state = {
      ...this.state,
      graphBatchDepth: newDepth,
      pendingTopologyBroadcast: newDepth > 0 ? this.state.pendingTopologyBroadcast : false
    };

    // Return true if a broadcast should happen
    return newDepth === 0 && wasPending;
  }

  /** Mark that a topology broadcast is pending */
  setPendingBroadcast(pending: boolean): void {
    this.state = { ...this.state, pendingTopologyBroadcast: pending };
  }

  // --------------------------------------------------------------------------
  // Element Operations
  // --------------------------------------------------------------------------

  /** Add a node to elements */
  addNode(node: CyElement): void {
    const exists = this.state.currentElements.some(
      el => el.group === 'nodes' && el.data.id === node.data.id
    );
    if (exists) return;

    this.state = {
      ...this.state,
      currentElements: [...this.state.currentElements, node]
    };
    this.notify();
  }

  /** Add an edge to elements */
  addEdge(edge: CyElement): void {
    const exists = this.state.currentElements.some(
      el => el.group === 'edges' && el.data.id === edge.data.id
    );
    if (exists) return;

    this.state = {
      ...this.state,
      currentElements: [...this.state.currentElements, edge]
    };
    this.notify();
  }

  /** Remove a node and its connected edges */
  removeNode(nodeId: string): void {
    const elements = this.state.currentElements.filter(el => {
      if (el.group === 'nodes' && el.data.id === nodeId) return false;
      if (el.group === 'edges') {
        return el.data.source !== nodeId && el.data.target !== nodeId;
      }
      return true;
    });

    const nodeAnnotations = this.state.currentAnnotations.nodeAnnotations?.filter(
      a => a.id !== nodeId
    );

    this.state = {
      ...this.state,
      currentElements: elements,
      currentAnnotations: {
        ...this.state.currentAnnotations,
        nodeAnnotations
      }
    };
    this.notify();
  }

  /** Remove an edge */
  removeEdge(edgeId: string): void {
    const elements = this.state.currentElements.filter(
      el => !(el.group === 'edges' && el.data.id === edgeId)
    );

    this.state = { ...this.state, currentElements: elements };
    this.notify();
  }

  /** Update a node's data */
  updateNodeData(nodeId: string, data: Partial<CyElement['data']>): void {
    const elements = this.state.currentElements.map(el => {
      if (el.group === 'nodes' && el.data.id === nodeId) {
        return {
          ...el,
          data: { ...el.data, ...data }
        };
      }
      return el;
    });

    this.state = { ...this.state, currentElements: elements };
    this.notify();
  }

  /** Update an edge's data */
  updateEdgeData(edgeId: string, data: Partial<CyElement['data']>): void {
    const elements = this.state.currentElements.map(el => {
      if (el.group === 'edges' && el.data.id === edgeId) {
        return {
          ...el,
          data: { ...el.data, ...data }
        };
      }
      return el;
    });

    this.state = { ...this.state, currentElements: elements };
    this.notify();
  }

  /** Update node positions */
  updateNodePositions(
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ): void {
    // Update element positions
    const elements = this.state.currentElements.map(el => {
      if (el.group === 'nodes') {
        const posData = positions.find(p => p.id === el.data.id);
        if (posData) {
          return { ...el, position: posData.position };
        }
      }
      return el;
    });

    // Update node annotations
    const nodeAnnotations = [...(this.state.currentAnnotations.nodeAnnotations || [])];
    const networkNodeAnnotations: NetworkNodeAnnotation[] = [
      ...((this.state.currentAnnotations as any).networkNodeAnnotations || [])
    ];

    for (const posData of positions) {
      const element = elements.find(
        el => el.group === 'nodes' && el.data.id === posData.id
      );
      const isNetworkNode = element?.data.topoViewerRole === 'cloud';

      if (isNetworkNode) {
        const existing = networkNodeAnnotations.find(a => a.id === posData.id);
        if (existing) {
          existing.position = posData.position;
        } else {
          networkNodeAnnotations.push({
            id: posData.id,
            type: (element?.data.type as NetworkNodeAnnotation['type']) || 'host',
            label: (element?.data.name as string) || posData.id,
            position: posData.position
          });
        }
      } else {
        const existing = nodeAnnotations.find(a => a.id === posData.id);
        if (existing) {
          existing.position = posData.position;
        } else {
          nodeAnnotations.push({ id: posData.id, position: posData.position });
        }
      }
    }

    this.state = {
      ...this.state,
      currentElements: elements,
      currentAnnotations: {
        ...this.state.currentAnnotations,
        nodeAnnotations,
        networkNodeAnnotations
      } as TopologyAnnotations
    };
    this.notify();
  }

  /** Update node group membership */
  updateNodeGroupMembership(
    nodeId: string,
    group: string | null,
    level: string | null
  ): void {
    const nodeAnnotations = [...(this.state.currentAnnotations.nodeAnnotations || [])];
    const existing = nodeAnnotations.find(a => a.id === nodeId);

    if (existing) {
      if (group) {
        existing.group = group;
        existing.level = level || '1';
      } else {
        delete existing.group;
        delete existing.level;
      }
    } else if (group) {
      nodeAnnotations.push({
        id: nodeId,
        group,
        level: level || '1'
      } as NodeAnnotation);
    }

    this.state = {
      ...this.state,
      currentAnnotations: {
        ...this.state.currentAnnotations,
        nodeAnnotations
      }
    };
    this.notify();
  }

  // --------------------------------------------------------------------------
  // Pub/Sub
  // --------------------------------------------------------------------------

  /** Subscribe to state changes */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Notify all listeners */
  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  // --------------------------------------------------------------------------
  // Bulk Operations
  // --------------------------------------------------------------------------

  /** Load a new topology (replaces everything) */
  loadTopology(
    elements: CyElement[],
    annotations: TopologyAnnotations,
    labName?: string
  ): void {
    this.state = {
      ...this.state,
      currentElements: elements,
      currentAnnotations: annotations,
      labName: labName || this.state.labName
    };
    this.notify();
  }

  /** Reset to default state */
  reset(): void {
    this.state = createDefaultState();
    this.notify();
  }
}
