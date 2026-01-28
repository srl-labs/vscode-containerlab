/**
 * ReactFlow-native type definitions for the topology viewer.
 * These types replace ParsedElement with ReactFlow's Node/Edge types.
 */
import type { Node, Edge } from "@xyflow/react";

import type { TextStyle } from "./annotationStyles";

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
  state?: string;
  mgmtIpv4Address?: string;
  mgmtIpv6Address?: string;
  longname?: string;
  geoCoordinates?: { lat: number; lng: number };
  extraData?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Node data for cloud/external endpoint nodes (host, mgmt-net, macvlan, vxlan, bridge)
 */
export interface CloudNodeData {
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
  geoCoordinates?: { lat: number; lng: number };
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
  borderStyle?: "solid" | "dotted" | "dashed" | "double";
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
  | CloudNodeData
  | GroupNodeData
  | FreeTextNodeData
  | FreeShapeNodeData;

/**
 * Custom node type string literals
 */
export type RFNodeType =
  | "topology-node"
  | "cloud-node"
  | "group-node"
  | "free-text-node"
  | "free-shape-node";

// ============================================================================
// Typed Node Aliases
// ============================================================================

/**
 * React Flow node with topology data
 */
export type TopologyRFNode = Node<TopologyNodeData, "topology-node">;
export type CloudRFNode = Node<CloudNodeData, "cloud-node">;
export type GroupRFNode = Node<GroupNodeData, "group-node">;
export type FreeTextRFNode = Node<FreeTextNodeData, "free-text-node">;
export type FreeShapeRFNode = Node<FreeShapeNodeData, "free-shape-node">;

/**
 * Union of all typed nodes
 */
export type TopoNode =
  | TopologyRFNode
  | CloudRFNode
  | GroupRFNode
  | FreeTextRFNode
  | FreeShapeRFNode;

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
// Constants
// ============================================================================

/**
 * Selection color constant (VS Code focus border)
 */
export const SELECTION_COLOR = "var(--vscode-focusBorder, #007ACC)";

/**
 * Default node icon color
 */
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
