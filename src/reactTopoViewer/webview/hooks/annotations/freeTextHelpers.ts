/**
 * Helper functions for free text annotations
 */
import type { FreeTextAnnotation } from '../../../shared/types/topology';

import {
  generateId,
  SAVE_DEBOUNCE_MS,
  PASTE_OFFSET,
  genericUpdateInList,
  genericUpdateRotation,
  genericSaveToList,
  genericDuplicateAnnotations,
} from './commonAnnotationImports';

// Re-export shared constants
export { SAVE_DEBOUNCE_MS, PASTE_OFFSET };

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_COLOR = '#FFFFFF';
export const DEFAULT_BACKGROUND_COLOR = 'transparent';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique annotation ID for free text annotations
 */
export function generateAnnotationId(): string {
  return generateId('freeText');
}

// ============================================================================
// Annotation Factory
// ============================================================================

/**
 * Creates a default annotation at the given position
 */
export function createDefaultAnnotation(position: { x: number; y: number }): FreeTextAnnotation {
  return {
    id: generateAnnotationId(),
    text: '',
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    fontSize: DEFAULT_FONT_SIZE,
    fontColor: DEFAULT_FONT_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    fontFamily: 'monospace',
    rotation: 0,
    roundedBackground: true
  };
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Extracts style properties from an annotation for reuse
 */
export function extractStyleFromAnnotation(annotation: FreeTextAnnotation): Partial<FreeTextAnnotation> {
  return {
    fontSize: annotation.fontSize,
    fontColor: annotation.fontColor,
    backgroundColor: annotation.backgroundColor,
    fontWeight: annotation.fontWeight,
    fontStyle: annotation.fontStyle,
    textDecoration: annotation.textDecoration,
    textAlign: annotation.textAlign,
    fontFamily: annotation.fontFamily,
    roundedBackground: annotation.roundedBackground
  };
}

// ============================================================================
// Annotation Updates
// ============================================================================

/**
 * Updates an annotation in the list by ID
 */
export function updateAnnotationInList(
  annotations: FreeTextAnnotation[],
  id: string,
  updater: (annotation: FreeTextAnnotation) => FreeTextAnnotation
): FreeTextAnnotation[] {
  return genericUpdateInList(annotations, id, updater);
}

/**
 * Updates position of an annotation
 */
export function updateAnnotationPosition(
  annotation: FreeTextAnnotation,
  position: { x: number; y: number }
): FreeTextAnnotation {
  return {
    ...annotation,
    position: { x: Math.round(position.x), y: Math.round(position.y) }
  };
}

/**
 * Updates rotation of an annotation (normalized to 0-359)
 */
export function updateAnnotationRotation(
  annotation: FreeTextAnnotation,
  rotation: number
): FreeTextAnnotation {
  return genericUpdateRotation(annotation, rotation);
}

/**
 * Saves or updates an annotation in the list
 * Uses updateAnnotationInList for existing annotations, appends for new ones
 */
export function saveAnnotationToList(
  annotations: FreeTextAnnotation[],
  annotation: FreeTextAnnotation
): FreeTextAnnotation[] {
  return genericSaveToList(annotations, annotation);
}

// ============================================================================
// Copy/Paste Operations
// ============================================================================

/**
 * Creates a duplicate of an annotation with a new ID and offset position
 */
export function duplicateAnnotation(
  annotation: FreeTextAnnotation,
  offset: number = PASTE_OFFSET
): FreeTextAnnotation {
  return {
    ...annotation,
    id: generateAnnotationId(),
    position: {
      x: annotation.position.x + offset,
      y: annotation.position.y + offset
    }
  };
}

/**
 * Creates duplicates of multiple annotations with new IDs and offset positions
 */
export function duplicateAnnotations(
  annotations: FreeTextAnnotation[],
  pasteCount: number = 0
): FreeTextAnnotation[] {
  return genericDuplicateAnnotations(annotations, duplicateAnnotation, pasteCount);
}
