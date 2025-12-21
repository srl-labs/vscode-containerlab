/**
 * Free text annotation types and helpers
 * Consolidated from: freeTextTypes.ts + freeTextHelpers.ts
 */
import type { Core as CyCore } from 'cytoscape';

import type { FreeTextAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';

import {
  generateAnnotationId as generateId,
  SAVE_DEBOUNCE_MS,
  PASTE_OFFSET,
  updateAnnotationInList as genericUpdateInList,
  updateAnnotationRotation as genericUpdateRotation,
  saveAnnotationToList as genericSaveToList,
  duplicateAnnotations as genericDuplicateAnnotations,
} from './sharedAnnotationHelpers';

// Re-export for consumers
export type { FreeTextAnnotation };
export { SAVE_DEBOUNCE_MS, PASTE_OFFSET };

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_COLOR = '#FFFFFF';
export const DEFAULT_BACKGROUND_COLOR = 'transparent';

// ============================================================================
// Types
// ============================================================================

export interface UseFreeTextAnnotationsOptions {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
  groups?: GroupStyleAnnotation[];
}

export interface AnnotationActionMethods {
  closeEditor: () => void;
  saveAnnotation: (annotation: FreeTextAnnotation) => void;
  deleteAnnotation: (id: string) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  updateSize: (id: string, width: number, height: number) => void;
  updateRotation: (id: string, rotation: number) => void;
  updateAnnotation: (id: string, updates: Partial<FreeTextAnnotation>) => void;
  updateGeoPosition: (id: string, geoCoords: { lat: number; lng: number }) => void;
  migrateGroupId: (oldGroupId: string, newGroupId: string) => void;
  loadAnnotations: (annotations: FreeTextAnnotation[]) => void;
}

export interface AnnotationSelectionMethods {
  selectedAnnotationIds: Set<string>;
  selectAnnotation: (id: string) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  deleteSelectedAnnotations: () => void;
  getSelectedAnnotations: () => FreeTextAnnotation[];
  boxSelectAnnotations: (ids: string[]) => void;
  copySelectedAnnotations: () => void;
  pasteAnnotations: () => void;
  duplicateSelectedAnnotations: () => void;
  hasClipboardContent: () => boolean;
}

export interface UseFreeTextAnnotationsReturn extends AnnotationActionMethods, AnnotationSelectionMethods {
  annotations: FreeTextAnnotation[];
  editingAnnotation: FreeTextAnnotation | null;
  isAddTextMode: boolean;
  enableAddTextMode: () => void;
  disableAddTextMode: () => void;
  handleCanvasClick: (position: { x: number; y: number }) => void;
  editAnnotation: (id: string) => void;
  getUndoRedoAction: (before: FreeTextAnnotation | null, after: FreeTextAnnotation | null) => AnnotationUndoAction;
}

export interface AnnotationUndoAction {
  type: 'annotation';
  annotationType: 'freeText';
  before: FreeTextAnnotation | null;
  after: FreeTextAnnotation | null;
  [key: string]: unknown;
}

// ============================================================================
// ID Generation
// ============================================================================

export function generateAnnotationId(): string {
  return generateId('freeText');
}

// ============================================================================
// Annotation Factory
// ============================================================================

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

export function updateAnnotationInList(
  annotations: FreeTextAnnotation[],
  id: string,
  updater: (annotation: FreeTextAnnotation) => FreeTextAnnotation
): FreeTextAnnotation[] {
  return genericUpdateInList(annotations, id, updater);
}

export function updateAnnotationPosition(
  annotation: FreeTextAnnotation,
  position: { x: number; y: number }
): FreeTextAnnotation {
  return {
    ...annotation,
    position: { x: Math.round(position.x), y: Math.round(position.y) }
  };
}

export function updateAnnotationRotation(
  annotation: FreeTextAnnotation,
  rotation: number
): FreeTextAnnotation {
  return genericUpdateRotation(annotation, rotation);
}

export function saveAnnotationToList(
  annotations: FreeTextAnnotation[],
  annotation: FreeTextAnnotation
): FreeTextAnnotation[] {
  return genericSaveToList(annotations, annotation);
}

// ============================================================================
// Copy/Paste Operations
// ============================================================================

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

export function duplicateAnnotations(
  annotations: FreeTextAnnotation[],
  pasteCount: number = 0
): FreeTextAnnotation[] {
  return genericDuplicateAnnotations(annotations, duplicateAnnotation, pasteCount);
}
