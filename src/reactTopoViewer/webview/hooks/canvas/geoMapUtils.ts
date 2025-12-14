/**
 * Geo Map Utilities for React TopoViewer
 * Helper functions for Leaflet map integration with Cytoscape
 */
import type { Core } from 'cytoscape';
import cytoscape from 'cytoscape';
import { log } from '../../utils/logger';

// Declare Leaflet types
declare global {
  interface Window {
    L: typeof import('leaflet');
  }
}

// Constants
export const CLASS_LEAFLET_ACTIVE = 'leaflet-active';
export const ID_GEO_MAP_CONTAINER = 'react-topoviewer-geo-map';
const DEFAULT_LAT = 48.684826888402256;
const DEFAULT_LNG = 9.007895390625677;

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

export interface GeoMapState {
  isInitialized: boolean;
  leafletMap: any;
  cytoscapeLeaflet: any;
  baseZoom: number;
  scaleFactor: number;
  scaleApplied: boolean;
  lastScale: number;
  isZooming: boolean;
  zoomAnimationFrameId: number | null;
}

export interface UseGeoMapOptions {
  cyInstance: Core | null;
  isGeoLayout: boolean;
  geoMode: 'pan' | 'edit';
}

export interface UseGeoMapReturn {
  isGeoMapActive: boolean;
}

let leafletRegistered = false;

/**
 * Register cytoscape-leaflet extension
 */
export async function ensureLeafletRegistered(): Promise<boolean> {
  if (leafletRegistered) return true;

  try {
    const cytoscapeLeaflet = await import('cytoscape-leaf');
    cytoscape.use(cytoscapeLeaflet.default);
    leafletRegistered = true;
    log.info('[GeoMap] cytoscape-leaflet extension registered');
    return true;
  } catch (err) {
    log.error(`[GeoMap] Failed to load cytoscape-leaflet: ${err}`);
    return false;
  }
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
 * Store original positions before geo mode
 */
export function storeOriginalPositions(cy: Core): void {
  cy.nodes().forEach((node) => {
    node.data('_origPosX', node.position('x'));
    node.data('_origPosY', node.position('y'));
  });
}

/**
 * Restore original positions after geo mode
 */
export function restoreOriginalPositions(cy: Core): void {
  cy.nodes().forEach((node) => {
    const x = node.data('_origPosX');
    const y = node.data('_origPosY');
    if (x !== undefined && y !== undefined) {
      node.position({ x, y });
      node.removeData('_origPosX');
      node.removeData('_origPosY');
    }
  });
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
 * Create or get the geo map container
 */
export function getOrCreateGeoMapContainer(cyContainer: HTMLElement): HTMLElement {
  let container = document.getElementById(ID_GEO_MAP_CONTAINER);
  if (!container) {
    container = document.createElement('div');
    container.id = ID_GEO_MAP_CONTAINER;
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 0;
    `;
    const parent = cyContainer.parentElement;
    if (parent) {
      parent.insertBefore(container, cyContainer);
    }
  }
  container.style.display = 'block';
  return container;
}

/**
 * Hide and remove geo map container
 */
export function hideGeoMapContainer(): void {
  const container = document.getElementById(ID_GEO_MAP_CONTAINER);
  if (container) {
    container.style.display = 'none';
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Ensure numeric data value is stored
 */
function ensureNumericData(ele: any, dataKey: string, styleKey: string, fallback = 0): number {
  let val = ele.data(dataKey);
  if (val !== undefined) return val;
  const parsed = parseFloat(ele.style(styleKey));
  val = isNaN(parsed) ? fallback : parsed;
  ele.data(dataKey, val);
  return val;
}

/**
 * Ensure font size is stored
 */
function ensureFontSize(ele: any, dataKey: string): number {
  let size = ele.data(dataKey);
  if (size !== undefined) return size;

  let fsStr = ele.renderedStyle ? ele.renderedStyle(STYLE_FONT_SIZE) : ele.style(STYLE_FONT_SIZE);
  if (typeof fsStr !== 'string') fsStr = String(fsStr || '');
  let fsNum = parseFloat(fsStr);
  if (isNaN(fsNum)) {
    const raw = ele.style(STYLE_FONT_SIZE);
    const rawNum = parseFloat(raw);
    if (isNaN(rawNum)) {
      fsNum = 12;
    } else if (String(raw).includes('em')) {
      fsNum = rawNum * 16;
    } else {
      fsNum = rawNum;
    }
  }
  ele.data(dataKey, fsNum);
  return fsNum;
}

/**
 * Scale a single node
 */
function scaleNode(n: any, factor: number, labelFactor: number): void {
  const origW = ensureNumericData(n, '_origWidth', STYLE_WIDTH);
  const origH = ensureNumericData(n, '_origHeight', STYLE_HEIGHT);
  const origFont = ensureFontSize(n, '_origFont');

  n.style({
    [STYLE_WIDTH]: Math.max(origW * factor, MIN_NODE_SIZE),
    [STYLE_HEIGHT]: Math.max(origH * factor, MIN_NODE_SIZE),
    [STYLE_FONT_SIZE]: `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`
  });

  if (n.data('topoViewerRole') === 'group') {
    const origBorder = ensureNumericData(n, '_origBorderWidth', STYLE_BORDER_WIDTH);
    n.style(STYLE_BORDER_WIDTH, Math.max(origBorder * factor, MIN_BORDER_WIDTH));
  }
}

/**
 * Scale a single edge
 */
function scaleEdge(e: any, factor: number, labelFactor: number): void {
  const origWidth = ensureNumericData(e, '_origWidth', STYLE_WIDTH);
  const origFont = ensureFontSize(e, '_origFont');
  const origArrow = ensureNumericData(e, '_origArrow', STYLE_ARROW_SCALE);

  if (origWidth) e.style(STYLE_WIDTH, Math.max(origWidth * factor, MIN_EDGE_WIDTH));
  if (origFont) e.style(STYLE_FONT_SIZE, `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`);
  if (origArrow) e.style(STYLE_ARROW_SCALE, Math.max(origArrow * factor, 0.3));
}

/**
 * Reset a single node to original style
 */
function resetNode(n: any): void {
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
}

/**
 * Reset a single edge to original style
 */
function resetEdge(e: any): void {
  const w = e.data('_origWidth');
  const fs = e.data('_origFont');
  const ar = e.data('_origArrow');
  if (w !== undefined) e.style(STYLE_WIDTH, w);
  if (fs !== undefined && fs !== 0) e.style(STYLE_FONT_SIZE, `${fs}px`);
  if (ar !== undefined) e.style(STYLE_ARROW_SCALE, ar);
  e.removeData('_origWidth');
  e.removeData('_origFont');
  e.removeData('_origArrow');
}

/**
 * Apply geo scaling to nodes and edges
 */
export function applyGeoScale(cy: Core, state: GeoMapState, enable: boolean, factor = 4): void {
  const labelFactor = factor * 8;

  if (enable) {
    cy.nodes().forEach((n: any) => scaleNode(n, factor, labelFactor));
    cy.edges().forEach((e: any) => scaleEdge(e, factor, labelFactor));
    state.scaleApplied = true;
    state.lastScale = factor;
  } else if (state.scaleApplied) {
    cy.nodes().forEach((n: any) => resetNode(n));
    cy.edges().forEach((e: any) => resetEdge(e));
    state.scaleApplied = false;
    state.lastScale = 4;
  }
}

/**
 * Fast scale update for smooth zooming - only updates if factor changed significantly
 * Uses batch mode to minimize redraws
 */
export function applyGeoScaleImmediate(cy: Core, state: GeoMapState, factor: number): void {
  // Skip if factor hasn't changed enough (prevents micro-updates)
  const threshold = 0.01;
  if (Math.abs(factor - state.lastScale) < threshold) return;

  const labelFactor = factor * 8;

  // Use batch to minimize redraws
  cy.batch(() => {
    cy.nodes().forEach((n: any) => scaleNodeImmediate(n, factor, labelFactor));
    cy.edges().forEach((e: any) => scaleEdgeImmediate(e, factor, labelFactor));
  });

  state.lastScale = factor;
}

function scaleNodeImmediate(n: any, factor: number, labelFactor: number): void {
  const origW = n.data('_origWidth');
  const origH = n.data('_origHeight');
  const origFont = n.data('_origFont');

  if (origW !== undefined && origH !== undefined) {
    const scaledW = Math.max(origW * factor, MIN_NODE_SIZE);
    const scaledH = Math.max(origH * factor, MIN_NODE_SIZE);
    const scaledFont = origFont ? Math.max(origFont * labelFactor, MIN_FONT_SIZE) : undefined;

    n.style({
      [STYLE_WIDTH]: scaledW,
      [STYLE_HEIGHT]: scaledH,
      [STYLE_FONT_SIZE]: scaledFont ? `${scaledFont}px` : undefined
    });
  }

  if (n.data('topoViewerRole') === 'group') {
    const origBorder = n.data('_origBorderWidth');
    if (origBorder !== undefined) {
      n.style(STYLE_BORDER_WIDTH, Math.max(origBorder * factor, MIN_BORDER_WIDTH));
    }
  }
}

function scaleEdgeImmediate(e: any, factor: number, labelFactor: number): void {
  const origWidth = e.data('_origWidth');
  const origFont = e.data('_origFont');
  const origArrow = e.data('_origArrow');

  if (origWidth !== undefined) e.style(STYLE_WIDTH, Math.max(origWidth * factor, MIN_EDGE_WIDTH));
  if (origFont !== undefined) e.style(STYLE_FONT_SIZE, `${Math.max(origFont * labelFactor, MIN_FONT_SIZE)}px`);
  if (origArrow !== undefined) e.style(STYLE_ARROW_SCALE, Math.max(origArrow * factor, 0.3));
}

/**
 * Calculate geo scale factor based on Leaflet zoom
 */
export function calculateGeoScale(state: GeoMapState): number {
  if (!state.leafletMap) return state.scaleFactor;
  const currentZoom = state.leafletMap.getZoom() || state.baseZoom;
  if (!state.baseZoom) state.baseZoom = currentZoom;
  const zoomDiff = currentZoom - state.baseZoom;
  return state.scaleFactor * Math.pow(2, zoomDiff);
}

/**
 * Update node positions from their geographic coordinates
 * Converts lat/lng to screen coordinates using Leaflet's projection
 */
function updateNodePositionsFromGeo(cy: Core, state: GeoMapState): void {
  if (!state.leafletMap) return;

  cy.batch(() => {
    cy.nodes().forEach((node: any) => {
      const lat = parseFloat(node.data('lat'));
      const lng = parseFloat(node.data('lng'));
      if (!isNaN(lat) && !isNaN(lng)) {
        const point = state.leafletMap.latLngToContainerPoint([lat, lng]);
        node.position({ x: point.x, y: point.y });
      }
    });
  });
}

/**
 * Animation loop that continuously updates node positions during zoom
 * Uses requestAnimationFrame for smooth 60fps updates
 */
function zoomAnimationLoop(cy: any, state: GeoMapState): void {
  if (!state.isZooming || !cy || !state.isInitialized) {
    state.zoomAnimationFrameId = null;
    return;
  }

  // Update positions to match geographic coordinates
  updateNodePositionsFromGeo(cy, state);

  // Update scale (sizes) simultaneously
  const factor = calculateGeoScale(state);
  applyGeoScaleImmediate(cy, state, factor);

  // Continue the animation loop
  state.zoomAnimationFrameId = window.requestAnimationFrame(() => zoomAnimationLoop(cy, state));
}

/**
 * Handle zoom start - begins the animation loop
 * Called on 'zoomstart' event for continuous updates during zoom animation
 */
export function handleZoomStart(cy: any, state: GeoMapState): void {
  if (!cy || !state.isInitialized || !state.leafletMap) return;

  // Start zooming state
  state.isZooming = true;

  // Cancel any existing animation frame
  if (state.zoomAnimationFrameId !== null) {
    window.cancelAnimationFrame(state.zoomAnimationFrameId);
  }

  // Start the animation loop
  state.zoomAnimationFrameId = window.requestAnimationFrame(() => zoomAnimationLoop(cy, state));
}

/**
 * Handle zoom scale update on zoom end
 * Stops the animation loop and ensures final position accuracy
 */
export function handleZoomScaleFinal(cy: any, state: GeoMapState): void {
  if (!cy || !state.isInitialized) return;

  // Stop the animation loop
  state.isZooming = false;
  if (state.zoomAnimationFrameId !== null) {
    window.cancelAnimationFrame(state.zoomAnimationFrameId);
    state.zoomAnimationFrameId = null;
  }

  // Final position sync for accuracy
  updateNodePositionsFromGeo(cy, state);

  // Final style application
  const factor = calculateGeoScale(state);
  applyGeoScaleImmediate(cy, state, factor);
}

/**
 * Create initial geo map state
 */
export function createInitialGeoMapState(): GeoMapState {
  return {
    isInitialized: false,
    leafletMap: null,
    cytoscapeLeaflet: null,
    baseZoom: 1,
    scaleFactor: 4,
    scaleApplied: false,
    lastScale: 4,
    isZooming: false,
    zoomAnimationFrameId: null
  };
}

/**
 * Switch to pan mode (map dragging enabled)
 */
export function switchToPanMode(cy: Core, state: GeoMapState): void {
  if (!state.cytoscapeLeaflet) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = 'none';
  }
  state.cytoscapeLeaflet.map.dragging.enable();
}

/**
 * Switch to edit mode (node dragging enabled)
 */
export function switchToEditMode(cy: Core, state: GeoMapState): void {
  if (!state.cytoscapeLeaflet) return;
  const container = cy.container();
  if (container) {
    (container as HTMLElement).style.pointerEvents = '';
  }
  state.cytoscapeLeaflet.map.dragging.disable();
}

/**
 * Handle geo mode change (pan or edit)
 */
export function handleGeoModeChange(cy: Core | null, state: GeoMapState, geoMode: 'pan' | 'edit'): void {
  if (!state.isInitialized || !cy) return;

  if (geoMode === 'pan') {
    log.info('[GeoMap] Switching to pan mode');
    switchToPanMode(cy, state);
  } else {
    log.info('[GeoMap] Switching to edit mode');
    switchToEditMode(cy, state);
  }
}

/**
 * Cleanup geo map state
 */
export function cleanupGeoMapState(
  cy: Core | null,
  state: GeoMapState,
  handleZoom: () => void,
  handleZoomEnd: () => void
): void {
  if (!state.isInitialized || !cy) return;

  log.info('[GeoMap] Disabling geo map');

  const container = cy.container();
  if (container) {
    container.classList.remove(CLASS_LEAFLET_ACTIVE);
    (container as HTMLElement).style.background = '';
  }

  restoreOriginalPositions(cy);

  // Stop any running animation loop
  state.isZooming = false;
  if (state.zoomAnimationFrameId !== null) {
    window.cancelAnimationFrame(state.zoomAnimationFrameId);
    state.zoomAnimationFrameId = null;
  }

  if (state.leafletMap) {
    state.leafletMap.off('zoomstart', handleZoom);
    state.leafletMap.off('zoomend', handleZoomEnd);
  }

  applyGeoScale(cy, state, false);

  if (state.cytoscapeLeaflet) {
    try {
      state.cytoscapeLeaflet.destroy();
    } catch {
      // Ignore destroy errors
    }
  }

  hideGeoMapContainer();
  showGridOverlay(container);

  cy.layout({
    name: 'cola',
    nodeGap: 5,
    edgeLength: 100,
    animate: true,
    randomize: false,
    maxSimulationTime: 1500
  } as any).run();
}

/**
 * Initialize geo map
 */
export async function initializeGeoMap(
  cy: Core,
  state: GeoMapState,
  handleZoom: () => void,
  handleZoomEnd: () => void
): Promise<void> {
  log.info('[GeoMap] Initializing geo map');

  const registered = await ensureLeafletRegistered();
  if (!registered) {
    log.error('[GeoMap] Failed to register cytoscape-leaflet');
    return;
  }

  const container = cy.container();
  if (!container || !window.L) {
    log.error('[GeoMap] Missing container or Leaflet library');
    return;
  }

  storeOriginalPositions(cy);
  assignMissingLatLng(cy);
  hideGridOverlay(container);

  container.classList.add(CLASS_LEAFLET_ACTIVE);
  (container as HTMLElement).style.background = 'transparent';

  const geoContainer = getOrCreateGeoMapContainer(container as HTMLElement);

  try {
    initCytoscapeLeaflet(cy, state, geoContainer, container);
    setupZoomHandlers(state, handleZoom, handleZoomEnd);
    applyGeoLayout(cy, state);
    log.info('[GeoMap] Geo map initialization complete');
  } catch (err) {
    handleInitError(container, err);
  }
}

function initCytoscapeLeaflet(cy: Core, state: GeoMapState, geoContainer: HTMLElement, container: Element): void {
  const cyAny = cy as any;
  state.cytoscapeLeaflet = cyAny.leaflet({
    container: geoContainer,
    cyContainer: container
  });

  if (state.cytoscapeLeaflet.defaultTileLayer) {
    state.cytoscapeLeaflet.map.removeLayer(state.cytoscapeLeaflet.defaultTileLayer);
  }

  state.leafletMap = state.cytoscapeLeaflet.map;

  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(state.leafletMap);

  overrideGetNodeLatLng(state);

  state.isInitialized = true;
  state.baseZoom = state.leafletMap.getZoom() || 1;
}

function overrideGetNodeLatLng(state: GeoMapState): void {
  const origGetNodeLatLng = state.cytoscapeLeaflet.getNodeLatLng;
  state.cytoscapeLeaflet.getNodeLatLng = (n: any) => {
    const data = n.data();
    if (data.lat === undefined || data.lng === undefined) {
      const pos = n.position();
      return state.leafletMap.containerPointToLatLng({ x: pos.x, y: pos.y });
    }
    return origGetNodeLatLng.call(state.cytoscapeLeaflet, n);
  };
}

function setupZoomHandlers(state: GeoMapState, handleZoomStart: () => void, handleZoomEnd: () => void): void {
  state.leafletMap.on('zoomstart', handleZoomStart);
  state.leafletMap.on('zoomend', handleZoomEnd);
}

function applyGeoLayout(cy: Core, state: GeoMapState): void {
  cy.layout({
    name: 'preset',
    fit: false,
    animate: false,
    positions: (node: any) => {
      const data = node.data();
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        const point = state.leafletMap.latLngToContainerPoint([lat, lng]);
        return { x: point.x, y: point.y };
      }
      return { x: node.position().x, y: node.position().y };
    }
  } as any).run();

  setTimeout(() => {
    if (state.cytoscapeLeaflet?.fit) {
      state.cytoscapeLeaflet.fit();
    }
    const factor = calculateGeoScale(state);
    applyGeoScale(cy, state, true, factor);
  }, 100);
}

function handleInitError(container: Element, err: unknown): void {
  log.error(`[GeoMap] Error initializing: ${err}`);
  container.classList.remove(CLASS_LEAFLET_ACTIVE);
  (container as HTMLElement).style.background = '';
  showGridOverlay(container);
  hideGeoMapContainer();
}
