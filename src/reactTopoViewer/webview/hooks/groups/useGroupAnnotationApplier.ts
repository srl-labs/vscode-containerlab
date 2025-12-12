/**
 * Hook to apply group annotation changes during undo/redo.
 * Similar pattern to useFreeShapeAnnotationApplier.
 */
import React from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoActionAnnotation } from '../state/useUndoRedo';
import type { UseGroupsReturn } from './groupTypes';

export interface UseGroupAnnotationApplierReturn {
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
  applyGroupAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

function applyGroupAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  groupsApi: Pick<UseGroupsReturn, 'loadGroups' | 'groups' | 'deleteGroup'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'group') return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      // Restoring a deleted group - add back
      const existing = groupsApi.groups.find(g => g.id === target.id);
      if (!existing) {
        groupsApi.loadGroups([...groupsApi.groups, target]);
      }
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
