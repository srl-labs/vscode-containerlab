/**
 * Combined annotation applier for undo/redo
 */
import { useCallback } from "react";

import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from "../../../shared/types/topology";
import type { UndoRedoActionAnnotation, UndoRedoActionGroupMove } from "../state/useUndoRedo";

import type { useAppGroups } from "./useAppGroups";

type GroupsHook = ReturnType<typeof useAppGroups>["groups"];

interface UseCombinedAnnotationApplierOptions {
  groups: GroupsHook;
  /** Apply free shape annotation change (from useFreeShapeAnnotationApplier) */
  applyFreeShapeChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  /** Apply free text annotation change (from useFreeTextAnnotationApplier) */
  applyFreeTextChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  onUpdateTextAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  onUpdateShapeAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
}

export function useCombinedAnnotationApplier(options: UseCombinedAnnotationApplierOptions) {
  const { groups, applyFreeShapeChange, applyFreeTextChange } = options;

  const applyAnnotationChange = useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean) => {
      const { annotationType } = action;

      if (annotationType === "freeText") {
        applyFreeTextChange(action, isUndo);
      } else if (annotationType === "freeShape") {
        applyFreeShapeChange(action, isUndo);
      } else if (annotationType === "group") {
        const { before, after } = action;
        const [from, to] = isUndo ? [after, before] : [before, after];
        const fromGroup = from as GroupStyleAnnotation | null;
        const toGroup = to as GroupStyleAnnotation | null;

        if (!fromGroup && toGroup) {
          // Add
          groups.addGroup(toGroup);
        } else if (fromGroup && !toGroup) {
          // Delete
          groups.deleteGroup(fromGroup.id);
        } else if (fromGroup && toGroup) {
          // Update
          groups.updateGroup(toGroup.id, toGroup);
        }
      }
    },
    [groups, applyFreeShapeChange, applyFreeTextChange]
  );

  const applyGroupMoveChange = useCallback(
    (action: UndoRedoActionGroupMove, isUndo: boolean) => {
      const target = isUndo ? action.groupBefore : action.groupAfter;
      const targetGroup = target as GroupStyleAnnotation;
      if (targetGroup?.id) {
        groups.updateGroup(targetGroup.id, {
          position: targetGroup.position,
          width: targetGroup.width,
          height: targetGroup.height
        });
      }
    },
    [groups]
  );

  return {
    applyAnnotationChange,
    applyGroupMoveChange
  };
}
