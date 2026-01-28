/**
 * Hook for tracking group resize operations with undo support.
 * Captures group state on resize start, uses non-undo updates during resize,
 * and creates a single undo action on resize end.
 */
import type React from "react";
import { useCallback, useRef } from "react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { UndoRedoAction, UndoRedoActionAnnotation } from "../state/useUndoRedo";
import { log } from "../../utils/logger";

import type { UseGroupsReturn } from "./groupTypes";

/** Deep clone a group annotation */
function cloneGroupForUndo(group: GroupStyleAnnotation): GroupStyleAnnotation {
  return {
    ...group,
    position: { ...group.position }
  };
}

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

interface ResizeStartState {
  groupId: string;
  groupBefore: GroupStyleAnnotation;
}

export interface UseGroupResizeUndoOptions {
  groups: UseGroupsReturn;
  undoRedo: UndoRedoApi;
  isApplyingGroupUndoRedo: React.RefObject<boolean>;
}

export interface UseGroupResizeUndoReturn {
  /** Call when group resize starts to capture initial state */
  onResizeStart: (groupId: string) => void;
  /** Call during resize to update size without undo (visual updates) */
  onResizeMove: (
    groupId: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void;
  /** Call when group resize ends to record undo action */
  onResizeEnd: (
    groupId: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void;
}

/** Check if size or position changed */
function hasChanged(
  before: GroupStyleAnnotation,
  afterWidth: number,
  afterHeight: number,
  afterPosition: { x: number; y: number }
): boolean {
  return (
    before.width !== afterWidth ||
    before.height !== afterHeight ||
    before.position.x !== afterPosition.x ||
    before.position.y !== afterPosition.y
  );
}

export function useGroupResizeUndo(options: UseGroupResizeUndoOptions): UseGroupResizeUndoReturn {
  const { groups, undoRedo, isApplyingGroupUndoRedo } = options;
  const resizeStartRef = useRef<ResizeStartState | null>(null);

  const onResizeStart = useCallback(
    (groupId: string) => {
      if (isApplyingGroupUndoRedo.current) return;

      const group = groups.groups.find((g) => g.id === groupId);
      if (!group) return;

      resizeStartRef.current = {
        groupId,
        groupBefore: cloneGroupForUndo(group)
      };

      log.info(`[GroupResizeUndo] Resize started for group ${groupId}`);
    },
    [groups.groups, isApplyingGroupUndoRedo]
  );

  const onResizeMove = useCallback(
    (groupId: string, width: number, height: number, position: { x: number; y: number }) => {
      // Update size and position without undo (visual updates only)
      // These use the non-undo wrapped versions
      groups.updateGroupSize(groupId, width, height);
      groups.updateGroupPosition(groupId, position);
    },
    [groups]
  );

  const onResizeEnd = useCallback(
    (
      groupId: string,
      finalWidth: number,
      finalHeight: number,
      finalPosition: { x: number; y: number }
    ) => {
      if (isApplyingGroupUndoRedo.current) return;

      const startState = resizeStartRef.current;
      if (!startState || startState.groupId !== groupId) {
        // No start state, just update directly
        groups.updateGroupSize(groupId, finalWidth, finalHeight);
        groups.updateGroupPosition(groupId, finalPosition);
        return;
      }

      // Check if anything changed
      if (!hasChanged(startState.groupBefore, finalWidth, finalHeight, finalPosition)) {
        resizeStartRef.current = null;
        return;
      }

      // Create after state
      const groupAfter: GroupStyleAnnotation = {
        ...startState.groupBefore,
        width: finalWidth,
        height: finalHeight,
        position: { ...finalPosition }
      };

      // Push single undo action
      const action: UndoRedoActionAnnotation = {
        type: "annotation",
        annotationType: "group",
        before: startState.groupBefore,
        after: groupAfter
      };
      undoRedo.pushAction(action);

      // Apply final state
      groups.updateGroupSize(groupId, finalWidth, finalHeight);
      groups.updateGroupPosition(groupId, finalPosition);

      log.info(
        `[GroupResizeUndo] Resize completed for group ${groupId}: ${startState.groupBefore.width}x${startState.groupBefore.height} -> ${finalWidth}x${finalHeight}`
      );

      resizeStartRef.current = null;
    },
    [groups, undoRedo, isApplyingGroupUndoRedo]
  );

  return { onResizeStart, onResizeMove, onResizeEnd };
}
