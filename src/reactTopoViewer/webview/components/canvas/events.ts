/**
 * Cytoscape event handlers and interaction utilities
 */
import { Core, EventObject } from 'cytoscape';
import React from 'react';

// Scratch key for edge creation state (must match useEdgeCreation.ts)
const EDGE_CREATION_SCRATCH_KEY = '_isCreatingEdge';
// Scratch key for context menu state (must match useContextMenu.ts)
const CONTEXT_MENU_SCRATCH_KEY = '_isContextMenuActive';

/**
 * Check if edge creation is in progress
 */
export function isCreatingEdge(cy: Core): boolean {
  return cy.scratch(EDGE_CREATION_SCRATCH_KEY) === true;
}

/**
 * Check if context menu is active
 */
export function isContextMenuActive(cy: Core): boolean {
  return cy.scratch(CONTEXT_MENU_SCRATCH_KEY) === true;
}

/**
 * Check if event is a right-click (context menu)
 */
export function isRightClick(evt: EventObject): boolean {
  const originalEvent = evt.originalEvent as MouseEvent;
  return originalEvent?.button === 2;
}

/**
 * Setup Cytoscape event handlers for node/edge selection
 */
export function setupEventHandlers(
  cy: Core,
  selectNode: (nodeId: string | null) => void,
  selectEdge: (edgeId: string | null) => void
): void {
  cy.on('tap', 'node', (evt) => {
    // Skip selection during edge creation or context menu interaction
    if (isCreatingEdge(cy) || isContextMenuActive(cy)) {
      return;
    }
    // Skip selection on right-click (context menu)
    if (isRightClick(evt)) {
      return;
    }
    const originalEvent = evt.originalEvent as MouseEvent;
    // If shift is held, let Cytoscape handle multi-selection
    // Don't update React single-selection state
    if (originalEvent?.shiftKey) {
      return;
    }
    selectNode(evt.target.id());
  });

  cy.on('tap', 'edge', (evt) => {
    // Skip selection during edge creation or context menu interaction
    if (isCreatingEdge(cy) || isContextMenuActive(cy)) {
      return;
    }
    // Skip selection on right-click (context menu)
    if (isRightClick(evt)) {
      return;
    }
    const originalEvent = evt.originalEvent as MouseEvent;
    // If shift is held, let Cytoscape handle multi-selection
    if (originalEvent?.shiftKey) {
      return;
    }
    selectEdge(evt.target.id());
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      selectNode(null);
      selectEdge(null);
    }
  });
}

/**
 * Create custom wheel handler for smooth zooming
 */
export function createCustomWheelHandler(
  cyRef: React.RefObject<Core | null>
): (event: WheelEvent) => void {
  return (event: WheelEvent) => {
    const cy = cyRef.current;
    if (!cy) return;
    event.preventDefault();
    let step = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      step *= 100;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      step *= window.innerHeight;
    }
    const isTrackpad = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50;
    const sensitivity = isTrackpad ? 0.002 : 0.0002;
    const factor = Math.pow(10, -step * sensitivity);
    const newZoom = cy.zoom() * factor;
    cy.zoom({
      level: newZoom,
      renderedPosition: { x: event.offsetX, y: event.offsetY }
    });
  };
}

/**
 * Attach custom wheel zoom handler to container
 * Returns cleanup function
 */
export function attachCustomWheelZoom(
  cyRef: React.RefObject<Core | null>,
  container: HTMLElement | null
): () => void {
  if (!container) return () => {};
  const handler = createCustomWheelHandler(cyRef);
  container.addEventListener('wheel', handler, { passive: false });
  return () => container.removeEventListener('wheel', handler);
}
