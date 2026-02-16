import { useCallback, useMemo, useRef } from "react";

import type { FreeShapeAnnotation } from "../../../shared/types/topology";
import type { AnnotationUIActions, AnnotationUIState } from "../../stores/annotationUIStore";
import * as annotationServices from "../../services";
import * as logger from "../../utils/logger";

import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import { findDeepestGroupAtPosition } from "./groupUtils";
import { readThemeColor } from "./themeColor";
interface UseShapeAnnotationsParams {
  isLocked: boolean;
  onLockedAction: () => void;
  derived: UseDerivedAnnotationsReturn;
  uiState: Pick<AnnotationUIState, "isAddShapeMode" | "pendingShapeType" | "selectedShapeIds">;
  uiActions: Pick<
    AnnotationUIActions,
    | "setAddShapeMode"
    | "disableAddShapeMode"
    | "setEditingShapeAnnotation"
    | "removeFromShapeSelection"
  >;
}

export interface ShapeAnnotationActions {
  handleAddShapes: (shapeType?: string) => void;
  createShapeAtPosition: (position: { x: number; y: number }, shapeType?: string) => void;
  editShapeAnnotation: (id: string) => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteShapeAnnotation: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  onShapeRotationStart: (id: string) => void;
  onShapeRotationEnd: (id: string) => void;
  handleShapeCanvasClick: (position: { x: number; y: number }) => void;
}

export function useShapeAnnotations(params: UseShapeAnnotationsParams): ShapeAnnotationActions {
  const { isLocked, onLockedAction, derived, uiState, uiActions } = params;
  const canEditAnnotations = !isLocked;

  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});
  const pendingRotationRef = useRef<string | null>(null);

  const persist = useCallback(() => {
    void annotationServices.saveAnnotationNodesFromGraph();
  }, []);

  const handleAddShapes = useCallback(
    (shapeType?: string) => {
      if (!canEditAnnotations) {
        onLockedAction();
        return;
      }
      const normalizedShape: FreeShapeAnnotation["shapeType"] =
        shapeType === "circle" || shapeType === "line" || shapeType === "rectangle"
          ? shapeType
          : "rectangle";
      uiActions.setAddShapeMode(true, normalizedShape);
    },
    [canEditAnnotations, onLockedAction, uiActions]
  );

  const buildShapeAnnotation = useCallback(
    (position: { x: number; y: number }, shapeType?: string): FreeShapeAnnotation => {
      const normalizedShape: FreeShapeAnnotation["shapeType"] =
        shapeType === "circle" || shapeType === "line" || shapeType === "rectangle"
          ? shapeType
          : "rectangle";
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      return {
        id: `freeShape_${Date.now()}`,
        shapeType: normalizedShape,
        position,
        endPosition: { x: position.x + 120, y: position.y + 60 },
        rotation: 0,
        fillColor: lastShapeStyleRef.current.fillColor ?? "rgba(127, 127, 127, 0.16)",
        fillOpacity: lastShapeStyleRef.current.fillOpacity ?? 0.2,
        borderColor:
          lastShapeStyleRef.current.borderColor ??
          readThemeColor("--vscode-editor-foreground", "#666666"),
        borderWidth: lastShapeStyleRef.current.borderWidth ?? 1,
        borderStyle: lastShapeStyleRef.current.borderStyle ?? "solid",
        borderRadius: lastShapeStyleRef.current.borderRadius ?? 4,
        groupId: parentGroup?.id
      };
    },
    [derived.groups]
  );

  const createShapeAtPosition = useCallback(
    (position: { x: number; y: number }, shapeType?: string) => {
      if (!canEditAnnotations) {
        onLockedAction();
        return;
      }
      const newAnnotation = buildShapeAnnotation(position, shapeType);
      derived.addShapeAnnotation(newAnnotation);
      persist();
      logger.log.info(`[FreeShape] Created annotation at (${position.x}, ${position.y})`);
    },
    [canEditAnnotations, onLockedAction, buildShapeAnnotation, derived, persist]
  );

  const editShapeAnnotation = useCallback(
    (id: string) => {
      const annotation = derived.shapeAnnotations.find((a) => a.id === id);
      if (annotation) {
        uiActions.setEditingShapeAnnotation(annotation);
      }
    },
    [derived.shapeAnnotations, uiActions]
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

      persist();
    },
    [derived, persist]
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
      const newAnnotation = buildShapeAnnotation(position, uiState.pendingShapeType);
      uiActions.setEditingShapeAnnotation(newAnnotation);
      uiActions.disableAddShapeMode();
      logger.log.info(`[FreeShape] Creating annotation at (${position.x}, ${position.y})`);
    },
    [uiState.isAddShapeMode, uiState.pendingShapeType, buildShapeAnnotation, uiActions]
  );

  return useMemo(
    () => ({
      handleAddShapes,
      createShapeAtPosition,
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
      createShapeAtPosition,
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
