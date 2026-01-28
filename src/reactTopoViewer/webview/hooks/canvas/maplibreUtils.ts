/**
 * MapLibre GL Integration for React TopoViewer
 * Replaces Leaflet with MapLibre GL for smoother, WebGL-powered map rendering
 */
import type { Core, NodeSingular, EdgeSingular, EventObject, NodeCollection } from "cytoscape";
import maplibregl from "maplibre-gl";

import { log } from "../../utils/logger";

/**
 * Cytoscape element with data accessor for geo map functionality
 */
type CytoscapeElement = NodeSingular | EdgeSingular;

// Constants
export const CLASS_MAPLIBRE_ACTIVE = "maplibre-active";
export const ID_GEO_MAP_CONTAINER = "react-topoviewer-geo-map";
const DEFAULT_LAT = 48.684826888402256;
const DEFAULT_LNG = 9.007895390625677;
const DEFAULT_INITIAL_ZOOM = 4;
const INITIAL_FIT_MAX_ZOOM = 15;
const RETINA_TILE_DPR_THRESHOLD = 1.5;

// Style keys for scaling
const STYLE_FONT_SIZE = "font-size";
const STYLE_BORDER_WIDTH = "border-width";
const STYLE_ARROW_SCALE = "arrow-scale";
const STYLE_WIDTH = "width";
const STYLE_HEIGHT = "height";

// Minimum sizes to prevent nodes from becoming too small when zoomed out
const MIN_NODE_SIZE = 20;
const MIN_FONT_SIZE = 8;
const MIN_EDGE_WIDTH = 1;
const MIN_BORDER_WIDTH = 1;

// Default fit padding
const DEFAULT_FIT_PADDING = 50;

function getCartoVoyagerTileUrls(): string[] {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  const suffix = dpr >= RETINA_TILE_DPR_THRESHOLD ? "@2x" : "";

  return [
    `https://a.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}${suffix}.png`,
    `https://b.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}${suffix}.png`,
    `https://c.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}${suffix}.png`,
    `https://d.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}${suffix}.png`
  ];
}

export interface MapLibreState {
  isInitialized: boolean;
  map: maplibregl.Map | null;
  mapContainer: HTMLElement | null;
  baseZoom: number;
  scaleFactor: number;
  scaleApplied: boolean;
  lastScale: number;
  originalPositions: Map<string, { x: number; y: number }>;
  originalZoom: number;
  originalPan: { x: number; y: number };
}

/**
 * Create initial MapLibre state
 */
export function createInitialMapLibreState(): MapLibreState {
  return {
    isInitialized: false,
    map: null,
    mapContainer: null,
    baseZoom: 4,
    scaleFactor: 4,
    scaleApplied: false,
    lastScale: 4,
    originalPositions: new Map(),
    originalZoom: 1,
    originalPan: { x: 0, y: 0 }
  };
}

/**
 * Assign missing lat/lng to nodes
 */
export function assignMissingLatLng(cy: Core): void {
  const stats = computeLatLngStats(cy);
  cy.nodes().forEach((node) => applyLatLngToNode(node, stats));
}

interface LatLngStats {
  avgLat: number;
  avgLng: number;
  useDefaultLat: boolean;
  useDefaultLng: boolean;
}

function computeLatLngStats(cy: Core): LatLngStats {
  const lats: number[] = [];
  const lngs: number[] = [];

  cy.nodes().forEach((node) => {
    const lat = parseFloat(node.data("lat"));
    const lng = parseFloat(node.data("lng"));
    if (!isNaN(lat)) lats.push(lat);
    if (!isNaN(lng)) lngs.push(lng);
  });

  return {
    avgLat: lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : DEFAULT_LAT,
    avgLng: lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : DEFAULT_LNG,
    useDefaultLat: lats.length === 0,
    useDefaultLng: lngs.length === 0
  };
}

function applyLatLngToNode(node: NodeSingular, stats: LatLngStats): void {
  let lat = parseFloat(node.data("lat") as string);
  if (!node.data("lat") || isNaN(lat)) {
    const idx = node.id().length % 5;
    const offset = (idx - 2) * 0.05;
    lat = (stats.useDefaultLat ? DEFAULT_LAT : stats.avgLat) + offset;
  }

  let lng = parseFloat(node.data("lng") as string);
  if (!node.data("lng") || isNaN(lng)) {
    const idx = (node.id().charCodeAt(0) || 0) % 7;
    const offset = (idx - 3) * 0.05;
    lng = (stats.useDefaultLng ? DEFAULT_LNG : stats.avgLng) + offset;
  }

  node.data("lat", lat.toFixed(15));
  node.data("lng", lng.toFixed(15));
}

/**
 * Hide the grid overlay when geo map is active
 */
export function hideGridOverlay(container: Element | null): void {
  if (!container) return;
  const gridOverlay = container.querySelector(
    ".react-topoviewer-grid-overlay"
  ) as HTMLCanvasElement | null;
  if (gridOverlay) {
    gridOverlay.style.display = "none";
  }
}

/**
 * Show the grid overlay when geo map is deactivated
 */
export function showGridOverlay(container: Element | null): void {
  if (!container) return;
  const gridOverlay = container.querySelector(
    ".react-topoviewer-grid-overlay"
  ) as HTMLCanvasElement | null;
  if (gridOverlay) {
    gridOverlay.style.display = "block";
  }
}

/**
 * Get node's LngLat position
 */
function getNodeLngLat(node: NodeSingular): maplibregl.LngLat | null {
  const lat = parseFloat(node.data("lat") as string);
  const lng = parseFloat(node.data("lng") as string);
  if (isNaN(lat) || isNaN(lng)) return null;
  return new maplibregl.LngLat(lng, lat);
}

// ============================================================================
// Annotation Geo Coordinate Functions
// ============================================================================

/**
 * Project annotation geo coordinates to screen position
 */
export function projectAnnotationGeoCoords(
  state: MapLibreState,
  geoCoords: { lat: number; lng: number }
): { x: number; y: number } | null {
  if (!state.map || !state.isInitialized) return null;
  const point = state.map.project(new maplibregl.LngLat(geoCoords.lng, geoCoords.lat));
  return { x: point.x, y: point.y };
}

/**
 * Convert screen position to geo coordinates (for dragging in geo mode)
 */
export function unprojectToGeoCoords(
  state: MapLibreState,
  screenPos: { x: number; y: number }
): { lat: number; lng: number } | null {
  if (!state.map || !state.isInitialized) return null;
  const lngLat = state.map.unproject([screenPos.x, screenPos.y]);
  return { lat: lngLat.lat, lng: lngLat.lng };
}

/**
 * Result of assigning missing geo coordinates to annotations
 */
export interface AssignGeoResult<T> {
  updated: T[];
  hasChanges: boolean;
}

/**
 * Base annotation type that supports geo coordinates
 */
interface GeoCapableAnnotation {
  position: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
}

/**
 * Extended annotation type for shapes with end positions (like lines)
 */
interface GeoCapableShapeAnnotation extends GeoCapableAnnotation {
  endPosition?: { x: number; y: number };
  endGeoCoordinates?: { lat: number; lng: number };
}

/**
 * Helper to process annotations and assign missing geo coordinates.
 * Returns early if state is not initialized.
 */
function processAnnotationsForGeoAssignment<T>(
  state: MapLibreState,
  annotations: T[],
  processItem: (item: T) => { modified: T; changed: boolean }
): AssignGeoResult<T> {
  if (!state.map || !state.isInitialized) return { updated: annotations, hasChanges: false };

  let hasChanges = false;
  const updated = annotations.map((ann) => {
    const result = processItem(ann);
    if (result.changed) hasChanges = true;
    return result.modified;
  });

  return { updated, hasChanges };
}

/**
 * Assign missing geo coordinates to annotations based on their model position.
 * This is called when geomap is initialized to ensure all annotations have geo coords.
 *
 * @param state - The MapLibre state
 * @param annotations - Array of annotations to process
 * @returns Object with updated annotations and flag indicating if changes were made
 */
export function assignMissingGeoCoordinatesToAnnotations<T extends GeoCapableAnnotation>(
  state: MapLibreState,
  annotations: T[]
): AssignGeoResult<T> {
  return processAnnotationsForGeoAssignment(state, annotations, (ann) => {
    if (!ann.geoCoordinates) {
      const geoCoords = unprojectToGeoCoords(state, ann.position);
      if (geoCoords) {
        return { modified: { ...ann, geoCoordinates: geoCoords }, changed: true };
      }
    }
    return { modified: ann, changed: false };
  });
}

/**
 * Assign missing geo coordinates to shape annotations, including end positions for lines.
 *
 * @param state - The MapLibre state
 * @param annotations - Array of shape annotations to process
 * @returns Object with updated annotations and flag indicating if changes were made
 */
export function assignMissingGeoCoordinatesToShapeAnnotations<T extends GeoCapableShapeAnnotation>(
  state: MapLibreState,
  annotations: T[]
): AssignGeoResult<T> {
  return processAnnotationsForGeoAssignment(state, annotations, (ann) => {
    let modified = { ...ann };
    let changed = false;

    // Assign geo coords for main position if missing
    if (!modified.geoCoordinates) {
      const geoCoords = unprojectToGeoCoords(state, modified.position);
      if (geoCoords) {
        changed = true;
        modified = { ...modified, geoCoordinates: geoCoords };
      }
    }

    // Assign geo coords for end position if missing (for lines)
    if (modified.endPosition && !modified.endGeoCoordinates) {
      const endGeoCoords = unprojectToGeoCoords(state, modified.endPosition);
      if (endGeoCoords) {
        changed = true;
        modified = { ...modified, endGeoCoordinates: endGeoCoords };
      }
    }

    return { modified, changed };
  });
}

/**
 * Get bounds containing all nodes
 */
function getNodeBounds(cy: Core): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let hasNodes = false;

  cy.nodes().forEach((node) => {
    const lngLat = getNodeLngLat(node);
    if (lngLat) {
      bounds.extend(lngLat);
      hasNodes = true;
    }
  });

  return hasNodes ? bounds : null;
}

/**
 * Update all node positions based on current map projection.
 * Temporarily unlocks nodes to allow position updates (Cytoscape's lock()
 * can prevent programmatic position changes in some cases).
 *
 * NOTE: Nodes that are currently being grabbed (dragged by user) are excluded
 * to prevent snapping them back to their old geo position during drag.
 */
function updateNodePositions(cy: Core, state: MapLibreState): void {
  if (!state.map) return;

  // Collect locked nodes so we can re-lock them after update
  const lockedNodes: NodeCollection = cy.nodes().filter((node) => node.locked());

  // Temporarily unlock all nodes to allow position updates
  if (lockedNodes.length > 0) {
    lockedNodes.unlock();
  }

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      // Skip nodes that are currently being grabbed (user is dragging them)
      // This prevents snapping them back to old geo position during drag
      if (node.grabbed()) return;

      const lngLat = getNodeLngLat(node);
      if (lngLat) {
        const point = state.map!.project(lngLat);
        node.position({ x: point.x, y: point.y });
      }
    });
  });

  // Re-lock the nodes that were previously locked
  if (lockedNodes.length > 0) {
    lockedNodes.lock();
  }
}

/**
 * Store original node sizes for scaling.
 * For font-size, always use the fallback since the stylesheet uses relative units (em)
 * that don't work well with the geo map scaling system.
 */
function setDefaultNumericData(
  target: CytoscapeElement,
  dataKey: string,
  styleKey: string,
  fallback: number
): void {
  if (target.data(dataKey) !== undefined) return;

  // For font-size, always use fallback since stylesheet uses em units
  // that don't translate well to the pixel-based scaling system
  if (styleKey === STYLE_FONT_SIZE) {
    target.data(dataKey, fallback);
    return;
  }

  const styleValue = target.style(styleKey) as string;
  const parsed = parseFloat(styleValue);
  target.data(dataKey, Number.isFinite(parsed) ? parsed : fallback);
}

function cacheNodeOriginalStyles(node: NodeSingular): void {
  setDefaultNumericData(node, "_origWidth", STYLE_WIDTH, 50);
  setDefaultNumericData(node, "_origHeight", STYLE_HEIGHT, 50);
  // Use small value similar to what 0.58em would parse to, since labelFactor multiplies by 8*scaleFactor
  setDefaultNumericData(node, "_origFont", STYLE_FONT_SIZE, 0.5);

  if (node.data("topoViewerRole") === "group") {
    setDefaultNumericData(node, "_origBorderWidth", STYLE_BORDER_WIDTH, 2);
  }
}

function cacheEdgeOriginalStyles(edge: EdgeSingular): void {
  setDefaultNumericData(edge, "_origWidth", STYLE_WIDTH, 2);
  // Use small value similar to what 0.42em would parse to, since labelFactor multiplies by 8*scaleFactor
  setDefaultNumericData(edge, "_origFont", STYLE_FONT_SIZE, 0.4);
  setDefaultNumericData(edge, "_origArrow", STYLE_ARROW_SCALE, 1);
}

function ensureOriginalSizes(cy: Core): void {
  cy.nodes().forEach((n) => {
    cacheNodeOriginalStyles(n);
  });

  cy.edges().forEach((e) => {
    cacheEdgeOriginalStyles(e);
  });
}

/**
 * Calculate scale factor based on current map zoom
 */
export function calculateScale(state: MapLibreState): number {
  if (!state.map) return state.scaleFactor;
  const currentZoom = state.map.getZoom();
  const zoomDiff = currentZoom - state.baseZoom;
  return state.scaleFactor * Math.pow(2, zoomDiff);
}

/**
 * Apply scaling to nodes and edges based on map zoom level
 */
export function applyScale(cy: Core, state: MapLibreState, factor: number): void {
  // Skip if factor hasn't changed enough
  const threshold = 0.01;
  if (state.scaleApplied && Math.abs(factor - state.lastScale) < threshold) return;

  const labelFactor = factor * 8;

  cy.batch(() => {
    cy.nodes().forEach((n) => {
      const origW = n.data("_origWidth") as number | undefined;
      const origH = n.data("_origHeight") as number | undefined;
      const origFont = n.data("_origFont") as number | undefined;

      if (origW !== undefined && origH !== undefined) {
        n.style({
          [STYLE_WIDTH]: Math.max(origW * factor, MIN_NODE_SIZE),
          [STYLE_HEIGHT]: Math.max(origH * factor, MIN_NODE_SIZE),
          [STYLE_FONT_SIZE]: origFont
            ? `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`
            : undefined
        });
      }

      if (n.data("topoViewerRole") === "group") {
        const origBorder = n.data("_origBorderWidth") as number | undefined;
        if (origBorder !== undefined) {
          n.style(STYLE_BORDER_WIDTH, Math.max(origBorder * factor, MIN_BORDER_WIDTH));
        }
      }
    });

    cy.edges().forEach((e) => {
      const origWidth = e.data("_origWidth") as number | undefined;
      const origFont = e.data("_origFont") as number | undefined;
      const origArrow = e.data("_origArrow") as number | undefined;

      if (origWidth !== undefined)
        e.style(STYLE_WIDTH, Math.max(origWidth * factor, MIN_EDGE_WIDTH));
      if (origFont !== undefined)
        e.style(STYLE_FONT_SIZE, `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`);
      if (origArrow !== undefined) e.style(STYLE_ARROW_SCALE, Math.max(origArrow * factor, 0.3));
    });
  });

  state.lastScale = factor;
  state.scaleApplied = true;
}

/**
 * Reset node/edge styles by removing inline styles so stylesheet takes over.
 * This is cleaner than trying to restore values since the original styles
 * may use relative units (em) that don't convert well to pixels.
 */
function resetStyles(cy: Core): void {
  cy.batch(() => {
    cy.nodes().forEach((n) => {
      // Remove inline styles - let stylesheet take over
      n.removeStyle(STYLE_WIDTH);
      n.removeStyle(STYLE_HEIGHT);
      n.removeStyle(STYLE_FONT_SIZE);
      if (n.data("topoViewerRole") === "group") {
        n.removeStyle(STYLE_BORDER_WIDTH);
      }

      // Clean up cached data
      n.removeData("_origWidth");
      n.removeData("_origHeight");
      n.removeData("_origFont");
      n.removeData("_origBorderWidth");
    });

    cy.edges().forEach((e) => {
      // Remove inline styles - let stylesheet take over
      e.removeStyle(STYLE_WIDTH);
      e.removeStyle(STYLE_FONT_SIZE);
      e.removeStyle(STYLE_ARROW_SCALE);

      // Clean up cached data
      e.removeData("_origWidth");
      e.removeData("_origFont");
      e.removeData("_origArrow");
    });
  });
}

/**
 * Update node's geo data after dragging
 */
function updateNodeGeoData(node: NodeSingular, state: MapLibreState): void {
  if (!state.map) return;
  const pos = node.position();
  const lngLat = state.map.unproject([pos.x, pos.y]);
  node.data("lat", lngLat.lat.toFixed(15));
  node.data("lng", lngLat.lng.toFixed(15));
}

function cleanupMapInitializationFailure(
  cy: Core,
  state: MapLibreState,
  container: HTMLElement,
  onMove: () => void,
  onDragFree: (event: EventObject) => void
): void {
  try {
    cy.off("dragfree", onDragFree);
  } catch {
    // ignore
  }

  if (state.map) {
    try {
      state.map.off("move", onMove);
      state.map.remove();
    } catch {
      // ignore
    }
    state.map = null;
  }

  if (state.mapContainer) {
    state.mapContainer.remove();
    state.mapContainer = null;
  }

  container.classList.remove(CLASS_MAPLIBRE_ACTIVE);
  (container as HTMLElement).style.background = "";
  (container as HTMLElement).style.pointerEvents = "";

  cy.nodes().forEach((node) => {
    const origPos = state.originalPositions.get(node.id());
    if (origPos) node.position(origPos);
  });
  state.originalPositions.clear();

  cy.userZoomingEnabled(true);
  cy.userPanningEnabled(true);
  cy.zoom(state.originalZoom);
  cy.pan(state.originalPan);

  showGridOverlay(container);
  state.isInitialized = false;
  state.scaleApplied = false;
}

/**
 * Initialize MapLibre GL map
 */
export async function initializeMapLibre(
  cy: Core,
  state: MapLibreState,
  onMove: () => void,
  onDragFree: (event: EventObject) => void
): Promise<void> {
  log.info("[MapLibre] Initializing geo map");

  const container = cy.container();
  if (!container) {
    log.error("[MapLibre] Missing container");
    return;
  }

  // Store original Cytoscape state
  state.originalZoom = cy.zoom();
  state.originalPan = { ...cy.pan() };

  // Store original positions
  cy.nodes().forEach((node) => {
    state.originalPositions.set(node.id(), { ...node.position() });
  });

  try {
    // Assign lat/lng to nodes that don't have them
    assignMissingLatLng(cy);
    const bounds = getNodeBounds(cy);
    hideGridOverlay(container);

    container.classList.add(CLASS_MAPLIBRE_ACTIVE);
    (container as HTMLElement).style.background = "transparent";

    // Create map container as sibling behind Cytoscape (so pointer-events toggling on Cytoscape doesn't block the map)
    const mapContainer = document.createElement("div");
    mapContainer.id = ID_GEO_MAP_CONTAINER;
    mapContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    `;

    const parent = container.parentElement;
    if (parent) {
      parent.insertBefore(mapContainer, container);
    } else {
      container.insertBefore(mapContainer, container.firstChild);
    }
    state.mapContainer = mapContainer;

    // Disable Cytoscape zoom/pan - let map handle it
    cy.userZoomingEnabled(false);
    cy.userPanningEnabled(false);

    // Create MapLibre map with raster tiles (no API key needed)
    const map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          "carto-voyager": {
            type: "raster",
            tiles: getCartoVoyagerTileUrls(),
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
        },
        layers: [
          {
            id: "carto-voyager-layer",
            type: "raster",
            source: "carto-voyager",
            minzoom: 0,
            maxzoom: 20,
            paint: {
              "raster-fade-duration": 0
            }
          }
        ]
      },
      center: [DEFAULT_LNG, DEFAULT_LAT],
      zoom: DEFAULT_INITIAL_ZOOM,
      ...(bounds
        ? {
            bounds,
            fitBoundsOptions: {
              padding: DEFAULT_FIT_PADDING,
              maxZoom: INITIAL_FIT_MAX_ZOOM,
              animate: false
            }
          }
        : {}),
      attributionControl: false
    });

    state.map = map;

    // Wait for map to load (avoid hanging forever if CSP/network blocks resources)
    const mapLoaded = new Promise<void>((resolve) => {
      // MapLibre's once() returns `this` when callback is provided, not a Promise
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      map.once("load", () => {
        log.info("[MapLibre] Map loaded");
        resolve();
      });
    });
    const loadTimeoutMs = 10_000;
    await Promise.race([
      mapLoaded,
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error("MapLibre load timeout")), loadTimeoutMs);
      })
    ]);

    // Store base zoom for scaling calculations
    state.baseZoom = map.getZoom();

    // Set Cytoscape to unit viewport (zoom=1, pan={0,0})
    cy.zoom(1);
    cy.pan({ x: 0, y: 0 });

    // Store original sizes and apply initial scale
    ensureOriginalSizes(cy);

    // Update positions and apply initial scale
    updateNodePositions(cy, state);
    const factor = calculateScale(state);
    applyScale(cy, state, factor);

    // Map move handler - updates node positions on pan/zoom
    map.on("move", onMove);

    // Setup drag handler for node position updates
    cy.on("dragfree", onDragFree);

    // Mark GeoMap as active on Cytoscape (for external wheel handlers)
    cy.scratch("geoMapActive", true);

    state.isInitialized = true;
    log.info("[MapLibre] Geo map initialization complete");
  } catch (err) {
    log.error(`[MapLibre] Failed to initialize geo map: ${err}`);
    cleanupMapInitializationFailure(cy, state, container, onMove, onDragFree);
  }
}

/**
 * Handle map move event - update node positions and scale
 */
export function handleMapMove(cy: Core, state: MapLibreState): void {
  if (!state.isInitialized || !state.map) return;

  updateNodePositions(cy, state);
  const factor = calculateScale(state);
  applyScale(cy, state, factor);
}

/**
 * Handle node drag - update geo coordinates
 */
export function handleNodeDragFree(node: NodeSingular, state: MapLibreState): void {
  updateNodeGeoData(node, state);
}

// Store wheel handler reference for cleanup
let editModeWheelHandler: ((e: WheelEvent) => void) | null = null;

/**
 * Enable full map interactivity (pan/zoom)
 */
function enableMapNavigation(map: maplibregl.Map): void {
  map.dragPan.enable();
  map.scrollZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
  map.doubleClickZoom.enable();
  map.touchZoomRotate.enable();
}

/**
 * Disable map dragging while keeping zoom controls available
 * In edit mode, users can zoom but not pan the map
 */
function disableMapDrag(map: maplibregl.Map): void {
  map.dragPan.disable();
  // Keep scroll zoom enabled so users can zoom while editing
  map.scrollZoom.enable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.doubleClickZoom.disable();
  // Disable touch zoom/rotate panning but keep pinch zoom
  map.touchZoomRotate.disableRotation();
}

/**
 * Switch to pan mode (map dragging enabled, node dragging disabled)
 */
export function switchToPanMode(cy: Core, state: MapLibreState): void {
  if (!state.map) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = "none";

    // Remove wheel handler from edit mode
    if (editModeWheelHandler) {
      container.removeEventListener("wheel", editModeWheelHandler);
      editModeWheelHandler = null;
    }
  }
  enableMapNavigation(state.map);
  log.info("[MapLibre] Switched to pan mode");
}

/**
 * Switch to edit mode (node dragging enabled, map dragging disabled)
 * Scroll wheel events are forwarded to MapLibre for zooming
 */
export function switchToEditMode(cy: Core, state: MapLibreState): void {
  if (!state.map) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = "";

    // Remove any existing wheel handler
    if (editModeWheelHandler) {
      container.removeEventListener("wheel", editModeWheelHandler);
      editModeWheelHandler = null;
    }

    // Forward wheel events from Cytoscape container to MapLibre for zooming
    editModeWheelHandler = (e: WheelEvent) => {
      if (!state.map) return;
      // Prevent default to avoid any browser zoom
      e.preventDefault();

      // Get the map canvas and forward the wheel event
      const mapCanvas = state.mapContainer?.querySelector("canvas");
      if (mapCanvas) {
        // Create and dispatch a synthetic wheel event to the map
        const syntheticEvent = new WheelEvent("wheel", {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaZ: e.deltaZ,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true
        });
        mapCanvas.dispatchEvent(syntheticEvent);
      }
    };
    container.addEventListener("wheel", editModeWheelHandler, { passive: false });
  }
  disableMapDrag(state.map);
  log.info("[MapLibre] Switched to edit mode");
}

/**
 * Handle geo mode change
 */
export function handleGeoModeChange(
  cy: Core | null,
  state: MapLibreState,
  geoMode: "pan" | "edit"
): void {
  if (!state.isInitialized || !cy) return;

  if (geoMode === "pan") {
    switchToPanMode(cy, state);
  } else {
    switchToEditMode(cy, state);
  }
}

/**
 * Cleanup MapLibre state
 */
export function cleanupMapLibreState(
  cy: Core | null,
  state: MapLibreState,
  onMove: () => void,
  onDragFree: (event: EventObject) => void
): void {
  if (!state.isInitialized || !cy) return;

  log.info("[MapLibre] Cleaning up geo map");

  const container = cy.container();

  // Remove container styling and wheel handler
  if (container) {
    container.classList.remove(CLASS_MAPLIBRE_ACTIVE);
    (container as HTMLElement).style.pointerEvents = "";
    (container as HTMLElement).style.background = "";

    // Remove wheel handler if present
    if (editModeWheelHandler) {
      container.removeEventListener("wheel", editModeWheelHandler);
      editModeWheelHandler = null;
    }
  }

  // Remove Cytoscape event listener
  cy.off("dragfree", onDragFree);

  // Clear GeoMap active marker
  cy.scratch("geoMapActive", false);

  // Remove map event listener and destroy map
  if (state.map) {
    state.map.off("move", onMove);
    state.map.remove();
    state.map = null;
  }

  // Remove map container
  if (state.mapContainer) {
    state.mapContainer.remove();
    state.mapContainer = null;
  }

  // Reset styles
  resetStyles(cy);

  // Restore original positions
  cy.nodes().forEach((node) => {
    const origPos = state.originalPositions.get(node.id());
    if (origPos) {
      node.position(origPos);
    }
  });
  state.originalPositions.clear();

  // Restore Cytoscape zoom/pan
  cy.userZoomingEnabled(true);
  cy.userPanningEnabled(true);
  cy.zoom(state.originalZoom);
  cy.pan(state.originalPan);

  showGridOverlay(container);

  // Fit the view to show all nodes after restoring positions
  cy.fit(undefined, 50);

  state.isInitialized = false;
  state.scaleApplied = false;
}
