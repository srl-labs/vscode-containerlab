/**
 * Hook for managing free text annotations in React TopoViewer.
 * Handles state, persistence, and undo/redo for text annotations.
 */
import { useCallback, useMemo } from 'react';

import { FreeTextAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { findDeepestGroupAtPosition } from '../groups/hierarchyUtils';

import { createDefaultAnnotation } from './freeTextHelpers';
import { useFreeTextState, useFreeTextActions } from './useFreeTextState';
import type {
  UseFreeTextAnnotationsOptions,
  UseFreeTextAnnotationsReturn,
  AnnotationUndoAction
} from './freeTextTypes';

// Re-export types for consumers
export type { UseFreeTextAnnotationsOptions, UseFreeTextAnnotationsReturn, AnnotationUndoAction };

/**
 * Main hook for free text annotations
 */
export function useFreeTextAnnotations(options: UseFreeTextAnnotationsOptions): UseFreeTextAnnotationsReturn {
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
  const handleCanvasClick = useCallback((position: { x: number; y: number }) => {
    if (!isAddTextMode) return;
    const defaultAnnotation = createDefaultAnnotation(position);

    // Check if position is inside a group and auto-assign groupId
    const parentGroup = groups ? findDeepestGroupAtPosition(position, groups) : null;

    const newAnnotation: FreeTextAnnotation = {
      ...defaultAnnotation,
      ...lastStyleRef.current,
      id: defaultAnnotation.id,
      text: '',
      position: defaultAnnotation.position,
      groupId: parentGroup?.id
    };
    setEditingAnnotation(newAnnotation);
    setIsAddTextMode(false);
    const groupInfo = parentGroup ? ` in group ${parentGroup.id}` : '';
    log.info(`[FreeText] Creating annotation at (${position.x}, ${position.y})${groupInfo}`);
  }, [isAddTextMode, lastStyleRef, setEditingAnnotation, setIsAddTextMode, groups]);

  // Edit existing annotation
  const editAnnotation = useCallback((id: string) => {
    if (mode === 'view' || isLocked) {
      if (isLocked) onLockedAction?.();
      return;
    }
    const annotation = annotations.find(a => a.id === id);
    if (annotation) {
      setEditingAnnotation({ ...annotation });
      log.info(`[FreeText] Editing annotation: ${id}`);
    }
  }, [mode, isLocked, onLockedAction, annotations, setEditingAnnotation]);

  // Undo/redo action creator
  const getUndoRedoAction = useCallback((
    before: FreeTextAnnotation | null,
    after: FreeTextAnnotation | null
  ): AnnotationUndoAction => ({
    type: 'annotation',
    annotationType: 'freeText',
    before,
    after
  }), []);

  return useMemo(() => ({
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
    selectedAnnotationIds,
    selectAnnotation: actions.selectAnnotation,
    toggleAnnotationSelection: actions.toggleAnnotationSelection,
    clearAnnotationSelection: actions.clearAnnotationSelection,
    deleteSelectedAnnotations: actions.deleteSelectedAnnotations,
    getSelectedAnnotations: actions.getSelectedAnnotations,
    boxSelectAnnotations: actions.boxSelectAnnotations,
    copySelectedAnnotations: actions.copySelectedAnnotations,
    pasteAnnotations: actions.pasteAnnotations,
    duplicateSelectedAnnotations: actions.duplicateSelectedAnnotations,
    hasClipboardContent: actions.hasClipboardContent
  }), [
    annotations, editingAnnotation, isAddTextMode, actions,
    handleCanvasClick, editAnnotation, getUndoRedoAction, selectedAnnotationIds
  ]);
}
