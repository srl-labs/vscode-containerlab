/**
 * Shared helper functions for annotations (both FreeShape and FreeText)
 */

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for saving annotations to extension */
export const SAVE_DEBOUNCE_MS = 300;

/** Offset for pasted annotations */
export const PASTE_OFFSET = 20;

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
  return annotations.map(a => (a.id === id ? updater(a) : a));
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
  const exists = annotations.some(a => a.id === annotation.id);
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
  return annotations.map(a => duplicateFn(a, offset));
}
