/**
 * Hook for managing free shape annotations in React TopoViewer.
 */
import { useCallback, useMemo } from 'react';

import type { FreeShapeAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { findDeepestGroupAtPosition } from '../groups/hierarchyUtils';

import { createDefaultAnnotation } from './freeShapeHelpers';
import { useFreeShapeState, useFreeShapeActions } from './useFreeShapeState';
import type { UseFreeShapeAnnotationsOptions, UseFreeShapeAnnotationsReturn, AnnotationUndoAction } from './freeShapeTypes';

export type { UseFreeShapeAnnotationsOptions, UseFreeShapeAnnotationsReturn, AnnotationUndoAction };

export function useFreeShapeAnnotations(options: UseFreeShapeAnnotationsOptions): UseFreeShapeAnnotationsReturn {
  const { mode, isLocked, onLockedAction, groups } = options;

  const state = useFreeShapeState();
  const {
    annotations,
    isAddShapeMode,
    pendingShapeType,
    editingAnnotation,
    setEditingAnnotation,
    setIsAddShapeMode,
    lastStyleRef,
    selectedAnnotationIds
  } = state;

  const actions = useFreeShapeActions({ state, mode, isLocked, onLockedAction });

  const handleCanvasClick = useCallback((position: { x: number; y: number }): FreeShapeAnnotation | null => {
    if (!isAddShapeMode) return null;

    // Check if position is inside a group and auto-assign groupId
    const parentGroup = groups ? findDeepestGroupAtPosition(position, groups) : null;

    const newAnnotation = createDefaultAnnotation(position, pendingShapeType, lastStyleRef.current);
    if (parentGroup) {
      newAnnotation.groupId = parentGroup.id;
    }

    actions.saveAnnotation(newAnnotation);
    actions.selectAnnotation(newAnnotation.id);
    setIsAddShapeMode(false);
    const groupInfo = parentGroup ? ` in group ${parentGroup.id}` : '';
    log.info(`[FreeShape] Created ${pendingShapeType} at (${position.x}, ${position.y})${groupInfo}`);
    return newAnnotation;
  }, [isAddShapeMode, pendingShapeType, lastStyleRef, actions, setIsAddShapeMode, groups]);

  // Edit existing annotation
  const editAnnotation = useCallback((id: string) => {
    if (mode === 'view' || isLocked) {
      if (isLocked) onLockedAction?.();
      return;
    }
    const annotation = annotations.find(a => a.id === id);
    if (annotation) {
      setEditingAnnotation({ ...annotation });
      log.info(`[FreeShape] Editing annotation: ${id}`);
    }
  }, [mode, isLocked, onLockedAction, annotations, setEditingAnnotation]);

  // Close the editor
  const closeEditor = useCallback(() => {
    setEditingAnnotation(null);
    log.info('[FreeShape] Editor closed');
  }, [setEditingAnnotation]);

  const getUndoRedoAction = useCallback((
    before: FreeShapeAnnotation | null,
    after: FreeShapeAnnotation | null
  ): AnnotationUndoAction => ({
    type: 'annotation',
    annotationType: 'freeShape',
    before,
    after
  }), []);

  return useMemo(() => ({
    annotations,
    isAddShapeMode,
    pendingShapeType,
    editingAnnotation,
    enableAddShapeMode: actions.enableAddShapeMode,
    disableAddShapeMode: actions.disableAddShapeMode,
    handleCanvasClick,
    editAnnotation,
    closeEditor,
    deleteAnnotation: actions.deleteAnnotation,
    saveAnnotation: actions.saveAnnotation,
    updatePosition: actions.updatePosition,
    updateSize: actions.updateSize,
    updateRotation: actions.updateRotation,
    updateEndPosition: actions.updateEndPosition,
    updateAnnotation: actions.updateAnnotation,
    updateGeoPosition: actions.updateGeoPosition,
    updateEndGeoPosition: actions.updateEndGeoPosition,
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
    annotations, isAddShapeMode, pendingShapeType, editingAnnotation, actions,
    handleCanvasClick, editAnnotation, closeEditor, getUndoRedoAction, selectedAnnotationIds
  ]);
}
