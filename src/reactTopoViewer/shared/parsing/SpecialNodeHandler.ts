/**
 * Special node handler for host, mgmt-net, macvlan, vxlan, etc.
 * Pure functions - no VS Code dependencies.
 */

// eslint-disable-next-line sonarjs/deprecation
import type {
  ClabNode,
  CyElement,
  ClabTopology,
  NetworkNodeAnnotation,
  CloudNodeAnnotation,
  TopologyAnnotations
} from "../types/topology";

import type { SpecialNodeType } from "./LinkNormalizer";
import {
  TYPES,
  PREFIX_MACVLAN,
  PREFIX_VXLAN_STITCH,
  NODE_KIND_BRIDGE,
  NODE_KIND_OVS_BRIDGE,
  splitEndpoint,
  normalizeLinkToTwoEndpoints,
  createDummyContext
} from "./LinkNormalizer";
import type { DummyContext, SpecialNodeInfo } from "./types";

// ============================================================================
// Special Node Initialization
// ============================================================================

/**
 * Initializes special nodes from the topology nodes (bridges).
 */
export function initSpecialNodes(nodes?: Record<string, ClabNode>): Map<string, SpecialNodeInfo> {
  const specialNodes = new Map<string, SpecialNodeInfo>();
  if (!nodes) return specialNodes;
  for (const [nodeName, nodeData] of Object.entries(nodes)) {
    if (nodeData?.kind === NODE_KIND_BRIDGE || nodeData?.kind === NODE_KIND_OVS_BRIDGE) {
      specialNodes.set(nodeName, {
        id: nodeName,
        type: nodeData.kind as SpecialNodeInfo["type"],
        label: nodeName
      });
    }
  }
  return specialNodes;
}

// ============================================================================
// Special Node Detection
// ============================================================================

/**
 * Determines if a node is a special endpoint type.
 */
export function determineSpecialNode(
  node: string,
  iface: string
): { id: string; type: SpecialNodeType; label: string } | null {
  if (node === "host")
    return { id: `host:${iface}`, type: "host", label: `host:${iface || "host"}` };
  if (node === "mgmt-net")
    return { id: `mgmt-net:${iface}`, type: "mgmt-net", label: `mgmt-net:${iface || "mgmt-net"}` };
  if (node.startsWith(PREFIX_MACVLAN)) return { id: node, type: "macvlan", label: node };
  if (node.startsWith(PREFIX_VXLAN_STITCH))
    return { id: node, type: TYPES.VXLAN_STITCH as SpecialNodeType, label: node };
  if (node.startsWith("vxlan:")) return { id: node, type: "vxlan", label: node };
  if (node.startsWith("dummy")) return { id: node, type: "dummy", label: node };
  return null;
}

/**
 * Registers an endpoint as a special node if applicable.
 * Bare endpoints (no interface) that aren't topology nodes are treated as implicit bridges.
 */
export function registerEndpoint(
  specialNodes: Map<string, SpecialNodeInfo>,
  end: unknown,
  topologyNodeNames?: Set<string>
): void {
  const { node, iface } = splitEndpoint(end as string | { node: string; interface?: string });
  const info = determineSpecialNode(node, iface);
  if (info) {
    specialNodes.set(info.id, { id: info.id, type: info.type, label: info.label });
  } else if (!iface && !topologyNodeNames?.has(node) && !specialNodes.has(node)) {
    // Bare endpoint not in topology nodes - treat as implicit bridge
    specialNodes.set(node, {
      id: node,
      type: NODE_KIND_BRIDGE as SpecialNodeInfo["type"],
      label: node
    });
  }
}

/**
 * Gets the special ID for an endpoint.
 */
export function getSpecialId(end: unknown): string | null {
  const { node, iface } = splitEndpoint(end as string | { node: string; interface?: string });
  if (node === "host") return `host:${iface}`;
  if (node === "mgmt-net") return `mgmt-net:${iface}`;
  if (node.startsWith(PREFIX_MACVLAN)) return node;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
  if (node.startsWith("vxlan:")) return node;
  if (node.startsWith("dummy")) return node;
  return null;
}

// ============================================================================
// Link Property Extraction
// ============================================================================

/**
 * Converts a value to string. Handles numbers, strings, and other types.
 */
function toStr(val: unknown): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  return String(val);
}

/**
 * Assigns common link properties to base props.
 * MTU is converted to string for consistent editor handling.
 */
export function assignCommonLinkProps(
  linkObj: Record<string, unknown>,
  baseProps: Record<string, unknown>
): void {
  if (linkObj?.mtu !== undefined) baseProps.extMtu = toStr(linkObj.mtu);
  if (linkObj?.vars !== undefined) baseProps.extVars = linkObj.vars;
  if (linkObj?.labels !== undefined) baseProps.extLabels = linkObj.labels;
}

/**
 * Assigns host/mgmt-net specific properties.
 */
export function assignHostMgmtProps(
  linkType: string,
  linkObj: Record<string, unknown>,
  baseProps: Record<string, unknown>
): void {
  if (!["host", "mgmt-net", "macvlan"].includes(linkType)) return;
  if (linkObj?.["host-interface"] !== undefined)
    baseProps.extHostInterface = linkObj["host-interface"];
  if (linkType === "macvlan" && linkObj?.mode !== undefined) baseProps.extMode = linkObj.mode;
}

/**
 * Assigns vxlan/vxlan-stitch specific properties.
 * Converts all values to strings for consistent handling in the editor.
 */
export function assignVxlanProps(
  linkType: string,
  linkObj: Record<string, unknown>,
  baseProps: Record<string, unknown>
): void {
  if (![TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as typeof TYPES.VXLAN)) return;
  if (linkObj?.remote !== undefined) baseProps.extRemote = toStr(linkObj.remote);
  if (linkObj?.vni !== undefined) baseProps.extVni = toStr(linkObj.vni);
  if (linkObj?.["dst-port"] !== undefined) baseProps.extDstPort = toStr(linkObj["dst-port"]);
  if (linkObj?.["src-port"] !== undefined) baseProps.extSrcPort = toStr(linkObj["src-port"]);
}

/**
 * Builds base properties for a special node.
 */
export function buildBaseProps(
  linkObj: Record<string, unknown>,
  linkType: string
): Record<string, unknown> {
  const baseProps: Record<string, unknown> = { extType: linkType };
  assignCommonLinkProps(linkObj, baseProps);
  assignHostMgmtProps(linkType, linkObj, baseProps);
  assignVxlanProps(linkType, linkObj, baseProps);
  const endpoint = linkObj?.endpoint as Record<string, unknown> | undefined;
  const epMac = endpoint?.mac;
  if (epMac !== undefined) baseProps.extMac = epMac;
  return baseProps;
}

/**
 * Merges special node properties from a link object.
 */
export function mergeSpecialNodeProps(
  linkObj: Record<string, unknown>,
  endA: unknown,
  endB: unknown,
  specialNodeProps: Map<string, Record<string, unknown>>
): void {
  const linkType = typeof linkObj?.type === "string" ? String(linkObj.type) : "";
  if (!linkType || linkType === "veth") return;

  const ids = [getSpecialId(endA), getSpecialId(endB)];
  const baseProps = buildBaseProps(linkObj, linkType);
  ids.forEach((id) => {
    if (!id) return;
    const prev = specialNodeProps.get(id) || {};
    specialNodeProps.set(id, { ...prev, ...baseProps });
  });
}

// ============================================================================
// Special Node Collection
// ============================================================================

/**
 * Collects special nodes from the topology.
 */
export function collectSpecialNodes(
  parsed: ClabTopology,
  ctx?: DummyContext
): {
  specialNodes: Map<string, SpecialNodeInfo>;
  specialNodeProps: Map<string, Record<string, unknown>>;
} {
  const dummyCtx = ctx ?? createDummyContext();
  const specialNodes = initSpecialNodes(parsed.topology?.nodes);
  const specialNodeProps: Map<string, Record<string, unknown>> = new Map();
  const links = parsed.topology?.links;
  if (!links) return { specialNodes, specialNodeProps };

  // Create set of topology node names to distinguish explicit nodes from implicit bridges
  const topologyNodeNames = new Set(Object.keys(parsed.topology?.nodes || {}));

  for (const linkObj of links) {
    const norm = normalizeLinkToTwoEndpoints(linkObj as Record<string, unknown>, dummyCtx);
    if (!norm) continue;
    const { endA, endB } = norm;
    registerEndpoint(specialNodes, endA, topologyNodeNames);
    registerEndpoint(specialNodes, endB, topologyNodeNames);
    mergeSpecialNodeProps(linkObj as Record<string, unknown>, endA, endB, specialNodeProps);
  }

  return { specialNodes, specialNodeProps };
}

// ============================================================================
// Cloud Node Creation
// ============================================================================

interface PlacementResult {
  position: { x: number; y: number };
  label?: string;
  geoCoordinates?: { lat: number; lng: number };
  group?: string;
  level?: string;
}

/**
 * Checks if a special node should be skipped (already created by addNodeElements).
 */
function shouldSkipCloudNode(
  nodeId: string,
  nodeInfo: SpecialNodeInfo,
  yamlNodeIds?: Set<string>
): boolean {
  const isBridgeType = nodeInfo.type === NODE_KIND_BRIDGE || nodeInfo.type === NODE_KIND_OVS_BRIDGE;
  return isBridgeType && (yamlNodeIds?.has(nodeId) ?? false);
}

/**
 * Extract placement from a network annotation.
 */
function extractNetworkPlacement(saved: NetworkNodeAnnotation): PlacementResult {
  return {
    position: saved.position || { x: 0, y: 0 },
    label: saved.label,
    geoCoordinates: saved.geoCoordinates,
    group: saved.group,
    level: saved.level
  };
}

/**
 * Extract placement from a cloud annotation (legacy).
 */
// eslint-disable-next-line sonarjs/deprecation
function extractCloudPlacement(saved: CloudNodeAnnotation | undefined): PlacementResult {
  return {
    position: saved?.position || { x: 0, y: 0 },
    label: saved?.label,
    group: saved?.group,
    level: saved?.level
  };
}

/**
 * Resolves position and label from network node annotations.
 * Checks networkNodeAnnotations first (new format), then falls back to cloudNodeAnnotations (legacy).
 */
function resolveCloudNodePlacement(
  nodeId: string,
  annotations?: TopologyAnnotations
): PlacementResult {
  // Check networkNodeAnnotations first (new format)
  const networkSaved = annotations?.networkNodeAnnotations?.find((nn) => nn.id === nodeId);
  if (networkSaved) {
    return extractNetworkPlacement(networkSaved);
  }

  // Fallback to cloudNodeAnnotations (legacy format)
  // eslint-disable-next-line sonarjs/deprecation
  const cloudSaved = annotations?.cloudNodeAnnotations?.find((cn) => cn.id === nodeId);
  return extractCloudPlacement(cloudSaved);
}

/**
 * Creates a cloud node element.
 */
function createCloudNodeElement(
  nodeId: string,
  nodeInfo: SpecialNodeInfo,
  placement: PlacementResult,
  extraProps: Record<string, unknown>
): CyElement {
  const displayLabel = placement.label || nodeInfo.label || nodeId;
  return {
    group: "nodes",
    data: {
      id: nodeId,
      weight: "30",
      name: displayLabel,
      topoViewerRole: "cloud",
      lat: placement.geoCoordinates?.lat?.toString() || "",
      lng: placement.geoCoordinates?.lng?.toString() || "",
      extraData: {
        clabServerUsername: "",
        fqdn: "",
        group: placement.group || "",
        level: placement.level || "",
        id: nodeId,
        image: "",
        index: "999",
        kind: nodeInfo.type,
        type: nodeInfo.type,
        labdir: "",
        labels: {},
        longname: nodeId,
        macAddress: "",
        mgmtIntf: "",
        mgmtIpv4AddressLength: 0,
        mgmtIpv4Address: "",
        mgmtIpv6Address: "",
        mgmtIpv6AddressLength: 0,
        mgmtNet: "",
        name: displayLabel,
        shortname: displayLabel,
        state: "",
        weight: "3",
        ...extraProps
      }
    },
    position: placement.position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: "special-endpoint"
  };
}

/**
 * Creates a SpecialNodeInfo from a network annotation type.
 */
function networkTypeToSpecialInfo(id: string, type: string, label?: string): SpecialNodeInfo {
  return {
    id,
    type: type as SpecialNodeInfo["type"],
    label: label || id
  };
}

/**
 * Adds cloud nodes from networkNodeAnnotations that don't have corresponding YAML links.
 * This allows network nodes to persist even when their links are deleted.
 */
function addOrphanedNetworkNodes(
  result: CyElement[],
  annotations?: TopologyAnnotations,
  specialNodes?: Map<string, SpecialNodeInfo>,
  specialNodeProps?: Map<string, Record<string, unknown>>
): void {
  const networkAnnotations = annotations?.networkNodeAnnotations;
  if (!networkAnnotations?.length) return;

  // Track which node IDs are already in result
  const existingIds = new Set(result.map((el) => el.data?.id).filter(Boolean));

  for (const annotation of networkAnnotations) {
    // Skip if already created from YAML links
    if (existingIds.has(annotation.id)) continue;
    if (specialNodes?.has(annotation.id)) continue;

    // Create cloud node from annotation
    const nodeInfo = networkTypeToSpecialInfo(annotation.id, annotation.type, annotation.label);
    const placement = extractNetworkPlacement(annotation);
    const extraProps = specialNodeProps?.get(annotation.id) || {};
    const cloudNodeEl = createCloudNodeElement(annotation.id, nodeInfo, placement, extraProps);
    result.push(cloudNodeEl);
  }
}

/**
 * Adds cloud nodes (special nodes) to the elements array.
 */
export function addCloudNodes(
  specialNodes: Map<string, SpecialNodeInfo>,
  specialNodeProps: Map<string, Record<string, unknown>>,
  annotations?: TopologyAnnotations,
  elements?: CyElement[],
  yamlNodeIds?: Set<string>
): CyElement[] {
  const result = elements ?? [];
  for (const [nodeId, nodeInfo] of specialNodes) {
    if (shouldSkipCloudNode(nodeId, nodeInfo, yamlNodeIds)) continue;

    const placement = resolveCloudNodePlacement(nodeId, annotations);
    const extraProps = specialNodeProps.get(nodeId) || {};
    const cloudNodeEl = createCloudNodeElement(nodeId, nodeInfo, placement, extraProps);
    result.push(cloudNodeEl);
  }

  // Also add network nodes from annotations that don't have YAML links
  addOrphanedNetworkNodes(result, annotations, specialNodes, specialNodeProps);

  return result;
}

/**
 * Checks if a node is a special node type (bridge, host, etc.).
 */
export function isSpecialNode(
  nodeId: string,
  specialNodes?: Map<string, SpecialNodeInfo>
): boolean {
  if (specialNodes?.has(nodeId)) return true;
  if (nodeId.startsWith("host:")) return true;
  if (nodeId.startsWith("mgmt-net:")) return true;
  if (nodeId.startsWith(PREFIX_MACVLAN)) return true;
  if (nodeId.startsWith(PREFIX_VXLAN_STITCH)) return true;
  if (nodeId.startsWith("vxlan:")) return true;
  if (nodeId.startsWith("dummy")) return true;
  return false;
}
