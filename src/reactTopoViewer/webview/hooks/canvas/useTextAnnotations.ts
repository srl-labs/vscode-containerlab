import { useCallback, useMemo, useRef } from "react";

import type { FreeTextAnnotation } from "../../../shared/types/topology";
import type { AnnotationUIActions, AnnotationUIState } from "../../stores/annotationUIStore";
import { saveAnnotationNodesFromGraph } from "../../services";
import { log } from "../../utils/logger";

import type { UseDerivedAnnotationsReturn } from "./useDerivedAnnotations";
import { findDeepestGroupAtPosition } from "./groupUtils";
interface UseTextAnnotationsParams {
  isLocked: boolean;
  onLockedAction: () => void;
  derived: UseDerivedAnnotationsReturn;
  uiState: Pick<AnnotationUIState, "isAddTextMode" | "selectedTextIds">;
  uiActions: Pick<
    AnnotationUIActions,
    | "setAddTextMode"
    | "disableAddTextMode"
    | "setEditingTextAnnotation"
    | "closeTextEditor"
    | "removeFromTextSelection"
  >;
}

export interface TextAnnotationActions {
  handleAddText: () => void;
  editTextAnnotation: (id: string) => void;
  saveTextAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteTextAnnotation: (id: string) => void;
  deleteSelectedTextAnnotations: () => void;
  onTextRotationStart: (id: string) => void;
  onTextRotationEnd: (id: string) => void;
  handleTextCanvasClick: (position: { x: number; y: number }) => void;
}

export function useTextAnnotations(params: UseTextAnnotationsParams): TextAnnotationActions {
  const { isLocked, onLockedAction, derived, uiState, uiActions } = params;
  const canEditAnnotations = !isLocked;

  const lastTextStyleRef = useRef<Partial<FreeTextAnnotation>>({});
  const pendingRotationRef = useRef<string | null>(null);

  const handleAddText = useCallback(() => {
    if (!canEditAnnotations) {
      onLockedAction();
      return;
    }
    uiActions.setAddTextMode(true);
  }, [canEditAnnotations, onLockedAction, uiActions]);

  const editTextAnnotation = useCallback(
    (id: string) => {
      if (!canEditAnnotations) {
        onLockedAction();
        return;
      }
      const annotation = derived.textAnnotations.find((a) => a.id === id);
      if (annotation) {
        uiActions.setEditingTextAnnotation(annotation);
      }
    },
    [canEditAnnotations, onLockedAction, derived.textAnnotations, uiActions]
  );

  const persist = useCallback(() => {
    void saveAnnotationNodesFromGraph();
  }, []);

  const saveTextAnnotation = useCallback(
    (annotation: FreeTextAnnotation) => {
      const isNew = !derived.textAnnotations.some((t) => t.id === annotation.id);

      if (isNew) {
        derived.addTextAnnotation(annotation);
      } else {
        derived.updateTextAnnotation(annotation.id, annotation);
      }

      lastTextStyleRef.current = {
        fontSize: annotation.fontSize,
        fontColor: annotation.fontColor,
        backgroundColor: annotation.backgroundColor,
        fontWeight: annotation.fontWeight,
        fontStyle: annotation.fontStyle,
        textDecoration: annotation.textDecoration,
        textAlign: annotation.textAlign,
        fontFamily: annotation.fontFamily
      };

      uiActions.closeTextEditor();
      persist();
    },
    [derived, uiActions, persist]
  );

  const deleteTextAnnotation = useCallback(
    (id: string) => {
      derived.deleteTextAnnotation(id);
      uiActions.removeFromTextSelection(id);
      persist();
    },
    [derived, uiActions, persist]
  );

  const deleteSelectedTextAnnotations = useCallback(() => {
    const ids = Array.from(uiState.selectedTextIds);
    if (ids.length === 0) return;
    ids.forEach((id) => {
      derived.deleteTextAnnotation(id);
      uiActions.removeFromTextSelection(id);
    });
    persist();
  }, [derived, uiActions, persist, uiState.selectedTextIds]);

  const onTextRotationStart = useCallback((id: string) => {
    pendingRotationRef.current = id;
  }, []);

  const onTextRotationEnd = useCallback(
    (id: string) => {
      if (pendingRotationRef.current === id) {
        pendingRotationRef.current = null;
        persist();
      }
    },
    [persist]
  );

  const handleTextCanvasClick = useCallback(
    (position: { x: number; y: number }) => {
      if (!uiState.isAddTextMode) return;
      const parentGroup = findDeepestGroupAtPosition(position, derived.groups);
      const newAnnotation: FreeTextAnnotation = {
        id: `freeText_${Date.now()}`,
        text: "",
        position,
        fontSize: lastTextStyleRef.current.fontSize ?? 14,
        fontColor: lastTextStyleRef.current.fontColor ?? "#ffffff",
        backgroundColor: lastTextStyleRef.current.backgroundColor,
        fontWeight: lastTextStyleRef.current.fontWeight ?? "normal",
        fontStyle: lastTextStyleRef.current.fontStyle ?? "normal",
        textDecoration: lastTextStyleRef.current.textDecoration ?? "none",
        textAlign: lastTextStyleRef.current.textAlign ?? "left",
        fontFamily: lastTextStyleRef.current.fontFamily ?? "Arial",
        groupId: parentGroup?.id
      };
      uiActions.setEditingTextAnnotation(newAnnotation);
      uiActions.disableAddTextMode();
      log.info(`[FreeText] Creating annotation at (${position.x}, ${position.y})`);
    },
    [uiState.isAddTextMode, derived.groups, uiActions]
  );

  return useMemo(
    () => ({
      handleAddText,
      editTextAnnotation,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      onTextRotationStart,
      onTextRotationEnd,
      handleTextCanvasClick
    }),
    [
      handleAddText,
      editTextAnnotation,
      saveTextAnnotation,
      deleteTextAnnotation,
      deleteSelectedTextAnnotations,
      onTextRotationStart,
      onTextRotationEnd,
      handleTextCanvasClick
    ]
  );
}
