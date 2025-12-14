/**
 * MapLibre GL Integration for React TopoViewer
 * Replaces Leaflet with MapLibre GL for smoother, WebGL-powered map rendering
 */
import type { Core } from 'cytoscape';
import { log } from '../../utils/logger';
import maplibregl from 'maplibre-gl';

// Constants
export const CLASS_MAPLIBRE_ACTIVE = 'maplibre-active';
export const ID_GEO_MAP_CONTAINER = 'react-topoviewer-geo-map';
const DEFAULT_LAT = 48.684826888402256;
const DEFAULT_LNG = 9.007895390625677;
const DEFAULT_INITIAL_ZOOM = 4;
const INITIAL_FIT_MAX_ZOOM = 15;
const RETINA_TILE_DPR_THRESHOLD = 1.5;

// Style keys for scaling
const STYLE_FONT_SIZE = 'font-size';
const STYLE_BORDER_WIDTH = 'border-width';
const STYLE_ARROW_SCALE = 'arrow-scale';
const STYLE_WIDTH = 'width';
const STYLE_HEIGHT = 'height';

// Minimum sizes to prevent nodes from becoming too small when zoomed out
const MIN_NODE_SIZE = 20;
const MIN_FONT_SIZE = 8;
const MIN_EDGE_WIDTH = 1;
const MIN_BORDER_WIDTH = 1;

// Default fit padding
const DEFAULT_FIT_PADDING = 50;

function getCartoVoyagerTileUrls(): string[] {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const suffix = dpr >= RETINA_TILE_DPR_THRESHOLD ? '@2x' : '';

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
  cy.nodes().forEach((node: any) => applyLatLngToNode(node, stats));
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
    const lat = parseFloat(node.data('lat'));
    const lng = parseFloat(node.data('lng'));
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

function applyLatLngToNode(node: any, stats: LatLngStats): void {
  let lat = parseFloat(node.data('lat'));
  if (!node.data('lat') || isNaN(lat)) {
    const idx = node.id().length % 5;
    const offset = (idx - 2) * 0.05;
    lat = (stats.useDefaultLat ? DEFAULT_LAT : stats.avgLat) + offset;
  }

  let lng = parseFloat(node.data('lng'));
  if (!node.data('lng') || isNaN(lng)) {
    const idx = (node.id().charCodeAt(0) || 0) % 7;
    const offset = (idx - 3) * 0.05;
    lng = (stats.useDefaultLng ? DEFAULT_LNG : stats.avgLng) + offset;
  }

  node.data('lat', lat.toFixed(15));
  node.data('lng', lng.toFixed(15));
}

/**
 * Hide the grid overlay when geo map is active
 */
export function hideGridOverlay(container: Element | null): void {
  if (!container) return;
  const gridOverlay = container.querySelector('.react-topoviewer-grid-overlay') as HTMLCanvasElement | null;
  if (gridOverlay) {
    gridOverlay.style.display = 'none';
  }
}

/**
 * Show the grid overlay when geo map is deactivated
 */
export function showGridOverlay(container: Element | null): void {
  if (!container) return;
  const gridOverlay = container.querySelector('.react-topoviewer-grid-overlay') as HTMLCanvasElement | null;
  if (gridOverlay) {
    gridOverlay.style.display = 'block';
  }
}

/**
 * Get node's LngLat position
 */
function getNodeLngLat(node: any): maplibregl.LngLat | null {
  const lat = parseFloat(node.data('lat'));
  const lng = parseFloat(node.data('lng'));
  if (isNaN(lat) || isNaN(lng)) return null;
  return new maplibregl.LngLat(lng, lat);
}

/**
 * Get bounds containing all nodes
 */
function getNodeBounds(cy: Core): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  let hasNodes = false;

  cy.nodes().forEach((node: any) => {
    const lngLat = getNodeLngLat(node);
    if (lngLat) {
      bounds.extend(lngLat);
      hasNodes = true;
    }
  });

  return hasNodes ? bounds : null;
}

/**
 * Update all node positions based on current map projection
 */
function updateNodePositions(cy: Core, state: MapLibreState): void {
  if (!state.map) return;

  cy.batch(() => {
    cy.nodes().forEach((node: any) => {
      const lngLat = getNodeLngLat(node);
      if (lngLat) {
        const point = state.map!.project(lngLat);
        node.position({ x: point.x, y: point.y });
      }
    });
  });
}

/**
 * Store original node sizes for scaling
 */
function ensureOriginalSizes(cy: Core): void {
  cy.nodes().forEach((n: any) => {
    if (n.data('_origWidth') === undefined) {
      n.data('_origWidth', parseFloat(n.style(STYLE_WIDTH)) || 50);
    }
    if (n.data('_origHeight') === undefined) {
      n.data('_origHeight', parseFloat(n.style(STYLE_HEIGHT)) || 50);
    }
    if (n.data('_origFont') === undefined) {
      const fs = parseFloat(n.style(STYLE_FONT_SIZE)) || 12;
      n.data('_origFont', fs);
    }
    if (n.data('topoViewerRole') === 'group' && n.data('_origBorderWidth') === undefined) {
      n.data('_origBorderWidth', parseFloat(n.style(STYLE_BORDER_WIDTH)) || 2);
    }
  });

  cy.edges().forEach((e: any) => {
    if (e.data('_origWidth') === undefined) {
      e.data('_origWidth', parseFloat(e.style(STYLE_WIDTH)) || 2);
    }
    if (e.data('_origFont') === undefined) {
      const fs = parseFloat(e.style(STYLE_FONT_SIZE)) || 10;
      e.data('_origFont', fs);
    }
    if (e.data('_origArrow') === undefined) {
      e.data('_origArrow', parseFloat(e.style(STYLE_ARROW_SCALE)) || 1);
    }
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
    cy.nodes().forEach((n: any) => {
      const origW = n.data('_origWidth');
      const origH = n.data('_origHeight');
      const origFont = n.data('_origFont');

      if (origW !== undefined && origH !== undefined) {
        n.style({
          [STYLE_WIDTH]: Math.max(origW * factor, MIN_NODE_SIZE),
          [STYLE_HEIGHT]: Math.max(origH * factor, MIN_NODE_SIZE),
          [STYLE_FONT_SIZE]: origFont ? `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px` : undefined
        });
      }

      if (n.data('topoViewerRole') === 'group') {
        const origBorder = n.data('_origBorderWidth');
        if (origBorder !== undefined) {
          n.style(STYLE_BORDER_WIDTH, Math.max(origBorder * factor, MIN_BORDER_WIDTH));
        }
      }
    });

    cy.edges().forEach((e: any) => {
      const origWidth = e.data('_origWidth');
      const origFont = e.data('_origFont');
      const origArrow = e.data('_origArrow');

      if (origWidth !== undefined) e.style(STYLE_WIDTH, Math.max(origWidth * factor, MIN_EDGE_WIDTH));
      if (origFont !== undefined) e.style(STYLE_FONT_SIZE, `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`);
      if (origArrow !== undefined) e.style(STYLE_ARROW_SCALE, Math.max(origArrow * factor, 0.3));
    });
  });

  state.lastScale = factor;
  state.scaleApplied = true;
}

/**
 * Reset node/edge styles to original values
 */
function resetStyles(cy: Core): void {
  cy.nodes().forEach((n: any) => {
    const w = n.data('_origWidth');
    const h = n.data('_origHeight');
    const fs = n.data('_origFont');
    const bw = n.data('_origBorderWidth');

    if (w !== undefined) n.style(STYLE_WIDTH, w);
    if (h !== undefined) n.style(STYLE_HEIGHT, h);
    if (fs !== undefined && fs !== 0) n.style(STYLE_FONT_SIZE, `${fs}px`);
    if (bw !== undefined && n.data('topoViewerRole') === 'group') {
      n.style(STYLE_BORDER_WIDTH, bw);
    }

    n.removeData('_origWidth');
    n.removeData('_origHeight');
    n.removeData('_origFont');
    n.removeData('_origBorderWidth');
  });

  cy.edges().forEach((e: any) => {
    const w = e.data('_origWidth');
    const fs = e.data('_origFont');
    const ar = e.data('_origArrow');

    if (w !== undefined) e.style(STYLE_WIDTH, w);
    if (fs !== undefined && fs !== 0) e.style(STYLE_FONT_SIZE, `${fs}px`);
    if (ar !== undefined) e.style(STYLE_ARROW_SCALE, ar);

    e.removeData('_origWidth');
    e.removeData('_origFont');
    e.removeData('_origArrow');
  });
}

/**
 * Update node's geo data after dragging
 */
function updateNodeGeoData(node: any, state: MapLibreState): void {
  if (!state.map) return;
  const pos = node.position();
  const lngLat = state.map.unproject([pos.x, pos.y]);
  node.data('lat', lngLat.lat.toFixed(15));
  node.data('lng', lngLat.lng.toFixed(15));
}

/**
 * Initialize MapLibre GL map
 */
export async function initializeMapLibre(
  cy: Core,
  state: MapLibreState,
  onMove: () => void,
  onDragFree: (event: any) => void
): Promise<void> {
  log.info('[MapLibre] Initializing geo map');

  const container = cy.container();
  if (!container) {
    log.error('[MapLibre] Missing container');
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
    (container as HTMLElement).style.background = 'transparent';

    // Create map container as sibling behind Cytoscape (so pointer-events toggling on Cytoscape doesn't block the map)
    const mapContainer = document.createElement('div');
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
          'carto-voyager': {
            type: 'raster',
            tiles: getCartoVoyagerTileUrls(),
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
        },
        layers: [
          {
            id: 'carto-voyager-layer',
            type: 'raster',
            source: 'carto-voyager',
            minzoom: 0,
            maxzoom: 20,
            paint: {
              'raster-fade-duration': 0
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
      map.once('load', () => {
        log.info('[MapLibre] Map loaded');
        resolve();
      });
    });
    const loadTimeoutMs = 10_000;
    await Promise.race([
      mapLoaded,
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error('MapLibre load timeout')), loadTimeoutMs);
      })
    ]);

    // Store base zoom for scaling calculations
    state.baseZoom = map.getZoom();

    // Set Cytoscape to unit viewport (zoom=1, pan={0,0})
    cy.zoom(1);
    cy.pan({ x: 0, y: 0 });

    // Store original sizes and apply initial scale
    ensureOriginalSizes(cy);

    // Update positions and apply scale
    updateNodePositions(cy, state);
    const factor = calculateScale(state);
    applyScale(cy, state, factor);

    // Map move handler - updates node positions on pan/zoom
    map.on('move', onMove);

    // Setup drag handler for node position updates
    cy.on('dragfree', onDragFree);

    state.isInitialized = true;
    log.info('[MapLibre] Geo map initialization complete');
  } catch (err) {
    log.error(`[MapLibre] Failed to initialize geo map: ${err}`);

    // Best-effort cleanup of partially initialized state
    try {
      cy.off('dragfree', onDragFree);
    } catch {
      // ignore
    }

    if (state.map) {
      try {
        state.map.off('move', onMove);
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
    (container as HTMLElement).style.background = '';
    (container as HTMLElement).style.pointerEvents = '';

    // Restore original positions
    cy.nodes().forEach((node) => {
      const origPos = state.originalPositions.get(node.id());
      if (origPos) node.position(origPos);
    });
    state.originalPositions.clear();

    // Restore Cytoscape zoom/pan
    cy.userZoomingEnabled(true);
    cy.userPanningEnabled(true);
    cy.zoom(state.originalZoom);
    cy.pan(state.originalPan);

    showGridOverlay(container);
    state.isInitialized = false;
    state.scaleApplied = false;
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
export function handleNodeDragFree(node: any, state: MapLibreState): void {
  updateNodeGeoData(node, state);
}

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
 */
function disableMapDrag(map: maplibregl.Map): void {
  map.dragPan.disable();
  map.scrollZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  map.doubleClickZoom.disable();
  map.touchZoomRotate.disable();
}

/**
 * Switch to pan mode (map dragging enabled, node dragging disabled)
 */
export function switchToPanMode(cy: Core, state: MapLibreState): void {
  if (!state.map) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = 'none';
  }
  enableMapNavigation(state.map);
  log.info('[MapLibre] Switched to pan mode');
}

/**
 * Switch to edit mode (node dragging enabled, map dragging disabled)
 */
export function switchToEditMode(cy: Core, state: MapLibreState): void {
  if (!state.map) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = '';
  }
  disableMapDrag(state.map);
  log.info('[MapLibre] Switched to edit mode');
}

/**
 * Handle geo mode change
 */
export function handleGeoModeChange(cy: Core | null, state: MapLibreState, geoMode: 'pan' | 'edit'): void {
  if (!state.isInitialized || !cy) return;

  if (geoMode === 'pan') {
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
  onDragFree: (event: any) => void
): void {
  if (!state.isInitialized || !cy) return;

  log.info('[MapLibre] Cleaning up geo map');

  const container = cy.container();

  // Remove container styling
  if (container) {
    container.classList.remove(CLASS_MAPLIBRE_ACTIVE);
    (container as HTMLElement).style.pointerEvents = '';
    (container as HTMLElement).style.background = '';
  }

  // Remove Cytoscape event listener
  cy.off('dragfree', onDragFree);

  // Remove map event listener and destroy map
  if (state.map) {
    state.map.off('move', onMove);
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

  // Run cola layout to reorganize nodes
  cy.layout({
    name: 'cola',
    nodeGap: 5,
    edgeLength: 100,
    animate: true,
    randomize: false,
    maxSimulationTime: 1500
  } as any).run();

  state.isInitialized = false;
  state.scaleApplied = false;
}
