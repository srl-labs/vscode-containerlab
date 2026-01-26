/**
 * App-level handlers hook
 * Combines common handlers to reduce App.tsx complexity
 */
import React from "react";

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
}

interface UseAppHandlersOptions {
  selectionCallbacks: SelectionCallbacks;
}

export function useAppHandlers({ selectionCallbacks }: UseAppHandlersOptions) {
  const { selectNode, selectEdge, editNode, editEdge } = selectionCallbacks;

  // Handle deselect all callback
  const handleDeselectAll = React.useCallback(() => {
    selectNode(null);
    selectEdge(null);
    editNode(null);
    editEdge(null);
  }, [selectNode, selectEdge, editNode, editEdge]);

  return {
    handleDeselectAll
  };
}
