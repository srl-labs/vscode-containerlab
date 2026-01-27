import { useCallback, useMemo } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import {
  saveAllNodeGroupMemberships,
  saveAnnotationNodesFromGraph,
  saveNodeGroupMembership
} from "../../services";
import { useAnnotationUIActions, useAnnotationUIState } from "../../stores/annotationUIStore";
import { useGraphStore } from "../../stores/graphStore";
import { useIsLocked, useMode } from "../../stores/topoViewerStore";
import { collectNodeGroupMemberships } from "../../utils/groupMembership";

import type { AnnotationContextValue } from "./annotationTypes";
import { handleAnnotationNodeDrop, handleTopologyNodeDrop } from "./annotationHelpers";
import { findDeepestGroupAtPosition, generateGroupId } from "./groupUtils";
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

  const mode = useMode();
  const isLocked = useIsLocked();
  const uiState = useAnnotationUIState();
  const uiActions = useAnnotationUIActions();
  const derived = useDerivedAnnotations();

  const groupActions = useGroupAnnotations({
    mode,
    isLocked,
    onLockedAction,
    rfInstance,
    derived,
    uiActions
  });

  const textActions = useTextAnnotations({
    mode,
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
    mode,
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

  const onNodeDropped = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (nodeId.startsWith("group-")) return;

      const targetGroup = findDeepestGroupAtPosition(position, derived.groups);
      const targetGroupId = targetGroup?.id ?? null;

      if (nodeId.startsWith("freeText_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.textAnnotations,
          derived.updateTextAnnotation
        );
        void saveAnnotationNodesFromGraph();
        return;
      }

      if (nodeId.startsWith("freeShape_")) {
        handleAnnotationNodeDrop(
          nodeId,
          targetGroupId,
          derived.shapeAnnotations,
          derived.updateShapeAnnotation
        );
        void saveAnnotationNodesFromGraph();
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
    [derived, saveAnnotationNodesFromGraph, saveNodeGroupMembership]
  );

  const deleteAllSelected = useCallback(() => {
    const groupsToDelete = Array.from(uiState.selectedGroupIds);
    const membersToClear = new Set<string>();

    for (const groupId of groupsToDelete) {
      derived.getGroupMembers(groupId).forEach((memberId) => membersToClear.add(memberId));
      derived.deleteGroup(groupId);
    }

    uiState.selectedTextIds.forEach((id) => derived.deleteTextAnnotation(id));
    uiState.selectedShapeIds.forEach((id) => derived.deleteShapeAnnotation(id));

    if (membersToClear.size > 0) {
      for (const memberId of membersToClear) {
        derived.removeNodeFromGroup(memberId);
      }

      const memberships = collectNodeGroupMemberships(useGraphStore.getState().nodes);
      void saveAllNodeGroupMemberships(memberships);
    }

    uiActions.clearAllSelections();
    void saveAnnotationNodesFromGraph();
  }, [
    uiState.selectedGroupIds,
    uiState.selectedTextIds,
    uiState.selectedShapeIds,
    uiActions,
    derived,
    saveAnnotationNodesFromGraph,
    saveAllNodeGroupMemberships
  ]);

  const persistAnnotationNodes = useCallback(() => {
    void saveAnnotationNodesFromGraph();
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
        derived.updateGroup(id, { parentId: parentId ?? undefined });
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
      generateGroupId: () => generateGroupId(derived.groups),
      addGroup: groupActions.addGroup,
      updateGroupSize: groupActions.updateGroupSize,

      // Text actions
      handleAddText: textActions.handleAddText,
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
      updateShapeEndPosition: (id, endPosition) => {
        derived.updateShapeAnnotation(id, { endPosition });
        persistAnnotationNodes();
      },
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
      deleteAllSelected
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
      persistAnnotationNodes
    ]
  );
}
