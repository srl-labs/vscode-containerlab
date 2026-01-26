/**
 * Viewport Utilities
 * Helper functions for viewport operations in React Flow.
 * These replace viewport operations like pan, zoom, and extent calculations.
 */
import type { ReactFlowInstance, Viewport } from "@xyflow/react";

/** Selector for the React Flow container element */
const REACT_FLOW_CONTAINER_SELECTOR = ".react-flow";

/**
 * Get the center of the visible viewport in model (flow) coordinates
 * Get the visible center of the viewport
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
    y: (height / 2 - viewport.y) / viewport.zoom
  };
}

/**
 * Convert screen coordinates to model (flow) coordinates
 * Replaces cy.extent() position calculations
 */
export function screenToModel(
  rfInstance: ReactFlowInstance | null,
  screenPos: { x: number; y: number }
): { x: number; y: number } {
  if (!rfInstance) {
    return screenPos;
  }

  const viewport = rfInstance.getViewport();

  return {
    x: (screenPos.x - viewport.x) / viewport.zoom,
    y: (screenPos.y - viewport.y) / viewport.zoom
  };
}

/**
 * Convert model (flow) coordinates to screen coordinates
 * Inverse of screenToModel
 */
export function modelToScreen(
  rfInstance: ReactFlowInstance | null,
  modelPos: { x: number; y: number }
): { x: number; y: number } {
  if (!rfInstance) {
    return modelPos;
  }

  const viewport = rfInstance.getViewport();

  return {
    x: modelPos.x * viewport.zoom + viewport.x,
    y: modelPos.y * viewport.zoom + viewport.y
  };
}

/**
 * Get the visible extent of the viewport in model coordinates
 * Replaces cy.extent()
 */
export function getViewportExtent(rfInstance: ReactFlowInstance | null): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
} {
  if (!rfInstance) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 };
  }

  const viewport = rfInstance.getViewport();
  const container = document.querySelector(REACT_FLOW_CONTAINER_SELECTOR);
  if (!container) {
    return { x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0 };
  }

  const { width, height } = container.getBoundingClientRect();

  const x1 = -viewport.x / viewport.zoom;
  const y1 = -viewport.y / viewport.zoom;
  const x2 = (width - viewport.x) / viewport.zoom;
  const y2 = (height - viewport.y) / viewport.zoom;

  return {
    x1,
    y1,
    x2,
    y2,
    width: x2 - x1,
    height: y2 - y1
  };
}

/**
 * Get the current viewport state (pan and zoom)
 * Replaces cy.pan() and cy.zoom()
 */
export function getViewportState(rfInstance: ReactFlowInstance | null): {
  pan: { x: number; y: number };
  zoom: number;
} {
  if (!rfInstance) {
    return { pan: { x: 0, y: 0 }, zoom: 1 };
  }

  const viewport = rfInstance.getViewport();
  return {
    pan: { x: viewport.x, y: viewport.y },
    zoom: viewport.zoom
  };
}

/**
 * Set the viewport state (pan and zoom)
 * Replaces cy.pan(pos) and cy.zoom(level)
 */
export function setViewportState(
  rfInstance: ReactFlowInstance | null,
  pan: { x: number; y: number },
  zoom: number
): void {
  if (!rfInstance) return;

  Promise.resolve(rfInstance.setViewport({ x: pan.x, y: pan.y, zoom })).catch(() => {
    /* ignore */
  });
}

/**
 * Center the viewport on a specific model position
 */
export function centerOnPosition(
  rfInstance: ReactFlowInstance | null,
  modelPos: { x: number; y: number },
  zoom?: number
): void {
  if (!rfInstance) return;

  const container = document.querySelector(REACT_FLOW_CONTAINER_SELECTOR);
  if (!container) return;

  const { width, height } = container.getBoundingClientRect();
  const currentZoom = zoom ?? rfInstance.getViewport().zoom;

  // Calculate pan so that modelPos is centered
  const newViewport: Viewport = {
    x: width / 2 - modelPos.x * currentZoom,
    y: height / 2 - modelPos.y * currentZoom,
    zoom: currentZoom
  };

  Promise.resolve(rfInstance.setViewport(newViewport)).catch(() => {
    /* ignore */
  });
}

/**
 * Get the container element for the React Flow instance
 */
export function getContainer(): HTMLElement | null {
  return document.querySelector(REACT_FLOW_CONTAINER_SELECTOR) as HTMLElement | null;
}

/**
 * Get the container dimensions
 */
export function getContainerDimensions(): { width: number; height: number } {
  const container = getContainer();
  if (!container) {
    return { width: 0, height: 0 };
  }
  const rect = container.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
