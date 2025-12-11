/**
 * Helper functions for free text annotations
 */
import { FreeTextAnnotation } from '../../../shared/types/topology';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_COLOR = '#FFFFFF';
export const DEFAULT_BACKGROUND_COLOR = 'transparent';
export const SAVE_DEBOUNCE_MS = 300;

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique annotation ID using crypto API for security
 */
export function generateAnnotationId(): string {
  const timestamp = Date.now();
  // Use globalThis.crypto.randomUUID for secure random generation
  const uuid = globalThis.crypto.randomUUID();
  return `freeText_${timestamp}_${uuid.slice(0, 8)}`;
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
  return annotations.map(a => a.id === id ? updater(a) : a);
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
  return {
    ...annotation,
    rotation: ((rotation % 360) + 360) % 360
  };
}

/**
 * Saves or updates an annotation in the list
 * Uses updateAnnotationInList for existing annotations, appends for new ones
 */
export function saveAnnotationToList(
  annotations: FreeTextAnnotation[],
  annotation: FreeTextAnnotation
): FreeTextAnnotation[] {
  const exists = annotations.some(a => a.id === annotation.id);
  if (exists) {
    return updateAnnotationInList(annotations, annotation.id, () => annotation);
  }
  return [...annotations, annotation];
}
