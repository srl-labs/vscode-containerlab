/**
 * Topology-related type definitions for React TopoViewer.
 * These types define the structure for Containerlab topologies and Cytoscape elements.
 */

// ============================================================================
// Containerlab YAML Types
// ============================================================================

/**
 * Represents a Containerlab node definition as specified in the YAML configuration.
 */
export interface ClabNode {
  [key: string]: unknown;
  kind?: string;
  image?: string;
  type?: string;
  group?: string;
  labels?: Record<string, unknown>;
}

/**
 * Represents a Containerlab link endpoint in map format.
 */
export interface ClabLinkEndpointMap {
  node: string;
  interface?: string;
  mac?: string;
}

/**
 * Represents a Containerlab link definition as specified in the YAML configuration.
 */
export interface ClabLink {
  endpoints?: (string | ClabLinkEndpointMap)[];
  endpoint?: ClabLinkEndpointMap;
  type?: 'veth' | 'host' | 'mgmt-net' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | string;
  mtu?: number | string;
  vars?: unknown;
  labels?: unknown;
  'host-interface'?: string;
  mode?: string;
  remote?: string;
  vni?: number | string;
  'dst-port'?: number | string;
  'src-port'?: number | string;
}

/**
 * Represents the main Containerlab topology structure as defined in the YAML configuration.
 */
export interface ClabTopology {
  name?: string;
  prefix?: string;
  topology?: {
    defaults?: ClabNode;
    kinds?: Record<string, ClabNode>;
    groups?: Record<string, ClabNode>;
    nodes?: Record<string, ClabNode>;
    links?: ClabLink[];
  };
}

// ============================================================================
// Cytoscape Element Types
// ============================================================================

/**
 * Represents a single Cytoscape element, either a node or an edge.
 */
export interface CyElement {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  position?: { x: number; y: number };
  removed?: boolean;
  selected?: boolean;
  selectable?: boolean;
  locked?: boolean;
  grabbed?: boolean;
  grabbable?: boolean;
  classes?: string;
}

/**
 * Represents the overall Cytoscape topology as an array of elements.
 */
export type CytoTopology = CyElement[];

// ============================================================================
// Annotation Types
// ============================================================================

/**
 * Free text annotation for canvas text overlays.
 */
export interface FreeTextAnnotation {
  id: string;
  text: string;
  position: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
  groupId?: string; // Parent group ID for hierarchy membership
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
  zIndex?: number;
  roundedBackground?: boolean;
  [key: string]: unknown;
}

/**
 * Free shape annotation for canvas shapes.
 */
export interface FreeShapeAnnotation {
  id: string;
  shapeType: 'rectangle' | 'circle' | 'line';
  position: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
  groupId?: string; // Parent group ID for hierarchy membership
  width?: number;
  height?: number;
  endPosition?: { x: number; y: number };
  endGeoCoordinates?: { lat: number; lng: number };
  fillColor?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  rotation?: number;
  zIndex?: number;
  lineStartArrow?: boolean;
  lineEndArrow?: boolean;
  lineArrowSize?: number;
  cornerRadius?: number;
  [key: string]: unknown;
}

/**
 * Group annotation for overlay groups (rendered as HTML/SVG, not Cytoscape nodes).
 * Members are tracked via NodeAnnotation.groupId (preferred) and group/level for legacy display.
 * Groups can be nested via parentId for hierarchical organization.
 */
export interface GroupStyleAnnotation {
  id: string;
  name: string;
  level: string;
  parentId?: string; // Parent group ID for nested groups
  // Geometry
  position: { x: number; y: number };
  width: number;
  height: number;
  // Geo coordinates for geomap mode
  geoCoordinates?: { lat: number; lng: number };
  // Style
  color?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dotted' | 'dashed' | 'double';
  borderRadius?: number;
  labelColor?: string;
  labelPosition?: string;
  zIndex?: number;
  [key: string]: unknown;
}

/**
 * Cloud node annotation for external network endpoints.
 * @deprecated Use NetworkNodeAnnotation instead. Kept for migration compatibility.
 */
export interface CloudNodeAnnotation {
  id: string;
  type: 'host' | 'mgmt-net' | 'macvlan';
  label: string;
  position: { x: number; y: number };
  group?: string;
  level?: string;
}

/**
 * Network node annotation for external network endpoints.
 * Networks are endpoints that connect to external resources like host interfaces,
 * management networks, VXLANs, etc.
 */
export interface NetworkNodeAnnotation {
  id: string;
  type: 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'dummy' | 'bridge' | 'ovs-bridge';
  label?: string;
  position: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
  group?: string;
  level?: string;
}

/**
 * Node annotation for position, icon, and other visual settings.
 */
export interface NodeAnnotation {
  id: string;
  label?: string;
  copyFrom?: string;
  yamlNodeId?: string;
  yamlInterface?: string;
  position?: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  groupLabelPos?: string;
  /** Internal group ID for membership (preferred). */
  groupId?: string;
  group?: string;
  level?: string;
  interfacePattern?: string;
}

/**
 * Edge annotation for per-link visual settings.
 */
export interface EdgeAnnotation {
  id?: string;
  source?: string;
  target?: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  endpointLabelOffsetEnabled?: boolean;
  endpointLabelOffset?: number;
}

/**
 * Alias endpoint annotation for mapping YAML nodes to visual aliases.
 */
export interface AliasEndpointAnnotation {
  yamlNodeId: string;
  interface: string;
  aliasNodeId: string;
}

/**
 * Container for all topology annotations.
 */
export interface TopologyAnnotations {
  freeTextAnnotations?: FreeTextAnnotation[];
  freeShapeAnnotations?: FreeShapeAnnotation[];
  groupStyleAnnotations?: GroupStyleAnnotation[];
  /**
   * @deprecated Use networkNodeAnnotations instead. Kept for migration compatibility.
   */
  // eslint-disable-next-line sonarjs/deprecation
  cloudNodeAnnotations?: CloudNodeAnnotation[];
  networkNodeAnnotations?: NetworkNodeAnnotation[];
  nodeAnnotations?: NodeAnnotation[];
  edgeAnnotations?: EdgeAnnotation[];
  aliasEndpointAnnotations?: AliasEndpointAnnotation[];
  viewerSettings?: {
    gridLineWidth?: number;
    endpointLabelOffset?: number;
  };
  [key: string]: unknown;
}

// ============================================================================
// Deployment State
// ============================================================================

export type DeploymentState = 'deployed' | 'undeployed' | 'unknown';

// ============================================================================
// Interface Statistics Types
// ============================================================================

/**
 * Interface statistics payload for traffic rate display.
 * Contains RX/TX rates in bits per second and packets per second.
 */
export interface InterfaceStatsPayload {
  rxBps?: number;
  txBps?: number;
  rxPps?: number;
  txPps?: number;
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  statsIntervalSeconds?: number;
}

/**
 * Endpoint statistics history for rolling chart display.
 */
export interface EndpointStatsHistory {
  timestamps: number[];
  rxBps: number[];
  txBps: number[];
  rxPps: number[];
  txPps: number[];
}
