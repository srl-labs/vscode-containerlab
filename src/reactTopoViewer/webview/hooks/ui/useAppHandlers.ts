/**
 * App-level handlers hook
 * Combines common handlers to reduce App.tsx complexity
 */
import React from "react";
import type { Edge, Node } from "@xyflow/react";

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
}

interface UseAppHandlersOptions {
  selectionCallbacks: SelectionCallbacks;
  rfInstance?: {
    getNodes?: () => Node[];
    getEdges?: () => Edge[];
    setNodes?: (payload: Node[] | ((nodes: Node[]) => Node[])) => void;
    setEdges?: (payload: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  } | null;
}

export function useAppHandlers({ selectionCallbacks, rfInstance }: UseAppHandlersOptions) {
  const { selectNode, selectEdge, editNode, editEdge } = selectionCallbacks;

  // Handle deselect all callback
  const handleDeselectAll = React.useCallback(() => {
    // Clear React Flow element selection (multi-select) if available
    if (rfInstance?.getNodes && rfInstance?.setNodes) {
      const nodes = rfInstance.getNodes();
      if (nodes.some((node) => node.selected)) {
        rfInstance.setNodes(
          nodes.map((node) => (node.selected ? { ...node, selected: false } : node))
        );
      }
    }
    if (rfInstance?.getEdges && rfInstance?.setEdges) {
      const edges = rfInstance.getEdges();
      if (edges.some((edge) => edge.selected)) {
        rfInstance.setEdges(
          edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
        );
      }
    }
    selectNode(null);
    selectEdge(null);
    editNode(null);
    editEdge(null);
  }, [selectNode, selectEdge, editNode, editEdge, rfInstance]);

  return {
    handleDeselectAll
  };
}
