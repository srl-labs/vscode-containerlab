// Types for React Flow canvas components.
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";

import type {
  NetworkNodeData,
  FreeShapeNodeData,
  FreeTextNodeData,
  TrafficRateNodeData,
  GroupNodeData,
  RFNodeData,
  RFNodeType,
  TopoEdge,
  TopoNode,
  TopologyEdgeData,
  TopologyNodeData,
  TopologyRFNode,
  NetworkRFNode,
  FreeTextRFNode,
  FreeShapeRFNode,
  TrafficRateRFNode,
  GroupRFNode
} from "../../../shared/types/graph";
import { DEFAULT_ICON_COLOR, ROLE_SVG_MAP } from "../../../shared/types/graph";
import { vscodePalette } from "../../theme/vscodeTheme";
export type GridStyle = "dotted" | "quadratic";

/** Edge label rendering mode */
export type EdgeLabelMode = "show-all" | "on-select" | "hide" | "grafana";

export type {
  TopologyNodeData,
  NetworkNodeData,
  FreeTextNodeData,
  FreeShapeNodeData,
  TrafficRateNodeData,
  GroupNodeData,
  TopologyEdgeData,
  RFNodeData,
  RFNodeType,
  TopologyRFNode,
  NetworkRFNode,
  FreeTextRFNode,
  FreeShapeRFNode,
  TrafficRateRFNode,
  GroupRFNode
};

export type TopologyRFEdge = TopoEdge;

/**
 * Ref interface for ReactFlowCanvas component
 */
export interface ReactFlowCanvasRef {
  fit: () => void;
  runLayout: (layoutName: string) => void;
  getReactFlowInstance: () => ReactFlowInstance | null;
  /** Get current nodes (for undo/redo) */
  getNodes: () => Node[];
  /** Get current edges (for undo/redo) */
  getEdges: () => Edge[];
  /** Update node positions (for undo/redo) */
  setNodePositions: (positions: MovePositionEntry[]) => void;
  /** Update nodes state (for undo/redo graph operations) */
  updateNodes: (updater: (nodes: Node[]) => Node[]) => void;
  /** Update edges state (for undo/redo graph operations) */
  updateEdges: (updater: (edges: Edge[]) => Edge[]) => void;
}

export type CanvasDropData = {
  type: "node" | "network" | "annotation";
  templateName?: string;
  networkType?: string;
  annotationType?: "text" | "shape" | "group" | "traffic-rate";
  shapeType?: string;
};

export type CanvasDropHandlers = {
  onDropCreateNode?: (position: { x: number; y: number }, templateName: string) => void;
  onDropCreateNetwork?: (position: { x: number; y: number }, networkType: string) => void;
  onAddTextAtPosition?: (position: { x: number; y: number }) => void;
  onAddShapeAtPosition?: (position: { x: number; y: number }, shapeType?: string) => void;
  onAddGroupAtPosition?: (position: { x: number; y: number }) => void;
  onAddTrafficRateAtPosition?: (position: { x: number; y: number }) => void;
};

/**
 * Annotation add mode state passed from App
 */
export interface AnnotationModeState {
  isAddTextMode: boolean;
  isAddShapeMode: boolean;
  pendingShapeType?: "rectangle" | "circle" | "line";
}

/**
 * Annotation handlers passed from App
 */
export interface AnnotationHandlers {
  /** Handle pane click when in add text mode */
  onAddTextClick: (position: { x: number; y: number }) => void;
  /** Handle pane click when in add shape mode */
  onAddShapeClick: (position: { x: number; y: number }) => void;
  /** Edit a free text annotation */
  onEditFreeText: (id: string) => void;
  /** Edit a free shape annotation */
  onEditFreeShape: (id: string) => void;
  /** Delete a free text annotation */
  onDeleteFreeText: (id: string) => void;
  /** Delete a free shape annotation */
  onDeleteFreeShape: (id: string) => void;
  /** Update free text size after resize */
  onUpdateFreeTextSize: (id: string, width: number, height: number) => void;
  /** Update free shape size after resize */
  onUpdateFreeShapeSize: (id: string, width: number, height: number) => void;
  /** Update traffic-rate size after resize */
  onUpdateTrafficRateSize?: (id: string, width: number, height: number) => void;
  /** Update free text rotation during rotate (live updates) */
  onUpdateFreeTextRotation: (id: string, rotation: number) => void;
  /** Update free shape rotation during rotate (live updates) */
  onUpdateFreeShapeRotation: (id: string, rotation: number) => void;
  /** Called when free text rotation starts (for undo/redo snapshot) */
  onFreeTextRotationStart?: (id: string) => void;
  /** Called when free text rotation ends (for undo/redo commit) */
  onFreeTextRotationEnd?: (id: string) => void;
  /** Called when free shape rotation starts (for undo/redo snapshot) */
  onFreeShapeRotationStart?: (id: string) => void;
  /** Called when free shape rotation ends (for undo/redo commit) */
  onFreeShapeRotationEnd?: (id: string) => void;
  /** Update line end position after resize */
  onUpdateFreeShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  /** Update line start position after resize */
  onUpdateFreeShapeStartPosition: (id: string, startPosition: { x: number; y: number }) => void;
  /** Persist annotations to file (call on drag end) */
  onPersistAnnotations?: () => void;
  /** Disable add text mode (e.g., on Escape) */
  disableAddTextMode: () => void;
  /** Disable add shape mode (e.g., on Escape) */
  disableAddShapeMode: () => void;
  /** Handle node dropped - check for group membership changes */
  onNodeDropped?: (nodeId: string, position: { x: number; y: number }) => void;
  /** Update group size after resize */
  onUpdateGroupSize?: (id: string, width: number, height: number) => void;
  /** Edit a group annotation */
  onEditGroup?: (id: string) => void;
  /** Delete a group annotation */
  onDeleteGroup?: (id: string) => void;
  /** Edit a traffic-rate annotation */
  onEditTrafficRate?: (id: string) => void;
  /** Delete a traffic-rate annotation */
  onDeleteTrafficRate?: (id: string) => void;
  /** Get members of a group (for group dragging) */
  getGroupMembers?: (groupId: string, options?: { includeNested?: boolean }) => string[];
}

/** Position entry for undo/redo move tracking */
export interface MovePositionEntry {
  id: string;
  position: { x: number; y: number };
}

/**
 * Props for ReactFlowCanvas component
 */
export interface ReactFlowCanvasProps {
  /** ReactFlow nodes (includes both topology and annotation nodes) */
  nodes?: TopoNode[];
  /** ReactFlow edges */
  edges?: TopoEdge[];
  /** Whether the left ContextPanel (palette) is currently open */
  isContextPanelOpen?: boolean;
  /** Current layout (used for geo layout transitions) */
  layout?: "preset" | "force" | "geo";
  /** Geo layout active */
  isGeoLayout?: boolean;
  /** Grid line thickness for the background */
  gridLineWidth?: number;
  /** Grid background style */
  gridStyle?: GridStyle;
  gridColor?: string | null;
  gridBgColor?: string | null;
  /** Annotation add mode state */
  annotationMode?: AnnotationModeState;
  /** Annotation event handlers */
  annotationHandlers?: AnnotationHandlers;
  /** Edge label rendering mode */
  linkLabelMode?: EdgeLabelMode;
  onNodeSelect?: (nodeId: string | null) => void;
  onEdgeSelect?: (edgeId: string | null) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onEdgeDoubleClick?: (edgeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onPaneClick?: () => void;
  /** Callback when ReactFlow instance is initialized */
  onInit?: (instance: ReactFlowInstance) => void;
  /** Callback when an edge is created via UI link creation mode */
  onEdgeCreated?: (
    sourceId: string,
    targetId: string,
    edgeData: {
      id: string;
      source: string;
      target: string;
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  ) => void;
  /** Callback for shift+click node creation */
  onShiftClickCreate?: (position: { x: number; y: number }) => void;
  /** Callback to open the node palette panel */
  onOpenNodePalette?: () => void;
  /** Callback to add a group annotation */
  onAddGroup?: () => void;
  /** Callback to enable add text mode */
  onAddText?: () => void;
  /** Callback to enable add shape mode */
  onAddShapes?: (shapeType?: string) => void;
  /** Callback to add text directly at a position */
  onAddTextAtPosition?: (position: { x: number; y: number }) => void;
  /** Callback to add a group directly at a position */
  onAddGroupAtPosition?: (position: { x: number; y: number }) => void;
  /** Callback to add a shape directly at a position */
  onAddShapeAtPosition?: (position: { x: number; y: number }, shapeType?: string) => void;
  /** Callback to add a traffic-rate annotation directly at a position */
  onAddTrafficRateAtPosition?: (position: { x: number; y: number }) => void;

  /** Callback for drag-drop node creation from palette */
  onDropCreateNode?: (position: { x: number; y: number }, templateName: string) => void;
  /** Callback for drag-drop network creation from palette */
  onDropCreateNetwork?: (position: { x: number; y: number }, networkType: string) => void;
  /** Callback when a locked action is attempted */
  onLockedAction?: () => void;
}

// Selection highlight color.
export const SELECTION_COLOR = vscodePalette.action.focus;

export { DEFAULT_ICON_COLOR, ROLE_SVG_MAP };
