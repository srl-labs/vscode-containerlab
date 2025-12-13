/**
 * App-level hook for group undo handlers.
 * Extracted from App.tsx to reduce complexity.
 * Note: This hook must be called after useGraphUndoRedoHandlers since it needs undoRedo.
 *
 * [MIGRATION] Migrate to @xyflow/react - replace node selection logic
 */
import { useCallback } from 'react';
import type { UseGroupsReturn } from './groupTypes';
import { useGroupUndoRedoHandlers } from './useGroupUndoRedoHandlers';

// [MIGRATION] Replace with ReactFlow types from @xyflow/react
interface ReactFlowNode { id: string; data: Record<string, unknown> }

interface UndoRedoApi {
  pushAction: (action: { type: string; [key: string]: unknown }) => void;
}

interface UseAppGroupUndoHandlersOptions {
  /** [MIGRATION] Replace with ReactFlowInstance from @xyflow/react */
  cyInstance?: unknown;
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
 * [MIGRATION] Update for ReactFlow node structure
 */
function canBeGrouped(node: ReactFlowNode): boolean {
  const role = node.data?.topoViewerRole;
  return role !== 'freeText' && role !== 'freeShape';
}

export function useAppGroupUndoHandlers(options: UseAppGroupUndoHandlersOptions): UseAppGroupUndoHandlersReturn {
  const { groups, undoRedo } = options;

  // Group undo/redo handlers
  const groupUndoHandlers = useGroupUndoRedoHandlers(groups, undoRedo);

  // Undo-aware handleAddGroup that creates group and opens editor
  // [MIGRATION] Use ReactFlow's selected nodes via callback parameters
  const handleAddGroupWithUndo = useCallback(() => {
    const groupId = groupUndoHandlers.createGroupWithUndo();
    if (groupId) {
      groups.editGroup(groupId);
    }
  }, [groupUndoHandlers, groups]);

  return {
    handleAddGroupWithUndo,
    deleteGroupWithUndo: groupUndoHandlers.deleteGroupWithUndo
  };
}

// ============================================================================
// Group Position Handler with Member Node Movement
// ============================================================================

interface UseGroupPositionHandlerOptions {
  /** [MIGRATION] Replace with ReactFlowInstance from @xyflow/react */
  cyInstance: unknown;
  /** Callback to update node positions in ReactFlow */
  updateNodePosition?: (nodeId: string, position: { x: number; y: number }) => void;
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
 * [MIGRATION] Update to use ReactFlow's setNodes to update node positions
 */
export function useGroupDragMoveHandler(options: UseGroupPositionHandlerOptions): GroupDragMoveHandler {
  const { cyInstance, updateNodePosition, groups } = options;

  return useCallback((groupId: string, delta: { dx: number; dy: number }) => {
    if (!cyInstance || (delta.dx === 0 && delta.dy === 0)) return;
    const memberIds = groups.getGroupMembers(groupId);
    // [MIGRATION] Use ReactFlow's setNodes or updateNodePosition callback
    memberIds.forEach(nodeId => {
      if (updateNodePosition) {
        // Caller must handle delta-based position updates
        // updateNodePosition(nodeId, { deltaX: delta.dx, deltaY: delta.dy });
      }
    });
  }, [cyInstance, updateNodePosition, groups]);
}
