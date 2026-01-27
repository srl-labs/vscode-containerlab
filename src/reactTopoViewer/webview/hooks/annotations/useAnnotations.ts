import { useCallback, useMemo } from "react";
import type { ReactFlowInstance } from "@xyflow/react";

import { useDerivedAnnotations } from "../useDerivedAnnotations";
import { useAnnotationUIActions, useAnnotationUIState } from "../../stores/annotationUIStore";
import { useMode, useIsLocked } from "../../stores/topoViewerStore";
import { useUndoRedoActions } from "../../stores/undoRedoStore";
import { findDeepestGroupAtPosition, generateGroupId } from "../groups";

import type { AnnotationContextValue } from "./types";
import { handleAnnotationNodeDrop, handleTopologyNodeDrop } from "./helpers";
import { useGroupAnnotations } from "./useGroupAnnotations";
import { useTextAnnotations } from "./useTextAnnotations";
import { useShapeAnnotations } from "./useShapeAnnotations";

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
  const undoRedo = useUndoRedoActions();

  const derived = useDerivedAnnotations();

  const groupActions = useGroupAnnotations({
    mode,
    isLocked,
    onLockedAction,
    rfInstance,
    derived,
    uiActions,
    undoRedo
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
    uiActions,
    undoRedo
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
    uiActions,
    undoRedo
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

      handleTopologyNodeDrop(
        nodeId,
        targetGroupId,
        derived.getNodeMembership(nodeId),
        derived.addNodeToGroup,
        derived.removeNodeFromGroup
      );
    },
    [derived]
  );

  const deleteAllSelected = useCallback(() => {
    uiState.selectedGroupIds.forEach((id) => derived.deleteGroup(id));
    uiState.selectedTextIds.forEach((id) => derived.deleteTextAnnotation(id));
    uiState.selectedShapeIds.forEach((id) => derived.deleteShapeAnnotation(id));
    uiActions.clearAllSelections();
  }, [
    uiState.selectedGroupIds,
    uiState.selectedTextIds,
    uiState.selectedShapeIds,
    uiActions,
    derived
  ]);

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
      updateGroupParent: (id, parentId) =>
        derived.updateGroup(id, { parentId: parentId ?? undefined }),
      updateGroupGeoPosition: (id, coords) => derived.updateGroup(id, { geoCoordinates: coords }),
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
      updateTextSize: (id, width, height) => derived.updateTextAnnotation(id, { width, height }),
      updateTextGeoPosition: (id, coords) =>
        derived.updateTextAnnotation(id, { geoCoordinates: coords }),
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
      updateShapeSize: shapeActions.updateShapeSize,
      updateShapeEndPosition: (id, endPosition) =>
        derived.updateShapeAnnotation(id, { endPosition }),
      updateShapeGeoPosition: (id, coords) =>
        derived.updateShapeAnnotation(id, { geoCoordinates: coords }),
      updateShapeEndGeoPosition: (id, coords) =>
        derived.updateShapeAnnotation(id, { endGeoCoordinates: coords }),
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
      deleteAllSelected
    ]
  );
}
