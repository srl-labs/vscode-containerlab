/**
 * App State Hook
 * Manages layout controls and selection data for React TopoViewer
 */
import type React from "react";
import { useRef, useCallback, useState } from "react";

import { deleteNode } from "../services";

/**
 * Canvas ref interface for layout controls.
 */
export interface CanvasRef {
  runLayout(name: string): void;
}

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation
} from "../../shared/types/topology";

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
 * Hook for managing canvas ref (deprecated - use ViewportContext instead)
 * @deprecated This hook is kept for API compatibility only
 */
export function useCytoscapeInstance(): {
  cytoscapeRef: React.RefObject<CanvasRef | null>;
  cyInstance: null;
  onCyReady: () => void;
  onCyDestroyed: () => void;
} {
  const cytoscapeRef = useRef<CanvasRef>(null);
  const onCyReady = useCallback(() => {
    // Disabled during ReactFlow migration
  }, []);
  const onCyDestroyed = useCallback(() => {
    // Disabled during ReactFlow migration
  }, []);
  return { cytoscapeRef, cyInstance: null, onCyReady, onCyDestroyed };
}

/**
 * Hook for selection data (deprecated - use TopoViewerContext instead)
 * @deprecated This hook is kept for API compatibility only
 */
export function useSelectionData(
  _cytoscapeRef: React.RefObject<CanvasRef | null>,
  _selectedNode: string | null,
  _selectedEdge: string | null,
  _refreshTrigger?: unknown
): { selectedNodeData: NodeData | null; selectedLinkData: LinkData | null } {
  // Disabled during ReactFlow migration
  // Selection data should come from TopoViewerContext
  return { selectedNodeData: null, selectedLinkData: null };
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
 * Hook for navbar actions (deprecated - use ViewportContext instead)
 * @deprecated This hook is kept for API compatibility only
 */
export function useNavbarActions(
  cytoscapeRef: React.RefObject<CanvasRef | null>,
  _annotations?: AnnotationData
): {
  handleZoomToFit: () => void;
  handleToggleLayout: () => void;
} {
  // Disabled during ReactFlow migration
  // Use ViewportContext for zoom/fit operations
  const handleZoomToFit = useCallback(() => {
    // Zoom to fit is handled via ViewportContext.rfInstance.fitView()
  }, []);

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

/**
 * Snap a position to the nearest grid cell center.
 * Grid lines are at 0, 14, 28, ... so cell centers are at 7, 21, 35, ...
 * Exported for use by ReactFlow components.
 */
export function snapToGrid(value: number): number {
  const halfSpacing = GRID_SPACING / 2;
  return Math.round((value - halfSpacing) / GRID_SPACING) * GRID_SPACING + halfSpacing;
}

export function useLayoutControls(
  cytoscapeRef: React.RefObject<CanvasRef | null>,
  _cyInstance: null
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

  const setGridLineWidth = useCallback((width: number) => {
    const clamped = clampLineWidth(width);
    setGridLineWidthState(clamped);
    storeGridLineWidth(clamped);
    // Grid overlay is now handled by ReactFlow's grid component
  }, []);

  const setGeoMode = useCallback((mode: "pan" | "edit") => {
    setGeoModeState(mode);
    // Geo mode controls are disabled during ReactFlow migration
    // TODO: Implement geo mode using ReactFlow
  }, []);

  const setLayout = useCallback(
    (nextLayout: LayoutOption) => {
      setLayoutState(nextLayout);
      const cyApi = cytoscapeRef.current;
      if (!cyApi) return;
      if (nextLayout === "geo") {
        // Geo layout disabled during ReactFlow migration
        return;
      }
      const normalized = normalizeLayoutName(nextLayout);
      cyApi.runLayout(normalized);
    },
    [cytoscapeRef]
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
  _cytoscapeRef: React.RefObject<CanvasRef | null>,
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
      void deleteNode(nodeId); // Persist to YAML and annotations
      removeNodeAndEdges(nodeId);
      selectNode(null);
    },
    [selectNode, removeNodeAndEdges]
  );

  const handleDeleteLink = useCallback(
    (edgeId: string) => {
      // Edge data should come from React state, not Cytoscape
      // The deleteLink service will be called by the TopoViewerContext
      removeEdge(edgeId);
      selectEdge(null);
    },
    [selectEdge, removeEdge]
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
