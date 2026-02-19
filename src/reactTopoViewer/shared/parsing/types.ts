/**
 * Parser-specific type definitions for the shared topology parser.
 * These types abstract away VS Code dependencies to enable use in both
 * the production extension and the dev server.
 */

import type {
  ClabTopology,
  ParsedElement,
  TopologyAnnotations,
  NodeAnnotation,
  InterfaceStatsPayload
} from "../types/topology";
import type { TopologyData } from "../types/graph";

// Re-export commonly used types for convenience
export type { ClabTopology, ParsedElement, TopologyAnnotations, NodeAnnotation, TopologyData };

// ============================================================================
// Parser Options and Results
// ============================================================================

/**
 * Options for parsing a topology.
 */
export interface ParseOptions {
  /** Annotations to merge with topology */
  annotations?: TopologyAnnotations;
  /** Container data provider for runtime enrichment (VS Code extension provides this) */
  containerDataProvider?: ContainerDataProvider;
  /** Logger interface (optional) */
  logger?: ParserLogger;
  /** Lab name for container lookups (if different from topology name) */
  labName?: string;
}

/**
 * Result from parsing a topology (internal ParsedElement format).
 * For external consumers, use ParseResultRF with TopologyData (ReactFlow format).
 */
export interface ParseResult {
  /** Parsed elements (nodes and edges) */
  elements: ParsedElement[];
  /** Lab name from topology */
  labName: string;
  /** Container name prefix (e.g., "clab-labname") */
  prefix: string;
  /** Whether all nodes have preset positions from annotations */
  isPresetLayout: boolean;
  /** Interface pattern migrations that need to be persisted */
  pendingMigrations: InterfacePatternMigration[];
  /** Graph-label migrations detected (need YAML modification) */
  graphLabelMigrations: GraphLabelMigration[];
}

/**
 * Result from parsing a topology (ReactFlow format).
 * Use this for new code instead of ParseResult.
 */
export interface ParseResultRF {
  /** Topology data with nodes and edges in ReactFlow format */
  topology: TopologyData;
  /** Lab name from topology */
  labName: string;
  /** Container name prefix (e.g., "clab-labname") */
  prefix: string;
  /** Whether all nodes have preset positions from annotations */
  isPresetLayout: boolean;
  /** Interface pattern migrations that need to be persisted */
  pendingMigrations: InterfacePatternMigration[];
  /** Graph-label migrations detected (need YAML modification) */
  graphLabelMigrations: GraphLabelMigration[];
}

// ============================================================================
// Container Data Abstraction (VS Code-free interface)
// ============================================================================

/**
 * Abstract interface for container data.
 * VS Code extension implements this to provide runtime container info.
 * Dev server doesn't use this (passes undefined).
 */
export interface ContainerDataProvider {
  /**
   * Find a container by name.
   */
  findContainer(containerName: string, labName: string): ContainerInfo | undefined;

  /**
   * Find an interface within a container.
   */
  findInterface(
    containerName: string,
    ifaceName: string,
    labName: string
  ): InterfaceInfo | undefined;

  /**
   * Find a distributed SROS interface across component containers.
   */
  findDistributedSrosInterface?(params: {
    baseNodeName: string;
    ifaceName: string;
    fullPrefix: string;
    labName: string;
    components: unknown[];
  }): { containerName: string; ifaceData?: InterfaceInfo } | undefined;

  /**
   * Find a distributed SROS container.
   */
  findDistributedSrosContainer?(params: {
    baseNodeName: string;
    fullPrefix: string;
    labName: string;
    components: unknown[];
  }): ContainerInfo | undefined;
}

/**
 * Container info without VS Code dependencies.
 * Maps to ClabContainerTreeNode fields.
 */
export interface ContainerInfo {
  /** Full container name (e.g., "clab-labname-node1") */
  name: string;
  /** Short name without prefix (e.g., "node1") */
  name_short: string;
  /** Root node name for grouped/distributed containers */
  rootNodeName?: string;
  /** Container state (e.g., "running", "stopped") */
  state: string;
  /** Node kind (e.g., "nokia_srlinux") */
  kind: string;
  /** Container image */
  image: string;
  /** IPv4 address without CIDR mask */
  IPv4Address: string;
  /** IPv6 address without CIDR mask */
  IPv6Address: string;
  /** Node type */
  nodeType?: string;
  /** Node group */
  nodeGroup?: string;
  /** Container interfaces */
  interfaces: InterfaceInfo[];
  /** Container label (may be TreeItemLabel in VS Code, but string here) */
  label?: string;
}

/**
 * Netem fields
 */

export interface NetemState {
  delay?: string;
  jitter?: string;
  loss?: string;
  rate?: string;
  corruption?: string;
}

/**
 * Interface info without VS Code dependencies.
 * Maps to ClabInterfaceTreeNode fields.
 */
export interface InterfaceInfo {
  /** Interface name (e.g., "eth1") */
  name: string;
  /** Interface alias (e.g., "ge-0/0/1") */
  alias: string;
  /** MAC address */
  mac: string;
  /** MTU */
  mtu: number;
  /** Interface state (e.g., "up", "down") */
  state: string;
  /** Interface type (e.g., "veth", "dummy") */
  type: string;
  /** Interface index */
  ifIndex?: number;
  /** Traffic statistics */
  stats?: InterfaceStatsPayload;
  /** Netem states */
  netemState?: NetemState;
}

// ============================================================================
// Logger Abstraction
// ============================================================================

/**
 * Logger interface for optional logging.
 * VS Code extension can provide a logger that writes to output channel.
 * Dev server can use console or no-op logger.
 */
export interface ParserLogger {
  info(msg: string): void;
  warn(msg: string): void;
  debug(msg: string): void;
  error(msg: string): void;
}

/**
 * No-op logger for when logging is not needed.
 */
export const nullLogger: ParserLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {}
};

// ============================================================================
// Migration Types
// ============================================================================

/**
 * Represents an interface pattern that needs to be migrated to annotations.
 */
export interface InterfacePatternMigration {
  /** Node ID in the topology */
  nodeId: string;
  /** Interface pattern to save (e.g., "eth{port}") */
  interfacePattern: string;
}

/**
 * Represents a graph-* label migration from YAML to annotations.
 */
export interface GraphLabelMigration {
  /** Node ID in the topology */
  nodeId: string;
  /** Position from graph-x/graph-y labels */
  position?: { x: number; y: number };
  /** Icon from graph-icon label */
  icon?: string;
  /** Group from graph-group label */
  group?: string;
  /** Level from graph-level label */
  level?: string;
  /** Group label position from graph-group-label-pos */
  groupLabelPos?: string;
  /** Geographic coordinates from graph-lat/graph-lng */
  geoCoordinates?: { lat: number; lng: number };
}

// ============================================================================
// Build Context Types
// ============================================================================

/**
 * Context for building node elements.
 */
export interface NodeBuildContext {
  /** Parsed topology object */
  topology: ClabTopology;
  /** Container name prefix */
  fullPrefix: string;
  /** Lab name */
  labName: string;
  /** Node annotations map (nodeId -> annotation) */
  nodeAnnotationsMap: Map<string, NodeAnnotation>;
  /** Container data provider (optional) */
  containerDataProvider?: ContainerDataProvider;
  /** Logger (optional) */
  logger?: ParserLogger;
}

/**
 * Context for building edge elements.
 */
export interface EdgeBuildContext {
  /** Parsed topology object */
  topology: ClabTopology;
  /** Container name prefix */
  fullPrefix: string;
  /** Lab name */
  labName: string;
  /** Node annotations map (nodeId -> annotation) */
  nodeAnnotationsMap: Map<string, NodeAnnotation>;
  /** Container data provider (optional) */
  containerDataProvider?: ContainerDataProvider;
  /** Logger (optional) */
  logger?: ParserLogger;
  /** Set of node IDs that exist in the topology */
  nodeIds: Set<string>;
}

/**
 * Context for tracking special nodes (dummy, vxlan, etc.) across link processing.
 */
export interface DummyContext {
  /** Counter for generating unique dummy IDs */
  dummyCounter: number;
  /** Map from link object to generated dummy ID */
  dummyLinkMap: Map<unknown, string>;
  /** Counter for generating unique vxlan IDs */
  vxlanCounter: number;
  /** Map from link object to generated vxlan ID */
  vxlanLinkMap: Map<unknown, string>;
  /** Counter for generating unique vxlan-stitch IDs */
  vxlanStitchCounter: number;
  /** Map from link object to generated vxlan-stitch ID */
  vxlanStitchLinkMap: Map<unknown, string>;
}

// ============================================================================
// Special Node Types
// ============================================================================

/**
 * Information about a special node (host, mgmt-net, bridge, etc.).
 */
export interface SpecialNodeInfo {
  /** Node ID (e.g., "host:eth0", "mgmt-net:eth1") */
  id: string;
  /** Node type */
  type:
    | "host"
    | "mgmt-net"
    | "macvlan"
    | "vxlan"
    | "vxlan-stitch"
    | "dummy"
    | "bridge"
    | "ovs-bridge";
  /** Display label */
  label?: string;
  /** Position from annotations */
  position?: { x: number; y: number };
  /** Geographic coordinates */
  geoCoordinates?: { lat: number; lng: number };
  /** Group membership */
  group?: string;
  /** Level within group */
  level?: string;
}

// ============================================================================
// Role Detection
// ============================================================================

/**
 * Node role for visual styling.
 */
export type NodeRole = "router" | "client" | "default" | "cloud";

/**
 * Kinds that are considered routers.
 */
export const ROUTER_KINDS = new Set([
  "nokia_srlinux",
  "nokia_sros",
  "nokia_srsim",
  "arista_ceos",
  "arista_veos",
  "cisco_xrd",
  "cisco_xrv",
  "cisco_xrv9k",
  "juniper_crpd",
  "juniper_vjunos_router",
  "juniper_vjunos_switch",
  "juniper_vmx",
  "juniper_vqfx",
  "juniper_vsrx",
  "frr",
  "gobgp",
  "bird",
  "openbgpd"
]);

/**
 * Kinds that are considered clients.
 */
export const CLIENT_KINDS = new Set(["linux", "alpine", "debian", "ubuntu", "centos", "rocky"]);

/**
 * Detect the role of a node based on its kind.
 */
export function detectRole(kind: string | undefined): NodeRole {
  if (!kind) return "default";
  const k = kind.toLowerCase();
  if (ROUTER_KINDS.has(k)) return "router";
  if (CLIENT_KINDS.has(k)) return "client";
  return "default";
}
