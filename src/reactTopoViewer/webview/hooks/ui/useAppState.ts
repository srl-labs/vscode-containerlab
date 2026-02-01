/**
 * App State Hook
 * Manages layout controls and context menu handlers for React TopoViewer
 */
import type React from "react";
import { useCallback, useState } from "react";

/**
 * Canvas ref interface for layout controls.
 */
export interface CanvasRef {
  runLayout(name: string): void;
}

export type GridStyle = "dotted" | "quadratic";
export type LayoutOption = "preset" | "force" | "geo";
export const DEFAULT_GRID_LINE_WIDTH = 0.5;
export const DEFAULT_GRID_STYLE: GridStyle = "dotted";

/**
 * Node data interface for info panels
 */
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

/**
 * Link data interface for info panels
 */
export interface LinkData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  [key: string]: unknown;
}

function normalizeLayoutName(option: LayoutOption): string {
  if (option === "geo") return "preset";
  return option;
}

const GRID_SPACING = 14;
const GRID_LINE_WIDTH_MIN = 0.00001;
const GRID_LINE_WIDTH_MAX = 2;
const GRID_LINE_WIDTH_STORAGE_KEY = "react-topoviewer-grid-line-width";
const GRID_STYLE_STORAGE_KEY = "react-topoviewer-grid-style";

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

function parseGridStyle(raw: string | null): GridStyle {
  if (raw === "quadratic" || raw === "dotted") return raw;
  return DEFAULT_GRID_STYLE;
}

function getStoredGridStyle(): GridStyle {
  try {
    return parseGridStyle(window.localStorage.getItem(GRID_STYLE_STORAGE_KEY));
  } catch {
    /* ignore storage errors */
  }
  return DEFAULT_GRID_STYLE;
}

function storeGridStyle(style: GridStyle): void {
  try {
    window.localStorage.setItem(GRID_STYLE_STORAGE_KEY, style);
  } catch {
    /* ignore storage errors */
  }
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

export function useLayoutControls(canvasRef: React.RefObject<CanvasRef | null>): {
  layout: LayoutOption;
  setLayout: (layout: LayoutOption) => void;
  isGeoLayout: boolean;
  gridLineWidth: number;
  setGridLineWidth: (width: number) => void;
  gridStyle: GridStyle;
  setGridStyle: (style: GridStyle) => void;
} {
  const [layout, setLayoutState] = useState<LayoutOption>("preset");
  const [gridLineWidth, setGridLineWidthState] = useState<number>(() => getStoredGridLineWidth());
  const [gridStyle, setGridStyleState] = useState<GridStyle>(() => getStoredGridStyle());

  const setGridLineWidth = useCallback((width: number) => {
    const clamped = clampLineWidth(width);
    setGridLineWidthState(clamped);
    storeGridLineWidth(clamped);
    // Grid overlay is now handled by ReactFlow's grid component
  }, []);

  const setGridStyle = useCallback((style: GridStyle) => {
    setGridStyleState(style);
    storeGridStyle(style);
  }, []);

  const setLayout = useCallback(
    (nextLayout: LayoutOption) => {
      setLayoutState(nextLayout);
      const cyApi = canvasRef.current;
      if (!cyApi) return;
      const normalized = normalizeLayoutName(nextLayout);
      cyApi.runLayout(normalized);
    },
    [canvasRef]
  );

  return {
    layout,
    setLayout,
    isGeoLayout: layout === "geo",
    gridLineWidth,
    setGridLineWidth,
    gridStyle,
    setGridStyle
  };
}

interface SelectionCallbacks {
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  editNode: (id: string | null) => void;
  editEdge: (id: string | null) => void;
  editNetwork: (id: string | null) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
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
export function useContextMenuHandlers(callbacks: SelectionCallbacks): ContextMenuHandlersResult {
  const { selectNode, selectEdge, editNode, editEdge, editNetwork, onDeleteNode, onDeleteEdge } =
    callbacks;

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
    // Link creation handled by ReactFlow edge handles
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
      onDeleteNode?.(nodeId);
    },
    [onDeleteNode]
  );

  const handleDeleteLink = useCallback(
    (edgeId: string) => {
      onDeleteEdge?.(edgeId);
    },
    [onDeleteEdge]
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
