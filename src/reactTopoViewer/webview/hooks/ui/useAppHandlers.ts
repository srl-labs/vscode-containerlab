/**
 * App-level handlers hook
 * Combines common handlers to reduce App.tsx complexity
 */
import React from 'react';
import type { FloatingActionPanelHandle } from '../../components/panels/FloatingActionPanel';
import type { NodePositionEntry } from '../state';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
}

interface UndoRedoRecorder {
  recordMove: (nodeIds: string[], beforePositions: NodePositionEntry[]) => void;
}

interface UseAppHandlersOptions {
  selectionCallbacks: SelectionCallbacks;
  undoRedo: UndoRedoRecorder;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  isLocked: boolean;
}

export function useAppHandlers({
  selectionCallbacks,
  undoRedo,
  floatingPanelRef,
  isLocked
}: UseAppHandlersOptions) {
  const { selectNode, selectEdge, editNode, editEdge } = selectionCallbacks;

  // Callback for when user tries to drag a locked node
  const handleLockedDrag = React.useCallback(
    () => floatingPanelRef.current?.triggerShake(),
    [floatingPanelRef]
  );

  // Callback for when a node move is complete (for undo/redo)
  const handleMoveComplete = React.useCallback(
    (nodeIds: string[], beforePositions: NodePositionEntry[]) => {
      undoRedo.recordMove(nodeIds, beforePositions);
    },
    [undoRedo]
  );

  // Handle deselect all callback
  const handleDeselectAll = React.useCallback(() => {
    selectNode(null);
    selectEdge(null);
    editNode(null);
    editEdge(null);
  }, [selectNode, selectEdge, editNode, editEdge]);

  // Sync lock state with extension
  React.useEffect(() => {
    sendCommandToExtension('toggle-lock-state', { isLocked });
  }, [isLocked]);

  return {
    handleLockedDrag,
    handleMoveComplete,
    handleDeselectAll
  };
}
