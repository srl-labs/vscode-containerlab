/**
 * State management hook for free text annotations
 */
import type React from 'react';
import { useState, useCallback, useRef } from 'react';

import type { FreeTextAnnotation } from '../../../shared/types/topology';
import { saveFreeTextAnnotations as saveFreeTextToIO } from '../../services';
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
import { useDebouncedSave } from './useDebouncedSave';
import { useAnnotationListSelection } from './useAnnotationListSelection';
import { useAnnotationListCopyPaste } from './useAnnotationListCopyPaste';

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
  const clipboardRef = useRef<FreeTextAnnotation[]>([]);
  const pasteCounterRef = useRef<number>(0);

  const { saveDebounced: saveAnnotationsToExtension, saveImmediate: saveAnnotationsImmediate } =
    useDebouncedSave(saveFreeTextToIO, 'FreeText', SAVE_DEBOUNCE_MS);

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
  /** Generic update for any annotation fields (used by group drag) */
  updateAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  /** Migrate all annotations from one groupId to another (used when group is renamed) */
  migrateGroupId: (oldGroupId: string, newGroupId: string) => void;
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

  /** Generic update for any annotation fields (used by group drag) */
  const updateAnnotation = useCallback((id: string, updates: Partial<FreeTextAnnotation>) => {
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
        log.info(`[FreeText] Migrated annotations from group ${oldGroupId} to ${newGroupId}`);
      }
      return updated;
    });
  }, [setAnnotations, saveAnnotationsToExtension]);

  return { updatePosition, updateSize, updateRotation, updateGeoPosition, updateAnnotation, migrateGroupId };
}

// Hook for basic selection operations (select, toggle, clear)
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
  const selectionActions = useAnnotationListSelection({
    logPrefix: 'FreeText',
    annotations,
    setAnnotations,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    saveAnnotationsToExtension,
  });
  const copyPasteActions = useAnnotationListCopyPaste({
    logPrefix: 'FreeText',
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
    ...selectionActions,
    ...copyPasteActions
  };
}
