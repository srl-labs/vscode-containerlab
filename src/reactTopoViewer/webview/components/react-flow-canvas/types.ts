/**
 * TypeScript types for React Flow canvas components
 */
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";

import type { EdgeLabelMode } from "../../context/EdgeRenderConfigContext";
import type { TopoNode, TopoEdge } from "../../../shared/types/graph";

/**
 * Node data for topology nodes (routers, switches, etc.)
 */
export interface TopologyNodeData {
  label: string;
  role: string;
  kind?: string;
  image?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  state?: string;
  mgmtIpv4Address?: string;
  mgmtIpv6Address?: string;
  longname?: string;
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for cloud/external endpoint nodes
 */
export interface CloudNodeData {
  label: string;
  nodeType: "host" | "mgmt-net" | "macvlan" | "vxlan" | "bridge";
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for free text annotations
 */
export interface FreeTextNodeData {
  text: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  rotation?: number;
  width?: number;
  height?: number;
  roundedBackground?: boolean;
  [key: string]: unknown;
}

/**
 * Node data for free shape annotations
 */
export interface FreeShapeNodeData {
  shapeType: "rectangle" | "circle" | "line";
  width?: number;
  height?: number;
  /** Absolute end position for lines (for updating annotation state) */
  endPosition?: { x: number; y: number };
  /** Relative end position for lines (end - start) */
  relativeEndPosition?: { x: number; y: number };
  /** Start position for lines (absolute, for handle updates) */
  startPosition?: { x: number; y: number };
  /** Line start position within the node's bounding box */
  lineStartInNode?: { x: number; y: number };
  fillColor?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  rotation?: number;
  lineStartArrow?: boolean;
  lineEndArrow?: boolean;
  lineArrowSize?: number;
  cornerRadius?: number;
  [key: string]: unknown;
}

/**
 * Edge data for topology edges (links)
 */
export interface TopologyEdgeData {
  sourceEndpoint: string;
  targetEndpoint: string;
  linkStatus?: "up" | "down" | "unknown";
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Union type for all node data types
 * Note: Groups are rendered via GroupLayer, not as React Flow nodes
 */
export type RFNodeData = TopologyNodeData | CloudNodeData | FreeTextNodeData | FreeShapeNodeData;

/**
 * Custom node types used in the topology viewer
 * Note: Groups are rendered via GroupLayer, not as React Flow nodes
 */
export type RFNodeType = "topology-node" | "cloud-node" | "free-text-node" | "free-shape-node";

/**
 * React Flow node with topology data
 */
export type TopologyRFNode = Node<TopologyNodeData, "topology-node">;
export type CloudRFNode = Node<CloudNodeData, "cloud-node">;
export type FreeTextRFNode = Node<FreeTextNodeData, "free-text-node">;
export type FreeShapeRFNode = Node<FreeShapeNodeData, "free-shape-node">;

/**
 * React Flow edge with topology data
 */
export type TopologyRFEdge = Edge<TopologyEdgeData>;

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
  /** Update annotation position after drag */
  onUpdateFreeTextPosition: (id: string, position: { x: number; y: number }) => void;
  /** Update annotation position after drag */
  onUpdateFreeShapePosition: (id: string, position: { x: number; y: number }) => void;
  /** Update free text size after resize */
  onUpdateFreeTextSize: (id: string, width: number, height: number) => void;
  /** Update free shape size after resize */
  onUpdateFreeShapeSize: (id: string, width: number, height: number) => void;
  /** Update free text rotation after rotate */
  onUpdateFreeTextRotation: (id: string, rotation: number) => void;
  /** Update free shape rotation after rotate */
  onUpdateFreeShapeRotation: (id: string, rotation: number) => void;
  /** Update line end position after resize */
  onUpdateFreeShapeEndPosition: (id: string, endPosition: { x: number; y: number }) => void;
  /** Update line start position after resize */
  onUpdateFreeShapeStartPosition: (id: string, startPosition: { x: number; y: number }) => void;
  /** Disable add text mode (e.g., on Escape) */
  disableAddTextMode: () => void;
  /** Disable add shape mode (e.g., on Escape) */
  disableAddShapeMode: () => void;
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
  /** ReactFlow nodes */
  nodes?: TopoNode[];
  /** ReactFlow edges */
  edges?: TopoEdge[];
  /** Additional nodes to render (e.g., annotations) */
  annotationNodes?: Node[];
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
  /** Callback when a node move is complete (for undo/redo) */
  onMoveComplete?: (before: MovePositionEntry[], after: MovePositionEntry[]) => void;
}

/**
 * Selection color constant (VS Code focus border)
 */
export const SELECTION_COLOR = "var(--vscode-focusBorder, #007ACC)";

/**
 * Default node icon color
 */
export const DEFAULT_ICON_COLOR = "#005aff";
