/**
 * Cytoscape event handlers and interaction utilities
 */
import type { Core, EventObject } from 'cytoscape';
import type React from 'react';

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
 * Roles that should not trigger node selection (groups, annotations)
 */
const NON_SELECTABLE_ROLES = new Set(['group', 'freeText', 'freeShape']);

/**
 * Check if selection should be skipped for this event
 */
function shouldSkipSelection(cy: Core, evt: EventObject): boolean {
  if (isCreatingEdge(cy) || isContextMenuActive(cy)) return true;
  if (isRightClick(evt)) return true;
  const originalEvent = evt.originalEvent as MouseEvent;
  if (originalEvent?.shiftKey) return true;
  return false;
}

/**
 * Check if node role allows selection
 */
function isSelectableNode(evt: EventObject): boolean {
  const role = evt.target.data('topoViewerRole');
  return !NON_SELECTABLE_ROLES.has(role);
}

/** Event handler options for double-tap editing */
export interface EditEventOptions {
  editNode?: (nodeId: string | null) => void;
  editEdge?: (edgeId: string | null) => void;
  getMode?: () => 'edit' | 'view';
  getIsLocked?: () => boolean;
}

/**
 * Check if Ctrl/Cmd key is pressed (for multi-select)
 */
function isCtrlPressed(evt: EventObject): boolean {
  const originalEvent = evt.originalEvent as MouseEvent;
  return originalEvent?.ctrlKey || originalEvent?.metaKey;
}

/**
 * Setup tap handlers for node/edge selection
 */
function setupTapHandlers(
  cy: Core,
  selectNode: (nodeId: string | null) => void,
  selectEdge: (edgeId: string | null) => void
): void {
  cy.on('tap', 'node', (evt) => {
    if (shouldSkipSelection(cy, evt)) return;
    if (!isSelectableNode(evt)) return;
    // If Ctrl/Cmd is NOT pressed, clear existing selection first (replace behavior)
    if (!isCtrlPressed(evt)) {
      cy.elements().unselect();
    }
    selectNode(evt.target.id());
  });

  cy.on('tap', 'edge', (evt) => {
    if (shouldSkipSelection(cy, evt)) return;
    // If Ctrl/Cmd is NOT pressed, clear existing selection first (replace behavior)
    if (!isCtrlPressed(evt)) {
      cy.elements().unselect();
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
 * Setup double-tap handlers for editing (only in edit mode and when not locked)
 */
function setupDoubleTapHandlers(cy: Core, options: EditEventOptions): void {
  if (options.editNode) {
    const editNode = options.editNode;
    cy.on('dbltap', 'node', (evt) => {
      if (shouldSkipSelection(cy, evt)) return;
      if (!isSelectableNode(evt)) return;
      const mode = options.getMode?.() ?? 'view';
      const isLocked = options.getIsLocked?.() ?? true;
      if (mode === 'edit' && !isLocked) {
        editNode(evt.target.id());
      }
    });
  }

  if (options.editEdge) {
    const editEdge = options.editEdge;
    cy.on('dbltap', 'edge', (evt) => {
      if (shouldSkipSelection(cy, evt)) return;
      const mode = options.getMode?.() ?? 'view';
      const isLocked = options.getIsLocked?.() ?? true;
      if (mode === 'edit' && !isLocked) {
        editEdge(evt.target.id());
      }
    });
  }
}

/**
 * Setup Cytoscape event handlers for node/edge selection and double-click editing
 */
export function setupEventHandlers(
  cy: Core,
  selectNode: (nodeId: string | null) => void,
  selectEdge: (edgeId: string | null) => void,
  options?: EditEventOptions
): void {
  setupTapHandlers(cy, selectNode, selectEdge);
  if (options) {
    setupDoubleTapHandlers(cy, options);
  }
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
