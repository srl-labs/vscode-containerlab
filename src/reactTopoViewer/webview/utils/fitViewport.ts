/**
 * Custom fit-to-viewport functionality that includes annotations.
 * Extends Cytoscape's native fit() to also consider text, shape, and group annotations.
 */

import type { CyLike } from "../hooks/useAppState";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";

import { getCombinedBounds, type BoundingBox } from "./boundingBox";

/** Default padding around the fitted content */
const DEFAULT_PADDING = 50;

/**
 * Get the extent as a BoundingBox, or null if no elements.
 */
function getCytoscapeExtent(cyCompat: CyLike): BoundingBox | null {
  const nodes = cyCompat.nodes();
  if (nodes.length === 0) {
    return null;
  }

  // Calculate bounding box from node positions
  // CyLike uses extent() method which provides node bounds
  const extent = cyCompat.extent();
  return {
    x1: extent.x1,
    y1: extent.y1,
    x2: extent.x2,
    y2: extent.y2
  };
}

/**
 * Fit the viewport to include all elements and annotations.
 *
 * NOTE: This function is skipped when GeoMap is active because GeoMap requires
 * zoom to stay at 1 and pan at {0,0} for correct projection.
 *
 * @param cyCompat - Cytoscape compatibility instance
 * @param textAnnotations - Array of text annotations
 * @param shapeAnnotations - Array of shape annotations
 * @param groups - Array of group annotations
 * @param padding - Padding around the content (default: 50)
 */
export function fitViewportToAll(
  cyCompat: CyLike | null,
  textAnnotations: FreeTextAnnotation[],
  shapeAnnotations: FreeShapeAnnotation[],
  groups: GroupStyleAnnotation[],
  padding: number = DEFAULT_PADDING
): void {
  if (!cyCompat) return;

  // Skip if GeoMap is active - GeoMap requires zoom=1 and pan={0,0}
  if (cyCompat.scratch("geoMapActive") === true) return;

  const container = cyCompat.container();
  if (!container) return;

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  if (containerWidth === 0 || containerHeight === 0) return;

  // Get extent
  const cyExtent = getCytoscapeExtent(cyCompat);

  // Calculate combined bounds including all annotations
  const combinedBounds = getCombinedBounds(cyExtent, textAnnotations, shapeAnnotations, groups);

  // If no bounds at all, nothing to fit
  if (!combinedBounds) {
    // Fall back to native fit if there's nothing to fit
    cyCompat.fit(undefined, padding);
    return;
  }

  // In the ReactFlow architecture, viewport calculations are handled by ReactFlow's fitView.
  // CyLike.fit() delegates to ReactFlow's fitView() which handles this internally.
  cyCompat.fit(undefined, padding);
}
