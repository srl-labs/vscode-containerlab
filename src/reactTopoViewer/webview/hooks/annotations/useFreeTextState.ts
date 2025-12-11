/**
 * State management hook for free text annotations
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FreeTextAnnotation } from '../../../shared/types/topology';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { log } from '../../utils/logger';
import {
  SAVE_DEBOUNCE_MS,
  extractStyleFromAnnotation,
  saveAnnotationToList,
  updateAnnotationInList,
  updateAnnotationPosition,
  updateAnnotationRotation
} from './freeTextHelpers';

export interface UseFreeTextStateReturn {
  annotations: FreeTextAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>;
  editingAnnotation: FreeTextAnnotation | null;
  setEditingAnnotation: React.Dispatch<React.SetStateAction<FreeTextAnnotation | null>>;
  isAddTextMode: boolean;
  setIsAddTextMode: React.Dispatch<React.SetStateAction<boolean>>;
  lastStyleRef: React.RefObject<Partial<FreeTextAnnotation>>;
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void;
}

/**
 * Hook for managing annotation state and persistence
 */
export function useFreeTextState(): UseFreeTextStateReturn {
  const [annotations, setAnnotations] = useState<FreeTextAnnotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<FreeTextAnnotation | null>(null);
  const [isAddTextMode, setIsAddTextMode] = useState(false);

  const lastStyleRef = useRef<Partial<FreeTextAnnotation>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAnnotationsToExtension = useCallback((updatedAnnotations: FreeTextAnnotation[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      sendCommandToExtension('save-free-text-annotations', { annotations: updatedAnnotations });
      log.info(`[FreeText] Saved ${updatedAnnotations.length} annotations`);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return {
    annotations,
    setAnnotations,
    editingAnnotation,
    setEditingAnnotation,
    isAddTextMode,
    setIsAddTextMode,
    lastStyleRef,
    saveAnnotationsToExtension
  };
}

export interface UseFreeTextActionsOptions {
  state: UseFreeTextStateReturn;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

export interface UseFreeTextActionsReturn {
  enableAddTextMode: () => void;
  disableAddTextMode: () => void;
  closeEditor: () => void;
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  loadAnnotations: (annotations: FreeTextAnnotation[]) => void;
}

// Hook for mode toggle actions
function useModeActions(
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  setIsAddTextMode: React.Dispatch<React.SetStateAction<boolean>>
) {
  const enableAddTextMode = useCallback(() => {
    if (mode === 'view' || isLocked) {
      if (isLocked) onLockedAction?.();
      return;
    }
    setIsAddTextMode(true);
    log.info('[FreeText] Add text mode enabled');
  }, [mode, isLocked, onLockedAction, setIsAddTextMode]);

  const disableAddTextMode = useCallback(() => {
    setIsAddTextMode(false);
    log.info('[FreeText] Add text mode disabled');
  }, [setIsAddTextMode]);

  return { enableAddTextMode, disableAddTextMode };
}

// Hook for annotation CRUD operations
function useAnnotationCrud(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  setEditingAnnotation: React.Dispatch<React.SetStateAction<FreeTextAnnotation | null>>,
  lastStyleRef: { current: Partial<FreeTextAnnotation> },
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
) {
  const closeEditor = useCallback(() => setEditingAnnotation(null), [setEditingAnnotation]);

  const saveAnnotation = useCallback((annotation: FreeTextAnnotation) => {
    if (!annotation.text.trim()) {
      closeEditor();
      return;
    }
    lastStyleRef.current = extractStyleFromAnnotation(annotation);
    setAnnotations(prev => {
      const updated = saveAnnotationToList(prev, annotation);
      saveAnnotationsToExtension(updated);
      return updated;
    });
    closeEditor();
    log.info(`[FreeText] Saved annotation: ${annotation.id}`);
  }, [closeEditor, lastStyleRef, setAnnotations, saveAnnotationsToExtension]);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeText] Deleted annotation: ${id}`);
  }, [setAnnotations, saveAnnotationsToExtension]);

  const loadAnnotations = useCallback((loadedAnnotations: FreeTextAnnotation[]) => {
    setAnnotations(loadedAnnotations);
    log.info(`[FreeText] Loaded ${loadedAnnotations.length} annotations`);
  }, [setAnnotations]);

  return { closeEditor, saveAnnotation, deleteAnnotation, loadAnnotations };
}

// Hook for position/size/rotation updates
function useAnnotationUpdates(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
) {
  const updatePosition = useCallback((id: string, position: { x: number; y: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationPosition(a, position));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  const updateSize = useCallback((id: string, width: number, height: number) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, width, height }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  const updateRotation = useCallback((id: string, rotation: number) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationRotation(a, rotation));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  return { updatePosition, updateSize, updateRotation };
}

/**
 * Hook for annotation CRUD actions
 */
export function useFreeTextActions(options: UseFreeTextActionsOptions): UseFreeTextActionsReturn {
  const { state, mode, isLocked, onLockedAction } = options;
  const { setAnnotations, setEditingAnnotation, setIsAddTextMode, lastStyleRef, saveAnnotationsToExtension } = state;

  const modeActions = useModeActions(mode, isLocked, onLockedAction, setIsAddTextMode);
  const crudActions = useAnnotationCrud(setAnnotations, setEditingAnnotation, lastStyleRef, saveAnnotationsToExtension);
  const updateActions = useAnnotationUpdates(setAnnotations, saveAnnotationsToExtension);

  return {
    ...modeActions,
    ...crudActions,
    ...updateActions
  };
}
