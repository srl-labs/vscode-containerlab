import { useCallback, useMemo, useRef } from "react";

import type { FreeShapeAnnotation } from "../../../shared/types/topology";
import type { AnnotationUIActions, AnnotationUIState } from "../../stores/annotationUIStore";
import type { UndoRedoActions } from "./annotationTypes";
import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE
} from "../../utils/annotations/constants";
import { normalizeShapeAnnotationColors } from "../../utils/color";
import { freeShapeToNode } from "../../utils/annotationNodeConverters";
import { findDeepestGroupAtPosition } from "./groupUtils";
import { log } from "../../utils/logger";

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
  undoRedo: UndoRedoActions;
}

export interface ShapeAnnotationActions {
  handleAddShapes: (shapeType?: string) => void;
  editShapeAnnotation: (id: string) => void;
  saveShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteShapeAnnotation: (id: string) => void;
  deleteSelectedShapeAnnotations: () => void;
  onShapeRotationStart: (id: string) => void;
  onShapeRotationEnd: (id: string) => void;
  updateShapeSize: (id: string, width: number, height: number) => void;
  handleShapeCanvasClick: (position: { x: number; y: number }) => void;
}

export function useShapeAnnotations(params: UseShapeAnnotationsParams): ShapeAnnotationActions {
  const { mode, isLocked, onLockedAction, derived, uiState, uiActions, undoRedo } = params;

  const lastShapeStyleRef = useRef<Partial<FreeShapeAnnotation>>({});
  const shapeRotationSnapshotRef = useRef<{
    id: string;
    snapshot: ReturnType<typeof undoRedo.captureSnapshot>;
  } | null>(null);

  const handleAddShapes = useCallback(
    (shapeType?: string) => {
      if (mode !== "edit") return;
      if (isLocked) {
        onLockedAction();
        return;
      }
      const validType =
        shapeType === "rectangle" || shapeType === "circle" || shapeType === "line"
          ? shapeType
          : undefined;
      uiActions.setAddShapeMode(true, validType);
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
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [annotation.id] });
      const normalized = normalizeShapeAnnotationColors(annotation);

      if (isNew) {
        derived.addShapeAnnotation(normalized);
      } else {
        derived.updateShapeAnnotation(normalized.id, normalized);
      }

      lastShapeStyleRef.current = {
        fillColor: normalized.fillColor,
        fillOpacity: normalized.fillOpacity,
        borderColor: normalized.borderColor,
        borderWidth: normalized.borderWidth,
        borderStyle: normalized.borderStyle
      };

      uiActions.closeShapeEditor();

      undoRedo.commitChange(
        snapshot,
        isNew ? `Add shape ${annotation.id}` : `Update shape ${annotation.id}`,
        { explicitNodes: [freeShapeToNode(normalized)] }
      );
    },
    [derived, uiActions, undoRedo]
  );

  const deleteShapeAnnotation = useCallback(
    (id: string) => {
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.deleteShapeAnnotation(id);
      uiActions.removeFromShapeSelection(id);
      undoRedo.commitChange(snapshot, `Delete shape ${id}`, { explicitNodes: [] });
    },
    [derived, uiActions, undoRedo]
  );

  const deleteSelectedShapeAnnotations = useCallback(() => {
    const ids = Array.from(uiState.selectedShapeIds);
    if (ids.length === 0) return;
    const snapshot = undoRedo.captureSnapshot({ nodeIds: ids });
    ids.forEach((id) => {
      derived.deleteShapeAnnotation(id);
      uiActions.removeFromShapeSelection(id);
    });
    undoRedo.commitChange(snapshot, `Delete ${ids.length} shape${ids.length === 1 ? "" : "s"}`, {
      explicitNodes: []
    });
  }, [derived, uiActions, undoRedo, uiState.selectedShapeIds]);

  const onShapeRotationStart = useCallback(
    (id: string) => {
      shapeRotationSnapshotRef.current = {
        id,
        snapshot: undoRedo.captureSnapshot({ nodeIds: [id] })
      };
    },
    [undoRedo]
  );

  const onShapeRotationEnd = useCallback(
    (id: string) => {
      if (shapeRotationSnapshotRef.current && shapeRotationSnapshotRef.current.id === id) {
        const annotation = derived.shapeAnnotations.find((a) => a.id === id);
        if (annotation) {
          undoRedo.commitChange(shapeRotationSnapshotRef.current.snapshot, `Rotate shape ${id}`, {
            explicitNodes: [freeShapeToNode(annotation)]
          });
        }
        shapeRotationSnapshotRef.current = null;
      }
    },
    [derived.shapeAnnotations, undoRedo]
  );

  const updateShapeSize = useCallback(
    (id: string, width: number, height: number) => {
      const shape = derived.shapeAnnotations.find((s) => s.id === id);
      if (!shape) return;
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [id] });
      derived.updateShapeAnnotation(id, { width, height });
      const updatedShape: FreeShapeAnnotation = { ...shape, width, height };
      undoRedo.commitChange(snapshot, `Resize shape ${id}`, {
        explicitNodes: [freeShapeToNode(updatedShape)]
      });
    },
    [derived, undoRedo]
  );

  const handleShapeCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!uiState.isAddShapeMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const pendingShapeType = uiState.pendingShapeType;
      const newAnnotation: FreeShapeAnnotation = {
        id: `freeShape_${Date.now()}`,
        shapeType: pendingShapeType,
        position,
        width: pendingShapeType === "line" ? undefined : 100,
        height: pendingShapeType === "line" ? undefined : 100,
        endPosition:
          pendingShapeType === "line" ? { x: position.x + 150, y: position.y } : undefined,
        fillColor: lastShapeStyleRef.current.fillColor ?? DEFAULT_FILL_COLOR,
        fillOpacity: lastShapeStyleRef.current.fillOpacity ?? DEFAULT_FILL_OPACITY,
        borderColor: lastShapeStyleRef.current.borderColor ?? DEFAULT_BORDER_COLOR,
        borderWidth: lastShapeStyleRef.current.borderWidth ?? DEFAULT_BORDER_WIDTH,
        borderStyle: lastShapeStyleRef.current.borderStyle ?? DEFAULT_BORDER_STYLE,
        groupId: parentGroup?.id
      };
      const snapshot = undoRedo.captureSnapshot({ nodeIds: [newAnnotation.id] });
      derived.addShapeAnnotation(newAnnotation);
      undoRedo.commitChange(snapshot, `Add shape ${newAnnotation.id}`, {
        explicitNodes: [freeShapeToNode(newAnnotation)]
      });
      uiActions.disableAddShapeMode();
      log.info(`[FreeShape] Creating ${pendingShapeType} at (${position.x}, ${position.y})`);
    },
    [uiState.isAddShapeMode, uiState.pendingShapeType, derived, undoRedo, uiActions]
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
      updateShapeSize,
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
      updateShapeSize,
      handleShapeCanvasClick
    ]
  );
}
