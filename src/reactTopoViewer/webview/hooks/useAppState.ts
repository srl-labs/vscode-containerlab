/**
 * App State Hook
 * Manages cytoscape instance and selection data
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Core } from 'cytoscape';

import { CytoscapeCanvasRef } from '../components/canvas/CytoscapeCanvas';
import { log } from '../utils/logger';
import { deleteNode, deleteLink } from '../services';

export type LayoutOption = 'preset' | 'cola' | 'radial' | 'hierarchical' | 'cose' | 'geo';
export const DEFAULT_GRID_LINE_WIDTH = 0.5;

export interface NodeData {
  id: string;
  label?: string;
  name?: string;
  kind?: string;
  state?: string;
  image?: string;
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  fqdn?: string;
  [key: string]: unknown;
}

export interface LinkData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

/**
 * Extract node data from cytoscape instance
 */
function getNodeDataFromCy(cy: Core | null, nodeId: string | null): NodeData | null {
  if (!cy || !nodeId) return null;
  const node = cy.getElementById(nodeId);
  return node.length > 0 ? (node.data() as NodeData) : null;
}

/**
 * Extract link data from cytoscape instance
 */
function getLinkDataFromCy(cy: Core | null, edgeId: string | null): LinkData | null {
  if (!cy || !edgeId) return null;
  const edge = cy.getElementById(edgeId);
  if (edge.length === 0) return null;

  const data = edge.data();
  return {
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint: data.sourceEndpoint || data.sourceInterface,
    targetEndpoint: data.targetEndpoint || data.targetInterface,
    ...data
  } as LinkData;
}

/**
 * Hook for managing cytoscape instance
 */
export function useCytoscapeInstance(elements: unknown[]): {
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>;
  cyInstance: Core | null;
} {
  const cytoscapeRef = useRef<CytoscapeCanvasRef>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const cy = cytoscapeRef.current?.getCy() || null;
      if (cy && cy !== cyInstance) setCyInstance(cy);
    }, 100);
    return () => clearTimeout(timer);
  }, [elements, cyInstance]);

  return { cytoscapeRef, cyInstance };
}

/**
 * Hook for selection data
 * @param refreshTrigger - Optional value that triggers re-fetch when changed (e.g., elements array for stats updates)
 */
export function useSelectionData(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  selectedNode: string | null,
  selectedEdge: string | null,
  refreshTrigger?: unknown
): { selectedNodeData: NodeData | null; selectedLinkData: LinkData | null } {
  const [selectedNodeData, setSelectedNodeData] = useState<NodeData | null>(null);
  const [selectedLinkData, setSelectedLinkData] = useState<LinkData | null>(null);

  useEffect(() => {
    const cy = cytoscapeRef.current?.getCy();
    setSelectedNodeData(getNodeDataFromCy(cy || null, selectedNode));
    setSelectedLinkData(getLinkDataFromCy(cy || null, selectedEdge));
  }, [selectedNode, selectedEdge, cytoscapeRef, refreshTrigger]);

  return { selectedNodeData, selectedLinkData };
}

/**
 * Hook for navbar actions
 */
export function useNavbarActions(cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>): {
  handleZoomToFit: () => void;
  handleToggleLayout: () => void;
} {
  const handleZoomToFit = useCallback(() => cytoscapeRef.current?.fit(), [cytoscapeRef]);
  const handleToggleLayout = useCallback(() => cytoscapeRef.current?.runLayout('cose'), [cytoscapeRef]);
  return { handleZoomToFit, handleToggleLayout };
}

function normalizeLayoutName(option: LayoutOption): string {
  if (option === 'radial') return 'concentric';
  if (option === 'hierarchical') return 'breadthfirst';
  if (option === 'geo') return 'preset';
  return option;
}

const GRID_SPACING = 14;
const GRID_COLOR = 'rgba(204,204,204,0.58)';
const GRID_LINE_WIDTH_MIN = 0.00001;
const GRID_LINE_WIDTH_MAX = 2;
const GRID_LINE_WIDTH_STORAGE_KEY = 'react-topoviewer-grid-line-width';

function clampLineWidth(width: number): number {
  const w = Number(width);
  if (!Number.isFinite(w)) return DEFAULT_GRID_LINE_WIDTH;
  return Math.min(GRID_LINE_WIDTH_MAX, Math.max(GRID_LINE_WIDTH_MIN, w));
}

function getStoredGridLineWidth(): number {
  try {
    const raw = window.localStorage.getItem(GRID_LINE_WIDTH_STORAGE_KEY);
    if (raw) {
      return clampLineWidth(parseFloat(raw));
    }
  } catch {
    /* ignore storage errors */
  }
  return DEFAULT_GRID_LINE_WIDTH;
}

function storeGridLineWidth(width: number): void {
  try {
    window.localStorage.setItem(GRID_LINE_WIDTH_STORAGE_KEY, String(clampLineWidth(width)));
  } catch {
    /* ignore storage errors */
  }
}

type GridOverlayHandle = {
  cleanup: () => void;
  setLineWidth: (width: number) => void;
};

function normalizeContainerPosition(container: HTMLElement): void {
  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
}

function createGridCanvas(container: HTMLElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.classList.add('react-topoviewer-grid-overlay');
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  // Insert as first child so it's below cytoscape-layers in DOM order
  if (container.firstChild) {
    container.insertBefore(canvas, container.firstChild);
  } else {
    container.appendChild(canvas);
  }
  return canvas;
}

function resizeGridCanvas(canvas: HTMLCanvasElement, container: HTMLElement): { width: number; height: number; ratio: number } {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return { width, height, ratio };
}

function drawGridOverlay(
  cy: Core,
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  overlayState: { lineWidth: number }
): void {
  const { width, height, ratio } = resizeGridCanvas(canvas, container);
  if (width === 0 || height === 0) return;

  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const zoom = cy.zoom();
  const spacing = Math.max(1, GRID_SPACING * zoom);
  const pan = cy.pan();
  const offsetX = ((pan.x % spacing) + spacing) % spacing;
  const offsetY = ((pan.y % spacing) + spacing) % spacing;

  ctx.beginPath();
  for (let x = offsetX; x <= width + spacing; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = offsetY; y <= height + spacing; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = overlayState.lineWidth;
  ctx.stroke();
  ctx.restore();
}

function createGridRedraw(drawFn: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      drawFn();
    });
  };
}

function ensureGridOverlay(cy: Core | null, lineWidth: number): GridOverlayHandle | null {
  if (!cy) return null;
  const cyAny = cy as any;
  const existing = cyAny.__reactGridOverlay as GridOverlayHandle | undefined;
  if (existing) {
    existing.setLineWidth(lineWidth);
    return existing;
  }

  const container = cy.container() as HTMLElement | null;
  if (!container) return null;
  normalizeContainerPosition(container);

  const canvas = createGridCanvas(container);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    log.warn('[GridGuide] Unable to acquire grid overlay context');
    return null;
  }

  const overlayState = { lineWidth };
  const draw = () => drawGridOverlay(cy, container, canvas, ctx, overlayState);
  const requestRedraw = createGridRedraw(draw);
  const handleResize = () => requestRedraw();

  cy.on('pan', requestRedraw);
  cy.on('zoom', requestRedraw);
  cy.on('render', requestRedraw);
  cy.on('resize', handleResize);
  window.addEventListener('resize', handleResize, { passive: true });
  requestRedraw();

  const cleanup = () => {
    cy.off('pan', requestRedraw);
    cy.off('zoom', requestRedraw);
    cy.off('render', requestRedraw);
    cy.off('resize', handleResize);
    window.removeEventListener('resize', handleResize);
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
    cyAny.__reactGridOverlay = undefined;
  };

  cy.one('destroy', cleanup);
  const handle: GridOverlayHandle = {
    cleanup,
    setLineWidth: (width: number) => {
      overlayState.lineWidth = clampLineWidth(width);
      requestRedraw();
    }
  };
  cyAny.__reactGridOverlay = handle;
  return handle;
}

function applyGridSettings(cy: Core | null, lineWidth: number, enableSnapping = true): void {
  if (!cy) return;
  const overlayHandle = ensureGridOverlay(cy, lineWidth);
  const cyAny = cy as any;
  if (typeof cyAny.gridGuide !== 'function') {
    log.warn('[GridGuide] gridGuide extension unavailable on Cytoscape instance');
    return;
  }
  try {
    cyAny.gridGuide({
      drawGrid: false,
      gridSpacing: GRID_SPACING,
      gridColor: GRID_COLOR,
      lineWidth,
      snapToGridOnRelease: enableSnapping,
      snapToGridDuringDrag: false,
      snapToAlignmentLocationOnRelease: enableSnapping,
      snapToAlignmentLocationDuringDrag: false,
      snapToGridCenter: enableSnapping,
      panGrid: true,
      zoomDash: true,
      guidelinesStackOrder: 4
    });
    overlayHandle?.setLineWidth(lineWidth);
  } catch (err) {
    log.warn(`[GridGuide] Failed to apply grid settings: ${err}`);
  }
}

export function useLayoutControls(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  cyInstance: Core | null
): {
  layout: LayoutOption;
  setLayout: (layout: LayoutOption) => void;
  geoMode: 'pan' | 'edit';
  setGeoMode: (mode: 'pan' | 'edit') => void;
  isGeoLayout: boolean;
  gridLineWidth: number;
  setGridLineWidth: (width: number) => void;
} {
  const [layout, setLayoutState] = useState<LayoutOption>('preset');
  const [geoMode, setGeoModeState] = useState<'pan' | 'edit'>('pan');
  const [gridLineWidth, setGridLineWidthState] = useState<number>(() => getStoredGridLineWidth());
  const snappingEnabledRef = useRef(false);

  useEffect(() => {
    if (!cyInstance) return;
    // Initially apply grid settings with snapping DISABLED to prevent
    // nodes from snapping to grid on initial load (preset positions should be respected)
    applyGridSettings(cyInstance, gridLineWidth, false);

    // Enable snapping after a short delay to allow preset layout to settle
    const timer = setTimeout(() => {
      applyGridSettings(cyInstance, gridLineWidth, true);
      snappingEnabledRef.current = true;
    }, 300);

    return () => clearTimeout(timer);
  }, [cyInstance, gridLineWidth]);

  const setGridLineWidth = useCallback((width: number) => {
    const clamped = clampLineWidth(width);
    setGridLineWidthState(clamped);
    storeGridLineWidth(clamped);
    applyGridSettings(cyInstance, clamped, snappingEnabledRef.current);
  }, [cyInstance]);

  const setGeoMode = useCallback((mode: 'pan' | 'edit') => {
    setGeoModeState(mode);
    if (layout !== 'geo') return;
    const cy = cytoscapeRef.current?.getCy();
    if (!cy) return;
    cy.autoungrabify(mode === 'pan');
    cy.boxSelectionEnabled(mode === 'edit');
  }, [cytoscapeRef, layout]);

  const setLayout = useCallback((nextLayout: LayoutOption) => {
    setLayoutState(nextLayout);
    const cyApi = cytoscapeRef.current;
    if (!cyApi) return;
    const cy = cyApi.getCy();
    if (!cy) return;
    if (nextLayout === 'geo') {
      cy.fit(undefined, 50);
      cy.autoungrabify(geoMode === 'pan');
      cy.boxSelectionEnabled(geoMode === 'edit');
      return;
    }
    const normalized = normalizeLayoutName(nextLayout);
    cy.autoungrabify(false);
    cy.boxSelectionEnabled(true);
    cyApi.runLayout(normalized);
  }, [cytoscapeRef, geoMode]);

  return {
    layout,
    setLayout,
    geoMode,
    setGeoMode,
    isGeoLayout: layout === 'geo',
    gridLineWidth,
    setGridLineWidth
  };
}

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  editNetwork: (id: string | null) => void;
  removeNodeAndEdges: (id: string) => void;
  removeEdge: (id: string) => void;
}

interface ContextMenuHandlersResult {
  handleEditNode: (nodeId: string) => void;
  handleEditNetwork: (nodeId: string) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleCreateLinkFromNode: (nodeId: string) => void;
  handleEditLink: (edgeId: string) => void;
  handleDeleteLink: (edgeId: string) => void;
  handleShowNodeProperties: (nodeId: string) => void;
  handleShowLinkProperties: (edgeId: string) => void;
  handleCloseNodePanel: () => void;
  handleCloseLinkPanel: () => void;
}

/**
 * Hook for context menu handlers
 */
export function useContextMenuHandlers(
  cytoscapeRef: React.RefObject<CytoscapeCanvasRef | null>,
  callbacks: SelectionCallbacks
): ContextMenuHandlersResult {
  const { selectNode, selectEdge, editNode, editEdge, editNetwork, removeNodeAndEdges, removeEdge } = callbacks;

  const handleEditNode = useCallback((nodeId: string) => {
    editNode(nodeId);
  }, [editNode]);

  const handleEditNetwork = useCallback((nodeId: string) => {
    editNetwork(nodeId);
  }, [editNetwork]);

  const handleCreateLinkFromNode = useCallback((_nodeId: string) => {
    // Link creation is handled by edge handles in cytoscape
  }, []);

  const handleShowNodeProperties = useCallback((nodeId: string) => {
    selectNode(nodeId);
  }, [selectNode]);

  const handleShowLinkProperties = useCallback((edgeId: string) => {
    selectEdge(edgeId);
  }, [selectEdge]);

  const handleEditLink = useCallback((edgeId: string) => {
    editEdge(edgeId);
  }, [editEdge]);
  const handleCloseNodePanel = useCallback(() => selectNode(null), [selectNode]);
  const handleCloseLinkPanel = useCallback(() => selectEdge(null), [selectEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    void deleteNode(nodeId);  // Persist to YAML and annotations
    removeNodeAndEdges(nodeId);
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      cy.getElementById(nodeId).remove();
    }
    selectNode(null);
  }, [selectNode, removeNodeAndEdges, cytoscapeRef]);

  const handleDeleteLink = useCallback((edgeId: string) => {
    const cy = cytoscapeRef.current?.getCy();
    if (cy) {
      const edge = cy.getElementById(edgeId);
      if (edge.length > 0) {
        const edgeData = edge.data();
        void deleteLink({  // Persist to YAML
          id: edgeId,
          source: edgeData.source,
          target: edgeData.target,
          sourceEndpoint: edgeData.sourceEndpoint || '',
          targetEndpoint: edgeData.targetEndpoint || ''
        });
        edge.remove();
      }
    }
    removeEdge(edgeId);
    selectEdge(null);
  }, [selectEdge, removeEdge, cytoscapeRef]);

  return {
    handleEditNode,
    handleEditNetwork,
    handleDeleteNode,
    handleCreateLinkFromNode,
    handleEditLink,
    handleDeleteLink,
    handleShowNodeProperties,
    handleShowLinkProperties,
    handleCloseNodePanel,
    handleCloseLinkPanel
  };
}
