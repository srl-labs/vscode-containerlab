/**
 * Hook for integrating free text annotations into App.tsx
 * Handles loading, state management, and callbacks for the App component
 */
import React, { useCallback, useMemo } from "react";
import type { Core as CyCore } from "cytoscape";

import type { FreeTextAnnotation, GroupStyleAnnotation } from "../../../shared/types/topology";
import { log } from "../../utils/logger";
import { subscribeToWebviewMessages, type TypedMessageEvent } from "../../utils/webviewMessageBus";
import { findDeepestGroupAtPosition } from "../groups";

import { createDefaultAnnotation } from "./freeText";
import {
  createEditAnnotationCallback,
  createCommonSelectionReturn
} from "./sharedAnnotationHelpers";
import { useFreeTextState, useFreeTextActions } from "./useFreeTextState";
import type {
  AnnotationActionMethods,
  AnnotationSelectionMethods,
  UseFreeTextAnnotationsOptions,
  UseFreeTextAnnotationsReturn,
  AnnotationUndoAction
} from "./freeText";

interface InitialData {
  freeTextAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: "topology-data";
  data: {
    freeTextAnnotations?: FreeTextAnnotation[];
  };
}

interface UseAppFreeTextAnnotationsOptions {
  cyInstance: CyCore | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  /** Groups for auto-assigning groupId when creating annotations inside groups */
  groups?: GroupStyleAnnotation[];
}

export interface UseAppFreeTextAnnotationsReturn
  extends Omit<AnnotationActionMethods, "loadAnnotations">, AnnotationSelectionMethods {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  handleAddText: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
}

/**
 * Internal hook for managing free text annotations.
 * Handles state, persistence, and undo/redo for text annotations.
 */
function useFreeTextAnnotations(
  options: UseFreeTextAnnotationsOptions
): UseFreeTextAnnotationsReturn {
  const { mode, isLocked, onLockedAction, groups } = options;

  // State management
  const state = useFreeTextState();
  const {
    annotations,
    editingAnnotation,
    isAddTextMode,
    setEditingAnnotation,
    setIsAddTextMode,
    lastStyleRef,
    selectedAnnotationIds
  } = state;

  // CRUD actions
  const actions = useFreeTextActions({ state, mode, isLocked, onLockedAction });

  // Canvas click handler for creating new annotations
  const handleCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!isAddTextMode) return;
      const defaultAnnotation = createDefaultAnnotation(position);

      // Check if position is inside a group and auto-assign groupId
      const parentGroup = groups ? findDeepestGroupAtPosition(position, groups) : null;

      const newAnnotation: FreeTextAnnotation = {
        ...defaultAnnotation,
        ...lastStyleRef.current,
        id: defaultAnnotation.id,
        text: "",
        position: defaultAnnotation.position,
        groupId: parentGroup?.id
      };
      setEditingAnnotation(newAnnotation);
      setIsAddTextMode(false);
      const groupInfo = parentGroup ? ` in group ${parentGroup.id}` : "";
      log.info(`[FreeText] Creating annotation at (${position.x}, ${position.y})${groupInfo}`);
    },
    [isAddTextMode, lastStyleRef, setEditingAnnotation, setIsAddTextMode, groups]
  );

  // Edit existing annotation
  const editAnnotation = useCallback(
    createEditAnnotationCallback(
      mode,
      isLocked,
      onLockedAction,
      annotations,
      setEditingAnnotation,
      "FreeText"
    ),
    [mode, isLocked, onLockedAction, annotations, setEditingAnnotation]
  );

  // Undo/redo action creator
  const getUndoRedoAction = useCallback(
    (
      before: FreeTextAnnotation | null,
      after: FreeTextAnnotation | null
    ): AnnotationUndoAction => ({
      type: "annotation",
      annotationType: "freeText",
      before,
      after
    }),
    []
  );

  return useMemo(
    () => ({
      annotations,
      editingAnnotation,
      isAddTextMode,
      enableAddTextMode: actions.enableAddTextMode,
      disableAddTextMode: actions.disableAddTextMode,
      handleCanvasClick,
      editAnnotation,
      closeEditor: actions.closeEditor,
      saveAnnotation: actions.saveAnnotation,
      deleteAnnotation: actions.deleteAnnotation,
      updatePosition: actions.updatePosition,
      updateSize: actions.updateSize,
      updateRotation: actions.updateRotation,
      updateAnnotation: actions.updateAnnotation,
      updateGeoPosition: actions.updateGeoPosition,
      migrateGroupId: actions.migrateGroupId,
      loadAnnotations: actions.loadAnnotations,
      getUndoRedoAction,
      ...createCommonSelectionReturn(selectedAnnotationIds, actions)
    }),
    [
      annotations,
      editingAnnotation,
      isAddTextMode,
      actions,
      handleCanvasClick,
      editAnnotation,
      getUndoRedoAction,
      selectedAnnotationIds
    ]
  );
}

/**
 * Hook that integrates free text annotations with App.tsx
 * Handles initialization from __INITIAL_DATA__ and message listeners
 */
export function useAppFreeTextAnnotations(
  options: UseAppFreeTextAnnotationsOptions
): UseAppFreeTextAnnotationsReturn {
  const { cyInstance, mode, isLocked, onLockedAction, groups } = options;

  const freeTextAnnotations = useFreeTextAnnotations({
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction,
    groups
  });

  // Handle Add Text button from panel - enable add text mode
  const handleAddText = React.useCallback(() => {
    if (isLocked) {
      onLockedAction();
      return;
    }
    freeTextAnnotations.enableAddTextMode();
  }, [isLocked, onLockedAction, freeTextAnnotations]);

  // Extract stable callback reference
  const { loadAnnotations } = freeTextAnnotations;

  // Load initial free text annotations
  React.useEffect(() => {
    // Load from initial data on mount
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.freeTextAnnotations?.length) {
      loadAnnotations(initialData.freeTextAnnotations as FreeTextAnnotation[]);
    }

    // Also listen for topology data updates
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (message?.type === "topology-data") {
        // Always load to clear old annotations if empty
        loadAnnotations(message.data?.freeTextAnnotations || []);
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === "topology-data");
  }, [loadAnnotations]);

  return {
    annotations: freeTextAnnotations.annotations,
    editingAnnotation: freeTextAnnotations.editingAnnotation,
    isAddTextMode: freeTextAnnotations.isAddTextMode,
    handleAddText,
    handleCanvasClick: freeTextAnnotations.handleCanvasClick,
    editAnnotation: freeTextAnnotations.editAnnotation,
    closeEditor: freeTextAnnotations.closeEditor,
    saveAnnotation: freeTextAnnotations.saveAnnotation,
    deleteAnnotation: freeTextAnnotations.deleteAnnotation,
    updatePosition: freeTextAnnotations.updatePosition,
    updateSize: freeTextAnnotations.updateSize,
    updateRotation: freeTextAnnotations.updateRotation,
    updateAnnotation: freeTextAnnotations.updateAnnotation,
    updateGeoPosition: freeTextAnnotations.updateGeoPosition,
    selectedAnnotationIds: freeTextAnnotations.selectedAnnotationIds,
    selectAnnotation: freeTextAnnotations.selectAnnotation,
    toggleAnnotationSelection: freeTextAnnotations.toggleAnnotationSelection,
    clearAnnotationSelection: freeTextAnnotations.clearAnnotationSelection,
    deleteSelectedAnnotations: freeTextAnnotations.deleteSelectedAnnotations,
    getSelectedAnnotations: freeTextAnnotations.getSelectedAnnotations,
    boxSelectAnnotations: freeTextAnnotations.boxSelectAnnotations,
    copySelectedAnnotations: freeTextAnnotations.copySelectedAnnotations,
    pasteAnnotations: freeTextAnnotations.pasteAnnotations,
    duplicateSelectedAnnotations: freeTextAnnotations.duplicateSelectedAnnotations,
    hasClipboardContent: freeTextAnnotations.hasClipboardContent,
    migrateGroupId: freeTextAnnotations.migrateGroupId
  };
}
