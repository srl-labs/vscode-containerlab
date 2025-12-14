/**
 * App-level handlers hook
 * Combines common handlers to reduce App.tsx complexity
 */
import React from 'react';
import type { FloatingActionPanelHandle } from '../../components/panels/FloatingActionPanel';
import type { NodePositionEntry, MembershipEntry } from '../state';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
}

interface UndoRedoRecorder {
  recordMove: (nodeIds: string[], beforePositions: NodePositionEntry[], membershipBefore?: MembershipEntry[], membershipAfter?: MembershipEntry[]) => void;
}

/** Ref for tracking pending membership changes during node drag */
export interface PendingMembershipChange {
  nodeId: string;
  oldGroupId: string | null;
  newGroupId: string | null;
}

interface UseAppHandlersOptions {
  selectionCallbacks: SelectionCallbacks;
  undoRedo: UndoRedoRecorder;
  floatingPanelRef: React.RefObject<FloatingActionPanelHandle | null>;
  isLocked: boolean;
  /** Ref holding pending membership changes from useNodeReparent */
  pendingMembershipChangesRef?: React.RefObject<Map<string, PendingMembershipChange>>;
}

export function useAppHandlers({
  selectionCallbacks,
  undoRedo,
  floatingPanelRef,
  isLocked,
  pendingMembershipChangesRef
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
      // Collect membership changes for the moved nodes
      let membershipBefore: MembershipEntry[] | undefined;
      let membershipAfter: MembershipEntry[] | undefined;

      if (pendingMembershipChangesRef?.current && pendingMembershipChangesRef.current.size > 0) {
        const changes: PendingMembershipChange[] = [];
        for (const nodeId of nodeIds) {
          const change = pendingMembershipChangesRef.current.get(nodeId);
          if (change) {
            changes.push(change);
            pendingMembershipChangesRef.current.delete(nodeId);
          }
        }
        if (changes.length > 0) {
          membershipBefore = changes.map(c => ({ nodeId: c.nodeId, groupId: c.oldGroupId }));
          membershipAfter = changes.map(c => ({ nodeId: c.nodeId, groupId: c.newGroupId }));
        }
      }

      undoRedo.recordMove(nodeIds, beforePositions, membershipBefore, membershipAfter);
    },
    [undoRedo, pendingMembershipChangesRef]
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
