/**
 * App-level hook for group undo handlers.
 * Extracted from App.tsx to reduce complexity.
 * Note: This hook must be called after useGraphUndoRedoHandlers since it needs undoRedo.
 */
import { useCallback } from "react";

import type { CyCompatCore, CyCompatElement } from "../useCytoCompatInstance";

import type { FreeShapeAnnotation, FreeTextAnnotation } from "../../../shared/types/topology";
import type { RelatedAnnotationChange, UndoRedoAction } from "../state/useUndoRedo";

import type { UseGroupsReturn } from "./groupTypes";
import { useGroupUndoRedoHandlers } from "./useGroupUndoRedoHandlers";

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

interface UseAppGroupUndoHandlersOptions {
  cyInstance: CyCompatCore | null;
  groups: UseGroupsReturn;
  undoRedo: UndoRedoApi;
  textAnnotations?: FreeTextAnnotation[];
  shapeAnnotations?: FreeShapeAnnotation[];
}

export interface UseAppGroupUndoHandlersReturn {
  handleAddGroupWithUndo: () => void;
  deleteGroupWithUndo: (groupId: string) => void;
}

/**
 * Check if a node can be added to a group.
 * Returns false for annotations.
 */
function canBeGrouped(node: CyCompatElement): boolean {
  const role = node.data("topoViewerRole") as string | undefined;
  return role !== "freeText" && role !== "freeShape";
}

export function useAppGroupUndoHandlers(
  options: UseAppGroupUndoHandlersOptions
): UseAppGroupUndoHandlersReturn {
  const { cyInstance, groups, undoRedo, textAnnotations, shapeAnnotations } = options;

  // Group undo/redo handlers
  const groupUndoHandlers = useGroupUndoRedoHandlers(groups, undoRedo);

  // Undo-aware handleAddGroup that creates group from selected nodes
  // Note: Do NOT auto-open editor - it blocks clicks on nodes inside the group
  // Users can double-click or right-click the group to edit it later
  const handleAddGroupWithUndo = useCallback(() => {
    if (!cyInstance) return;
    const selectedNodeIds = cyInstance
      .nodes(":selected")
      .filter((n) => canBeGrouped(n))
      .map((n) => n.id());

    const groupId = groupUndoHandlers.createGroupWithUndo(
      selectedNodeIds.length > 0 ? selectedNodeIds : undefined
    );
    if (groupId) {
      // Clear all selections after creating group to prevent:
      // 1. BUG-004: Cytoscape selection blocking subsequent clicks
      // 2. Accidental group deletion when pressing Delete
      cyInstance.elements().unselect();
      groups.clearGroupSelection();
    }
  }, [cyInstance, groupUndoHandlers, groups]);

  const deleteGroupWithUndo = useCallback(
    (groupId: string) => {
      const beforeGroup = groups.groups.find((g) => g.id === groupId);
      if (!beforeGroup) return;

      if (!groupUndoHandlers.isApplyingGroupUndoRedo.current) {
        const parentId = groups.getParentGroup(groupId)?.id ?? null;
        const memberIds = groups.getGroupMembers(groupId);
        const action = groups.getUndoRedoAction(beforeGroup, null);

        if (memberIds.length > 0) {
          action.membershipBefore = memberIds.map((nodeId) => ({ nodeId, groupId }));
          action.membershipAfter = memberIds.map((nodeId) => ({ nodeId, groupId: parentId }));
        }

        const relatedAnnotations: RelatedAnnotationChange[] = [];
        const childGroups = groups.getChildGroups(groupId);
        if (childGroups.length > 0) {
          const promotedParentId = beforeGroup.parentId;
          childGroups.forEach((child) => {
            const beforeChild = { ...child, position: { ...child.position } };
            relatedAnnotations.push({
              annotationType: "group",
              before: beforeChild,
              after: { ...beforeChild, parentId: promotedParentId }
            });
          });
        }
        if (textAnnotations) {
          textAnnotations.forEach((annotation) => {
            if (annotation.groupId !== groupId) return;
            relatedAnnotations.push({
              annotationType: "freeText",
              before: { ...annotation },
              after: { ...annotation, groupId: parentId ?? undefined }
            });
          });
        }
        if (shapeAnnotations) {
          shapeAnnotations.forEach((annotation) => {
            if (annotation.groupId !== groupId) return;
            relatedAnnotations.push({
              annotationType: "freeShape",
              before: { ...annotation },
              after: { ...annotation, groupId: parentId ?? undefined }
            });
          });
        }
        if (relatedAnnotations.length > 0) {
          action.relatedAnnotations = relatedAnnotations;
        }

        undoRedo.pushAction(action);
      }

      groups.deleteGroup(groupId);
    },
    [groups, undoRedo, textAnnotations, shapeAnnotations, groupUndoHandlers]
  );

  return {
    handleAddGroupWithUndo,
    deleteGroupWithUndo
  };
}

// ============================================================================
// Group Position Handler with Member Node Movement
// ============================================================================

interface UseGroupPositionHandlerOptions {
  cyInstance: CyCompatCore | null;
  groups: UseGroupsReturn;
}

export type GroupPositionChangeHandler = (
  groupId: string,
  position: { x: number; y: number },
  delta: { dx: number; dy: number }
) => void;

/**
 * Hook that creates a handler for group position changes.
 * Moves member nodes along with the group when dragged.
 */
export function useGroupPositionHandler(
  options: UseGroupPositionHandlerOptions
): GroupPositionChangeHandler {
  const { groups } = options;

  return useCallback(
    (groupId: string, position: { x: number; y: number }, _delta: { dx: number; dy: number }) => {
      // Note: Real-time node movement is handled by useGroupDragMoveHandler
      // This handler just persists the final group position
      groups.updateGroupPosition(groupId, position);
    },
    [groups]
  );
}

export type GroupDragMoveHandler = (groupId: string, delta: { dx: number; dy: number }) => void;

/**
 * Hook that creates a handler for real-time node movement during group drag.
 * Note: In the CyCompat layer, position updates are read-only.
 * Actual node position updates should be handled through React state in ReactFlow.
 */
export function useGroupDragMoveHandler(
  options: UseGroupPositionHandlerOptions
): GroupDragMoveHandler {
  const { cyInstance, groups } = options;

  return useCallback(
    (groupId: string, delta: { dx: number; dy: number }) => {
      if (!cyInstance || (delta.dx === 0 && delta.dy === 0)) return;
      const memberIds = groups.getGroupMembers(groupId);
      // Note: In CyCompatCore, position is read-only. Actual movement should be
      // handled through React state updates. This callback now just identifies
      // which nodes need to move - the actual movement happens via updateNodePositions
      // in the parent component.
      void memberIds; // Member IDs identified for movement
    },
    [cyInstance, groups]
  );
}
