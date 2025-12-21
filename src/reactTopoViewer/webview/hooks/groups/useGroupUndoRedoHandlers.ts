/**
 * Hook that wraps group actions with undo/redo recording.
 * Similar pattern to useFreeShapeUndoRedoHandlers.
 */
import React from 'react';

import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoActionAnnotation } from '../state/useUndoRedo';
import { type UndoRedoApi, updateWithUndo, createPushUndoFn } from '../shared/undoHelpers';

import type { UseGroupsReturn } from './groupTypes';

export interface UseGroupUndoRedoHandlersReturn {
  createGroupWithUndo: (selectedNodeIds?: string[]) => string | null;
  deleteGroupWithUndo: (groupId: string) => void;
  updateGroupPositionWithUndo: (groupId: string, position: { x: number; y: number }) => void;
  updateGroupSizeWithUndo: (groupId: string, width: number, height: number) => void;
  applyGroupAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
}

function cloneGroup(group: GroupStyleAnnotation | undefined): GroupStyleAnnotation | null {
  if (!group) return null;
  return { ...group, position: { ...group.position } };
}

/** Transform group position */
function transformPosition(group: GroupStyleAnnotation, position: { x: number; y: number }): GroupStyleAnnotation {
  return { ...group, position: { ...position } };
}

/** Transform group size */
function transformSize(group: GroupStyleAnnotation, size: { width: number; height: number }): GroupStyleAnnotation {
  return { ...group, ...size };
}

function applyGroupAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  groupsApi: Pick<UseGroupsReturn, 'createGroup' | 'deleteGroup' | 'loadGroups' | 'groups'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'group') return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      // Restoring a deleted group - add back
      groupsApi.loadGroups([...groupsApi.groups, target]);
    } else if (!target && opposite) {
      // Deleting a group
      groupsApi.deleteGroup(opposite.id);
    } else if (target && opposite) {
      // Updating group
      const newGroups = groupsApi.groups.map(g => (g.id === target.id ? target : g));
      groupsApi.loadGroups(newGroups);
    }
  } finally {
    isApplyingRef.current = false;
  }
}

export function useGroupUndoRedoHandlers(
  groupsApi: UseGroupsReturn,
  undoRedo: UndoRedoApi
): UseGroupUndoRedoHandlersReturn {
  const isApplyingGroupUndoRedo = React.useRef(false);

  // Create shared push undo function
  const pushUndoFn = React.useMemo(
    () => createPushUndoFn(undoRedo, groupsApi.getUndoRedoAction, isApplyingGroupUndoRedo),
    [undoRedo, groupsApi.getUndoRedoAction]
  );

  const createGroupWithUndo = React.useCallback(
    (selectedNodeIds?: string[]): string | null => {
      const result = groupsApi.createGroup(selectedNodeIds);
      if (result) {
        const after = cloneGroup(result.group);
        if (after && !isApplyingGroupUndoRedo.current) {
          undoRedo.pushAction(groupsApi.getUndoRedoAction(null, after));
        }
        return result.groupId;
      }
      return null;
    },
    [groupsApi, undoRedo]
  );

  const deleteGroupWithUndo = React.useCallback(
    (groupId: string): void => {
      const beforeGroup = cloneGroup(groupsApi.groups.find(g => g.id === groupId));
      if (beforeGroup && !isApplyingGroupUndoRedo.current) {
        undoRedo.pushAction(groupsApi.getUndoRedoAction(beforeGroup, null));
      }
      groupsApi.deleteGroup(groupId);
    },
    [groupsApi, undoRedo]
  );

  const updateGroupPositionWithUndo = React.useCallback(
    (groupId: string, position: { x: number; y: number }): void => {
      updateWithUndo(
        groupId, groupsApi.groups, cloneGroup, transformPosition,
        pushUndoFn, groupsApi.updateGroupPosition, position
      );
    },
    [groupsApi.groups, groupsApi.updateGroupPosition, pushUndoFn]
  );

  const updateGroupSizeWithUndo = React.useCallback(
    (groupId: string, width: number, height: number): void => {
      updateWithUndo(
        groupId, groupsApi.groups, cloneGroup, transformSize,
        pushUndoFn, (id, size) => groupsApi.updateGroupSize(id, size.width, size.height),
        { width, height }
      );
    },
    [groupsApi.groups, groupsApi.updateGroupSize, pushUndoFn]
  );

  const applyGroupAnnotationChange = React.useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean): void => {
      applyGroupAnnotationChangeInternal(action, isUndo, groupsApi, isApplyingGroupUndoRedo);
    },
    [groupsApi]
  );

  return {
    createGroupWithUndo,
    deleteGroupWithUndo,
    updateGroupPositionWithUndo,
    updateGroupSizeWithUndo,
    applyGroupAnnotationChange,
    isApplyingGroupUndoRedo
  };
}
