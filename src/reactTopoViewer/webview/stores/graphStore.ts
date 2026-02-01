/**
 * graphStore - Zustand store for React Flow graph state (nodes/edges)
 *
 * This store owns the React Flow nodes/edges state and provides
 * all graph manipulation operations. React Flow is the source of truth.
 */
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../shared/types/graph";

// ============================================================================
// Types
// ============================================================================

export interface GraphState {
  nodes: Node[];
  edges: Edge[];
}

export interface GraphActions {
  // Core setters
  setNodes: (nodesOrUpdater: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edgesOrUpdater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  setGraph: (nodes: Node[], edges: Edge[]) => void;

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  // Node mutations
  addNode: (node: TopoNode) => void;
  removeNode: (nodeId: string) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  replaceNode: (nodeId: string, newNode: Node) => void;
  renameNode: (oldId: string, newId: string, name?: string) => void;
  updateNodePositions: (
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;

  // Edge mutations
  addEdge: (edge: TopoEdge) => void;
  removeEdge: (edgeId: string) => void;
  updateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  updateEdgeData: (edgeId: string, data: Partial<Record<string, unknown>>) => void;
}

export type GraphStore = GraphState & GraphActions;

// ============================================================================
// Store Creation
// ============================================================================

export const useGraphStore = createWithEqualityFn<GraphStore>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],

  // Core setters
  setNodes: (nodesOrUpdater) => {
    set((state) => ({
      nodes: typeof nodesOrUpdater === "function" ? nodesOrUpdater(state.nodes) : nodesOrUpdater
    }));
  },

  setEdges: (edgesOrUpdater) => {
    set((state) => ({
      edges: typeof edgesOrUpdater === "function" ? edgesOrUpdater(state.edges) : edgesOrUpdater
    }));
  },

  setGraph: (nodes, edges) => {
    set({ nodes, edges });
  },

  // React Flow change handlers
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes)
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges)
    }));
  },

  // Node mutations
  addNode: (node) => {
    set((state) => {
      if (state.nodes.some((n) => n.id === node.id)) return state;
      return { nodes: [...state.nodes, node as Node] };
    });
  },

  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId)
    }));
  },

  removeNodeAndEdges: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
    }));
  },

  updateNode: (nodeId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const mergedData = updates.data ? { ...node.data, ...updates.data } : node.data;
        return { ...node, ...updates, data: mergedData };
      })
    }));
  },

  replaceNode: (nodeId, newNode) => {
    set((state) => ({
      nodes: state.nodes.map((node) => (node.id === nodeId ? newNode : node))
    }));
  },

  renameNode: (oldId, newId, name) => {
    const nextName = name ?? newId;
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== oldId) return node;
        return {
          ...node,
          id: newId,
          data: { ...node.data, label: nextName }
        };
      }),
      edges: state.edges.map((edge) => {
        if (edge.source !== oldId && edge.target !== oldId) return edge;
        return {
          ...edge,
          source: edge.source === oldId ? newId : edge.source,
          target: edge.target === oldId ? newId : edge.target
        };
      })
    }));
  },

  updateNodePositions: (positions) => {
    if (positions.length === 0) return;
    const updates = new Map(positions.map((p) => [p.id, p.position]));
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const pos = updates.get(node.id);
        if (!pos) return node;
        return { ...node, position: pos };
      })
    }));
  },

  updateNodeData: (nodeId, extraData) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const currentData = node.data as Record<string, unknown>;
        const updatedData: Record<string, unknown> = {
          ...currentData,
          extraData
        };
        // Also update top-level visual properties
        if (extraData.topoViewerRole !== undefined) {
          updatedData.role = extraData.topoViewerRole;
        }
        if (extraData.iconColor !== undefined) {
          updatedData.iconColor = extraData.iconColor;
        }
        if (extraData.iconCornerRadius !== undefined) {
          updatedData.iconCornerRadius = extraData.iconCornerRadius;
        }
        return { ...node, data: updatedData };
      })
    }));
  },

  // Edge mutations
  addEdge: (edge) => {
    set((state) => {
      if (state.edges.some((e) => e.id === edge.id)) return state;
      return { edges: [...state.edges, edge as Edge] };
    });
  },

  removeEdge: (edgeId) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId)
    }));
  },

  updateEdge: (edgeId, updates) => {
    set((state) => ({
      edges: state.edges.map((edge) => {
        if (edge.id !== edgeId) return edge;
        const mergedData = updates.data
          ? { ...edge.data, ...(updates.data as Record<string, unknown>) }
          : edge.data;
        return { ...edge, ...updates, data: mergedData };
      })
    }));
  },

  updateEdgeData: (edgeId, data) => {
    get().updateEdge(edgeId, { data });
  }
}));

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

/** Get nodes array */
export const useNodes = () => useGraphStore((state) => state.nodes);

/** Get edges array */
export const useEdges = () => useGraphStore((state) => state.edges);

/** Get both nodes and edges */
export const useGraphState = () =>
  useGraphStore((state) => ({ nodes: state.nodes, edges: state.edges }), shallow);

/** Get graph actions (stable reference) */
export const useGraphActions = () =>
  useGraphStore(
    (state) => ({
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      setGraph: state.setGraph,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      addNode: state.addNode,
      removeNode: state.removeNode,
      removeNodeAndEdges: state.removeNodeAndEdges,
      updateNode: state.updateNode,
      replaceNode: state.replaceNode,
      renameNode: state.renameNode,
      updateNodePositions: state.updateNodePositions,
      updateNodeData: state.updateNodeData,
      addEdge: state.addEdge,
      removeEdge: state.removeEdge,
      updateEdge: state.updateEdge,
      updateEdgeData: state.updateEdgeData
    }),
    shallow
  );
