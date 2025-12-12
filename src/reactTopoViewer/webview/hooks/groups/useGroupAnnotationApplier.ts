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
  groups: Pick<UseGroupsReturn, 'loadGroupStyles' | 'groupStyles' | 'deleteGroup'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'group') return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      // Restoring a deleted group - add style back
      const existing = groups.groupStyles.find(s => s.id === target.id);
      if (!existing) {
        groups.loadGroupStyles([...groups.groupStyles, target]);
      }
    } else if (!target && opposite) {
      // Deleting a group
      groups.deleteGroup(opposite.id);
    } else if (target && opposite) {
      // Updating group style
      const newStyles = groups.groupStyles.map(s => (s.id === target.id ? target : s));
      groups.loadGroupStyles(newStyles);
    }
  } finally {
    isApplyingRef.current = false;
  }
}

export function useGroupAnnotationApplier(
  groups: UseGroupsReturn
): UseGroupAnnotationApplierReturn {
  const isApplyingGroupUndoRedo = React.useRef(false);

  const applyGroupAnnotationChange = React.useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean): void => {
      applyGroupAnnotationChangeInternal(action, isUndo, groups, isApplyingGroupUndoRedo);
    },
    [groups]
  );

  return {
    isApplyingGroupUndoRedo,
    applyGroupAnnotationChange
  };
}
