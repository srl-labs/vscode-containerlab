/**
 * Free text annotation types and helpers
 * Consolidated from: freeTextTypes.ts + freeTextHelpers.ts + freeTextLayerHelpers.ts
 */
import type { Core as CyCore } from 'cytoscape';
import type React from 'react';

import type { FreeTextAnnotation, GroupStyleAnnotation } from '../../../shared/types/topology';
import type { MapLibreState } from '../canvas/maplibreUtils';
import { projectAnnotationGeoCoords, calculateScale } from '../canvas/maplibreUtils';

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
  migrateGroupId: (oldGroupId: string, newGroupId: string | null) => void;
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

// ============================================================================
// Layer Helpers
// ============================================================================

// ============================================================================
// Coordinate Conversion
// ============================================================================

export function modelToRendered(cy: CyCore, modelX: number, modelY: number): { x: number; y: number; zoom: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: modelX * zoom + pan.x, y: modelY * zoom + pan.y, zoom };
}

export function renderedToModel(cy: CyCore, renderedX: number, renderedY: number): { x: number; y: number } {
  const pan = cy.pan();
  const zoom = cy.zoom();
  return { x: (renderedX - pan.x) / zoom, y: (renderedY - pan.y) / zoom };
}

/**
 * Convert model coordinates to rendered coordinates with geo mode support.
 * When geo mode is active and annotation has geo coords, use MapLibre projection.
 * The zoom returned is the scale factor for annotation sizing.
 */
export function modelToRenderedGeo(
  mapLibreState: MapLibreState | null,
  geoCoords: { lat: number; lng: number } | undefined,
  modelX: number,
  modelY: number
): RenderedPosition {
  // If geo mode is active and annotation has geo coordinates, project them
  if (mapLibreState?.isInitialized && geoCoords) {
    const projected = projectAnnotationGeoCoords(mapLibreState, geoCoords);
    if (projected) {
      const scale = calculateScale(mapLibreState);
      return { x: projected.x, y: projected.y, zoom: scale };
    }
  }
  // Fallback to model position (non-geo mode or no geo coords)
  return { x: modelX, y: modelY, zoom: 1 };
}

// ============================================================================
// Style Helpers
// ============================================================================

export function getCursorStyle(isLocked: boolean, isDragging: boolean): string {
  if (isLocked) return 'default';
  return isDragging ? 'grabbing' : 'grab';
}

export function getBorderRadius(hasBackground: boolean, roundedBackground?: boolean): string {
  if (!hasBackground) return '0';
  return roundedBackground !== false ? '4px' : '0';
}

// ============================================================================
// Rendered Position Type
// ============================================================================

export interface RenderedPosition {
  x: number;
  y: number;
  zoom: number;
}

// ============================================================================
// Style Computation - Split into smaller functions
// ============================================================================

function computeBaseStyle(annotation: FreeTextAnnotation, _renderedPos: RenderedPosition): React.CSSProperties {
  // Base font size - scaling is done via transform: scale(zoom) on the wrapper
  const baseFontSize = annotation.fontSize || 14;
  return {
    // Position/transform are handled by the wrapper in FreeTextLayer
    fontSize: `${baseFontSize}px`,
    fontFamily: annotation.fontFamily || 'monospace',
    fontWeight: annotation.fontWeight || 'normal',
    fontStyle: annotation.fontStyle || 'normal',
    textDecoration: annotation.textDecoration || 'none',
    textAlign: annotation.textAlign || 'left',
    color: annotation.fontColor || '#FFFFFF',
    userSelect: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    pointerEvents: 'auto'
  };
}

function computeBackgroundStyle(annotation: FreeTextAnnotation, _renderedPos: RenderedPosition): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  const style: React.CSSProperties = {
    backgroundColor: hasBackground ? annotation.backgroundColor : 'transparent',
    padding: hasBackground ? '4px 8px' : '2px',
    borderRadius: getBorderRadius(hasBackground, annotation.roundedBackground)
  };

  // Apply explicit dimensions if set (base values - scaling is done via transform)
  // otherwise use maxWidth constraint
  if (annotation.width) {
    style.width = `${annotation.width}px`;
  } else {
    style.maxWidth = '300px';
    style.minWidth = '20px';
  }
  if (annotation.height) {
    style.height = `${annotation.height}px`;
  }

  // Note: overflow is NOT set here to avoid clipping the handles (rotation/resize)
  // Overflow should be applied to the inner markdown content div instead

  return style;
}

function computeInteractionStyle(isDragging: boolean): React.CSSProperties {
  return {
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
    transition: isDragging ? 'none' : 'box-shadow 0.15s ease'
  };
}

function computeTextShadow(hasBackground: boolean): React.CSSProperties {
  if (hasBackground) return {};
  return { textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)' };
}

export function computeAnnotationStyle(
  annotation: FreeTextAnnotation,
  renderedPos: RenderedPosition,
  isDragging: boolean,
  _isHovered: boolean,
  _isLocked: boolean
): React.CSSProperties {
  const hasBackground = Boolean(annotation.backgroundColor && annotation.backgroundColor !== 'transparent');
  return {
    ...computeBaseStyle(annotation, renderedPos),
    ...computeBackgroundStyle(annotation, renderedPos),
    ...computeInteractionStyle(isDragging),
    ...computeTextShadow(hasBackground)
  };
}
