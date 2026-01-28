/**
 * Custom fit-to-viewport functionality that includes annotations.
 * Extends Cytoscape's native fit() to also consider text, shape, and group annotations.
 */

import type { Core } from "cytoscape";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";

import { getCombinedBounds, type BoundingBox } from "./boundingBox";

/** Default padding around the fitted content */
const DEFAULT_PADDING = 50;

/** Minimum zoom level to prevent extreme zoom */
const MIN_ZOOM = 0.1;

/** Maximum zoom level to prevent extreme zoom */
const MAX_ZOOM = 3;

/**
 * Get the Cytoscape extent as a BoundingBox, or null if no elements.
 */
function getCytoscapeExtent(cy: Core): BoundingBox | null {
  const nodes = cy.nodes();
  if (nodes.length === 0) {
    return null;
  }

  // Use nodes().boundingBox() for stable bounds matching native cy.fit() behavior
  // Edges are excluded since they don't add meaningful extent (they connect nodes)
  const bb = nodes.boundingBox();
  return {
    x1: bb.x1,
    y1: bb.y1,
    x2: bb.x2,
    y2: bb.y2
  };
}

/**
 * Calculate the zoom and pan needed to fit bounds within the container.
 */
function calculateViewport(
  bounds: BoundingBox,
  containerWidth: number,
  containerHeight: number,
  padding: number
): { zoom: number; pan: { x: number; y: number } } {
  const boundsWidth = bounds.x2 - bounds.x1;
  const boundsHeight = bounds.y2 - bounds.y1;

  // Available space after padding
  const availableWidth = containerWidth - padding * 2;
  const availableHeight = containerHeight - padding * 2;

  // Calculate zoom to fit both dimensions
  const zoomX = availableWidth / boundsWidth;
  const zoomY = availableHeight / boundsHeight;
  let zoom = Math.min(zoomX, zoomY);

  // Clamp zoom to reasonable limits
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

  // Calculate center of bounds
  const boundsCenterX = (bounds.x1 + bounds.x2) / 2;
  const boundsCenterY = (bounds.y1 + bounds.y2) / 2;

  // Calculate pan to center the bounds in the viewport
  // Pan represents where the origin (0,0) of the graph is in rendered coordinates
  // We want the bounds center to be at the container center
  const pan = {
    x: containerWidth / 2 - boundsCenterX * zoom,
    y: containerHeight / 2 - boundsCenterY * zoom
  };

  return { zoom, pan };
}

/**
 * Fit the viewport to include all Cytoscape elements and annotations.
 *
 * NOTE: This function is skipped when GeoMap is active because GeoMap requires
 * cy.zoom() to stay at 1 and cy.pan() at {0,0} for correct projection.
 *
 * @param cy - Cytoscape instance
 * @param textAnnotations - Array of text annotations
 * @param shapeAnnotations - Array of shape annotations
 * @param groups - Array of group annotations
 * @param padding - Padding around the content (default: 50)
 */
export function fitViewportToAll(
  cy: Core,
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[],
  padding: number = DEFAULT_PADDING
): void {
  // Skip if GeoMap is active - GeoMap requires cy.zoom()=1 and cy.pan()={0,0}
  if (cy.scratch("geoMapActive") === true) return;

  const container = cy.container();
  if (!container) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  if (containerWidth === 0 || containerHeight === 0) return;

  // Get Cytoscape extent
  const cyExtent = getCytoscapeExtent(cy);

  // Calculate combined bounds including all annotations
  const combinedBounds = getCombinedBounds(cyExtent, textAnnotations, shapeAnnotations, groups);

  // If no bounds at all, nothing to fit
  if (!combinedBounds) {
    // Fall back to Cytoscape's native fit if there's nothing to fit
    cy.fit(undefined, padding);
    return;
  }

  // Calculate and apply viewport
  const { zoom, pan } = calculateViewport(combinedBounds, containerWidth, containerHeight, padding);

  cy.viewport({ zoom, pan });
}
