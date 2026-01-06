/**
 * Hook for integrating free shape annotations into App.tsx
 */
import React, { useCallback, useMemo } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { FreeShapeAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';
import { log } from '../../utils/logger';
import { findDeepestGroupAtPosition } from '../groups';

import { createDefaultAnnotation } from './freeShape';
import { createEditAnnotationCallback, createCommonSelectionReturn } from './sharedAnnotationHelpers';
import { useFreeShapeState, useFreeShapeActions } from './useFreeShapeState';
import type { UseFreeShapeAnnotationsOptions, UseFreeShapeAnnotationsReturn, AnnotationUndoAction } from './freeShape';

export type { UseFreeShapeAnnotationsOptions, UseFreeShapeAnnotationsReturn, AnnotationUndoAction };

/**
 * Hook for managing free shape annotations in React TopoViewer.
 * This is an internal hook - use useAppFreeShapeAnnotations instead.
 */
function useFreeShapeAnnotations(options: UseFreeShapeAnnotationsOptions): UseFreeShapeAnnotationsReturn {
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
  const editAnnotation = useCallback(
    createEditAnnotationCallback(mode, isLocked, onLockedAction, annotations, setEditingAnnotation, 'FreeShape'),
    [mode, isLocked, onLockedAction, annotations, setEditingAnnotation]
  );

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
    ...createCommonSelectionReturn(selectedAnnotationIds, actions)
  }), [
    annotations, isAddShapeMode, pendingShapeType, editingAnnotation, actions,
    handleCanvasClick, editAnnotation, closeEditor, getUndoRedoAction, selectedAnnotationIds
  ]);
}

/**
 * Helper function to normalize shape type strings to valid FreeShapeAnnotation shape types
 */
function normalizeShapeType(shapeType: string | undefined): FreeShapeAnnotation['shapeType'] {
  if (shapeType === 'circle' || shapeType === 'line' || shapeType === 'rectangle') {
    return shapeType;
  }
  return 'rectangle';
}

interface InitialData {
  freeShapeAnnotations?: unknown[];
}

interface TopologyDataMessage {
  type: 'topology-data';
  data: {
    freeShapeAnnotations?: FreeShapeAnnotation[];
  };
}

interface UseAppFreeShapeAnnotationsOptions {
  cyInstance: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: () => void;
  /** Groups for auto-assigning groupId when creating annotations inside groups */
  groups?: GroupStyleAnnotation[];
}

export function useAppFreeShapeAnnotations(options: UseAppFreeShapeAnnotationsOptions) {
  const { cyInstance, mode, isLocked, onLockedAction, groups } = options;

  const freeShapeAnnotations = useFreeShapeAnnotations({
    cy: cyInstance,
    mode,
    isLocked,
    onLockedAction,
    groups
  });

  const { loadAnnotations } = freeShapeAnnotations;

  React.useEffect(() => {
    const initialData = (window as unknown as { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
    if (initialData?.freeShapeAnnotations?.length) {
      loadAnnotations(initialData.freeShapeAnnotations as FreeShapeAnnotation[]);
    }

    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as TopologyDataMessage | undefined;
      if (message?.type === 'topology-data') {
        // Always load to clear old annotations if empty
        loadAnnotations(message.data?.freeShapeAnnotations || []);
      }
    };
    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'topology-data');
  }, [loadAnnotations]);

  return freeShapeAnnotations;
}

interface UseAddShapesHandlerParams {
  isLocked: boolean;
  onLockedAction: () => void;
  enableAddShapeMode: (shapeType: FreeShapeAnnotation['shapeType']) => void;
}

/**
 * Hook for handling add shapes action with lock checking
 */
export function useAddShapesHandler({
  isLocked,
  onLockedAction,
  enableAddShapeMode
}: UseAddShapesHandlerParams): (shapeType?: string) => void {
  return React.useCallback((shapeType?: string) => {
    if (isLocked) {
      onLockedAction();
      return;
    }
    const normalized = normalizeShapeType(shapeType);
    enableAddShapeMode(normalized);
  }, [isLocked, onLockedAction, enableAddShapeMode]);
}
