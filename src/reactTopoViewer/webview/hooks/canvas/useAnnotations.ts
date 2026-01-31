import { useCallback, useMemo } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import {
  saveAllNodeGroupMemberships,
  saveAnnotationNodesFromGraph,
  saveNodeGroupMembership
} from "../../services";
import { useAnnotationUIActions, useAnnotationUIState } from "../../stores/annotationUIStore";
import { useGraphStore } from "../../stores/graphStore";
import { useIsLocked } from "../../stores/topoViewerStore";
import { collectNodeGroupMemberships } from "../../annotations/groupMembership";
import type { GroupStyleAnnotation } from "../../../shared/types/topology";

import type { AnnotationContextValue } from "./annotationTypes";
import { handleAnnotationNodeDrop, handleTopologyNodeDrop } from "./annotationHelpers";
import {
  findDeepestGroupAtPosition,
  findParentGroupForBounds,
  generateGroupId
} from "./groupUtils";
import { useDerivedAnnotations } from "./useDerivedAnnotations";
import { useGroupAnnotations } from "./useGroupAnnotations";
import { useShapeAnnotations } from "./useShapeAnnotations";
import { useTextAnnotations } from "./useTextAnnotations";

interface UseAnnotationsParams {
  rfInstance: ReactFlowInstance | null;
  onLockedAction?: () => void;
}

export function useAnnotations(params?: UseAnnotationsParams): AnnotationContextValue {
  const rfInstance = params?.rfInstance ?? null;
  const onLockedAction = params?.onLockedAction ?? (() => {});

  const isLocked = useIsLocked();
  const uiState = useAnnotationUIState();
  const uiActions = useAnnotationUIActions();
  const derived = useDerivedAnnotations();

  const groupActions = useGroupAnnotations({
    isLocked,
    onLockedAction,
    rfInstance,
    derived,
    uiActions
  });

  const textActions = useTextAnnotations({
    isLocked,
    onLockedAction,
    derived,
    uiState: {
      isAddTextMode: uiState.isAddTextMode,
      selectedTextIds: uiState.selectedTextIds
    },
    uiActions
  });

  const shapeActions = useShapeAnnotations({
    isLocked,
    onLockedAction,
    derived,
    uiState: {
      isAddShapeMode: uiState.isAddShapeMode,
      pendingShapeType: uiState.pendingShapeType,
      selectedShapeIds: uiState.selectedShapeIds
    },
    uiActions
  });

  const getGroupParentId = useCallback((group: GroupStyleAnnotation): string | null => {
    if (typeof group.parentId === "string") return group.parentId;
    if (typeof group.groupId === "string") return group.groupId;
    return null;
  }, []);

  const getGroupDescendants = useCallback(
    (rootId: string): Set<string> => {
      const descendants = new Set<string>();
      const stack = [rootId];

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        for (const group of derived.groups) {
          const parentId = getGroupParentId(group);
          if (!parentId || parentId !== current) continue;
          if (!descendants.has(group.id)) {
            descendants.add(group.id);
            stack.push(group.id);
          }
        }
      }

      return descendants;
    },
    [derived.groups, getGroupParentId]
  );

  const onNodeDropped = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      const droppedGroup = derived.groups.find((group) => group.id === nodeId);
      if (droppedGroup) {
        const bounds = {
          x: position.x,
          y: position.y,
          width: droppedGroup.width ?? 200,
          height: droppedGroup.height ?? 150
        };
        const excluded = getGroupDescendants(nodeId);
        excluded.add(nodeId);
        const candidateGroups = derived.groups.filter((group) => !excluded.has(group.id));
        const parentGroup = findParentGroupForBounds(bounds, candidateGroups, nodeId);
        const nextParentId = parentGroup?.id ?? null;
        const currentParentId = getGroupParentId(droppedGroup);

        if (currentParentId !== nextParentId) {
          derived.updateGroup(nodeId, {
            parentId: nextParentId ?? undefined,
            groupId: nextParentId ?? undefined
          });
        }
        return;
      }

      const targetGroup = findDeepestGroupAtPosition(position, derived.groups);
      const targetGroupId = targetGroup?.id ?? null;

      if (nodeId.startsWith("freeText_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.textAnnotations,
          derived.updateTextAnnotation
        );
        return;
      }

      if (nodeId.startsWith("freeShape_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.shapeAnnotations,
          derived.updateShapeAnnotation
        );
        return;
      }

      const currentGroupId = derived.getNodeMembership(nodeId);
      handleTopologyNodeDrop(
        nodeId,
        targetGroupId,
        currentGroupId,
        derived.addNodeToGroup,
        derived.removeNodeFromGroup
      );

      if (currentGroupId !== targetGroupId) {
        void saveNodeGroupMembership(nodeId, targetGroupId);
      }
    },
    [
      derived,
      getGroupDescendants,
      getGroupParentId,
      saveAnnotationNodesFromGraph,
      saveNodeGroupMembership
    ]
  );

  const deleteSelections = useCallback(
    (
      groupIds: Set<string>,
      textIds: Set<string>,
      shapeIds: Set<string>,
      options: { persist: boolean }
    ): { didDelete: boolean; membersCleared: boolean } => {
      if (groupIds.size === 0 && textIds.size === 0 && shapeIds.size === 0) {
        return { didDelete: false, membersCleared: false };
      }

      const membersToClear = new Set<string>();

      for (const groupId of groupIds) {
        derived.getGroupMembers(groupId).forEach((memberId) => membersToClear.add(memberId));
        derived.deleteGroup(groupId);
        uiActions.removeFromGroupSelection(groupId);
      }

      for (const id of textIds) {
        derived.deleteTextAnnotation(id);
        uiActions.removeFromTextSelection(id);
      }

      for (const id of shapeIds) {
        derived.deleteShapeAnnotation(id);
        uiActions.removeFromShapeSelection(id);
      }

      if (membersToClear.size > 0) {
        for (const memberId of membersToClear) {
          derived.removeNodeFromGroup(memberId);
        }

        if (options.persist) {
          const memberships = collectNodeGroupMemberships(useGraphStore.getState().nodes);
          saveAllNodeGroupMemberships(memberships).catch((err) => {
            console.error("[Annotations] Failed to save group memberships", err);
          });
        }
      }

      uiActions.clearAllSelections();

      if (options.persist) {
        saveAnnotationNodesFromGraph().catch((err) => {
          console.error("[Annotations] Failed to save annotations", err);
        });
      }

      return { didDelete: true, membersCleared: membersToClear.size > 0 };
    },
    [derived, uiActions, saveAnnotationNodesFromGraph, saveAllNodeGroupMemberships]
  );

  const deleteAllSelected = useCallback(() => {
    deleteSelections(
      new Set(uiState.selectedGroupIds),
      new Set(uiState.selectedTextIds),
      new Set(uiState.selectedShapeIds),
      { persist: true }
    );
  }, [
    uiState.selectedGroupIds,
    uiState.selectedTextIds,
    uiState.selectedShapeIds,
    deleteSelections
  ]);

  const deleteSelectedForBatch = useCallback(
    (options?: {
      groupIds?: Iterable<string>;
      textIds?: Iterable<string>;
      shapeIds?: Iterable<string>;
    }): { didDelete: boolean; membersCleared: boolean } => {
      const groupIds = new Set(uiState.selectedGroupIds);
      const textIds = new Set(uiState.selectedTextIds);
      const shapeIds = new Set(uiState.selectedShapeIds);

      for (const id of options?.groupIds ?? []) {
        groupIds.add(id);
      }
      for (const id of options?.textIds ?? []) {
        textIds.add(id);
      }
      for (const id of options?.shapeIds ?? []) {
        shapeIds.add(id);
      }

      return deleteSelections(groupIds, textIds, shapeIds, { persist: false });
    },
    [
      uiState.selectedGroupIds,
      uiState.selectedTextIds,
      uiState.selectedShapeIds,
      deleteSelections
    ]
  );

  const persistAnnotationNodes = useCallback(() => {
    saveAnnotationNodesFromGraph().catch((err) => {
      console.error("[Annotations] Failed to save annotations", err);
    });
  }, [saveAnnotationNodesFromGraph]);

  // Persist without re-applying snapshot - use for continuous updates like handle dragging
  const persistAnnotationNodesQuiet = useCallback(() => {
    saveAnnotationNodesFromGraph(undefined, { applySnapshot: false }).catch((err) => {
      console.error("[Annotations] Failed to save annotations (quiet)", err);
    });
  }, [saveAnnotationNodesFromGraph]);

  return useMemo<AnnotationContextValue>(
    () => ({
      // State
      groups: derived.groups,
      selectedGroupIds: uiState.selectedGroupIds,
      editingGroup: uiState.editingGroup,
      textAnnotations: derived.textAnnotations,
      selectedTextIds: uiState.selectedTextIds,
      editingTextAnnotation: uiState.editingTextAnnotation,
      isAddTextMode: uiState.isAddTextMode,
      shapeAnnotations: derived.shapeAnnotations,
      selectedShapeIds: uiState.selectedShapeIds,
      editingShapeAnnotation: uiState.editingShapeAnnotation,
      isAddShapeMode: uiState.isAddShapeMode,
      pendingShapeType: uiState.pendingShapeType,

      // Group actions
      selectGroup: uiActions.selectGroup,
      toggleGroupSelection: uiActions.toggleGroupSelection,
      boxSelectGroups: uiActions.boxSelectGroups,
      clearGroupSelection: uiActions.clearGroupSelection,
      editGroup: groupActions.editGroup,
      closeGroupEditor: uiActions.closeGroupEditor,
      saveGroup: groupActions.saveGroup,
      deleteGroup: groupActions.deleteGroup,
      updateGroup: derived.updateGroup,
      updateGroupParent: (id, parentId) => {
        derived.updateGroup(id, {
          parentId: parentId ?? undefined,
          groupId: parentId ?? undefined
        });
        persistAnnotationNodes();
      },
      updateGroupGeoPosition: (id, coords) => {
        derived.updateGroup(id, { geoCoordinates: coords });
        persistAnnotationNodes();
      },
      addNodeToGroup: derived.addNodeToGroup,
      getNodeMembership: derived.getNodeMembership,
      getGroupMembers: derived.getGroupMembers,
      handleAddGroup: groupActions.handleAddGroup,
      createGroupAtPosition: groupActions.createGroupAtPosition,
      generateGroupId: () => generateGroupId(derived.groups),
      addGroup: groupActions.addGroup,
      updateGroupSize: groupActions.updateGroupSize,

      // Text actions
      handleAddText: textActions.handleAddText,
      createTextAtPosition: textActions.createTextAtPosition,
      disableAddTextMode: uiActions.disableAddTextMode,
      selectTextAnnotation: uiActions.selectTextAnnotation,
      toggleTextAnnotationSelection: uiActions.toggleTextAnnotationSelection,
      boxSelectTextAnnotations: uiActions.boxSelectTextAnnotations,
      clearTextAnnotationSelection: uiActions.clearTextAnnotationSelection,
      editTextAnnotation: textActions.editTextAnnotation,
      closeTextEditor: uiActions.closeTextEditor,
      saveTextAnnotation: textActions.saveTextAnnotation,
      deleteTextAnnotation: textActions.deleteTextAnnotation,
      deleteSelectedTextAnnotations: textActions.deleteSelectedTextAnnotations,
      updateTextRotation: (id: string, rotation: number) =>
        derived.updateTextAnnotation(id, { rotation }),
      onTextRotationStart: textActions.onTextRotationStart,
      onTextRotationEnd: textActions.onTextRotationEnd,
      updateTextSize: (id, width, height) => {
        derived.updateTextAnnotation(id, { width, height });
        persistAnnotationNodes();
      },
      updateTextGeoPosition: (id, coords) => {
        derived.updateTextAnnotation(id, { geoCoordinates: coords });
        persistAnnotationNodes();
      },
      updateTextAnnotation: derived.updateTextAnnotation,
      handleTextCanvasClick: textActions.handleTextCanvasClick,

      // Shape actions
      handleAddShapes: shapeActions.handleAddShapes,
      createShapeAtPosition: shapeActions.createShapeAtPosition,
      disableAddShapeMode: uiActions.disableAddShapeMode,
      selectShapeAnnotation: uiActions.selectShapeAnnotation,
      toggleShapeAnnotationSelection: uiActions.toggleShapeAnnotationSelection,
      boxSelectShapeAnnotations: uiActions.boxSelectShapeAnnotations,
      clearShapeAnnotationSelection: uiActions.clearShapeAnnotationSelection,
      editShapeAnnotation: shapeActions.editShapeAnnotation,
      closeShapeEditor: uiActions.closeShapeEditor,
      saveShapeAnnotation: shapeActions.saveShapeAnnotation,
      deleteShapeAnnotation: shapeActions.deleteShapeAnnotation,
      deleteSelectedShapeAnnotations: shapeActions.deleteSelectedShapeAnnotations,
      updateShapeRotation: (id, rotation) => derived.updateShapeAnnotation(id, { rotation }),
      onShapeRotationStart: shapeActions.onShapeRotationStart,
      onShapeRotationEnd: shapeActions.onShapeRotationEnd,
      updateShapeSize: (id, width, height) => {
        derived.updateShapeAnnotation(id, { width, height });
        persistAnnotationNodes();
      },
      updateShapeStartPosition: (id, startPosition) => {
        // Only update local state during drag - persist should be called on drag end
        derived.updateShapeAnnotation(id, { position: startPosition });
      },
      updateShapeEndPosition: (id, endPosition) => {
        // Only update local state during drag - persist should be called on drag end
        derived.updateShapeAnnotation(id, { endPosition });
      },
      // Persist annotations (call on drag end)
      persistAnnotations: persistAnnotationNodesQuiet,
      updateShapeGeoPosition: (id, coords) => {
        derived.updateShapeAnnotation(id, { geoCoordinates: coords });
        persistAnnotationNodes();
      },
      updateShapeEndGeoPosition: (id, coords) => {
        derived.updateShapeAnnotation(id, { endGeoCoordinates: coords });
        persistAnnotationNodes();
      },
      updateShapeAnnotation: derived.updateShapeAnnotation,
      handleShapeCanvasClick: shapeActions.handleShapeCanvasClick,

      // Membership
      onNodeDropped,

      // Utilities
      clearAllSelections: uiActions.clearAllSelections,
      deleteAllSelected,
      deleteSelectedForBatch
    }),
    [
      derived,
      uiState,
      uiActions,
      groupActions,
      textActions,
      shapeActions,
      onNodeDropped,
      deleteAllSelected,
      deleteSelectedForBatch,
      persistAnnotationNodes,
      persistAnnotationNodesQuiet
    ]
  );
}
