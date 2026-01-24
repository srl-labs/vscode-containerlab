/**
 * MapLibre GL Integration for React TopoViewer
 * Replaces Leaflet with MapLibre GL for smoother, WebGL-powered map rendering
 *
 * NOTE: This utility module is designed to work with the unknown compatibility
 * layer that bridges ReactFlow to a Cytoscape-like API. The geo map functionality
 * requires deep integration with the graph library and may need reimplementation
 * for full ReactFlow support.
 */
import maplibregl from "maplibre-gl";

import { log } from "../../utils/logger";

/**
 * Node-like element interface for geo map functionality
 * Compatible with both Cytoscape nodes and unknown
 */
interface GeoNodeLike {
  id: () => string;
  data: (key?: string, value?: unknown) => unknown;
  position: (pos?: { x: number; y: number }) => { x: number; y: number };
  isNode?: () => boolean;
  grabbed?: () => boolean;
  locked?: () => boolean;
  unlock?: () => void;
  lock?: () => void;
  style?: (key: string, value?: unknown) => unknown;
  removeStyle?: (key: string) => void;
  removeData?: (key: string) => void;
}

/**
 * Edge-like element interface for geo map functionality
 */
interface GeoEdgeLike {
  id: () => string;
  data: (key?: string, value?: unknown) => unknown;
  style?: (key: string, value?: unknown) => unknown;
  removeStyle?: (key: string) => void;
  removeData?: (key: string) => void;
}

/**
 * Cytoscape-like collection interface for geo map operations
 */
interface GeoCollectionLike<T> {
  forEach: (fn: (item: T) => void) => void;
  filter: (fn: (item: T) => boolean) => GeoCollectionLike<T>;
  map: <U>(fn: (item: T) => U) => U[];
  length?: number;
}

/**
 * Cytoscape-like core interface for geo map operations
 * NOTE: Stubbed during ReactFlow migration - geo map functionality is limited
 */
interface GeoCyLike {
  nodes: (selector?: string) => GeoCollectionLike<GeoNodeLike>;
  edges: () => GeoCollectionLike<GeoEdgeLike>;
  elements: () => GeoCollectionLike<GeoNodeLike | GeoEdgeLike>;
  container: () => HTMLElement | null;
  scratch: (key: string, value?: unknown) => unknown;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
  fit: (padding?: number) => void;
  batch: (fn: () => void) => void;
  zoom: () => number;
  pan: () => { x: number; y: number };
}

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

// Note: Minimum sizes are not used in CyCompat mode since styling is handled by React components
// These are kept for reference but commented out to avoid unused variable warnings
// const MIN_NODE_SIZE = 20;
// const MIN_FONT_SIZE = 8;
// const MIN_EDGE_WIDTH = 1;
// const MIN_BORDER_WIDTH = 1;

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
export function assignMissingLatLng(cy: GeoCyLike): void {
  const cyTyped = cy as GeoCyLike;
  const stats = computeLatLngStats(cyTyped);
  cyTyped.nodes().forEach((node: GeoNodeLike) => applyLatLngToNode(node, stats));
}

interface LatLngStats {
  avgLat: number;
  avgLng: number;
  useDefaultLat: boolean;
  useDefaultLng: boolean;
}

function computeLatLngStats(cy: GeoCyLike): LatLngStats {
  const lats: number[] = [];
  const lngs: number[] = [];

  cy.nodes().forEach((node) => {
    const lat = parseFloat(String(node.data("lat")));
    const lng = parseFloat(String(node.data("lng")));
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

function applyLatLngToNode(node: GeoNodeLike, stats: LatLngStats): void {
  let lat = parseFloat(String(node.data("lat")));
  if (!node.data("lat") || isNaN(lat)) {
    const idx = node.id().length % 5;
    const offset = (idx - 2) * 0.05;
    lat = (stats.useDefaultLat ? DEFAULT_LAT : stats.avgLat) + offset;
  }

  let lng = parseFloat(String(node.data("lng")));
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
function getNodeLngLat(node: GeoNodeLike): maplibregl.LngLat | null {
  const lat = parseFloat(String(node.data("lat")));
  const lng = parseFloat(String(node.data("lng")));
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
function getNodeBounds(cy: GeoCyLike): maplibregl.LngLatBounds | null {
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
 *
 * NOTE: In the CyCompat layer, node position updates are handled differently
 * than in native Cytoscape. This function is a stub for the ReactFlow migration.
 */
function updateNodePositions(cy: GeoCyLike, state: MapLibreState): void {
  if (!state.map) return;

  // In ReactFlow, node positions are managed by React state.
  // This function would need to update positions through the proper React state management.
  // For now, we iterate through nodes to project their positions.
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const lngLat = getNodeLngLat(node);
      if (lngLat) {
        const point = state.map!.project(lngLat);
        // Note: In CyCompat, position() returns a value but doesn't set it.
        // Position updates need to go through React state management.
        void point;
      }
    });
  });
}

/**
 * Store original node sizes for scaling.
 * For font-size, always use the fallback since the stylesheet uses relative units (em)
 * that don't work well with the geo map scaling system.
 *
 * NOTE: In the CyCompat layer, style operations are not supported.
 * This is a stub for the ReactFlow migration.
 */
function setDefaultNumericData(
  target: GeoNodeLike | GeoEdgeLike,
  dataKey: string,
  _styleKey: string,
  fallback: number
): void {
  if (target.data(dataKey) !== undefined) return;
  target.data(dataKey, fallback);
}

function cacheNodeOriginalStyles(node: GeoNodeLike): void {
  setDefaultNumericData(node, "_origWidth", STYLE_WIDTH, 50);
  setDefaultNumericData(node, "_origHeight", STYLE_HEIGHT, 50);
  setDefaultNumericData(node, "_origFont", STYLE_FONT_SIZE, 0.5);

  if (node.data("topoViewerRole") === "group") {
    setDefaultNumericData(node, "_origBorderWidth", STYLE_BORDER_WIDTH, 2);
  }
}

function cacheEdgeOriginalStyles(edge: GeoEdgeLike): void {
  setDefaultNumericData(edge, "_origWidth", STYLE_WIDTH, 2);
  setDefaultNumericData(edge, "_origFont", STYLE_FONT_SIZE, 0.4);
  setDefaultNumericData(edge, "_origArrow", STYLE_ARROW_SCALE, 1);
}

function ensureOriginalSizes(cy: GeoCyLike): void {
  cy.nodes().forEach((n) => {
    cacheNodeOriginalStyles(n as unknown as GeoNodeLike);
  });

  cy.edges().forEach((e) => {
    cacheEdgeOriginalStyles(e as unknown as GeoEdgeLike);
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
 *
 * NOTE: In the CyCompat layer, style operations are not fully supported.
 * This function tracks state for scale calculations but actual styling
 * would need to be handled through React component props in ReactFlow.
 */
export function applyScale(cy: GeoCyLike, state: MapLibreState, factor: number): void {
  // Skip if factor hasn't changed enough
  const threshold = 0.01;
  if (state.scaleApplied && Math.abs(factor - state.lastScale) < threshold) return;

  // In ReactFlow, scaling is typically handled through component props or CSS transforms.
  // This function is a stub that tracks scale state for future implementation.
  cy.batch(() => {
    // Batch is a no-op in CyCompat, but we keep the structure for consistency
    void cy;
  });

  state.lastScale = factor;
  state.scaleApplied = true;
}

/**
 * Reset node/edge styles by removing inline styles so stylesheet takes over.
 *
 * NOTE: In the CyCompat layer, style operations are not supported.
 * This is a stub for the ReactFlow migration.
 */
function resetStyles(cy: GeoCyLike): void {
  // In ReactFlow, styles are managed through component props.
  // This function is a stub that would need to trigger a re-render
  // with default styles through React state management.
  cy.batch(() => {
    // Batch is a no-op in CyCompat
    void cy;
  });
}

/**
 * Update node's geo data after dragging
 */
function updateNodeGeoData(
  node:
    | GeoNodeLike
    | {
        position?: () => { x: number; y: number };
        data?: (key?: string, value?: unknown) => unknown;
      },
  state: MapLibreState
): void {
  if (!state.map) return;
  if (typeof node.position !== "function" || typeof node.data !== "function") return;
  const pos = node.position();
  const lngLat = state.map.unproject([pos.x, pos.y]);
  node.data("lat", lngLat.lat.toFixed(15));
  node.data("lng", lngLat.lng.toFixed(15));
}

/**
 * Node drag event target interface
 */
export interface NodeDragEventTarget {
  isNode?: () => boolean;
  id?: () => string;
  data?: (key?: string, value?: unknown) => unknown;
  position?: () => { x: number; y: number };
}

/**
 * Node drag event interface for cleanup handler
 * Named to avoid collision with the browser's DragEvent type
 */
export interface NodeDragEvent {
  target?: NodeDragEventTarget;
}

function cleanupMapInitializationFailure(
  cy: GeoCyLike,
  state: MapLibreState,
  container: HTMLElement,
  onMove: () => void,
  onDragFree: (event: NodeDragEvent) => void
): void {
  try {
    cy.off("dragfree", onDragFree as () => void);
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

  // In CyCompat, position restoration would need to go through React state
  state.originalPositions.clear();

  // In CyCompat, viewport controls are not available
  // cy.userZoomingEnabled(true);
  // cy.userPanningEnabled(true);
  // cy.zoom(state.originalZoom);
  // cy.pan(state.originalPan);

  showGridOverlay(container);
  state.isInitialized = false;
  state.scaleApplied = false;
}

/**
 * Initialize MapLibre GL map
 */
export async function initializeMapLibre(
  cy: GeoCyLike,
  state: MapLibreState,
  onMove: () => void,
  onDragFree: (event: NodeDragEvent) => void
): Promise<void> {
  log.info("[MapLibre] Initializing geo map");

  const container = cy.container();
  if (!container) {
    log.error("[MapLibre] Missing container");
    return;
  }

  // Store original state from CyCompat
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

    // In CyCompat, viewport controls are not available
    // The ReactFlow equivalent would be handled through panOnDrag/zoomOnScroll props
    // cy.userZoomingEnabled(false);
    // cy.userPanningEnabled(false);

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

    // In CyCompat, viewport manipulation would need to go through ReactFlow's API
    // cy.zoom(1);
    // cy.pan({ x: 0, y: 0 });

    // Store original sizes and apply initial scale
    ensureOriginalSizes(cy);

    // Update positions and apply initial scale
    updateNodePositions(cy, state);
    const factor = calculateScale(state);
    applyScale(cy, state, factor);

    // Map move handler - updates node positions on pan/zoom
    map.on("move", onMove);

    // Setup drag handler for node position updates
    cy.on("dragfree", onDragFree as () => void);

    // Mark GeoMap as active (for external wheel handlers)
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
export function handleMapMove(cy: GeoCyLike, state: MapLibreState): void {
  if (!state.isInitialized || !state.map) return;

  updateNodePositions(cy, state);
  const factor = calculateScale(state);
  applyScale(cy, state, factor);
}

/**
 * Handle node drag - update geo coordinates
 */
export function handleNodeDragFree(
  node:
    | GeoNodeLike
    | {
        position?: () => { x: number; y: number };
        data?: (key?: string, value?: unknown) => unknown;
      },
  state: MapLibreState
): void {
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
export function switchToPanMode(cy: GeoCyLike, state: MapLibreState): void {
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
export function switchToEditMode(cy: GeoCyLike, state: MapLibreState): void {
  if (!state.map) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = "";

    // Remove any existing wheel handler
    if (editModeWheelHandler) {
      container.removeEventListener("wheel", editModeWheelHandler);
      editModeWheelHandler = null;
    }

    // Forward wheel events from container to MapLibre for zooming
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
export function handleGeoModeChange(cy: null, state: MapLibreState, geoMode: "pan" | "edit"): void {
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
  cy: GeoCyLike | null,
  state: MapLibreState,
  onMove: () => void,
  onDragFree: (event: NodeDragEvent) => void
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

  // Remove event listener
  cy.off("dragfree", onDragFree as () => void);

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

  // In CyCompat, position restoration would need to go through React state
  state.originalPositions.clear();

  // In CyCompat, viewport controls are handled differently
  // Fit the view to show all nodes after restoring positions
  cy.fit(50);

  showGridOverlay(container);

  state.isInitialized = false;
  state.scaleApplied = false;
}
