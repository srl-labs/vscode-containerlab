/**
 * useGraphCompat - Compatibility hook bridging old GraphContext API to Zustand stores
 *
 * This hook provides the same interface as the old useGraph/useGraphState/useGraphActions
 * hooks but is backed by the graphStore.
 */
import { useMemo } from "react";
import type { Node, Edge, OnNodesChange, OnEdgesChange } from "@xyflow/react";

import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import { useGraphStore } from "../stores/graphStore";

// ============================================================================
// Types (matching old GraphContext types)
// ============================================================================

export interface GraphState {
  nodes: Node[];
  edges: Edge[];
}

export interface GraphActions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  addNode: (node: TopoNode) => void;
  addEdge: (edge: TopoEdge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  removeNodeAndEdges: (nodeId: string) => void;
  updateNodePositions: (
    positions: Array<{ id: string; position: { x: number; y: number } }>
  ) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  renameNode: (oldId: string, newId: string, name?: string) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  replaceNode: (nodeId: string, newNode: Node) => void;
  updateEdge: (edgeId: string, updates: Partial<Edge>) => void;
  updateEdgeData: (edgeId: string, data: Partial<Record<string, unknown>>) => void;
}

export type GraphContextValue = GraphState & GraphActions;

// ============================================================================
// Compatibility Hooks
// ============================================================================

/**
 * Hook for graph state only (for components that only read)
 * Compatible with old useGraphState() API
 */
export function useGraphState(): GraphState {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  return useMemo(() => ({ nodes, edges }), [nodes, edges]);
}

/**
 * Hook for graph actions only (stable reference)
 * Compatible with old useGraphActions() API
 */
export function useGraphActions(): GraphActions {
  const store = useGraphStore.getState();

  return useMemo(
    () => ({
      setNodes: store.setNodes,
      setEdges: store.setEdges,
      onNodesChange: store.onNodesChange,
      onEdgesChange: store.onEdgesChange,
      addNode: store.addNode,
      addEdge: store.addEdge,
      removeNode: store.removeNode,
      removeEdge: store.removeEdge,
      removeNodeAndEdges: store.removeNodeAndEdges,
      updateNodePositions: store.updateNodePositions,
      updateNodeData: store.updateNodeData,
      renameNode: store.renameNode,
      updateNode: store.updateNode,
      replaceNode: store.replaceNode,
      updateEdge: store.updateEdge,
      updateEdgeData: store.updateEdgeData
    }),
    // Store actions are stable, no dependencies needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}

/**
 * Hook to access graph state and actions
 * Compatible with old useGraph() API
 */
export function useGraph(): GraphContextValue {
  const graphState = useGraphState();
  const graphActions = useGraphActions();
  return useMemo(() => ({ ...graphState, ...graphActions }), [graphState, graphActions]);
}
