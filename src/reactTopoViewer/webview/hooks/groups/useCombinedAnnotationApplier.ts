/**
 * Hook that combines freeShape and group annotation appliers.
 * Extracted from App.tsx to reduce complexity.
 */
import { useCallback } from 'react';
import type { UndoRedoActionAnnotation, UndoRedoActionGroupMove } from '../state/useUndoRedo';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UseGroupsReturn } from './groupTypes';
import { useGroupAnnotationApplier } from './useGroupAnnotationApplier';
import { log } from '../../utils/logger';

interface UseCombinedAnnotationApplierOptions {
  groups: UseGroupsReturn;
  applyFreeShapeChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

export interface UseCombinedAnnotationApplierReturn {
  applyAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyGroupMoveChange: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
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

  // Group move change handler for undo/redo (group + member nodes)
  const applyGroupMoveChange = useCallback(
    (action: UndoRedoActionGroupMove, isUndo: boolean) => {
      const targetGroup = (isUndo ? action.groupBefore : action.groupAfter) as GroupStyleAnnotation;

      // Update group position via loadGroups to replace the group state
      const updatedGroups = groups.groups.map(g =>
        g.id === targetGroup.id ? targetGroup : g
      );
      groups.loadGroups(updatedGroups);

      log.info(`[CombinedApplier] Applied group move ${isUndo ? 'undo' : 'redo'} for ${targetGroup.id}`);
    },
    [groups]
  );

  return { applyAnnotationChange, applyGroupMoveChange };
}
