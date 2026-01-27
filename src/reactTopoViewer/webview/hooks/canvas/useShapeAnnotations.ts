import { useCallback, useMemo, useRef } from "react";

import type { FreeShapeAnnotation } from "../../../shared/types/topology";
import type { AnnotationUIActions, AnnotationUIState } from "../../stores/annotationUIStore";
import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import { findDeepestGroupAtPosition } from "./groupUtils";
import { log } from "../../utils/logger";
import { saveAnnotationNodesFromGraph } from "../../services";

interface UseShapeAnnotationsParams {
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: () => void;
  derived: UseDerivedAnnotationsReturn;
  uiState: Pick<AnnotationUIState, "isAddShapeMode" | "pendingShapeType" | "selectedShapeIds">;
  uiActions: Pick<
    AnnotationUIActions,
    | "setAddShapeMode"
    | "disableAddShapeMode"
    | "setEditingShapeAnnotation"
    | "closeShapeEditor"
    | "removeFromShapeSelection"
  >;
}

export interface ShapeAnnotationActions {
  handleAddShapes: (shapeType?: string) => void;
  editShapeAnnotation: (id: string) => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteShapeAnnotation: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  onShapeRotationStart: (id: string) => void;
  onShapeRotationEnd: (id: string) => void;
  handleShapeCanvasClick: (position: { x: number; y: number }) => void;
}

export function useShapeAnnotations(params: UseShapeAnnotationsParams): ShapeAnnotationActions {
  const { mode, isLocked, onLockedAction, derived, uiState, uiActions } = params;

  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});
  const pendingRotationRef = useRef<string | null>(null);

  const persist = useCallback(() => {
    void saveAnnotationNodesFromGraph();
  }, []);

  const handleAddShapes = useCallback(
    (shapeType?: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      uiActions.setAddShapeMode(shapeType ?? "rectangle");
    },
    [mode, isLocked, onLockedAction, uiActions]
  );

  const editShapeAnnotation = useCallback(
    (id: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const annotation = derived.shapeAnnotations.find((a) => a.id === id);
      if (annotation) {
        uiActions.setEditingShapeAnnotation(annotation);
      }
    },
    [mode, isLocked, onLockedAction, derived.shapeAnnotations, uiActions]
  );

  const saveShapeAnnotation = useCallback(
    (annotation: FreeShapeAnnotation) => {
      const isNew = !derived.shapeAnnotations.some((s) => s.id === annotation.id);

      if (isNew) {
        derived.addShapeAnnotation(annotation);
      } else {
        derived.updateShapeAnnotation(annotation.id, annotation);
      }

      lastShapeStyleRef.current = {
        fillColor: annotation.fillColor,
        fillOpacity: annotation.fillOpacity,
        borderColor: annotation.borderColor,
        borderWidth: annotation.borderWidth,
        borderStyle: annotation.borderStyle,
        borderRadius: annotation.borderRadius,
        rotation: annotation.rotation
      };

      uiActions.closeShapeEditor();
      persist();
    },
    [derived, uiActions, persist]
  );

  const deleteShapeAnnotation = useCallback(
    (id: string) => {
      derived.deleteShapeAnnotation(id);
      uiActions.removeFromShapeSelection(id);
      persist();
    },
    [derived, uiActions, persist]
  );

  const deleteSelectedShapeAnnotations = useCallback(() => {
    const ids = Array.from(uiState.selectedShapeIds);
    if (ids.length === 0) return;
    ids.forEach((id) => {
      derived.deleteShapeAnnotation(id);
      uiActions.removeFromShapeSelection(id);
    });
    persist();
  }, [derived, uiActions, persist, uiState.selectedShapeIds]);

  const onShapeRotationStart = useCallback((id: string) => {
    pendingRotationRef.current = id;
  }, []);

  const onShapeRotationEnd = useCallback(
    (id: string) => {
      if (pendingRotationRef.current === id) {
        pendingRotationRef.current = null;
        persist();
      }
    },
    [persist]
  );

  const handleShapeCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!uiState.isAddShapeMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const newAnnotation: FreeShapeAnnotation = {
        id: `freeShape_${Date.now()}`,
        type: uiState.pendingShapeType ?? "rectangle",
        position,
        endPosition: { x: position.x + 120, y: position.y + 60 },
        rotation: 0,
        fillColor: lastShapeStyleRef.current.fillColor ?? "rgba(255, 255, 255, 0.1)",
        fillOpacity: lastShapeStyleRef.current.fillOpacity ?? 0.2,
        borderColor: lastShapeStyleRef.current.borderColor ?? "#ffffff",
        borderWidth: lastShapeStyleRef.current.borderWidth ?? 1,
        borderStyle: lastShapeStyleRef.current.borderStyle ?? "solid",
        borderRadius: lastShapeStyleRef.current.borderRadius ?? 4,
        groupId: parentGroup?.id
      };
      uiActions.setEditingShapeAnnotation(newAnnotation);
      uiActions.disableAddShapeMode();
      log.info(`[FreeShape] Creating annotation at (${position.x}, ${position.y})`);
    },
    [uiState.isAddShapeMode, uiState.pendingShapeType, derived.groups, uiActions]
  );

  return useMemo(
    () => ({
      handleAddShapes,
      editShapeAnnotation,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      onShapeRotationStart,
      onShapeRotationEnd,
      handleShapeCanvasClick
    }),
    [
      handleAddShapes,
      editShapeAnnotation,
      saveShapeAnnotation,
      deleteShapeAnnotation,
      deleteSelectedShapeAnnotations,
      onShapeRotationStart,
      onShapeRotationEnd,
      handleShapeCanvasClick
    ]
  );
}
