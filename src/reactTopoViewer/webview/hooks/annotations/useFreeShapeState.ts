/**
 * State management hook for free shape annotations
 */
import type React from 'react';
import { useState, useCallback, useRef } from 'react';

import type { FreeShapeAnnotation } from '../../../shared/types/topology';
import { saveFreeShapeAnnotations as saveFreeShapeToIO } from '../../services';
import { log } from '../../utils/logger';

import {
  SAVE_DEBOUNCE_MS,
  extractStyleFromAnnotation,
  saveAnnotationToList,
  updateAnnotationInList,
  updateAnnotationPosition,
  updateAnnotationRotation,
  updateAnnotationEndPosition,
  duplicateAnnotations
} from './freeShape';
import type { AnnotationSelectionActions } from './freeShape';
import {
  useDebouncedSave,
  useDeleteAnnotation,
  useStandardUpdates,
  useGenericAnnotationUpdates
} from './sharedAnnotationHelpers';
import { useAnnotationListSelection, useAnnotationListCopyPaste } from './useAnnotationListOperations';

export interface UseFreeShapeStateReturn {
  annotations: FreeShapeAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>;
  isAddShapeMode: boolean;
  setIsAddShapeMode: React.Dispatch<React.SetStateAction<boolean>>;
  pendingShapeType: FreeShapeAnnotation['shapeType'];
  setPendingShapeType: React.Dispatch<React.SetStateAction<FreeShapeAnnotation['shapeType']>>;
  editingAnnotation: FreeShapeAnnotation | null;
  setEditingAnnotation: React.Dispatch<React.SetStateAction<FreeShapeAnnotation | null>>;
  lastStyleRef: React.RefObject<Partial<FreeShapeAnnotation>>;
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void;
  saveAnnotationsImmediate: (annotations: FreeShapeAnnotation[]) => void;
  selectedAnnotationIds: Set<string>;
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  clipboardRef: React.RefObject<FreeShapeAnnotation[]>;
  pasteCounterRef: React.RefObject<number>;
}

export function useFreeShapeState(): UseFreeShapeStateReturn {
  const [annotations, setAnnotations] = useState<FreeShapeAnnotation[]>([]);
  const [isAddShapeMode, setIsAddShapeMode] = useState(false);
  const [pendingShapeType, setPendingShapeType] = useState<FreeShapeAnnotation['shapeType']>('rectangle');
  const [editingAnnotation, setEditingAnnotation] = useState<FreeShapeAnnotation | null>(null);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());

  const lastStyleRef = useRef<Partial<FreeShapeAnnotation>>({});
  const clipboardRef = useRef<FreeShapeAnnotation[]>([]);
  const pasteCounterRef = useRef<number>(0);

  const { saveDebounced: saveAnnotationsToExtension, saveImmediate: saveAnnotationsImmediate } =
    useDebouncedSave(saveFreeShapeToIO, 'FreeShape', SAVE_DEBOUNCE_MS);

  return {
    annotations,
    setAnnotations,
    isAddShapeMode,
    setIsAddShapeMode,
    pendingShapeType,
    setPendingShapeType,
    editingAnnotation,
    setEditingAnnotation,
    lastStyleRef,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef
  };
}

export interface UseFreeShapeActionsOptions {
  state: UseFreeShapeStateReturn;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

export interface UseFreeShapeActionsReturn extends AnnotationSelectionActions {
  enableAddShapeMode: (shapeType?: FreeShapeAnnotation['shapeType']) => void;
  disableAddShapeMode: () => void;
  saveAnnotation: (annotation: FreeShapeAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  updateEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  /** Generic update for any annotation fields (used by group drag) */
  updateAnnotation: (id: string, updates: Partial<FreeShapeAnnotation>) => void;
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  updateEndGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  /** Reassign all annotations from one groupId to another (used when groups are removed) */
  migrateGroupId: (oldGroupId: string, newGroupId: string | null) => void;
  loadAnnotations: (annotations: FreeShapeAnnotation[]) => void;
}

function useModeActions(
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  setIsAddShapeMode: React.Dispatch<React.SetStateAction<boolean>>,
  setPendingShapeType: React.Dispatch<React.SetStateAction<FreeShapeAnnotation['shapeType']>>
) {
  const enableAddShapeMode = useCallback((shapeType?: FreeShapeAnnotation['shapeType']) => {
    if (mode === 'view' || isLocked) {
      if (isLocked) onLockedAction?.();
      return;
    }
    setPendingShapeType(shapeType || 'rectangle');
    setIsAddShapeMode(true);
    log.info(`[FreeShape] Add shape mode enabled (${shapeType || 'rectangle'})`);
  }, [mode, isLocked, onLockedAction, setPendingShapeType, setIsAddShapeMode]);

  const disableAddShapeMode = useCallback(() => {
    setIsAddShapeMode(false);
    log.info('[FreeShape] Add shape mode disabled');
  }, [setIsAddShapeMode]);

  return { enableAddShapeMode, disableAddShapeMode };
}

function useAnnotationCrud(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  lastStyleRef: { current: Partial<FreeShapeAnnotation> },
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  const saveAnnotation = useCallback((annotation: FreeShapeAnnotation) => {
    lastStyleRef.current = extractStyleFromAnnotation(annotation);
    setAnnotations(prev => {
      const updated = saveAnnotationToList(prev, annotation);
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeShape] Saved annotation: ${annotation.id}`);
  }, [lastStyleRef, setAnnotations, saveAnnotationsToExtension]);

  const deleteAnnotation = useDeleteAnnotation('FreeShape', setAnnotations, saveAnnotationsToExtension);

  const loadAnnotations = useCallback((loaded: FreeShapeAnnotation[]) => {
    setAnnotations(loaded);
    log.info(`[FreeShape] Loaded ${loaded.length} annotations`);
  }, [setAnnotations]);

  return { saveAnnotation, deleteAnnotation, loadAnnotations };
}

function useAnnotationUpdates(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  const { updatePosition, updateSize, updateRotation } = useStandardUpdates(
    setAnnotations,
    saveAnnotationsToExtension,
    updateAnnotationInList,
    updateAnnotationPosition,
    updateAnnotationRotation
  );

  const updateEndPosition = useCallback((id: string, endPosition: { x: number; y: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationEndPosition(a, endPosition));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  const { updateAnnotation, migrateGroupId } = useGenericAnnotationUpdates(
    'FreeShape',
    setAnnotations,
    saveAnnotationsToExtension,
    updateAnnotationInList
  );

  return { updatePosition, updateSize, updateRotation, updateEndPosition, updateAnnotation, migrateGroupId };
}

function useGeoUpdates(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  const updateGeoPosition = useCallback((id: string, geoCoords: { lat: number; lng: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, geoCoordinates: geoCoords }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeShape] Updated geo position for annotation ${id}`);
  }, [setAnnotations, saveAnnotationsToExtension]);

  const updateEndGeoPosition = useCallback((id: string, geoCoords: { lat: number; lng: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, endGeoCoordinates: geoCoords }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeShape] Updated end geo position for annotation ${id}`);
  }, [setAnnotations, saveAnnotationsToExtension]);

  return { updateGeoPosition, updateEndGeoPosition };
}

export function useFreeShapeActions(options: UseFreeShapeActionsOptions): UseFreeShapeActionsReturn {
  const { state, mode, isLocked, onLockedAction } = options;
  const {
    annotations,
    setAnnotations,
    setIsAddShapeMode,
    setPendingShapeType,
    lastStyleRef,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef
  } = state;

  const modeActions = useModeActions(mode, isLocked, onLockedAction, setIsAddShapeMode, setPendingShapeType);
  const crudActions = useAnnotationCrud(setAnnotations, lastStyleRef, saveAnnotationsToExtension);
  const updateActions = useAnnotationUpdates(setAnnotations, saveAnnotationsToExtension);
  const geoActions = useGeoUpdates(setAnnotations, saveAnnotationsToExtension);
  const selectionActions = useAnnotationListSelection({
    logPrefix: 'FreeShape',
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    saveAnnotationsToExtension,
  });
  const copyPasteActions = useAnnotationListCopyPaste({
    logPrefix: 'FreeShape',
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef,
    duplicateAnnotations,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
  });

  return {
    ...modeActions,
    ...crudActions,
    ...updateActions,
    ...geoActions,
    ...selectionActions,
    ...copyPasteActions
  };
}
