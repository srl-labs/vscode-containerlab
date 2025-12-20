/**
 * Hook that wraps free shape annotation actions with undo/redo recording.
 * Extracted from App.tsx to keep App complexity low.
 */
import React from 'react';

import { FreeShapeAnnotation } from '../../../shared/types/topology';
import type { UndoRedoAction, UndoRedoActionAnnotation } from '../state/useUndoRedo';

import type { UseFreeShapeAnnotationsReturn } from './freeShapeTypes';
import {
  updateAnnotationPosition,
  updateAnnotationRotation,
  updateAnnotationEndPosition
} from './freeShapeHelpers';

interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

export interface UseFreeShapeUndoRedoHandlersReturn {
  handleCanvasClickWithUndo: (position: { x: number; y: number }) => void;
  deleteAnnotationWithUndo: (id: string) => void;
  updatePositionWithUndo: (id: string, position: { x: number; y: number }) => void;
  updateSizeWithUndo: (id: string, width: number, height: number) => void;
  updateRotationWithUndo: (id: string, rotation: number) => void;
  updateEndPositionWithUndo: (id: string, endPosition: { x: number; y: number }) => void;
  deleteSelectedWithUndo: () => void;
  // Deferred undo for drag operations (captures before state, records undo at drag end)
  captureAnnotationBefore: (id: string) => FreeShapeAnnotation | null;
  finalizeWithUndo: (before: FreeShapeAnnotation | null, id: string) => void;
}

export interface UseFreeShapeAnnotationApplierReturn {
  isApplyingAnnotationUndoRedo: React.RefObject<boolean>;
  applyAnnotationChange: (action: UndoRedoActionAnnotation, isUndo: boolean) => void;
}

function cloneAnnotation(annotation: FreeShapeAnnotation | undefined): FreeShapeAnnotation | null {
  if (!annotation) return null;
  return {
    ...annotation,
    position: { ...annotation.position },
    endPosition: annotation.endPosition ? { ...annotation.endPosition } : undefined
  };
}

function pushUndo(
  undoRedo: UndoRedoApi,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'getUndoRedoAction'>,
  isApplyingRef: React.RefObject<boolean>,
  before: FreeShapeAnnotation | null,
  after: FreeShapeAnnotation | null
): void {
  if (isApplyingRef.current) return;
  undoRedo.pushAction(freeShapeAnnotations.getUndoRedoAction(before, after));
}

function applyAnnotationChangeInternal(
  action: UndoRedoActionAnnotation,
  isUndo: boolean,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'saveAnnotation' | 'deleteAnnotation'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (action.annotationType !== 'freeShape') return;
  const target = (isUndo ? action.before : action.after) as FreeShapeAnnotation | null;
  const opposite = (isUndo ? action.after : action.before) as FreeShapeAnnotation | null;

  isApplyingRef.current = true;
  try {
    if (target) {
      freeShapeAnnotations.saveAnnotation(target);
    } else if (opposite?.id) {
      freeShapeAnnotations.deleteAnnotation(opposite.id);
    }
  } finally {
    isApplyingRef.current = false;
  }
}

function recordDeleteSelected(
  undoRedo: UndoRedoApi,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'getSelectedAnnotations' | 'getUndoRedoAction'>,
  isApplyingRef: React.RefObject<boolean>
): void {
  if (isApplyingRef.current) return;
  freeShapeAnnotations.getSelectedAnnotations().forEach(a => {
    const beforeCopy = cloneAnnotation(a) as FreeShapeAnnotation;
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, null);
  });
}

function handleCanvasClickWithUndoInternal(
  position: { x: number; y: number },
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'handleCanvasClick' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const created = freeShapeAnnotations.handleCanvasClick(position);
  if (created) {
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, null, created);
  }
}

function deleteAnnotationWithUndoInternal(
  id: string,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'annotations' | 'deleteAnnotation' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  if (beforeCopy) {
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, null);
  }
  freeShapeAnnotations.deleteAnnotation(id);
}

function updatePositionWithUndoInternal(
  id: string,
  position: { x: number; y: number },
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'annotations' | 'updatePosition' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  if (beforeCopy) {
    const after = updateAnnotationPosition(beforeCopy, position);
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, after);
  }
  freeShapeAnnotations.updatePosition(id, position);
}

function updateSizeWithUndoInternal(
  id: string,
  width: number,
  height: number,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'annotations' | 'updateSize' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  if (beforeCopy) {
    const after = { ...beforeCopy, width, height };
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, after);
  }
  freeShapeAnnotations.updateSize(id, width, height);
}

function updateRotationWithUndoInternal(
  id: string,
  rotation: number,
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'annotations' | 'updateRotation' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  if (beforeCopy) {
    const after = updateAnnotationRotation(beforeCopy, rotation);
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, after);
  }
  freeShapeAnnotations.updateRotation(id, rotation);
}

function updateEndPositionWithUndoInternal(
  id: string,
  endPosition: { x: number; y: number },
  freeShapeAnnotations: Pick<UseFreeShapeAnnotationsReturn, 'annotations' | 'updateEndPosition' | 'getUndoRedoAction'>,
  undoRedo: UndoRedoApi,
  isApplyingRef: React.RefObject<boolean>
): void {
  const beforeCopy = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  if (beforeCopy) {
    const after = updateAnnotationEndPosition(beforeCopy, endPosition);
    pushUndo(undoRedo, freeShapeAnnotations, isApplyingRef, beforeCopy, after);
  }
  freeShapeAnnotations.updateEndPosition(id, endPosition);
}

export function useFreeShapeAnnotationApplier(
  freeShapeAnnotations: UseFreeShapeAnnotationsReturn
): UseFreeShapeAnnotationApplierReturn {
  const isApplyingAnnotationUndoRedo = React.useRef(false);
  const applyAnnotationChange = React.useCallback((action: UndoRedoActionAnnotation, isUndo: boolean) => {
    applyAnnotationChangeInternal(action, isUndo, freeShapeAnnotations, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations]);
  return { isApplyingAnnotationUndoRedo, applyAnnotationChange };
}

export function useFreeShapeUndoRedoHandlers(
  freeShapeAnnotations: UseFreeShapeAnnotationsReturn,
  undoRedo: UndoRedoApi,
  isApplyingAnnotationUndoRedo: React.RefObject<boolean>
): UseFreeShapeUndoRedoHandlersReturn {

  const handleCanvasClickWithUndo = React.useCallback((position: { x: number; y: number }) => {
    handleCanvasClickWithUndoInternal(position, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const deleteAnnotationWithUndo = React.useCallback((id: string) => {
    deleteAnnotationWithUndoInternal(id, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const updatePositionWithUndo = React.useCallback((id: string, position: { x: number; y: number }) => {
    updatePositionWithUndoInternal(id, position, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const updateSizeWithUndo = React.useCallback((id: string, width: number, height: number) => {
    updateSizeWithUndoInternal(id, width, height, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const updateRotationWithUndo = React.useCallback((id: string, rotation: number) => {
    updateRotationWithUndoInternal(id, rotation, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const updateEndPositionWithUndo = React.useCallback((id: string, endPosition: { x: number; y: number }) => {
    updateEndPositionWithUndoInternal(id, endPosition, freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo);
  }, [freeShapeAnnotations, undoRedo]);

  const deleteSelectedWithUndo = React.useCallback(() => {
    recordDeleteSelected(undoRedo, freeShapeAnnotations, isApplyingAnnotationUndoRedo);
    freeShapeAnnotations.deleteSelectedAnnotations();
  }, [freeShapeAnnotations, undoRedo]);

  // Capture annotation state before a drag operation (for deferred undo)
  const captureAnnotationBefore = React.useCallback((id: string): FreeShapeAnnotation | null => {
    return cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
  }, [freeShapeAnnotations.annotations]);

  // Record undo at drag end with before state captured at drag start
  const finalizeWithUndo = React.useCallback((before: FreeShapeAnnotation | null, id: string) => {
    if (!before || isApplyingAnnotationUndoRedo.current) return;
    const after = cloneAnnotation(freeShapeAnnotations.annotations.find(a => a.id === id) || undefined);
    if (!after) return;
    // Only record if something actually changed
    const hasChanged = JSON.stringify(before) !== JSON.stringify(after);
    if (hasChanged) {
      undoRedo.pushAction(freeShapeAnnotations.getUndoRedoAction(before, after));
    }
  }, [freeShapeAnnotations, undoRedo, isApplyingAnnotationUndoRedo]);

  return {
    handleCanvasClickWithUndo,
    deleteAnnotationWithUndo,
    updatePositionWithUndo,
    updateSizeWithUndo,
    updateRotationWithUndo,
    updateEndPositionWithUndo,
    deleteSelectedWithUndo,
    captureAnnotationBefore,
    finalizeWithUndo
  };
}
