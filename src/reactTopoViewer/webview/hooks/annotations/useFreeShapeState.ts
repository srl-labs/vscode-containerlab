/**
 * State management hook for free shape annotations
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FreeShapeAnnotation } from '../../../shared/types/topology';
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
} from './freeShapeHelpers';

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
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardRef = useRef<FreeShapeAnnotation[]>([]);
  const pasteCounterRef = useRef<number>(0);

  const saveAnnotationsToExtension = useCallback((updatedAnnotations: FreeShapeAnnotation[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveFreeShapeToIO(updatedAnnotations).catch(err => {
        log.error(`[FreeShape] Failed to save annotations: ${err}`);
      });
      log.info(`[FreeShape] Saved ${updatedAnnotations.length} annotations`);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const saveAnnotationsImmediate = useCallback((updatedAnnotations: FreeShapeAnnotation[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveFreeShapeToIO(updatedAnnotations).catch(err => {
      log.error(`[FreeShape] Failed to save annotations: ${err}`);
    });
    log.info(`[FreeShape] Saved ${updatedAnnotations.length} annotations (immediate)`);
  }, []);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

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

export interface UseFreeShapeActionsReturn {
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
  /** Migrate all annotations from one groupId to another (used when group is renamed) */
  migrateGroupId: (oldGroupId: string, newGroupId: string) => void;
  loadAnnotations: (annotations: FreeShapeAnnotation[]) => void;
  selectAnnotation: (id: string) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  deleteSelectedAnnotations: () => void;
  getSelectedAnnotations: () => FreeShapeAnnotation[];
  boxSelectAnnotations: (ids: string[]) => void;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  hasClipboardContent: () => boolean;
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

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeShape] Deleted annotation: ${id}`);
  }, [setAnnotations, saveAnnotationsToExtension]);

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

  const updateEndPosition = useCallback((id: string, endPosition: { x: number; y: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => updateAnnotationEndPosition(a, endPosition));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  /** Generic update for any annotation fields (used by group drag) */
  const updateAnnotation = useCallback((id: string, updates: Partial<FreeShapeAnnotation>) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, ...updates }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  /** Migrate all annotations from one groupId to another (used when group is renamed) */
  const migrateGroupId = useCallback((oldGroupId: string, newGroupId: string) => {
    setAnnotations(prev => {
      const updated = prev.map(a =>
        a.groupId === oldGroupId ? { ...a, groupId: newGroupId } : a
      );
      // Only save if something actually changed
      const hasChanges = updated.some((a, i) => a !== prev[i]);
      if (hasChanges) {
        saveAnnotationsToExtension(updated);
        log.info(`[FreeShape] Migrated annotations from group ${oldGroupId} to ${newGroupId}`);
      }
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

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

function useBasicSelection(
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const selectAnnotation = useCallback((id: string) => {
    setSelectedAnnotationIds(new Set([id]));
    log.info(`[FreeShape] Selected annotation: ${id}`);
  }, [setSelectedAnnotationIds]);

  const toggleAnnotationSelection = useCallback((id: string) => {
    setSelectedAnnotationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        log.info(`[FreeShape] Deselected annotation: ${id}`);
      } else {
        next.add(id);
        log.info(`[FreeShape] Added annotation to selection: ${id}`);
      }
      return next;
    });
  }, [setSelectedAnnotationIds]);

  const clearAnnotationSelection = useCallback(() => {
    setSelectedAnnotationIds(new Set());
    log.info('[FreeShape] Cleared annotation selection');
  }, [setSelectedAnnotationIds]);

  return { selectAnnotation, toggleAnnotationSelection, clearAnnotationSelection };
}

function useBoxSelection(
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  return useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedAnnotationIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
    log.info(`[FreeShape] Box selected ${ids.length} annotations`);
  }, [setSelectedAnnotationIds]);
}

function useDeleteSelected(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  return useCallback(() => {
    if (selectedAnnotationIds.size === 0) return;
    setAnnotations(prev => {
      const updated = prev.filter(a => !selectedAnnotationIds.has(a.id));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeShape] Deleted ${selectedAnnotationIds.size} selected annotations`);
    setSelectedAnnotationIds(new Set());
  }, [selectedAnnotationIds, setAnnotations, saveAnnotationsToExtension, setSelectedAnnotationIds]);
}

function useGetSelected(
  annotations: FreeShapeAnnotation[],
  selectedAnnotationIds: Set<string>
) {
  return useCallback(() => annotations.filter(a => selectedAnnotationIds.has(a.id)), [annotations, selectedAnnotationIds]);
}

function useAnnotationSelection(
  annotations: FreeShapeAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  const basicSelection = useBasicSelection(setSelectedAnnotationIds);
  const boxSelectAnnotations = useBoxSelection(setSelectedAnnotationIds);
  const deleteSelectedAnnotations = useDeleteSelected(setAnnotations, selectedAnnotationIds, setSelectedAnnotationIds, saveAnnotationsToExtension);
  const getSelectedAnnotations = useGetSelected(annotations, selectedAnnotationIds);

  return {
    ...basicSelection,
    boxSelectAnnotations,
    deleteSelectedAnnotations,
    getSelectedAnnotations
  };
}

function getSelected(annotations: FreeShapeAnnotation[], ids: Set<string>): FreeShapeAnnotation[] {
  return annotations.filter(a => ids.has(a.id));
}

function useCopyAnnotations(
  annotations: FreeShapeAnnotation[],
  selectedAnnotationIds: Set<string>,
  clipboardRef: React.RefObject<FreeShapeAnnotation[]>,
  pasteCounterRef: React.RefObject<number>
) {
  return useCallback(() => {
    const selected = getSelected(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    clipboardRef.current = selected;
    pasteCounterRef.current = 0;
    log.info(`[FreeShape] Copied ${selected.length} annotations to clipboard`);
  }, [annotations, selectedAnnotationIds, clipboardRef, pasteCounterRef]);
}

function usePasteAnnotations(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  clipboardRef: React.RefObject<FreeShapeAnnotation[]>,
  pasteCounterRef: React.RefObject<number>,
  saveAnnotationsImmediate: (annotations: FreeShapeAnnotation[]) => void
) {
  return useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.length === 0) return;
    const duplicated = duplicateAnnotations(clipboardRef.current, pasteCounterRef.current);
    pasteCounterRef.current++;
    setAnnotations(prev => {
      const updated = [...prev, ...duplicated];
      saveAnnotationsImmediate(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set(duplicated.map(a => a.id)));
    log.info(`[FreeShape] Pasted ${duplicated.length} annotations`);
  }, [clipboardRef, pasteCounterRef, setAnnotations, saveAnnotationsImmediate, setSelectedAnnotationIds]);
}

function useDuplicateAnnotations(
  annotations: FreeShapeAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void
) {
  return useCallback(() => {
    const selected = getSelected(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    const duplicated = duplicateAnnotations(selected, 0);
    setAnnotations(prev => {
      const updated = [...prev, ...duplicated];
      saveAnnotationsToExtension(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set(duplicated.map(a => a.id)));
    log.info(`[FreeShape] Duplicated ${duplicated.length} annotations`);
  }, [annotations, selectedAnnotationIds, setAnnotations, saveAnnotationsToExtension, setSelectedAnnotationIds]);
}

function useHasClipboardContent(clipboardRef: React.RefObject<FreeShapeAnnotation[]>) {
  return useCallback(() => clipboardRef.current && clipboardRef.current.length > 0, [clipboardRef]);
}

function useAnnotationCopyPaste(
  annotations: FreeShapeAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeShapeAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  clipboardRef: React.RefObject<FreeShapeAnnotation[]>,
  pasteCounterRef: React.RefObject<number>,
  saveAnnotationsToExtension: (annotations: FreeShapeAnnotation[]) => void,
  saveAnnotationsImmediate: (annotations: FreeShapeAnnotation[]) => void
) {
  const copySelectedAnnotations = useCopyAnnotations(annotations, selectedAnnotationIds, clipboardRef, pasteCounterRef);
  const pasteAnnotations = usePasteAnnotations(setAnnotations, setSelectedAnnotationIds, clipboardRef, pasteCounterRef, saveAnnotationsImmediate);
  const duplicateSelectedAnnotations = useDuplicateAnnotations(annotations, setAnnotations, selectedAnnotationIds, setSelectedAnnotationIds, saveAnnotationsToExtension);
  const hasClipboardContent = useHasClipboardContent(clipboardRef);

  return {
    copySelectedAnnotations,
    pasteAnnotations,
    duplicateSelectedAnnotations,
    hasClipboardContent
  };
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
  const selectionActions = useAnnotationSelection(
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    saveAnnotationsToExtension
  );
  const copyPasteActions = useAnnotationCopyPaste(
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate
  );

  return {
    ...modeActions,
    ...crudActions,
    ...updateActions,
    ...geoActions,
    ...selectionActions,
    ...copyPasteActions
  };
}

