/**
 * TypeScript types for React Flow canvas components
 */
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';

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
  nodeType: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'bridge';
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for group container nodes
 */
export interface GroupNodeData {
  label: string;
  name: string;
  level: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dotted' | 'dashed' | 'double';
  borderRadius?: number;
  labelColor?: string;
  labelPosition?: string;
  width: number;
  height: number;
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
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right';
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
  shapeType: 'rectangle' | 'circle' | 'line';
  width?: number;
  height?: number;
  endPosition?: { x: number; y: number };
  fillColor?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
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
  linkStatus?: 'up' | 'down' | 'unknown';
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Union type for all node data types
 */
export type RFNodeData = TopologyNodeData | CloudNodeData | GroupNodeData | FreeTextNodeData | FreeShapeNodeData;

/**
 * Custom node types used in the topology viewer
 */
export type RFNodeType = 'topology-node' | 'cloud-node' | 'group-node' | 'free-text-node' | 'free-shape-node';

/**
 * React Flow node with topology data
 */
export type TopologyRFNode = Node<TopologyNodeData, 'topology-node'>;
export type CloudRFNode = Node<CloudNodeData, 'cloud-node'>;
export type GroupRFNode = Node<GroupNodeData, 'group-node'>;
export type FreeTextRFNode = Node<FreeTextNodeData, 'free-text-node'>;
export type FreeShapeRFNode = Node<FreeShapeNodeData, 'free-shape-node'>;

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
}

/**
 * Props for ReactFlowCanvas component
 */
export interface ReactFlowCanvasProps {
  elements: import('../../../shared/types/topology').CyElement[];
  onNodeSelect?: (nodeId: string | null) => void;
  onEdgeSelect?: (edgeId: string | null) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onEdgeDoubleClick?: (edgeId: string) => void;
  onPaneClick?: () => void;
}

/**
 * Selection color constant (VS Code focus border)
 */
export const SELECTION_COLOR = 'var(--vscode-focusBorder, #007ACC)';

/**
 * Default node icon color
 */
export const DEFAULT_ICON_COLOR = '#005aff';
