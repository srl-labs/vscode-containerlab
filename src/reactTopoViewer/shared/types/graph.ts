// ReactFlow type definitions for the topology viewer.
import type { Node, Edge } from "@xyflow/react";

import type { TextStyle, BoxStyle, TrafficRateStyle } from "./annotationStyles";

// ============================================================================
// Node Data Types
// ============================================================================

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
  labelPosition?: string;
  direction?: string;
  labelBackgroundColor?: string;
  state?: string;
  mgmtIpv4Address?: string;
  mgmtIpv6Address?: string;
  longname?: string;
  geoCoordinates?: { lat: number; lng: number };
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for network endpoint nodes (host, mgmt-net, macvlan, vxlan, bridge)
 */
export interface NetworkNodeData {
  label: string;
  nodeType:
    | "host"
    | "mgmt-net"
    | "macvlan"
    | "vxlan"
    | "vxlan-stitch"
    | "dummy"
    | "bridge"
    | "ovs-bridge"
    | string;
  labelPosition?: string;
  direction?: string;
  labelBackgroundColor?: string;
  geoCoordinates?: { lat: number; lng: number };
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for group container nodes
 */
export interface GroupNodeData extends BoxStyle {
  label: string;
  name: string;
  level: string;
  parentId?: string;
  groupId?: string;
  width: number;
  height: number;
  [key: string]: unknown;
}

/**
 * Node data for free text annotations
 */
export interface FreeTextNodeData extends TextStyle {
  text: string;
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
 * Node data for traffic-rate annotations.
 */
export interface TrafficRateNodeData extends TrafficRateStyle {
  nodeId?: string;
  interfaceName?: string;
  mode?: "chart" | "text";
  textMetric?: "combined" | "rx" | "tx";
  showLegend?: boolean;
  width?: number;
  height?: number;
  groupId?: string;
  geoCoordinates?: { lat: number; lng: number };
  [key: string]: unknown;
}

// ============================================================================
// Edge Data Types
// ============================================================================

/**
 * Edge data for topology edges (links between nodes)
 */
export interface TopologyEdgeData {
  sourceEndpoint: string;
  targetEndpoint: string;
  linkStatus?: "up" | "down" | "unknown";
  endpointLabelOffsetEnabled?: boolean;
  endpointLabelOffset?: number;
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Union type for all node data types
 */
export type RFNodeData =
  | TopologyNodeData
  | NetworkNodeData
  | GroupNodeData
  | FreeTextNodeData
  | FreeShapeNodeData
  | TrafficRateNodeData;

/**
 * Custom node type string literals
 */
export type RFNodeType =
  | "topology-node"
  | "network-node"
  | "group-node"
  | "free-text-node"
  | "free-shape-node"
  | "traffic-rate-node";

// ============================================================================
// Typed Node Aliases
// ============================================================================

/**
 * React Flow node with topology data
 */
export type TopologyRFNode = Node<TopologyNodeData, "topology-node">;
export type NetworkRFNode = Node<NetworkNodeData, "network-node">;
export type GroupRFNode = Node<GroupNodeData, "group-node">;
export type FreeTextRFNode = Node<FreeTextNodeData, "free-text-node">;
export type FreeShapeRFNode = Node<FreeShapeNodeData, "free-shape-node">;
export type TrafficRateRFNode = Node<TrafficRateNodeData, "traffic-rate-node">;

/**
 * Union of all typed nodes
 */
export type TopoNode =
  | TopologyRFNode
  | NetworkRFNode
  | GroupRFNode
  | FreeTextRFNode
  | FreeShapeRFNode
  | TrafficRateRFNode;

/**
 * React Flow edge with topology data
 */
export type TopoEdge = Edge<TopologyEdgeData>;

// ============================================================================
// Topology Data Structure
// ============================================================================

/**
 * Topology data structure with ReactFlow nodes and edges.
 */
export interface TopologyData {
  nodes: TopoNode[];
  edges: TopoEdge[];
}

// ============================================================================
// Handler Callback Types
// ============================================================================

/**
 * Edge creation data passed to handler callbacks
 */
export interface EdgeCreatedData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
}

/**
 * Handler callback for edge creation
 */
export type EdgeCreatedHandler = (
  sourceId: string,
  targetId: string,
  edgeData: EdgeCreatedData
) => void;

/**
 * Handler callback for node creation
 */
export type NodeCreatedHandler = (
  nodeId: string,
  nodeElement: TopoNode,
  position: { x: number; y: number }
) => void;

// ============================================================================
// Constants
// ============================================================================

// Default node icon color
export const DEFAULT_ICON_COLOR = "#005aff";

/**
 * Role to SVG node type mapping
 */
export const ROLE_SVG_MAP: Record<string, string> = {
  router: "pe",
  default: "pe",
  pe: "pe",
  p: "pe",
  controller: "controller",
  pon: "pon",
  dcgw: "dcgw",
  leaf: "leaf",
  switch: "switch",
  rgw: "rgw",
  "super-spine": "super-spine",
  spine: "spine",
  server: "server",
  bridge: "bridge",
  ue: "ue",
  cloud: "cloud",
  client: "client"
};
