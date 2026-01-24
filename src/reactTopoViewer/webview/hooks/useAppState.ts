/**
 * App State Hook
 * Manages cytoscape instance and selection data
 */
import type React from "react";
import { useRef, useCallback, useEffect, useState } from "react";

import { log } from "../utils/logger";
import { deleteNode, deleteLink } from "../services";

// Re-export CyLike types from shared location to avoid circular dependencies
export type { CyLike, CyLikeElement, CyLikeCollection } from "./shared/cyCompatTypes";
import type { CyLike } from "./shared/cyCompatTypes";

/**
 * Canvas ref interface for layout controls and selection.
 * Compatible with both CytoscapeCanvas and ReactFlowCanvas refs.
 */
export interface CanvasRef {
  getCy(): CyLike | null;
  runLayout(name: string): void;
}

/** Edge data interface for link operations */
interface EdgeData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";
import { fitViewportToAll } from "../utils/fitViewport";

/**
 * Grid overlay handle interface for managing custom grid canvas
 */
interface GridOverlayHandleType {
  cleanup: () => void;
  setLineWidth: (width: number) => void;
}

/**
 * Augmented CyLike with grid overlay property
 * Note: This is a type extension for the compatibility layer
 */
interface CyLikeWithGrid extends CyLike {
  __reactGridOverlay?: GridOverlayHandleType;
}

export type LayoutOption = "preset" | "cola" | "radial" | "hierarchical" | "cose" | "geo";
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
function getNodeDataFromCy(cy: CyLike | null, nodeId: string | null): NodeData | null {
  if (!cy || !nodeId) return null;
  const node = cy.getElementById(nodeId);
  return node.length > 0 ? (node.data() as NodeData) : null;
}

/**
 * Extract link data from cytoscape instance
 */
function getLinkDataFromCy(cy: CyLike | null, edgeId: string | null): LinkData | null {
  if (!cy || !edgeId) return null;
  const edge = cy.getElementById(edgeId);
  if (edge.length === 0) return null;

  const data = edge.data() as EdgeData;
  return {
    ...data,
    id: data.id,
    source: data.source,
    target: data.target,
    sourceEndpoint:
      data.sourceEndpoint ||
      ((data as Record<string, unknown>).sourceInterface as string | undefined),
    targetEndpoint:
      data.targetEndpoint ||
      ((data as Record<string, unknown>).targetInterface as string | undefined)
  } as LinkData;
}

/**
 * Hook for managing cytoscape-compatible instance
 */
export function useCytoscapeInstance(): {
  cytoscapeRef: React.RefObject<CanvasRef | null>;
  cyInstance: CyLike | null;
  onCyReady: (cy: CyLike) => void;
  onCyDestroyed: () => void;
} {
  const cytoscapeRef = useRef<CanvasRef>(null);
  const [cyInstance, setCyInstance] = useState<CyLike | null>(null);

  const onCyReady = useCallback((cy: CyLike) => {
    setCyInstance(cy);
  }, []);

  const onCyDestroyed = useCallback(() => {
    setCyInstance(null);
  }, []);

  return { cytoscapeRef, cyInstance, onCyReady, onCyDestroyed };
}

/**
 * Hook for selection data
 * @param refreshTrigger - Optional value that triggers re-fetch when changed (e.g., elements array for stats updates)
 */
export function useSelectionData(
  cytoscapeRef: React.RefObject<CanvasRef | null>,
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
 * Annotation data for fit-to-viewport calculations
 */
export interface AnnotationData {
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
  groups: GroupStyleAnnotation[];
}

/**
 * Hook for navbar actions
 */
export function useNavbarActions(
  cytoscapeRef: React.RefObject<CanvasRef | null>,
  annotations?: AnnotationData
): {
  handleZoomToFit: () => void;
  handleToggleLayout: () => void;
} {
  const handleZoomToFit = useCallback(() => {
    const cy = cytoscapeRef.current?.getCy();
    if (!cy) return;

    // Skip if GeoMap is active - GeoMap requires cy.zoom()=1 and cy.pan()={0,0}
    if (cy.scratch("geoMapActive") === true) return;

    // Use custom fit that includes annotations
    if (annotations) {
      fitViewportToAll(
        cy,
        annotations.textAnnotations,
        annotations.shapeAnnotations,
        annotations.groups
      );
    } else {
      // Fallback to native fit if no annotations provided
      cy.fit(undefined, 50);
    }
  }, [cytoscapeRef, annotations]);

  const handleToggleLayout = useCallback(
    () => cytoscapeRef.current?.runLayout("cose"),
    [cytoscapeRef]
  );
  return { handleZoomToFit, handleToggleLayout };
}

function normalizeLayoutName(option: LayoutOption): string {
  if (option === "radial") return "concentric";
  if (option === "hierarchical") return "breadthfirst";
  if (option === "geo") return "preset";
  return option;
}

const GRID_SPACING = 14;
const GRID_COLOR = "rgba(204,204,204,0.58)";
const GRID_LINE_WIDTH_MIN = 0.00001;
const GRID_LINE_WIDTH_MAX = 2;
const GRID_LINE_WIDTH_STORAGE_KEY = "react-topoviewer-grid-line-width";

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
  if (window.getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
}

function createGridCanvas(container: HTMLElement): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.classList.add("react-topoviewer-grid-overlay");
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "0";
  // Insert as first child so it's below cytoscape-layers in DOM order
  if (container.firstChild) {
    container.insertBefore(canvas, container.firstChild);
  } else {
    container.appendChild(canvas);
  }
  return canvas;
}

function resizeGridCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLElement
): { width: number; height: number; ratio: number } {
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
  cy: CyLike,
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

function ensureGridOverlay(cy: CyLike | null, lineWidth: number): GridOverlayHandle | null {
  if (!cy) return null;
  const cyWithGrid = cy as CyLikeWithGrid;
  const existing = cyWithGrid.__reactGridOverlay;
  if (existing) {
    existing.setLineWidth(lineWidth);
    return existing;
  }

  const container = cy.container() as HTMLElement | null;
  if (!container) return null;
  normalizeContainerPosition(container);

  const canvas = createGridCanvas(container);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    log.warn("[GridGuide] Unable to acquire grid overlay context");
    return null;
  }

  const overlayState = { lineWidth };
  const draw = () => drawGridOverlay(cy, container, canvas, ctx, overlayState);
  const requestRedraw = createGridRedraw(draw);
  const handleResize = () => requestRedraw();

  cy.on("pan", requestRedraw);
  cy.on("zoom", requestRedraw);
  cy.on("render", requestRedraw);
  cy.on("resize", handleResize);
  window.addEventListener("resize", handleResize, { passive: true });
  requestRedraw();

  const cleanup = () => {
    cy.off("pan", requestRedraw);
    cy.off("zoom", requestRedraw);
    cy.off("render", requestRedraw);
    cy.off("resize", handleResize);
    window.removeEventListener("resize", handleResize);
    if (canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
    cyWithGrid.__reactGridOverlay = undefined;
  };

  cy.one("destroy", cleanup);
  const handle: GridOverlayHandle = {
    cleanup,
    setLineWidth: (width: number) => {
      overlayState.lineWidth = clampLineWidth(width);
      requestRedraw();
    }
  };
  cyWithGrid.__reactGridOverlay = handle;
  return handle;
}

/**
 * Apply grid settings - sets up the custom grid overlay
 */
function applyGridSettings(cy: CyLike | null, lineWidth: number): void {
  if (!cy) return;
  ensureGridOverlay(cy, lineWidth);
}

/**
 * Snap a position to the nearest grid cell center.
 * Grid lines are at 0, 14, 28, ... so cell centers are at 7, 21, 35, ...
 * Exported for use by ReactFlow components.
 */
export function snapToGrid(value: number): number {
  const halfSpacing = GRID_SPACING / 2;
  return Math.round((value - halfSpacing) / GRID_SPACING) * GRID_SPACING + halfSpacing;
}

// Note: CyCompatNodeSingular was used for per-node snapping but is
// now handled through React state during the ReactFlow migration.

/**
 * Setup per-node snapping that ONLY affects the individual node being dragged.
 * This is called once when cytoscape instance is available.
 * NOTE: Disabled during ReactFlow migration - snapping handled via React state
 */
function setupPerNodeSnapping(_cy: CyLike | null): () => void {
  // Disabled during ReactFlow migration
  return () => {};
}

export function useLayoutControls(
  cytoscapeRef: React.RefObject<CanvasRef | null>,
  cyInstance: CyLike | null
): {
  layout: LayoutOption;
  setLayout: (layout: LayoutOption) => void;
  geoMode: "pan" | "edit";
  setGeoMode: (mode: "pan" | "edit") => void;
  isGeoLayout: boolean;
  gridLineWidth: number;
  setGridLineWidth: (width: number) => void;
} {
  const [layout, setLayoutState] = useState<LayoutOption>("preset");
  const [geoMode, setGeoModeState] = useState<"pan" | "edit">("pan");
  const [gridLineWidth, setGridLineWidthState] = useState<number>(() => getStoredGridLineWidth());

  useEffect(() => {
    if (!cyInstance) return;
    // Apply grid overlay settings
    applyGridSettings(cyInstance, gridLineWidth);
    // Setup per-node snapping (only affects the dragged node on release)
    return setupPerNodeSnapping(cyInstance);
  }, [cyInstance, gridLineWidth]);

  const setGridLineWidth = useCallback(
    (width: number) => {
      const clamped = clampLineWidth(width);
      setGridLineWidthState(clamped);
      storeGridLineWidth(clamped);
      applyGridSettings(cyInstance, clamped);
    },
    [cyInstance]
  );

  const setGeoMode = useCallback(
    (mode: "pan" | "edit") => {
      setGeoModeState(mode);
      if (layout !== "geo") return;
      const cy = cytoscapeRef.current?.getCy();
      if (!cy) return;
      cy.autoungrabify(mode === "pan");
      cy.boxSelectionEnabled(mode === "edit");
    },
    [cytoscapeRef, layout]
  );

  const setLayout = useCallback(
    (nextLayout: LayoutOption) => {
      setLayoutState(nextLayout);
      const cyApi = cytoscapeRef.current;
      if (!cyApi) return;
      const cy = cyApi.getCy();
      if (!cy) return;
      if (nextLayout === "geo") {
        cy.fit(undefined, 50);
        cy.autoungrabify(geoMode === "pan");
        cy.boxSelectionEnabled(geoMode === "edit");
        return;
      }
      const normalized = normalizeLayoutName(nextLayout);
      cy.autoungrabify(false);
      cy.boxSelectionEnabled(true);
      cyApi.runLayout(normalized);
    },
    [cytoscapeRef, geoMode]
  );

  return {
    layout,
    setLayout,
    geoMode,
    setGeoMode,
    isGeoLayout: layout === "geo",
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
  cytoscapeRef: React.RefObject<CanvasRef | null>,
  callbacks: SelectionCallbacks
): ContextMenuHandlersResult {
  const {
    selectNode,
    selectEdge,
    editNode,
    editEdge,
    editNetwork,
    removeNodeAndEdges,
    removeEdge
  } = callbacks;

  const handleEditNode = useCallback(
    (nodeId: string) => {
      editNode(nodeId);
    },
    [editNode]
  );

  const handleEditNetwork = useCallback(
    (nodeId: string) => {
      editNetwork(nodeId);
    },
    [editNetwork]
  );

  const handleCreateLinkFromNode = useCallback((_nodeId: string) => {
    // Link creation is handled by edge handles in cytoscape
  }, []);

  const handleShowNodeProperties = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode]
  );

  const handleShowLinkProperties = useCallback(
    (edgeId: string) => {
      selectEdge(edgeId);
    },
    [selectEdge]
  );

  const handleEditLink = useCallback(
    (edgeId: string) => {
      editEdge(edgeId);
    },
    [editEdge]
  );
  const handleCloseNodePanel = useCallback(() => selectNode(null), [selectNode]);
  const handleCloseLinkPanel = useCallback(() => selectEdge(null), [selectEdge]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      void deleteNode(nodeId); // Persist to YAML and annotations
      removeNodeAndEdges(nodeId);
      selectNode(null);
    },
    [selectNode, removeNodeAndEdges]
  );

  const handleDeleteLink = useCallback(
    (edgeId: string) => {
      const cy = cytoscapeRef.current?.getCy();
      if (cy) {
        const edge = cy.getElementById(edgeId);
        if (edge.length > 0) {
          const edgeData = edge.data() as EdgeData;
          void deleteLink({
            // Persist to YAML
            id: edgeId,
            source: edgeData.source,
            target: edgeData.target,
            sourceEndpoint: edgeData.sourceEndpoint || "",
            targetEndpoint: edgeData.targetEndpoint || ""
          });
        }
      }
      removeEdge(edgeId);
      selectEdge(null);
    },
    [selectEdge, removeEdge, cytoscapeRef]
  );

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
