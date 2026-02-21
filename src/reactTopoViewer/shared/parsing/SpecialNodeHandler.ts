/**
 * Special node handler for host, mgmt-net, macvlan, vxlan, etc.
 * Pure functions - no VS Code dependencies.
 */

import type {
  ClabNode,
  ParsedElement,
  ClabTopology,
  NetworkNodeAnnotation,
  TopologyAnnotations,
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
  createDummyContext,
} from "./LinkNormalizer";
import type { DummyContext, SpecialNodeInfo } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEndpointInput(value: unknown): value is string | { node: string; interface?: string } {
  if (typeof value === "string") return true;
  if (!isRecord(value)) return false;
  if (typeof value.node !== "string") return false;
  return value.interface === undefined || typeof value.interface === "string";
}

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
    if (nodeData.kind === NODE_KIND_BRIDGE || nodeData.kind === NODE_KIND_OVS_BRIDGE) {
      specialNodes.set(nodeName, {
        id: nodeName,
        type: nodeData.kind === NODE_KIND_BRIDGE ? NODE_KIND_BRIDGE : NODE_KIND_OVS_BRIDGE,
        label: nodeName,
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
  if (!isEndpointInput(end)) return;
  const { node, iface } = splitEndpoint(end);
  const info = determineSpecialNode(node, iface);
  if (info) {
    specialNodes.set(info.id, { id: info.id, type: info.type, label: info.label });
  } else if (
    iface === "" &&
    (topologyNodeNames === undefined || !topologyNodeNames.has(node)) &&
    !specialNodes.has(node)
  ) {
    // Bare endpoint not in topology nodes - treat as implicit bridge
    specialNodes.set(node, {
      id: node,
      type: NODE_KIND_BRIDGE,
      label: node,
    });
  }
}

/**
 * Gets the special ID for an endpoint.
 */
export function getSpecialId(end: unknown): string | null {
  if (!isEndpointInput(end)) return null;
  const { node, iface } = splitEndpoint(end);
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
  if (linkObj.mtu !== undefined) baseProps.extMtu = toStr(linkObj.mtu);
  if (linkObj.vars !== undefined) baseProps.extVars = linkObj.vars;
  if (linkObj.labels !== undefined) baseProps.extLabels = linkObj.labels;
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
  if (linkObj["host-interface"] !== undefined)
    baseProps.extHostInterface = linkObj["host-interface"];
  if (linkType === "macvlan" && linkObj.mode !== undefined) baseProps.extMode = linkObj.mode;
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
  if (linkType !== TYPES.VXLAN && linkType !== TYPES.VXLAN_STITCH) return;
  if (linkObj.remote !== undefined) baseProps.extRemote = toStr(linkObj.remote);
  if (linkObj.vni !== undefined) baseProps.extVni = toStr(linkObj.vni);
  if (linkObj["dst-port"] !== undefined) baseProps.extDstPort = toStr(linkObj["dst-port"]);
  if (linkObj["src-port"] !== undefined) baseProps.extSrcPort = toStr(linkObj["src-port"]);
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
  const endpoint = isRecord(linkObj.endpoint) ? linkObj.endpoint : undefined;
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
  const linkType = typeof linkObj.type === "string" ? String(linkObj.type) : "";
  if (linkType === "" || linkType === "veth") return;

  const ids = [getSpecialId(endA), getSpecialId(endB)];
  const baseProps = buildBaseProps(linkObj, linkType);
  ids.forEach((id) => {
    if (id === null || id === "") return;
    const prev = specialNodeProps.get(id) ?? {};
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
  const topologyNodeNames = new Set(Object.keys(parsed.topology?.nodes ?? {}));

  for (const linkObj of links) {
    const linkRecord: Record<string, unknown> = { ...linkObj };
    const norm = normalizeLinkToTwoEndpoints(linkRecord, dummyCtx);
    if (!norm) continue;
    const { endA, endB } = norm;
    registerEndpoint(specialNodes, endA, topologyNodeNames);
    registerEndpoint(specialNodes, endB, topologyNodeNames);
    mergeSpecialNodeProps(linkRecord, endA, endB, specialNodeProps);
  }

  return { specialNodes, specialNodeProps };
}

// ============================================================================
// Network Node Creation
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
function shouldSkipNetworkNode(
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
    position: saved.position,
    label: saved.label,
    geoCoordinates: saved.geoCoordinates,
    group: saved.group,
    level: saved.level,
  };
}

/**
 * Resolves position and label from network node annotations.
 */
function resolveNetworkNodePlacement(
  nodeId: string,
  annotations?: TopologyAnnotations
): PlacementResult {
  const networkSaved = annotations?.networkNodeAnnotations?.find((nn) => nn.id === nodeId);
  if (networkSaved) {
    return extractNetworkPlacement(networkSaved);
  }

  return { position: { x: 0, y: 0 } };
}

/**
 * Creates a network node element.
 */
function createNetworkNodeElement(
  nodeId: string,
  nodeInfo: SpecialNodeInfo,
  placement: PlacementResult,
  extraProps: Record<string, unknown>
): ParsedElement {
  const displayLabel = placement.label ?? nodeInfo.label ?? nodeId;
  return {
    group: "nodes",
    data: {
      id: nodeId,
      weight: "30",
      name: displayLabel,
      topoViewerRole: nodeInfo.type as string,
      lat: placement.geoCoordinates?.lat.toString() ?? "",
      lng: placement.geoCoordinates?.lng.toString() ?? "",
      extraData: {
        clabServerUsername: "",
        fqdn: "",
        group: placement.group ?? "",
        level: placement.level ?? "",
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
        ...extraProps,
      },
    },
    position: placement.position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: "special-endpoint",
  };
}

/**
 * Creates a SpecialNodeInfo from a network annotation type.
 */
function networkTypeToSpecialInfo(
  id: string,
  type: SpecialNodeInfo["type"],
  label?: string
): SpecialNodeInfo {
  return {
    id,
    type,
    label: label ?? id,
  };
}

/**
 * Adds network nodes from networkNodeAnnotations that don't have corresponding YAML links.
 * This allows network nodes to persist even when their links are deleted.
 */
function addOrphanedNetworkNodes(
  result: ParsedElement[],
  annotations?: TopologyAnnotations,
  specialNodes?: Map<string, SpecialNodeInfo>,
  specialNodeProps?: Map<string, Record<string, unknown>>
): void {
  const networkAnnotations = annotations?.networkNodeAnnotations;
  if (networkAnnotations === undefined || networkAnnotations.length === 0) return;

  // Track which node IDs are already in result
  const existingIds = new Set(
    result.map((el) => (typeof el.data.id === "string" ? el.data.id : "")).filter((id) => id !== "")
  );

  for (const annotation of networkAnnotations) {
    // Skip if already created from YAML links
    if (existingIds.has(annotation.id)) continue;
    if (specialNodes !== undefined && specialNodes.has(annotation.id)) continue;

    // Create network node from annotation
    const nodeInfo = networkTypeToSpecialInfo(annotation.id, annotation.type, annotation.label);
    const placement = extractNetworkPlacement(annotation);
    const extraProps = specialNodeProps?.get(annotation.id) ?? {};
    const networkNodeEl = createNetworkNodeElement(annotation.id, nodeInfo, placement, extraProps);
    result.push(networkNodeEl);
  }
}

/**
 * Adds network nodes (special nodes) to the elements array.
 */
export function addNetworkNodes(
  specialNodes: Map<string, SpecialNodeInfo>,
  specialNodeProps: Map<string, Record<string, unknown>>,
  annotations?: TopologyAnnotations,
  elements?: ParsedElement[],
  yamlNodeIds?: Set<string>
): ParsedElement[] {
  const result = elements ?? [];
  for (const [nodeId, nodeInfo] of specialNodes) {
    if (shouldSkipNetworkNode(nodeId, nodeInfo, yamlNodeIds)) continue;

    const placement = resolveNetworkNodePlacement(nodeId, annotations);
    const extraProps = specialNodeProps.get(nodeId) ?? {};
    const networkNodeEl = createNetworkNodeElement(nodeId, nodeInfo, placement, extraProps);
    result.push(networkNodeEl);
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
  if (specialNodes !== undefined && specialNodes.has(nodeId)) return true;
  if (nodeId.startsWith("host:")) return true;
  if (nodeId.startsWith("mgmt-net:")) return true;
  if (nodeId.startsWith(PREFIX_MACVLAN)) return true;
  if (nodeId.startsWith(PREFIX_VXLAN_STITCH)) return true;
  if (nodeId.startsWith("vxlan:")) return true;
  if (nodeId.startsWith("dummy")) return true;
  return false;
}
