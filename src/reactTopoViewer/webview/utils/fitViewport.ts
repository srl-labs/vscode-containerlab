/**
 * Custom fit-to-viewport functionality that includes annotations.
 *
 * NOTE: This module is disabled during ReactFlow migration.
 * Viewport fitting is now handled by ReactFlow's fitView() API.
 * TODO: Re-implement with ReactFlow's viewport controls.
 */

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";

import { getCombinedBounds, type BoundingBox } from "./boundingBox";

// Suppress unused import warnings
void getCombinedBounds;

/**
 * Fit the viewport to include all elements and annotations.
 *
 * @deprecated Use ReactFlow's fitView() instead via ViewportContext
 */
export function fitViewportToAll(
  _cyCompat: unknown,
  _textAnnotations: FreeTextAnnotation[],
  _shapeAnnotations: FreeShapeAnnotation[],
  _groups: GroupStyleAnnotation[],
  _padding?: number
): void {
  // Disabled during ReactFlow migration
  // Use ViewportContext.rfInstance.fitView() instead
}

/**
 * Calculate the combined bounds of nodes and annotations.
 * @deprecated Use getCombinedBounds from boundingBox.ts directly
 */
export function calculateCombinedBounds(
  nodeExtent: BoundingBox | null,
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[]
): BoundingBox | null {
  return getCombinedBounds(nodeExtent, textAnnotations, shapeAnnotations, groups);
}
