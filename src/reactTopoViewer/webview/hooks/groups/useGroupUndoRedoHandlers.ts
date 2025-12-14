/**
 * Hook that wraps group actions with undo/redo recording.
 * Similar pattern to useFreeShapeUndoRedoHandlers.
 */
import React from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoAction, UndoRedoActionAnnotation } from '../state/useUndoRedo';
import type { UseGroupsReturn } from './groupTypes';

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

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

function updateGroupPosition(
  group: GroupStyleAnnotation,
  position: { x: number; y: number }
): GroupStyleAnnotation {
  return { ...group, position: { ...position } };
}

function updateGroupSize(
  group: GroupStyleAnnotation,
  width: number,
  height: number
): GroupStyleAnnotation {
  return { ...group, width, height };
}

function pushUndo(
  undoRedo: UndoRedoApi,
  groupsApi: Pick<UseGroupsReturn, 'getUndoRedoAction'>,
  isApplyingRef: React.RefObject<boolean>,
  before: GroupStyleAnnotation | null,
  after: GroupStyleAnnotation | null
): void {
  if (isApplyingRef.current) return;
  undoRedo.pushAction(groupsApi.getUndoRedoAction(before, after));
}

function updateGroupPositionWithUndoInternal(
  id: string,
  position: { x: number; y: number },
  groupsApi: Pick<UseGroupsReturn, 'groups' | 'updateGroupPosition' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneGroup(groupsApi.groups.find(g => g.id === id) || undefined);
  if (beforeCopy) {
    const after = updateGroupPosition(beforeCopy, position);
    pushUndo(undoRedo, groupsApi, isApplyingRef, beforeCopy, after);
  }
  groupsApi.updateGroupPosition(id, position);
}

function updateGroupSizeWithUndoInternal(
  id: string,
  width: number,
  height: number,
  groupsApi: Pick<UseGroupsReturn, 'groups' | 'updateGroupSize' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneGroup(groupsApi.groups.find(g => g.id === id) || undefined);
  if (beforeCopy) {
    const after = updateGroupSize(beforeCopy, width, height);
    pushUndo(undoRedo, groupsApi, isApplyingRef, beforeCopy, after);
  }
  groupsApi.updateGroupSize(id, width, height);
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

  const createGroupWithUndo = React.useCallback(
    (selectedNodeIds?: string[]): string | null => {
      const groupId = groupsApi.createGroup(selectedNodeIds);
      if (groupId) {
        const newGroup = groupsApi.groups.find(g => g.id === groupId);
        if (newGroup) {
          pushUndo(undoRedo, groupsApi, isApplyingGroupUndoRedo, null, cloneGroup(newGroup));
        }
      }
      return groupId;
    },
    [groupsApi, undoRedo]
  );

  const deleteGroupWithUndo = React.useCallback(
    (groupId: string): void => {
      const beforeGroup = cloneGroup(groupsApi.groups.find(g => g.id === groupId) || undefined);
      if (beforeGroup) {
        pushUndo(undoRedo, groupsApi, isApplyingGroupUndoRedo, beforeGroup, null);
      }
      groupsApi.deleteGroup(groupId);
    },
    [groupsApi, undoRedo]
  );

  const updateGroupPositionWithUndo = React.useCallback(
    (groupId: string, position: { x: number; y: number }): void => {
      updateGroupPositionWithUndoInternal(groupId, position, groupsApi, undoRedo, isApplyingGroupUndoRedo);
    },
    [groupsApi, undoRedo]
  );

  const updateGroupSizeWithUndo = React.useCallback(
    (groupId: string, width: number, height: number): void => {
      updateGroupSizeWithUndoInternal(groupId, width, height, groupsApi, undoRedo, isApplyingGroupUndoRedo);
    },
    [groupsApi, undoRedo]
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
