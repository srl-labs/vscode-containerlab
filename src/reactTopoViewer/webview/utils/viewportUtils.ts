/**
 * Viewport Utilities
 * Helper functions for viewport operations in React Flow.
 */
import type { ReactFlowInstance } from "@xyflow/react";

/** Selector for the React Flow container element */
const REACT_FLOW_CONTAINER_SELECTOR = ".react-flow";

/**
 * Get the center of the visible viewport in model (flow) coordinates.
 */
export function getViewportCenter(rfInstance: ReactFlowInstance | null): { x: number; y: number } {
  if (!rfInstance) {
    return { x: 0, y: 0 };
  }

  const viewport = rfInstance.getViewport();
  const container = document.querySelector(REACT_FLOW_CONTAINER_SELECTOR);
  if (!container) {
    return { x: 0, y: 0 };
  }

  const { width, height } = container.getBoundingClientRect();

  // Convert screen center to model coordinates
  // Screen center is (width/2, height/2)
  // Model coords = (screenCoords - pan) / zoom
  return {
    x: (width / 2 - viewport.x) / viewport.zoom,
    y: (height / 2 - viewport.y) / viewport.zoom,
  };
}
