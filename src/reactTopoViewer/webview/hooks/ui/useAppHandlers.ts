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
    if (
      rfInstance !== null &&
      rfInstance !== undefined &&
      rfInstance.getNodes !== undefined &&
      rfInstance.setNodes !== undefined
    ) {
      const nodes = rfInstance.getNodes();
      if (nodes.some((node) => node.selected === true)) {
        rfInstance.setNodes(
          nodes.map((node) => (node.selected === true ? { ...node, selected: false } : node))
        );
      }
    }
    if (
      rfInstance !== null &&
      rfInstance !== undefined &&
      rfInstance.getEdges !== undefined &&
      rfInstance.setEdges !== undefined
    ) {
      const edges = rfInstance.getEdges();
      if (edges.some((edge) => edge.selected === true)) {
        rfInstance.setEdges(
          edges.map((edge) => (edge.selected === true ? { ...edge, selected: false } : edge))
        );
      }
    }
    selectNode(null);
    selectEdge(null);
    editNode(null);
    editEdge(null);
  }, [selectNode, selectEdge, editNode, editEdge, rfInstance]);

  return {
    handleDeselectAll,
  };
}
