/**
 * Hook to apply group annotation changes during undo/redo.
 * Similar pattern to useFreeShapeAnnotationApplier.
 */
import React from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoActionAnnotation } from '../state/useUndoRedo';
import type { UseGroupsReturn } from './groupTypes';
import { log } from '../../utils/logger';

export interface UseGroupAnnotationApplierReturn {
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
  applyGroupAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

type GroupsApi = Pick<UseGroupsReturn, 'loadGroups' | 'groups' | 'deleteGroup'>;

/** Log the current state for debugging */
function logGroupUndoState(
  isUndo: boolean,
  groups: GroupStyleAnnotation[],
  target: GroupStyleAnnotation | null,
  opposite: GroupStyleAnnotation | null
): void {
  const action = isUndo ? 'UNDO' : 'REDO';
  const targetLabel = isUndo ? 'before' : 'after';
  const oppositeLabel = isUndo ? 'after' : 'before';
  log.info(`[GroupUndo] ${action} group annotation`);
  log.info(`[GroupUndo] Current groups: ${groups.map(g => g.id).join(', ')}`);
  log.info(`[GroupUndo] Target (${targetLabel}): ${target?.id ?? 'null'}`);
  log.info(`[GroupUndo] Opposite (${oppositeLabel}): ${opposite?.id ?? 'null'}`);
}

/** Restore a deleted group */
function restoreGroup(target: GroupStyleAnnotation, groupsApi: GroupsApi): void {
  log.info(`[GroupUndo] Restoring deleted group: ${target.id}`);
  const existing = groupsApi.groups.find(g => g.id === target.id);
  if (!existing) {
    groupsApi.loadGroups([...groupsApi.groups, target]);
  }
}

/** Delete a group via loadGroups to bypass mode checks */
function removeGroup(opposite: GroupStyleAnnotation, groupsApi: GroupsApi): void {
  log.info(`[GroupUndo] Deleting group: ${opposite.id}`);
  const filteredGroups = groupsApi.groups.filter(g => g.id !== opposite.id);
  log.info(`[GroupUndo] Filtered groups: ${filteredGroups.map(g => g.id).join(', ')}`);
  groupsApi.loadGroups(filteredGroups);
}

/** Update an existing group */
function updateGroup(target: GroupStyleAnnotation, groupsApi: GroupsApi): void {
  log.info(`[GroupUndo] Updating group: ${target.id}`);
  const newGroups = groupsApi.groups.map(g => (g.id === target.id ? target : g));
  groupsApi.loadGroups(newGroups);
}

function applyGroupAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  groupsApi: GroupsApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'group') return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  logGroupUndoState(isUndo, groupsApi.groups, target, opposite);

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      restoreGroup(target, groupsApi);
    } else if (!target && opposite) {
      removeGroup(opposite, groupsApi);
    } else if (target && opposite) {
      updateGroup(target, groupsApi);
    }
  } finally {
    isApplyingRef.current = false;
  }
}

export function useGroupAnnotationApplier(
  groupsApi: UseGroupsReturn
): UseGroupAnnotationApplierReturn {
  const isApplyingGroupUndoRedo = React.useRef(false);

  const applyGroupAnnotationChange = React.useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean): void => {
      applyGroupAnnotationChangeInternal(action, isUndo, groupsApi, isApplyingGroupUndoRedo);
    },
    [groupsApi]
  );

  return {
    isApplyingGroupUndoRedo,
    applyGroupAnnotationChange
  };
}
