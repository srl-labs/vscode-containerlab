/**
 * Helper functions for free shape annotations
 */
import { FreeShapeAnnotation } from '../../../shared/types/topology';
import { generateAnnotationId as generateId } from './annotationIdUtils';

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SHAPE_WIDTH = 50;
export const DEFAULT_SHAPE_HEIGHT = 50;
export const DEFAULT_LINE_LENGTH = 150;
export const DEFAULT_FILL_COLOR = '#ffffff';
export const DEFAULT_FILL_OPACITY = 0;
export const DEFAULT_BORDER_COLOR = '#646464';
export const DEFAULT_BORDER_WIDTH = 2;
export const DEFAULT_BORDER_STYLE: NonNullable<FreeShapeAnnotation['borderStyle']> = 'solid';
export const DEFAULT_ARROW_SIZE = 10;
export const DEFAULT_CORNER_RADIUS = 0;
export const MIN_SHAPE_SIZE = 5;
export const SAVE_DEBOUNCE_MS = 300;

// ============================================================================
// ID Generation
// ============================================================================

export function generateAnnotationId(): string {
  return generateId('freeShape');
}

// ============================================================================
// Geometry Helpers
// ============================================================================

export function getLineCenter(annotation: FreeShapeAnnotation): { x: number; y: number } {
  const endX = annotation.endPosition?.x ?? annotation.position.x;
  const endY = annotation.endPosition?.y ?? annotation.position.y;
  return {
    x: (annotation.position.x + endX) / 2,
    y: (annotation.position.y + endY) / 2
  };
}

// ============================================================================
// Annotation Factory
// ============================================================================

export function createDefaultAnnotation(
  position: { x: number; y: number },
  shapeType: FreeShapeAnnotation['shapeType'],
  lastStyle: Partial<FreeShapeAnnotation> = {}
): FreeShapeAnnotation {
  const id = generateAnnotationId();
  const roundedPosition = { x: Math.round(position.x), y: Math.round(position.y) };

  const base: FreeShapeAnnotation = {
    id,
    shapeType,
    position: roundedPosition,
    fillColor: lastStyle.fillColor ?? DEFAULT_FILL_COLOR,
    fillOpacity: lastStyle.fillOpacity ?? DEFAULT_FILL_OPACITY,
    borderColor: lastStyle.borderColor ?? DEFAULT_BORDER_COLOR,
    borderWidth: lastStyle.borderWidth ?? DEFAULT_BORDER_WIDTH,
    borderStyle: lastStyle.borderStyle ?? DEFAULT_BORDER_STYLE,
    rotation: 0,
    zIndex: lastStyle.zIndex
  };

  if (shapeType === 'line') {
    const halfLength = DEFAULT_LINE_LENGTH / 2;
    base.position = { x: Math.round(position.x - halfLength), y: Math.round(position.y) };
    base.endPosition = { x: Math.round(position.x + halfLength), y: Math.round(position.y) };
    base.lineStartArrow = lastStyle.lineStartArrow ?? false;
    base.lineEndArrow = lastStyle.lineEndArrow ?? true;
    base.lineArrowSize = lastStyle.lineArrowSize ?? DEFAULT_ARROW_SIZE;
  } else {
    base.width = lastStyle.width ?? DEFAULT_SHAPE_WIDTH;
    base.height = lastStyle.height ?? DEFAULT_SHAPE_HEIGHT;
    if (shapeType === 'rectangle') {
      base.cornerRadius = lastStyle.cornerRadius ?? DEFAULT_CORNER_RADIUS;
    }
  }

  return base;
}

// ============================================================================
// Style Extraction
// ============================================================================

export function extractStyleFromAnnotation(annotation: FreeShapeAnnotation): Partial<FreeShapeAnnotation> {
  return {
    fillColor: annotation.fillColor,
    fillOpacity: annotation.fillOpacity,
    borderColor: annotation.borderColor,
    borderWidth: annotation.borderWidth,
    borderStyle: annotation.borderStyle,
    lineStartArrow: annotation.lineStartArrow,
    lineEndArrow: annotation.lineEndArrow,
    lineArrowSize: annotation.lineArrowSize,
    cornerRadius: annotation.cornerRadius,
    width: annotation.width,
    height: annotation.height,
    zIndex: annotation.zIndex
  };
}

// ============================================================================
// Annotation Updates
// ============================================================================

export function updateAnnotationInList(
  annotations: FreeShapeAnnotation[],
  id: string,
  updater: (annotation: FreeShapeAnnotation) => FreeShapeAnnotation
): FreeShapeAnnotation[] {
  return annotations.map(a => (a.id === id ? updater(a) : a));
}

export function updateAnnotationRotation(annotation: FreeShapeAnnotation, rotation: number): FreeShapeAnnotation {
  return { ...annotation, rotation: ((rotation % 360) + 360) % 360 };
}

export function updateAnnotationPosition(
  annotation: FreeShapeAnnotation,
  newCenter: { x: number; y: number }
): FreeShapeAnnotation {
  if (annotation.shapeType !== 'line') {
    return {
      ...annotation,
      position: { x: Math.round(newCenter.x), y: Math.round(newCenter.y) }
    };
  }

  const oldCenter = getLineCenter(annotation);
  const dx = newCenter.x - oldCenter.x;
  const dy = newCenter.y - oldCenter.y;

  const newStart = {
    x: Math.round(annotation.position.x + dx),
    y: Math.round(annotation.position.y + dy)
  };
  const oldEnd = annotation.endPosition ?? {
    x: annotation.position.x + DEFAULT_LINE_LENGTH,
    y: annotation.position.y
  };
  const newEnd = {
    x: Math.round(oldEnd.x + dx),
    y: Math.round(oldEnd.y + dy)
  };

  return {
    ...annotation,
    position: newStart,
    endPosition: newEnd
  };
}

export function updateAnnotationEndPosition(
  annotation: FreeShapeAnnotation,
  endPosition: { x: number; y: number }
): FreeShapeAnnotation {
  if (annotation.shapeType !== 'line') return annotation;
  const start = annotation.position;
  let dx = endPosition.x - start.x;
  let dy = endPosition.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length > 0 && length < MIN_SHAPE_SIZE) {
    const scale = MIN_SHAPE_SIZE / length;
    dx *= scale;
    dy *= scale;
  }
  return {
    ...annotation,
    endPosition: { x: Math.round(start.x + dx), y: Math.round(start.y + dy) }
  };
}

export function saveAnnotationToList(
  annotations: FreeShapeAnnotation[],
  annotation: FreeShapeAnnotation
): FreeShapeAnnotation[] {
  const exists = annotations.some(a => a.id === annotation.id);
  if (exists) {
    return updateAnnotationInList(annotations, annotation.id, () => annotation);
  }
  return [...annotations, annotation];
}

// ============================================================================
// Copy/Paste Operations
// ============================================================================

const PASTE_OFFSET = 20;

export function duplicateAnnotation(annotation: FreeShapeAnnotation, offset = PASTE_OFFSET): FreeShapeAnnotation {
  if (annotation.shapeType === 'line') {
    const end = annotation.endPosition;
    return {
      ...annotation,
      id: generateAnnotationId(),
      position: {
        x: annotation.position.x + offset,
        y: annotation.position.y + offset
      },
      endPosition: end
        ? { x: end.x + offset, y: end.y + offset }
        : undefined
    };
  }

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
  annotations: FreeShapeAnnotation[],
  pasteCount = 0
): FreeShapeAnnotation[] {
  const offset = PASTE_OFFSET * (pasteCount + 1);
  return annotations.map(a => duplicateAnnotation(a, offset));
}

