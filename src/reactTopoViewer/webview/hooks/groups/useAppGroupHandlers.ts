/**
 * App-level hook for group undo handlers.
 * Extracted from App.tsx to reduce complexity.
 * Note: This hook must be called after useGraphUndoRedoHandlers since it needs undoRedo.
 */
import { useCallback } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { UseGroupsReturn } from './groupTypes';
import { useGroupUndoRedoHandlers } from './useGroupUndoRedoHandlers';
import { canBeGrouped } from './groupHelpers';

interface UndoRedoApi {
  pushAction: (action: { type: string; [key: string]: unknown }) => void;
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
