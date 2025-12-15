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
  updateAnnotationRotation,
  duplicateAnnotations
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
  /** Immediate save without debounce - use for paste operations */
  saveAnnotationsImmediate: (annotations: FreeTextAnnotation[]) => void;
  /** IDs of currently selected annotations */
  selectedAnnotationIds: Set<string>;
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Clipboard for copied annotations */
  clipboardRef: React.RefObject<FreeTextAnnotation[]>;
  /** Paste counter for offset calculation */
  pasteCounterRef: React.RefObject<number>;
}

/**
 * Hook for managing annotation state and persistence
 */
export function useFreeTextState(): UseFreeTextStateReturn {
  const [annotations, setAnnotations] = useState<FreeTextAnnotation[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<FreeTextAnnotation | null>(null);
  const [isAddTextMode, setIsAddTextMode] = useState(false);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());

  const lastStyleRef = useRef<Partial<FreeTextAnnotation>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardRef = useRef<FreeTextAnnotation[]>([]);
  const pasteCounterRef = useRef<number>(0);

  const saveAnnotationsToExtension = useCallback((updatedAnnotations: FreeTextAnnotation[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      sendCommandToExtension('save-free-text-annotations', { annotations: updatedAnnotations });
      log.info(`[FreeText] Saved ${updatedAnnotations.length} annotations`);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Immediate save without debounce - used for paste to avoid race with topology refresh
  const saveAnnotationsImmediate = useCallback((updatedAnnotations: FreeTextAnnotation[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    sendCommandToExtension('save-free-text-annotations', { annotations: updatedAnnotations });
    log.info(`[FreeText] Saved ${updatedAnnotations.length} annotations (immediate)`);
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
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef
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
  /** Select a single annotation (clears existing selection) */
  selectAnnotation: (id: string) => void;
  /** Toggle annotation selection (Ctrl+click behavior) */
  toggleAnnotationSelection: (id: string) => void;
  /** Clear all annotation selection */
  clearAnnotationSelection: () => void;
  /** Delete all selected annotations */
  deleteSelectedAnnotations: () => void;
  /** Get selected annotations */
  getSelectedAnnotations: () => FreeTextAnnotation[];
  /** Box select multiple annotations (adds to existing selection) */
  boxSelectAnnotations: (ids: string[]) => void;
  /** Copy selected annotations to clipboard */
  copySelectedAnnotations: () => void;
  /** Paste annotations from clipboard */
  pasteAnnotations: () => void;
  /** Cut selected annotations (copy and delete) */
  cutSelectedAnnotations: () => void;
  /** Duplicate selected annotations */
  duplicateSelectedAnnotations: () => void;
  /** Check if clipboard has annotations */
  hasClipboardContent: () => boolean;
  /** Update geo coordinates for an annotation */
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
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

  const updateGeoPosition = useCallback((id: string, geoCoords: { lat: number; lng: number }) => {
    setAnnotations(prev => {
      const updated = updateAnnotationInList(prev, id, a => ({ ...a, geoCoordinates: geoCoords }));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeText] Updated geo position for annotation ${id}: ${geoCoords.lat}, ${geoCoords.lng}`);
  }, [setAnnotations, saveAnnotationsToExtension]);

  return { updatePosition, updateSize, updateRotation, updateGeoPosition };
}

// Hook for basic selection operations (select, toggle, clear)
function useBasicSelection(
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const selectAnnotation = useCallback((id: string) => {
    setSelectedAnnotationIds(new Set([id]));
    log.info(`[FreeText] Selected annotation: ${id}`);
  }, [setSelectedAnnotationIds]);

  const toggleAnnotationSelection = useCallback((id: string) => {
    setSelectedAnnotationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        log.info(`[FreeText] Deselected annotation: ${id}`);
      } else {
        next.add(id);
        log.info(`[FreeText] Added annotation to selection: ${id}`);
      }
      return next;
    });
  }, [setSelectedAnnotationIds]);

  const clearAnnotationSelection = useCallback(() => {
    setSelectedAnnotationIds(new Set());
    log.info('[FreeText] Cleared annotation selection');
  }, [setSelectedAnnotationIds]);

  return { selectAnnotation, toggleAnnotationSelection, clearAnnotationSelection };
}

// Hook for box selection of annotations
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
    log.info(`[FreeText] Box selected ${ids.length} annotations`);
  }, [setSelectedAnnotationIds]);
}

// Hook for deleting selected annotations
function useDeleteSelected(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
) {
  return useCallback(() => {
    if (selectedAnnotationIds.size === 0) return;
    setAnnotations(prev => {
      const updated = prev.filter(a => !selectedAnnotationIds.has(a.id));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    log.info(`[FreeText] Deleted ${selectedAnnotationIds.size} selected annotations`);
    setSelectedAnnotationIds(new Set());
  }, [selectedAnnotationIds, setAnnotations, saveAnnotationsToExtension, setSelectedAnnotationIds]);
}

// Hook for getting selected annotations
function useGetSelected(
  annotations: FreeTextAnnotation[],
  selectedAnnotationIds: Set<string>
) {
  return useCallback(() => {
    return annotations.filter(a => selectedAnnotationIds.has(a.id));
  }, [annotations, selectedAnnotationIds]);
}

// Hook for annotation selection operations
function useAnnotationSelection(
  annotations: FreeTextAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
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

// Helper to get selected annotations
function getSelected(annotations: FreeTextAnnotation[], ids: Set<string>): FreeTextAnnotation[] {
  return annotations.filter(a => ids.has(a.id));
}

// Hook for copy operation
function useCopyAnnotations(
  annotations: FreeTextAnnotation[],
  selectedAnnotationIds: Set<string>,
  clipboardRef: React.RefObject<FreeTextAnnotation[]>,
  pasteCounterRef: React.RefObject<number>
) {
  return useCallback(() => {
    const selected = getSelected(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    clipboardRef.current = selected;
    pasteCounterRef.current = 0;
    log.info(`[FreeText] Copied ${selected.length} annotations to clipboard`);
  }, [annotations, selectedAnnotationIds, clipboardRef, pasteCounterRef]);
}

// Hook for paste operation - uses immediate save to avoid race with topology refresh
function usePasteAnnotations(
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  clipboardRef: React.RefObject<FreeTextAnnotation[]>,
  pasteCounterRef: React.RefObject<number>,
  saveAnnotationsImmediate: (annotations: FreeTextAnnotation[]) => void
) {
  return useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.length === 0) return;
    const duplicated = duplicateAnnotations(clipboardRef.current, pasteCounterRef.current);
    pasteCounterRef.current++;
    setAnnotations(prev => {
      const updated = [...prev, ...duplicated];
      // Use immediate save to avoid race with topology-data refresh from graph paste
      saveAnnotationsImmediate(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set(duplicated.map(a => a.id)));
    log.info(`[FreeText] Pasted ${duplicated.length} annotations`);
  }, [clipboardRef, pasteCounterRef, setAnnotations, saveAnnotationsImmediate, setSelectedAnnotationIds]);
}

// Hook for cut operation
function useCutAnnotations(
  annotations: FreeTextAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  clipboardRef: React.RefObject<FreeTextAnnotation[]>,
  pasteCounterRef: React.RefObject<number>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
) {
  return useCallback(() => {
    const selected = getSelected(annotations, selectedAnnotationIds);
    if (selected.length === 0) return;
    clipboardRef.current = selected;
    pasteCounterRef.current = 0;
    setAnnotations(prev => {
      const updated = prev.filter(a => !selectedAnnotationIds.has(a.id));
      saveAnnotationsToExtension(updated);
      return updated;
    });
    setSelectedAnnotationIds(new Set());
    log.info(`[FreeText] Cut ${selected.length} annotations`);
  }, [annotations, selectedAnnotationIds, clipboardRef, pasteCounterRef, setAnnotations, saveAnnotationsToExtension, setSelectedAnnotationIds]);
}

// Hook for duplicate operation
function useDuplicateAnnotations(
  annotations: FreeTextAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void
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
    log.info(`[FreeText] Duplicated ${duplicated.length} annotations`);
  }, [annotations, selectedAnnotationIds, setAnnotations, saveAnnotationsToExtension, setSelectedAnnotationIds]);
}

// Hook for checking clipboard content
function useHasClipboardContent(clipboardRef: React.RefObject<FreeTextAnnotation[]>) {
  return useCallback(() => {
    return clipboardRef.current && clipboardRef.current.length > 0;
  }, [clipboardRef]);
}

// Aggregate hook for copy/paste operations
function useAnnotationCopyPaste(
  annotations: FreeTextAnnotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<FreeTextAnnotation[]>>,
  selectedAnnotationIds: Set<string>,
  setSelectedAnnotationIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  clipboardRef: React.RefObject<FreeTextAnnotation[]>,
  pasteCounterRef: React.RefObject<number>,
  saveAnnotationsToExtension: (annotations: FreeTextAnnotation[]) => void,
  saveAnnotationsImmediate: (annotations: FreeTextAnnotation[]) => void
) {
  const copySelectedAnnotations = useCopyAnnotations(annotations, selectedAnnotationIds, clipboardRef, pasteCounterRef);
  // Use immediate save for paste to avoid race with topology-data refresh
  const pasteAnnotations = usePasteAnnotations(setAnnotations, setSelectedAnnotationIds, clipboardRef, pasteCounterRef, saveAnnotationsImmediate);
  const cutSelectedAnnotations = useCutAnnotations(annotations, setAnnotations, selectedAnnotationIds, setSelectedAnnotationIds, clipboardRef, pasteCounterRef, saveAnnotationsToExtension);
  const duplicateSelectedAnnotations = useDuplicateAnnotations(annotations, setAnnotations, selectedAnnotationIds, setSelectedAnnotationIds, saveAnnotationsToExtension);
  const hasClipboardContent = useHasClipboardContent(clipboardRef);

  return {
    copySelectedAnnotations,
    pasteAnnotations,
    cutSelectedAnnotations,
    duplicateSelectedAnnotations,
    hasClipboardContent
  };
}

/**
 * Hook for annotation CRUD actions
 */
export function useFreeTextActions(options: UseFreeTextActionsOptions): UseFreeTextActionsReturn {
  const { state, mode, isLocked, onLockedAction } = options;
  const {
    annotations,
    setAnnotations,
    setEditingAnnotation,
    setIsAddTextMode,
    lastStyleRef,
    saveAnnotationsToExtension,
    saveAnnotationsImmediate,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    clipboardRef,
    pasteCounterRef
  } = state;

  const modeActions = useModeActions(mode, isLocked, onLockedAction, setIsAddTextMode);
  const crudActions = useAnnotationCrud(setAnnotations, setEditingAnnotation, lastStyleRef, saveAnnotationsToExtension);
  const updateActions = useAnnotationUpdates(setAnnotations, saveAnnotationsToExtension);
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
    ...selectionActions,
    ...copyPasteActions
  };
}
