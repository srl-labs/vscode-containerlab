/**
 * Shared helper functions and hooks for annotations (both FreeShape and FreeText)
 * Consolidates: pure helper functions + React hook factories for annotation state management
 */
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { log } from "../../utils/logger";

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for saving annotations to extension */
export const SAVE_DEBOUNCE_MS = 300;

/** Offset for pasted annotations */
export const PASTE_OFFSET = 20;

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique annotation ID using crypto API
 * @param prefix - The prefix for the annotation type (e.g., 'freeText', 'freeShape', 'group')
 */
export function generateAnnotationId(prefix: string): string {
  const timestamp = Date.now();
  const uuid = globalThis.crypto.randomUUID();
  return `${prefix}_${timestamp}_${uuid.slice(0, 8)}`;
}

// ============================================================================
// Types
// ============================================================================

/** Base interface for all annotations */
export interface BaseAnnotation {
  id: string;
  position: { x: number; y: number };
  rotation?: number;
  [key: string]: unknown;
}

// ============================================================================
// Generic Annotation Updates
// ============================================================================

/**
 * Updates an annotation in the list by ID
 * @param annotations The list of annotations
 * @param id The ID of the annotation to update
 * @param updater Function to update the annotation
 * @returns New list with the updated annotation
 */
export function updateAnnotationInList<T extends BaseAnnotation>(
  annotations: T[],
  id: string,
  updater: (annotation: T) => T
): T[] {
  return annotations.map((a) => (a.id === id ? updater(a) : a));
}

/**
 * Updates rotation of an annotation (normalized to 0-359)
 * @param annotation The annotation to update
 * @param rotation The new rotation value
 * @returns New annotation with updated rotation
 */
export function updateAnnotationRotation<T extends BaseAnnotation>(
  annotation: T,
  rotation: number
): T {
  return { ...annotation, rotation: ((rotation % 360) + 360) % 360 };
}

/**
 * Saves or updates an annotation in the list
 * Uses updateAnnotationInList for existing annotations, appends for new ones
 * @param annotations The list of annotations
 * @param annotation The annotation to save
 * @returns New list with the saved annotation
 */
export function saveAnnotationToList<T extends BaseAnnotation>(
  annotations: T[],
  annotation: T
): T[] {
  const exists = annotations.some((a) => a.id === annotation.id);
  if (exists) {
    return updateAnnotationInList(annotations, annotation.id, () => annotation);
  }
  return [...annotations, annotation];
}

/**
 * Creates duplicates of multiple annotations with new IDs and offset positions
 * @param annotations The annotations to duplicate
 * @param duplicateFn Function to duplicate a single annotation
 * @param pasteCount Number of times annotations have been pasted (for offset calculation)
 * @returns New list of duplicated annotations
 */
export function duplicateAnnotations<T extends BaseAnnotation>(
  annotations: T[],
  duplicateFn: (annotation: T, offset: number) => T,
  pasteCount: number = 0
): T[] {
  const offset = PASTE_OFFSET * (pasteCount + 1);
  return annotations.map((a) => duplicateFn(a, offset));
}

// ============================================================================
// Hook Helpers
// ============================================================================

/**
 * Creates an editAnnotation callback that handles mode/locked checks
 * @param mode Current mode (view or edit)
 * @param isLocked Whether the topology is locked
 * @param onLockedAction Callback to trigger when locked action is attempted
 * @param annotations List of annotations to search
 * @param setEditingAnnotation Function to set the annotation being edited
 * @param logPrefix Prefix for log messages
 * @returns The edit annotation callback
 */
export function createEditAnnotationCallback<T extends BaseAnnotation>(
  _mode: "view" | "edit",
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  annotations: T[],
  setEditingAnnotation: (annotation: T | null) => void,
  logPrefix: string
): (id: string) => void {
  return (id: string) => {
    // Only check isLocked - allows annotation editing in viewer mode when explicitly unlocked
    if (isLocked) {
      onLockedAction?.();
      return;
    }
    const annotation = annotations.find((a) => a.id === id);
    if (annotation) {
      setEditingAnnotation({ ...annotation });
      log.info(`[${logPrefix}] Editing annotation: ${id}`);
    }
  };
}

/**
 * Common selection and clipboard actions interface
 * Used by both FreeShape and FreeText annotations
 */
export interface CommonSelectionActions<T> {
  selectedAnnotationIds: Set<string>;
  selectAnnotation: (id: string) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  deleteSelectedAnnotations: () => void;
  getSelectedAnnotations: () => T[];
  boxSelectAnnotations: (ids: string[]) => void;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  hasClipboardContent: () => boolean;
}

/**
 * Creates the common selection/clipboard return object
 * Extracts the shared selection and clipboard operations
 */
export function createCommonSelectionReturn<T>(
  selectedAnnotationIds: Set<string>,
  actions: Omit<CommonSelectionActions<T>, "selectedAnnotationIds">
): CommonSelectionActions<T> {
  return {
    selectedAnnotationIds,
    ...actions
  };
}

// ============================================================================
// React Hook Factories for State Management
// ============================================================================

/** Minimal annotation interface for hook utilities */
interface BaseAnnotationWithGroupId {
  id: string;
  groupId?: string;
}

/**
 * Creates a delete annotation callback
 */
export function useDeleteAnnotation<T extends BaseAnnotationWithGroupId>(
  logPrefix: string,
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void
) {
  return useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        saveAnnotationsToExtension(updated);
        return updated;
      });
      log.info(`[${logPrefix}] Deleted annotation: ${id}`);
    },
    [setAnnotations, saveAnnotationsToExtension]
  );
}

/**
 * Creates standard position/size/rotation update callbacks
 */
export function useStandardUpdates<T extends BaseAnnotationWithGroupId>(
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void,
  updateInList: (annotations: T[], id: string, updater: (annotation: T) => T) => T[],
  updatePosition: (annotation: T, position: { x: number; y: number }) => T,
  updateRotation: (annotation: T, rotation: number) => T
) {
  const updatePositionFn = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setAnnotations((prev) => {
        const updated = updateInList(prev, id, (a) => updatePosition(a, position));
        saveAnnotationsToExtension(updated);
        return updated;
      });
    },
    [setAnnotations, saveAnnotationsToExtension, updateInList, updatePosition]
  );

  const updateSize = useCallback(
    (id: string, width: number, height: number) => {
      setAnnotations((prev) => {
        const updated = updateInList(prev, id, (a) => ({ ...a, width, height }) as T);
        saveAnnotationsToExtension(updated);
        return updated;
      });
    },
    [setAnnotations, saveAnnotationsToExtension, updateInList]
  );

  const updateRotationFn = useCallback(
    (id: string, rotation: number) => {
      setAnnotations((prev) => {
        const updated = updateInList(prev, id, (a) => updateRotation(a, rotation));
        saveAnnotationsToExtension(updated);
        return updated;
      });
    },
    [setAnnotations, saveAnnotationsToExtension, updateInList, updateRotation]
  );

  return { updatePosition: updatePositionFn, updateSize, updateRotation: updateRotationFn };
}

/** Annotation with optional geoCoordinates */
interface AnnotationWithGeo extends BaseAnnotationWithGroupId {
  geoCoordinates?: { lat: number; lng: number };
}

/**
 * Creates a geo position update callback
 */
export function useGeoPositionUpdate<T extends AnnotationWithGeo>(
  logPrefix: string,
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void,
  updateInList: (annotations: T[], id: string, updater: (annotation: T) => T) => T[]
) {
  return useCallback(
    (id: string, geoCoords: { lat: number; lng: number }) => {
      setAnnotations((prev) => {
        const updated = updateInList(prev, id, (a) => ({
          ...a,
          geoCoordinates: geoCoords
        }));
        saveAnnotationsToExtension(updated);
        return updated;
      });
      log.info(`[${logPrefix}] Updated geo position for annotation ${id}`);
    },
    [setAnnotations, saveAnnotationsToExtension, updateInList]
  );
}

/**
 * Creates generic annotation update and group migration callbacks
 */
export function useGenericAnnotationUpdates<T extends BaseAnnotationWithGroupId>(
  logPrefix: string,
  setAnnotations: React.Dispatch<React.SetStateAction<T[]>>,
  saveAnnotationsToExtension: (annotations: T[]) => void,
  updateInList: (annotations: T[], id: string, updater: (annotation: T) => T) => T[]
) {
  const updateAnnotation = useCallback(
    (id: string, updates: Partial<T>) => {
      setAnnotations((prev) => {
        const updated = updateInList(prev, id, (a) => ({ ...a, ...updates }));
        saveAnnotationsToExtension(updated);
        return updated;
      });
    },
    [setAnnotations, saveAnnotationsToExtension, updateInList]
  );

  const migrateGroupId = useCallback(
    (oldGroupId: string, newGroupId: string | null) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) =>
          a.groupId === oldGroupId ? { ...a, groupId: newGroupId ?? undefined } : a
        );
        // Only save if something actually changed
        const hasChanges = updated.some((a, i) => a !== prev[i]);
        if (hasChanges) {
          saveAnnotationsToExtension(updated);
          const targetLabel = newGroupId ?? "root";
          log.info(
            `[${logPrefix}] Migrated annotations from group ${oldGroupId} to ${targetLabel}`
          );
        }
        return updated;
      });
    },
    [setAnnotations, saveAnnotationsToExtension]
  );

  return { updateAnnotation, migrateGroupId };
}

// ============================================================================
// Debounced Save Hook
// ============================================================================

export interface UseDebouncedSaveReturn<T> {
  saveDebounced: (items: T[]) => void;
  saveImmediate: (items: T[]) => void;
}

/**
 * Hook for debounced saving of annotations to extension
 */
export function useDebouncedSave<T>(
  save: (items: T[]) => Promise<void>,
  logPrefix: string,
  debounceMs: number
): UseDebouncedSaveReturn<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const saveDebounced = useCallback(
    (items: T[]) => {
      clear();
      timeoutRef.current = setTimeout(() => {
        save(items).catch((err) => {
          log.error(`[${logPrefix}] Failed to save annotations: ${err}`);
        });
        log.info(`[${logPrefix}] Saved ${items.length} annotations`);
      }, debounceMs);
    },
    [clear, debounceMs, logPrefix, save]
  );

  const saveImmediate = useCallback(
    (items: T[]) => {
      clear();
      save(items).catch((err) => {
        log.error(`[${logPrefix}] Failed to save annotations: ${err}`);
      });
      log.info(`[${logPrefix}] Saved ${items.length} annotations (immediate)`);
    },
    [clear, logPrefix, save]
  );

  useEffect(() => clear, [clear]);

  return { saveDebounced, saveImmediate };
}

// ============================================================================
// Debounced Hover Hook
// ============================================================================

export interface UseDebouncedHoverReturn {
  isHovered: boolean;
  hoverHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Hook for debounced hover state management.
 * Prevents flickering when moving between adjacent elements (e.g., frame and handles).
 * @param debounceMs - Delay before setting hover to false (default: 10ms)
 */
export function useDebouncedHover(debounceMs: number = 10): UseDebouncedHoverReturn {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      hoverTimeoutRef.current = null;
    }, debounceMs);
  }, [debounceMs]);

  return {
    isHovered,
    hoverHandlers: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave
    }
  };
}
