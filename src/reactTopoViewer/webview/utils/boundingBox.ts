/**
 * Bounding box calculation utilities for fit-to-viewport functionality.
 * These utilities calculate combined bounds that include Cytoscape elements
 * and all annotation types (text, shapes, groups).
 */

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from '../../shared/types/topology';

/**
 * Represents an axis-aligned bounding box.
 */
export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Default estimated dimensions for text annotations without explicit size.
 */
const DEFAULT_TEXT_WIDTH = 100;
const DEFAULT_TEXT_HEIGHT = 20;

/**
 * Estimate text annotation dimensions based on font size.
 * Used when width/height are not explicitly set.
 */
function estimateTextDimensions(annotation: FreeTextAnnotation): { width: number; height: number } {
  const fontSize = annotation.fontSize ?? 14;
  const text = annotation.text || '';
  // Rough estimate: each character is about 0.6x font size wide
  const estimatedWidth = Math.max(DEFAULT_TEXT_WIDTH, text.length * fontSize * 0.6);
  // Height based on font size with some padding
  const estimatedHeight = Math.max(DEFAULT_TEXT_HEIGHT, fontSize * 1.5);
  return { width: estimatedWidth, height: estimatedHeight };
}

/**
 * Get bounding box for a text annotation.
 * Text position is the CENTER of the annotation (same as canvas rendering).
 */
export function getTextAnnotationBounds(annotation: FreeTextAnnotation): BoundingBox {
  const { x, y } = annotation.position;
  const width = annotation.width ?? estimateTextDimensions(annotation).width;
  const height = annotation.height ?? estimateTextDimensions(annotation).height;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return {
    x1: x - halfWidth,
    y1: y - halfHeight,
    x2: x + halfWidth,
    y2: y + halfHeight
  };
}

/**
 * Get bounding box for a shape annotation.
 * Handles rectangles, circles, and lines differently.
 * Rectangles and circles: position is the CENTER (same as canvas rendering).
 * Lines: position and endPosition are the actual start/end points.
 */
export function getShapeAnnotationBounds(annotation: FreeShapeAnnotation): BoundingBox {
  const { x, y } = annotation.position;

  if (annotation.shapeType === 'line') {
    // Lines have start position and end position (not center-based)
    const endX = annotation.endPosition?.x ?? x;
    const endY = annotation.endPosition?.y ?? y;
    return {
      x1: Math.min(x, endX),
      y1: Math.min(y, endY),
      x2: Math.max(x, endX),
      y2: Math.max(y, endY)
    };
  }

  // Rectangles and circles: position is CENTER
  const width = annotation.width ?? 100;
  const height = annotation.height ?? 100;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    x1: x - halfWidth,
    y1: y - halfHeight,
    x2: x + halfWidth,
    y2: y + halfHeight
  };
}

/**
 * Get bounding box for a group annotation.
 * Group position is the CENTER, so we need to calculate corners.
 */
export function getGroupBounds(group: GroupStyleAnnotation): BoundingBox {
  const halfWidth = group.width / 2;
  const halfHeight = group.height / 2;
  return {
    x1: group.position.x - halfWidth,
    y1: group.position.y - halfHeight,
    x2: group.position.x + halfWidth,
    y2: group.position.y + halfHeight
  };
}

/**
 * Merge two bounding boxes into one that encompasses both.
 */
export function mergeBounds(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2)
  };
}

/**
 * Check if a bounding box is valid (has non-zero area and finite values).
 */
export function isValidBounds(bounds: BoundingBox): boolean {
  const hasFiniteValues =
    Number.isFinite(bounds.x1) &&
    Number.isFinite(bounds.y1) &&
    Number.isFinite(bounds.x2) &&
    Number.isFinite(bounds.y2);
  const hasPositiveArea = bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1;
  return hasFiniteValues && hasPositiveArea;
}

/**
 * Merge a new bounds into existing result if valid.
 * Returns the merged result or the new bounds if result is null.
 */
function mergeIfValid(result: BoundingBox | null, bounds: BoundingBox): BoundingBox | null {
  if (!isValidBounds(bounds)) return result;
  return result ? mergeBounds(result, bounds) : bounds;
}

/**
 * Collect all bounding boxes from annotations into a single array.
 */
function collectAnnotationBounds(
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[]
): BoundingBox[] {
  const bounds: BoundingBox[] = [];
  for (const annotation of textAnnotations) {
    bounds.push(getTextAnnotationBounds(annotation));
  }
  for (const annotation of shapeAnnotations) {
    bounds.push(getShapeAnnotationBounds(annotation));
  }
  for (const group of groups) {
    bounds.push(getGroupBounds(group));
  }
  return bounds;
}

/**
 * Calculate combined bounding box from Cytoscape extent and all annotations.
 * Returns null if there are no valid bounds to fit.
 */
export function getCombinedBounds(
  cyExtent: BoundingBox | null,
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[]
): BoundingBox | null {
  // Start with Cytoscape extent if valid
  let result: BoundingBox | null =
    cyExtent && isValidBounds(cyExtent) ? { ...cyExtent } : null;

  // Collect and merge all annotation bounds
  const allBounds = collectAnnotationBounds(textAnnotations, shapeAnnotations, groups);
  for (const bounds of allBounds) {
    result = mergeIfValid(result, bounds);
  }

  return result;
}
