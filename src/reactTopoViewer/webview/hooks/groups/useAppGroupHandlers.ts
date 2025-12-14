/**
 * App-level hook for group undo handlers.
 * Extracted from App.tsx to reduce complexity.
 * Note: This hook must be called after useGraphUndoRedoHandlers since it needs undoRedo.
 */
import { useCallback } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { UseGroupsReturn } from './groupTypes';
import { useGroupUndoRedoHandlers } from './useGroupUndoRedoHandlers';
import type { UndoRedoAction } from '../state/useUndoRedo';

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

interface UseAppGroupUndoHandlersOptions {
  cyInstance: CyCore | null;
  groups: UseGroupsReturn;
  undoRedo: UndoRedoApi;
}

export interface UseAppGroupUndoHandlersReturn {
  handleAddGroupWithUndo: () => void;
  deleteGroupWithUndo: (groupId: string) => void;
}

/**
 * Check if a node can be added to a group.
 * Returns false for annotations.
 */
function canBeGrouped(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'freeText' && role !== 'freeShape';
}

export function useAppGroupUndoHandlers(options: UseAppGroupUndoHandlersOptions): UseAppGroupUndoHandlersReturn {
  const { cyInstance, groups, undoRedo } = options;

  // Group undo/redo handlers
  const groupUndoHandlers = useGroupUndoRedoHandlers(groups, undoRedo);

  // Undo-aware handleAddGroup that creates group from selected nodes and opens editor
  const handleAddGroupWithUndo = useCallback(() => {
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(':selected')
      .filter(n => canBeGrouped(n as NodeSingular))
      .map(n => n.id());

    const groupId = groupUndoHandlers.createGroupWithUndo(
      selectedNodeIds.length > 0 ? selectedNodeIds : undefined
    );
    if (groupId) {
      groups.editGroup(groupId);
    }
  }, [cyInstance, groupUndoHandlers, groups]);

  return {
    handleAddGroupWithUndo,
    deleteGroupWithUndo: groupUndoHandlers.deleteGroupWithUndo
  };
}

// ============================================================================
// Group Position Handler with Member Node Movement
// ============================================================================

interface UseGroupPositionHandlerOptions {
  cyInstance: CyCore | null;
  groups: UseGroupsReturn;
}

export type GroupPositionChangeHandler = (
  groupId: string,
  position: { x: number; y: number },
  delta: { dx: number; dy: number }
) => void;

/**
 * Hook that creates a handler for group position changes.
 * Moves member nodes along with the group when dragged.
 */
export function useGroupPositionHandler(options: UseGroupPositionHandlerOptions): GroupPositionChangeHandler {
  const { groups } = options;

  return useCallback((
    groupId: string,
    position: { x: number; y: number },
    _delta: { dx: number; dy: number }
  ) => {
    // Note: Real-time node movement is handled by useGroupDragMoveHandler
    // This handler just persists the final group position
    groups.updateGroupPosition(groupId, position);
  }, [groups]);
}

export type GroupDragMoveHandler = (groupId: string, delta: { dx: number; dy: number }) => void;

/**
 * Hook that creates a handler for real-time node movement during group drag.
 */
export function useGroupDragMoveHandler(options: UseGroupPositionHandlerOptions): GroupDragMoveHandler {
  const { cyInstance, groups } = options;

  return useCallback((groupId: string, delta: { dx: number; dy: number }) => {
    if (!cyInstance || (delta.dx === 0 && delta.dy === 0)) return;
    const memberIds = groups.getGroupMembers(groupId);
    memberIds.forEach(nodeId => {
      const node = cyInstance.getElementById(nodeId);
      if (node.length > 0) {
        const currentPos = node.position();
        node.position({ x: currentPos.x + delta.dx, y: currentPos.y + delta.dy });
      }
    });
  }, [cyInstance, groups]);
}
