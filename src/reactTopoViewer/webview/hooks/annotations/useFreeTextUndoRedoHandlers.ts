/**
 * Hook that wraps free text annotation actions with undo/redo recording.
 * Provides annotation applier for undo/redo and wrapper methods for create/delete.
 */
import React from 'react';

import type { FreeTextAnnotation } from '../../../shared/types/topology';
import type { UndoRedoAction, UndoRedoActionAnnotation } from '../state/useUndoRedo';
import type { UndoRedoApi } from '../shared/undoHelpers';

import type { UseAppFreeTextAnnotationsReturn } from './useAppFreeTextAnnotations';

export interface UseFreeTextAnnotationApplierReturn {
  isApplyingAnnotationUndoRedo: React.RefObject<boolean>;
  applyAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

export interface UseFreeTextUndoRedoHandlersReturn {
  saveAnnotationWithUndo: (annotation: FreeTextAnnotation, isNew: boolean) => void;
  deleteAnnotationWithUndo: (id: string) => void;
  deleteSelectedWithUndo: () => void;
}

/** Type for the subset of annotation API needed by undo handlers */
interface FreeTextAnnotationApi {
  annotations: FreeTextAnnotation[];
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  getSelectedAnnotations: () => FreeTextAnnotation[];
  deleteSelectedAnnotations: () => void;
}

function cloneAnnotation(annotation: FreeTextAnnotation | undefined): FreeTextAnnotation | null {
  if (!annotation) return null;
  return {
    ...annotation,
    position: { ...annotation.position }
  };
}

/** Create an undo/redo action for free text annotation changes */
function createUndoAction(before: FreeTextAnnotation | null, after: FreeTextAnnotation | null): UndoRedoAction {
  return {
    type: 'annotation',
    annotationType: 'freeText',
    before,
    after
  } as UndoRedoAction;
}

function pushUndo(
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>,
  before: FreeTextAnnotation | null,
  after: FreeTextAnnotation | null
): void {
  if (isApplyingRef.current) return;
  undoRedo.pushAction(createUndoAction(before, after));
}

function applyAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  freeTextAnnotations: Pick<FreeTextAnnotationApi, 'saveAnnotation' | 'deleteAnnotation'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'freeText') return;
  const target = (isUndo ? action.before : action.after) as FreeTextAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as FreeTextAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target) {
      freeTextAnnotations.saveAnnotation(target);
    } else if (opposite?.id) {
      freeTextAnnotations.deleteAnnotation(opposite.id);
    }
  } finally {
    isApplyingRef.current = false;
  }
}

function recordDeleteSelected(
  undoRedo: UndoRedoApi,
  freeTextAnnotations: Pick<FreeTextAnnotationApi, 'getSelectedAnnotations'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (isApplyingRef.current) return;
  freeTextAnnotations.getSelectedAnnotations().forEach(a => {
    const beforeCopy = cloneAnnotation(a) as FreeTextAnnotation;
    pushUndo(undoRedo, isApplyingRef, beforeCopy, null);
  });
}

export function useFreeTextAnnotationApplier(
  freeTextAnnotations: UseAppFreeTextAnnotationsReturn
): UseFreeTextAnnotationApplierReturn {
  const isApplyingAnnotationUndoRedo = React.useRef(false);
  const applyAnnotationChange = React.useCallback((action: UndoRedoActionAnnotation, isUndo: boolean) => {
    applyAnnotationChangeInternal(action, isUndo, freeTextAnnotations, isApplyingAnnotationUndoRedo);
  }, [freeTextAnnotations]);
  return { isApplyingAnnotationUndoRedo, applyAnnotationChange };
}

export function useFreeTextUndoRedoHandlers(
  freeTextAnnotations: UseAppFreeTextAnnotationsReturn,
  undoRedo: UndoRedoApi,
  isApplyingAnnotationUndoRedo: React.RefObject<boolean>
): UseFreeTextUndoRedoHandlersReturn {

  const saveAnnotationWithUndo = React.useCallback((annotation: FreeTextAnnotation, isNew: boolean) => {
    // Capture before state if editing existing annotation
    const beforeCopy = isNew ? null : cloneAnnotation(freeTextAnnotations.annotations.find(a => a.id === annotation.id));
    const afterCopy = cloneAnnotation(annotation);

    // Save the annotation
    freeTextAnnotations.saveAnnotation(annotation);

    // Push undo action
    if (afterCopy) {
      pushUndo(undoRedo, isApplyingAnnotationUndoRedo, beforeCopy, afterCopy);
    }
  }, [freeTextAnnotations, undoRedo, isApplyingAnnotationUndoRedo]);

  const deleteAnnotationWithUndo = React.useCallback((id: string) => {
    const beforeCopy = cloneAnnotation(freeTextAnnotations.annotations.find(a => a.id === id));
    if (beforeCopy) {
      pushUndo(undoRedo, isApplyingAnnotationUndoRedo, beforeCopy, null);
    }
    freeTextAnnotations.deleteAnnotation(id);
  }, [freeTextAnnotations, undoRedo, isApplyingAnnotationUndoRedo]);

  const deleteSelectedWithUndo = React.useCallback(() => {
    recordDeleteSelected(undoRedo, freeTextAnnotations, isApplyingAnnotationUndoRedo);
    freeTextAnnotations.deleteSelectedAnnotations();
  }, [freeTextAnnotations, undoRedo, isApplyingAnnotationUndoRedo]);

  return {
    saveAnnotationWithUndo,
    deleteAnnotationWithUndo,
    deleteSelectedWithUndo
  };
}
