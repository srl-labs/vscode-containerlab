/**
 * Hook that combines freeShape and group annotation appliers.
 * Extracted from App.tsx to reduce complexity.
 *
 * This file also includes the group annotation applier functionality
 * (previously in useGroupAnnotationApplier.ts).
 */
import React, { useCallback } from 'react';

import type { UndoRedoActionAnnotation, UndoRedoActionGroupMove } from '../state/useUndoRedo';
import type { GroupStyleAnnotation, FreeTextAnnotation, FreeShapeAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';

import type { UseGroupsReturn } from './groupTypes';

// ============================================================================
// Group Annotation Applier Types and Functions
// ============================================================================

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

// ============================================================================
// Combined Annotation Applier
// ============================================================================

interface UseCombinedAnnotationApplierOptions {
  groups: UseGroupsReturn;
  applyFreeShapeChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyFreeTextChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  /** Callback to update text annotation position (for group move undo/redo) */
  onUpdateTextAnnotation?: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  /** Callback to update shape annotation position (for group move undo/redo) */
  onUpdateShapeAnnotation?: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
}

/** Restore descendant groups from undo/redo action */
function restoreDescendantGroups(
  action: UndoRedoActionGroupMove,
  isUndo: boolean,
  currentGroups: GroupStyleAnnotation[]
): GroupStyleAnnotation[] {
  const descendantGroups = (isUndo
    ? action.descendantGroupsBefore
    : action.descendantGroupsAfter) as GroupStyleAnnotation[] | undefined;

  if (!descendantGroups || descendantGroups.length === 0) {
    return currentGroups;
  }

  let updatedGroups = currentGroups;
  for (const dg of descendantGroups) {
    updatedGroups = updatedGroups.map(g => g.id === dg.id ? dg : g);
  }
  log.info(`[CombinedApplier] Restored ${descendantGroups.length} descendant groups`);
  return updatedGroups;
}

/** Restore text annotations from undo/redo action */
function restoreTextAnnotations(
  action: UndoRedoActionGroupMove,
  isUndo: boolean,
  onUpdate?: (id: string, updates: Partial<FreeTextAnnotation>) => void
): void {
  if (!onUpdate) return;

  const textAnnotations = (isUndo
    ? action.textAnnotationsBefore
    : action.textAnnotationsAfter) as FreeTextAnnotation[] | undefined;

  if (!textAnnotations || textAnnotations.length === 0) return;

  for (const ta of textAnnotations) {
    onUpdate(ta.id, { position: { ...ta.position } });
  }
  log.info(`[CombinedApplier] Restored ${textAnnotations.length} text annotations`);
}

/** Restore shape annotations from undo/redo action */
function restoreShapeAnnotations(
  action: UndoRedoActionGroupMove,
  isUndo: boolean,
  onUpdate?: (id: string, updates: Partial<FreeShapeAnnotation>) => void
): void {
  if (!onUpdate) return;

  const shapeAnnotations = (isUndo
    ? action.shapeAnnotationsBefore
    : action.shapeAnnotationsAfter) as FreeShapeAnnotation[] | undefined;

  if (!shapeAnnotations || shapeAnnotations.length === 0) return;

  for (const sa of shapeAnnotations) {
    const updates: Partial<FreeShapeAnnotation> = { position: { ...sa.position } };
    if (sa.endPosition) {
      updates.endPosition = { ...sa.endPosition };
    }
    onUpdate(sa.id, updates);
  }
  log.info(`[CombinedApplier] Restored ${shapeAnnotations.length} shape annotations`);
}

export interface UseCombinedAnnotationApplierReturn {
  applyAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
  applyGroupMoveChange: (action: UndoRedoActionGroupMove, isUndo: boolean) => void;
}

export function useCombinedAnnotationApplier(
  options: UseCombinedAnnotationApplierOptions
): UseCombinedAnnotationApplierReturn {
  const { groups, applyFreeShapeChange, applyFreeTextChange, onUpdateTextAnnotation, onUpdateShapeAnnotation } = options;

  // Group annotation applier for undo/redo
  const { applyGroupAnnotationChange } = useGroupAnnotationApplier(groups);

  // Combined annotation change handler for undo/redo
  const applyAnnotationChange = useCallback(
    (action: UndoRedoActionAnnotation, isUndo: boolean) => {
      if (action.annotationType === 'freeShape') {
        applyFreeShapeChange(action, isUndo);
      } else if (action.annotationType === 'freeText') {
        applyFreeTextChange(action, isUndo);
      } else if (action.annotationType === 'group') {
        applyGroupAnnotationChange(action, isUndo);
      }
    },
    [applyFreeShapeChange, applyFreeTextChange, applyGroupAnnotationChange]
  );

  // Group move change handler for undo/redo (group + member nodes + descendant groups + annotations)
  const applyGroupMoveChange = useCallback(
    (action: UndoRedoActionGroupMove, isUndo: boolean) => {
      const targetGroup = (isUndo ? action.groupBefore : action.groupAfter) as GroupStyleAnnotation;

      // 1. Restore parent group position
      let updatedGroups = groups.groups.map(g =>
        g.id === targetGroup.id ? targetGroup : g
      );

      // 2. Restore descendant group positions
      updatedGroups = restoreDescendantGroups(action, isUndo, updatedGroups);
      groups.loadGroups(updatedGroups);

      // 3. Restore annotation positions
      restoreTextAnnotations(action, isUndo, onUpdateTextAnnotation);
      restoreShapeAnnotations(action, isUndo, onUpdateShapeAnnotation);

      log.info(`[CombinedApplier] Applied group move ${isUndo ? 'undo' : 'redo'} for ${targetGroup.id}`);
    },
    [groups, onUpdateTextAnnotation, onUpdateShapeAnnotation]
  );

  return { applyAnnotationChange, applyGroupMoveChange };
}
