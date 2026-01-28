/**
 * Hook that wraps group actions with undo/redo recording.
 * Similar pattern to useFreeShapeUndoRedoHandlers.
 */
import React from "react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { RelatedAnnotationChange, UndoRedoActionAnnotation } from "../state/useUndoRedo";
import { type UndoRedoApi, updateWithUndo, createPushUndoFn } from "../shared/undoHelpers";

import type { UseGroupsReturn } from "./groupTypes";
import { createGroupInserter, createGroupRemover, createGroupUpserter } from "./groupHelpers";

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
function transformPosition(
  group: GroupStyleAnnotation,
  position: { x: number; y: number }
): GroupStyleAnnotation {
  return { ...group, position: { ...position } };
}

/** Transform group size */
function transformSize(
  group: GroupStyleAnnotation,
  size: { width: number; height: number }
): GroupStyleAnnotation {
  return { ...group, ...size };
}

function applyGroupAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  groupsApi: Pick<UseGroupsReturn, "createGroup" | "deleteGroup" | "loadGroups" | "groups">,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== "group") return;
  const target = (isUndo ? action.before : action.after) as GroupStyleAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as GroupStyleAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target && !opposite) {
      // Restoring a deleted group - add back
      groupsApi.loadGroups(createGroupInserter(target));
    } else if (!target && opposite) {
      // Deleting a group
      groupsApi.loadGroups(createGroupRemover(opposite.id));
    } else if (target && opposite) {
      // Updating group
      groupsApi.loadGroups(createGroupUpserter(target));
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
          const action = groupsApi.getUndoRedoAction(null, after);
          if (selectedNodeIds && selectedNodeIds.length > 0) {
            action.membershipBefore = selectedNodeIds.map((nodeId) => ({
              nodeId,
              groupId: groupsApi.getNodeMembership(nodeId)
            }));
            action.membershipAfter = selectedNodeIds.map((nodeId) => ({
              nodeId,
              groupId: result.groupId
            }));
          }
          undoRedo.pushAction(action);
        }
        return result.groupId;
      }
      return null;
    },
    [groupsApi, undoRedo]
  );

  const deleteGroupWithUndo = React.useCallback(
    (groupId: string): void => {
      const beforeGroup = cloneGroup(groupsApi.groups.find((g) => g.id === groupId));
      if (beforeGroup && !isApplyingGroupUndoRedo.current) {
        const action = groupsApi.getUndoRedoAction(beforeGroup, null);
        const relatedAnnotations: RelatedAnnotationChange[] = [];
        const childGroups = groupsApi.getChildGroups(groupId);
        if (childGroups.length > 0) {
          const promotedParentId = beforeGroup.parentId;
          childGroups.forEach((child) => {
            const beforeChild = cloneGroup(child);
            if (!beforeChild) return;
            relatedAnnotations.push({
              annotationType: "group",
              before: beforeChild,
              after: { ...beforeChild, parentId: promotedParentId }
            });
          });
        }
        const memberIds = groupsApi.getGroupMembers(groupId);
        if (memberIds.length > 0) {
          const parentId = groupsApi.getParentGroup(groupId)?.id ?? null;
          action.membershipBefore = memberIds.map((nodeId) => ({ nodeId, groupId }));
          action.membershipAfter = memberIds.map((nodeId) => ({ nodeId, groupId: parentId }));
        }
        if (relatedAnnotations.length > 0) {
          action.relatedAnnotations = relatedAnnotations;
        }
        undoRedo.pushAction(action);
      }
      groupsApi.deleteGroup(groupId);
    },
    [groupsApi, undoRedo]
  );

  const updateGroupPositionWithUndo = React.useCallback(
    (groupId: string, position: { x: number; y: number }): void => {
      updateWithUndo(
        groupId,
        groupsApi.groups,
        cloneGroup,
        transformPosition,
        pushUndoFn,
        groupsApi.updateGroupPosition,
        position
      );
    },
    [groupsApi.groups, groupsApi.updateGroupPosition, pushUndoFn]
  );

  const updateGroupSizeWithUndo = React.useCallback(
    (groupId: string, width: number, height: number): void => {
      updateWithUndo(
        groupId,
        groupsApi.groups,
        cloneGroup,
        transformSize,
        pushUndoFn,
        (id, size) => groupsApi.updateGroupSize(id, size.width, size.height),
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
