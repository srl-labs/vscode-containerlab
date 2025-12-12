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
  applyGroupAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
}

function cloneGroupStyle(style: GroupStyleAnnotation | undefined): GroupStyleAnnotation | null {
  if (!style) return null;
  return { ...style };
}

function pushUndo(
  undoRedo: UndoRedoApi,
  groups: Pick<UseGroupsReturn, 'getUndoRedoAction'>,
  isApplyingRef: React.RefObject<boolean>,
  before: GroupStyleAnnotation | null,
  after: GroupStyleAnnotation | null
): void {
  if (isApplyingRef.current) return;
  undoRedo.pushAction(groups.getUndoRedoAction(before, after));
}

function applyGroupAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  groups: Pick<UseGroupsReturn, 'createGroup' | 'deleteGroup' | 'loadGroupStyles' | 'groupStyles'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'group') return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      // Restoring a deleted group - just add style back (group node should be recreated)
      groups.loadGroupStyles([...groups.groupStyles, target]);
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

export function useGroupUndoRedoHandlers(
  groups: UseGroupsReturn,
  undoRedo: UndoRedoApi
): UseGroupUndoRedoHandlersReturn {
  const isApplyingGroupUndoRedo = React.useRef(false);

  const createGroupWithUndo = React.useCallback(
    (selectedNodeIds?: string[]): string | null => {
      const groupId = groups.createGroup(selectedNodeIds);
      if (groupId) {
        const newStyle = groups.groupStyles.find(s => s.id === groupId);
        if (newStyle) {
          pushUndo(undoRedo, groups, isApplyingGroupUndoRedo, null, cloneGroupStyle(newStyle));
        }
      }
      return groupId;
    },
    [groups, undoRedo]
  );

  const deleteGroupWithUndo = React.useCallback(
    (groupId: string): void => {
      const beforeStyle = cloneGroupStyle(groups.groupStyles.find(s => s.id === groupId) || undefined);
      if (beforeStyle) {
        pushUndo(undoRedo, groups, isApplyingGroupUndoRedo, beforeStyle, null);
      }
      groups.deleteGroup(groupId);
    },
    [groups, undoRedo]
  );

  const applyGroupAnnotationChange = React.useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean): void => {
      applyGroupAnnotationChangeInternal(action, isUndo, groups, isApplyingGroupUndoRedo);
    },
    [groups]
  );

  return {
    createGroupWithUndo,
    deleteGroupWithUndo,
    applyGroupAnnotationChange,
    isApplyingGroupUndoRedo
  };
}
