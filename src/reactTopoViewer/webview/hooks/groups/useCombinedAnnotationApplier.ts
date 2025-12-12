/**
 * Hook that combines freeShape and group annotation appliers.
 * Extracted from App.tsx to reduce complexity.
 */
import { useCallback } from 'react';
import type { UndoRedoActionAnnotation } from '../state/useUndoRedo';
import type { UseGroupsReturn } from './groupTypes';
import { useGroupAnnotationApplier } from './useGroupAnnotationApplier';

interface UseCombinedAnnotationApplierOptions {
  groups: UseGroupsReturn;
  applyFreeShapeChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

export interface UseCombinedAnnotationApplierReturn {
  applyAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

export function useCombinedAnnotationApplier(
  options: UseCombinedAnnotationApplierOptions
): UseCombinedAnnotationApplierReturn {
  const { groups, applyFreeShapeChange } = options;

  // Group annotation applier for undo/redo
  const { applyGroupAnnotationChange } = useGroupAnnotationApplier(groups);

  // Combined annotation change handler for undo/redo
  const applyAnnotationChange = useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean) => {
      if (action.annotationType === 'freeShape') {
        applyFreeShapeChange(action, isUndo);
      } else if (action.annotationType === 'group') {
        applyGroupAnnotationChange(action, isUndo);
      }
    },
    [applyFreeShapeChange, applyGroupAnnotationChange]
  );

  return { applyAnnotationChange };
}
