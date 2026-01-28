/**
 * Cytoscape event handlers and interaction utilities
 */
import type { Core, EventObject, NodeSingular, EdgeSingular } from "cytoscape";
import type React from "react";

// Scratch key for edge creation state (must match useEdgeCreation.ts)
const EDGE_CREATION_SCRATCH_KEY = "_isCreatingEdge";
// Scratch key for context menu state (must match useContextMenu.ts)
const CONTEXT_MENU_SCRATCH_KEY = "_isContextMenuActive";

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
const NON_SELECTABLE_ROLES = new Set(["group", "freeText", "freeShape"]);

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
function isSelectableNode(target: NodeSingular): boolean {
  const role = target.data("topoViewerRole") as string | undefined;
  return !role || !NON_SELECTABLE_ROLES.has(role);
}

/** Event handler options for double-tap editing */
export interface EditEventOptions {
  editNode?: (nodeId: string | null) => void;
  editEdge?: (edgeId: string | null) => void;
  getMode?: () => "edit" | "view";
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
  cy.on("tap", "node", (evt) => {
    if (shouldSkipSelection(cy, evt)) return;
    const target = evt.target as NodeSingular;
    if (!isSelectableNode(target)) return;
    // If Ctrl/Cmd is NOT pressed, clear existing selection first (replace behavior)
    if (!isCtrlPressed(evt)) {
      cy.elements().unselect();
    }
    selectNode(target.id());
  });

  cy.on("tap", "edge", (evt) => {
    if (shouldSkipSelection(cy, evt)) return;
    const target = evt.target as EdgeSingular;
    // If Ctrl/Cmd is NOT pressed, clear existing selection first (replace behavior)
    if (!isCtrlPressed(evt)) {
      cy.elements().unselect();
    }
    selectEdge(target.id());
  });

  cy.on("tap", (evt) => {
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
    cy.on("dbltap", "node", (evt) => {
      if (shouldSkipSelection(cy, evt)) return;
      const target = evt.target as NodeSingular;
      if (!isSelectableNode(target)) return;
      const mode = options.getMode?.() ?? "view";
      const isLocked = options.getIsLocked?.() ?? true;
      if (mode === "edit" && !isLocked) {
        editNode(target.id());
      }
    });
  }

  if (options.editEdge) {
    const editEdge = options.editEdge;
    cy.on("dbltap", "edge", (evt) => {
      if (shouldSkipSelection(cy, evt)) return;
      const target = evt.target as EdgeSingular;
      const mode = options.getMode?.() ?? "view";
      const isLocked = options.getIsLocked?.() ?? true;
      if (mode === "edit" && !isLocked) {
        editEdge(target.id());
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

/** State for smooth zoom animation */
interface SmoothZoomState {
  targetZoom: number;
  currentZoom: number;
  velocity: number;
  lastPosition: { x: number; y: number };
  animationFrame: number | null;
  lastWheelTime: number;
}

/**
 * Create custom wheel handler for super smooth zooming
 * Uses momentum-based animation with easing for fluid zoom experience
 * NOTE: This handler is disabled when GeoMap is active (cy.scratch('geoMapActive'))
 * because GeoMap manages zoom through MapLibre and requires cy.zoom() to stay at 1.
 */
export function createCustomWheelHandler(
  cyRef: React.RefObject<Core | null>
): (event: WheelEvent) => void {
  // Smooth zoom state - persists across wheel events
  const state: SmoothZoomState = {
    targetZoom: 1,
    currentZoom: 1,
    velocity: 0,
    lastPosition: { x: 0, y: 0 },
    animationFrame: null,
    lastWheelTime: 0
  };

  // Smoothing parameters
  const LERP_FACTOR = 0.35; // How quickly zoom catches up (0-1, higher = snappier)
  const VELOCITY_DECAY = 0.75; // Momentum decay per frame (0-1, lower = stops faster)
  const MIN_VELOCITY = 0.0001; // Stop animating below this velocity
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 100;

  const animate = () => {
    const cy = cyRef.current;
    if (!cy) {
      state.animationFrame = null;
      return;
    }

    // Apply velocity to target
    state.targetZoom *= 1 + state.velocity;
    state.targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.targetZoom));

    // Decay velocity (momentum)
    state.velocity *= VELOCITY_DECAY;

    // Lerp current zoom toward target
    const diff = state.targetZoom - state.currentZoom;
    state.currentZoom += diff * LERP_FACTOR;

    // Apply zoom
    cy.zoom({
      level: state.currentZoom,
      renderedPosition: state.lastPosition
    });

    // Continue animation if there's significant movement
    const isMoving = Math.abs(diff) > 0.0001 || Math.abs(state.velocity) > MIN_VELOCITY;
    if (isMoving) {
      state.animationFrame = window.requestAnimationFrame(animate);
    } else {
      state.animationFrame = null;
      // Snap to target when settled
      state.currentZoom = state.targetZoom;
    }
  };

  return (event: WheelEvent) => {
    const cy = cyRef.current;
    if (!cy) return;

    // Skip if GeoMap is active - let MapLibre handle zoom
    // GeoMap requires cy.zoom() to stay at 1 for correct projection
    if (cy.scratch("geoMapActive") === true) {
      return;
    }

    event.preventDefault();

    // Initialize state from current cy zoom if animation not running
    if (state.animationFrame === null) {
      state.currentZoom = cy.zoom();
      state.targetZoom = cy.zoom();
      state.velocity = 0;
    }

    // Normalize delta across different input modes
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= 40; // Approximate pixels per line
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= window.innerHeight;
    }

    // Detect trackpad vs mouse wheel for appropriate sensitivity
    const isTrackpad =
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50;
    const sensitivity = isTrackpad ? 0.002 : 0.00025;

    // Add to velocity (negative because scroll down = zoom out)
    state.velocity -= delta * sensitivity;

    // Update zoom position (where to zoom toward)
    state.lastPosition = { x: event.offsetX, y: event.offsetY };
    state.lastWheelTime = Date.now();

    // Start animation loop if not already running
    if (state.animationFrame === null) {
      state.animationFrame = window.requestAnimationFrame(animate);
    }
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
  container.addEventListener("wheel", handler, { passive: false });
  return () => container.removeEventListener("wheel", handler);
}
