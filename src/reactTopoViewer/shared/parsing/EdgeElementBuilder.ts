/**
 * Edge element builder for creating parsed edge elements.
 * Pure functions - no VS Code dependencies.
 */

import type { ClabNode, ParsedElement, ClabTopology, TopologyAnnotations } from "../types/topology";

import { resolveNodeConfig } from "./NodeConfigResolver";
import {
  TYPES,
  PREFIX_VXLAN_STITCH,
  NODE_KIND_BRIDGE,
  NODE_KIND_OVS_BRIDGE,
  SINGLE_ENDPOINT_TYPE_LIST,
  splitEndpoint,
  normalizeLinkToTwoEndpoints,
  resolveActualNode,
  buildContainerName,
  shouldOmitEndpoint,
  extractEndpointMac,
} from "./LinkNormalizer";
import { isDistributedSrosNode, findDistributedSrosInterface } from "./DistributedSrosMapper";
import type {
  ContainerDataProvider,
  InterfaceInfo,
  DummyContext,
  SpecialNodeInfo,
  ParserLogger,
  NetemState,
} from "./types";
import { nullLogger } from "./types";

// ============================================================================
// Build Options
// ============================================================================

export interface EdgeBuildOptions {
  /** Include container runtime data */
  includeContainerData?: boolean;
  /** Container data provider for runtime enrichment */
  containerDataProvider?: ContainerDataProvider;
  /** Annotations */
  annotations?: TopologyAnnotations;
  /** Logger */
  logger?: ParserLogger;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEndpointObject(value: unknown): value is { node: string; interface?: string } {
  if (!isRecord(value)) return false;
  if (typeof value.node !== "string") return false;
  return value.interface === undefined || typeof value.interface === "string";
}

function isEndpointInput(value: unknown): value is string | { node: string; interface?: string } {
  return typeof value === "string" || isEndpointObject(value);
}

// ============================================================================
// Special Node Detection
// ============================================================================

/**
 * Checks if a node is a special node type.
 */
export function isSpecialNode(nodeData: ClabNode | undefined, nodeName: string): boolean {
  return (
    nodeData?.kind === NODE_KIND_BRIDGE ||
    nodeData?.kind === NODE_KIND_OVS_BRIDGE ||
    nodeName === "host" ||
    nodeName === "mgmt-net" ||
    nodeName.startsWith("macvlan:") ||
    nodeName.startsWith("vxlan:") ||
    nodeName.startsWith(PREFIX_VXLAN_STITCH) ||
    nodeName.startsWith("dummy")
  );
}

// ============================================================================
// Edge Class Computation
// ============================================================================

/**
 * Gets edge class from interface state.
 */
export function classFromState(ifaceData: { state?: string } | undefined): string {
  if (ifaceData?.state === undefined || ifaceData.state === "") return "";
  return ifaceData.state === "up" ? "link-up" : "link-down";
}

/**
 * Computes edge class for special nodes.
 */
export function edgeClassForSpecial(
  sourceIsSpecial: boolean,
  targetIsSpecial: boolean,
  sourceIfaceData: { state?: string } | undefined,
  targetIfaceData: { state?: string } | undefined
): string {
  if (sourceIsSpecial && !targetIsSpecial) {
    return classFromState(targetIfaceData);
  }
  if (!sourceIsSpecial && targetIsSpecial) {
    return classFromState(sourceIfaceData);
  }
  return "link-up";
}

/**
 * Checks if nodes are special and computes edge class for special nodes.
 */
function computeSpecialNodeEdgeClass(
  topology: NonNullable<ClabTopology["topology"]>,
  sourceNode: string,
  targetNode: string,
  sourceIfaceData: { state?: string } | undefined,
  targetIfaceData: { state?: string } | undefined
): string | null {
  const sourceNodeData = topology.nodes?.[sourceNode];
  const targetNodeData = topology.nodes?.[targetNode];
  const sourceIsSpecial = isSpecialNode(sourceNodeData, sourceNode);
  const targetIsSpecial = isSpecialNode(targetNodeData, targetNode);
  if (sourceIsSpecial || targetIsSpecial) {
    return edgeClassForSpecial(sourceIsSpecial, targetIsSpecial, sourceIfaceData, targetIfaceData);
  }
  return null;
}

/**
 * Computes edge class based on interface states.
 */
export function computeEdgeClass(
  sourceNode: string,
  targetNode: string,
  sourceIfaceData: { state?: string } | undefined,
  targetIfaceData: { state?: string } | undefined,
  topology: NonNullable<ClabTopology["topology"]>
): string {
  const specialClass = computeSpecialNodeEdgeClass(
    topology,
    sourceNode,
    targetNode,
    sourceIfaceData,
    targetIfaceData
  );
  if (specialClass !== null) {
    return specialClass;
  }
  if (
    sourceIfaceData?.state !== undefined &&
    sourceIfaceData.state !== "" &&
    targetIfaceData?.state !== undefined &&
    targetIfaceData.state !== ""
  ) {
    return sourceIfaceData.state === "up" && targetIfaceData.state === "up"
      ? "link-up"
      : "link-down";
  }
  return "";
}

/**
 * Computes edge class from states (public API).
 */
export function computeEdgeClassFromStates(
  topology: NonNullable<ClabTopology["topology"]>,
  sourceNode: string,
  targetNode: string,
  sourceState?: string,
  targetState?: string
): string {
  const specialClass = computeSpecialNodeEdgeClass(
    topology,
    sourceNode,
    targetNode,
    { state: sourceState },
    { state: targetState }
  );
  if (specialClass !== null) {
    return specialClass;
  }
  if (
    sourceState !== undefined &&
    sourceState !== "" &&
    targetState !== undefined &&
    targetState !== ""
  ) {
    return sourceState === "up" && targetState === "up" ? "link-up" : "link-down";
  }
  return "";
}

// ============================================================================
// Link Validation
// ============================================================================

/**
 * Validates a veth link.
 */
export function validateVethLink(linkObj: Record<string, unknown>): string[] {
  const eps: unknown[] = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
  const first = eps[0];
  const second = eps[1];
  const ok =
    eps.length >= 2 &&
    isEndpointObject(first) &&
    isEndpointObject(second) &&
    first.node !== "" &&
    first.interface !== undefined &&
    second.node !== "" &&
    second.interface !== undefined;
  return ok ? [] : ["invalid-veth-endpoints"];
}

/**
 * Validates a special link type.
 */
export function validateSpecialLink(linkType: string, linkObj: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const ep = linkObj.endpoint;
  const hostInterface = linkObj["host-interface"];
  const remote = linkObj.remote;
  if (!(isEndpointObject(ep) && ep.node !== "" && ep.interface !== undefined)) {
    errors.push("invalid-endpoint");
  }
  if (
    ["mgmt-net", "host", "macvlan"].includes(linkType) &&
    (typeof hostInterface !== "string" || hostInterface === "")
  ) {
    errors.push("missing-host-interface");
  }
  if (linkType === TYPES.VXLAN || linkType === TYPES.VXLAN_STITCH) {
    if (typeof remote !== "string" || remote === "") errors.push("missing-remote");
    if (linkObj.vni === undefined || linkObj.vni === "") errors.push("missing-vni");
    if (linkObj["dst-port"] === undefined || linkObj["dst-port"] === "")
      errors.push("missing-dst-port");
  }
  return errors;
}

/**
 * Validates an extended link.
 */
export function validateExtendedLink(linkObj: Record<string, unknown>): string[] {
  const linkType = typeof linkObj.type === "string" ? linkObj.type : "";
  if (linkType === "") return [];

  if (linkType === "veth") {
    return validateVethLink(linkObj);
  }

  if (SINGLE_ENDPOINT_TYPE_LIST.includes(linkType)) {
    return validateSpecialLink(linkType, linkObj);
  }

  return [];
}

// ============================================================================
// Container/Interface Resolution
// ============================================================================

/**
 * Resolves container and interface for an endpoint.
 */
export function resolveContainerAndInterface(params: {
  parsed: ClabTopology;
  nodeName: string;
  actualNodeName: string;
  ifaceName: string;
  fullPrefix: string;
  labName: string;
  includeContainerData?: boolean;
  containerDataProvider?: ContainerDataProvider;
  logger?: ParserLogger;
}): { containerName: string; ifaceData?: InterfaceInfo } {
  const {
    parsed,
    nodeName,
    actualNodeName,
    ifaceName,
    fullPrefix,
    labName,
    includeContainerData,
    containerDataProvider,
    logger,
  } = params;

  const log = logger ?? nullLogger;
  const containerName = buildContainerName(nodeName, actualNodeName, fullPrefix);

  if (includeContainerData !== true || containerDataProvider === undefined) {
    return { containerName };
  }

  const directIface = containerDataProvider.findInterface(containerName, ifaceName, labName);
  if (directIface) {
    return { containerName, ifaceData: directIface };
  }

  log.debug(`[EdgeBuilder] Interface not found: ${containerName}:${ifaceName} in lab ${labName}`);

  const topologyNode = parsed.topology?.nodes?.[nodeName] ?? {};
  const resolvedNode = resolveNodeConfig(parsed, topologyNode);

  if (isDistributedSrosNode(resolvedNode)) {
    const components = Array.isArray(resolvedNode.components) ? resolvedNode.components : [];
    const distributedMatch = findDistributedSrosInterface({
      baseNodeName: nodeName,
      ifaceName,
      fullPrefix,
      labName,
      provider: containerDataProvider,
      components,
    });
    if (distributedMatch) {
      return distributedMatch;
    }
  }

  return { containerName };
}

// ============================================================================
// Interface Stats Extraction
// ============================================================================

/**
 * Extracts interface stats for an edge.
 */
export function extractEdgeInterfaceStats(ifaceData: unknown): Record<string, number> | undefined {
  if (!isRecord(ifaceData)) {
    return undefined;
  }

  const sourceStats = isRecord(ifaceData.stats) ? ifaceData.stats : ifaceData;

  const keys = [
    "rxBps",
    "rxPps",
    "rxBytes",
    "rxPackets",
    "txBps",
    "txPps",
    "txBytes",
    "txPackets",
    "statsIntervalSeconds",
  ];

  const stats: Record<string, number> = {};
  for (const key of keys) {
    const value = sourceStats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      stats[key] = value;
    }
  }

  return Object.keys(stats).length > 0 ? stats : undefined;
}

// ============================================================================
// Edge Info Building
// ============================================================================

/**
 * Extracts interface properties with defaults.
 */
function extractIfaceProps(ifaceData?: InterfaceInfo): {
  mac: string;
  state: string;
  mtu: string | number;
  type: string;
  netemState: NetemState;
} {
  return {
    mac: ifaceData?.mac ?? "",
    state: ifaceData?.state ?? "",
    mtu: ifaceData?.mtu ?? "",
    type: ifaceData?.type ?? "",
    netemState: ifaceData?.netemState ?? {},
  };
}

/**
 * Creates clab info for an edge.
 */
export function createClabInfo(params: {
  sourceContainerName: string;
  targetContainerName: string;
  sourceIface: string;
  targetIface: string;
  sourceIfaceData?: InterfaceInfo;
  targetIfaceData?: InterfaceInfo;
}): Record<string, unknown> {
  const {
    sourceContainerName,
    targetContainerName,
    sourceIface,
    targetIface,
    sourceIfaceData,
    targetIfaceData,
  } = params;

  const src = extractIfaceProps(sourceIfaceData);
  const tgt = extractIfaceProps(targetIfaceData);
  const sourceStats = extractEdgeInterfaceStats(sourceIfaceData);
  const targetStats = extractEdgeInterfaceStats(targetIfaceData);

  const info: Record<string, unknown> = {
    clabServerUsername: "asad",
    clabSourceLongName: sourceContainerName,
    clabTargetLongName: targetContainerName,
    clabSourcePort: sourceIface,
    clabTargetPort: targetIface,
    clabSourceMacAddress: src.mac,
    clabTargetMacAddress: tgt.mac,
    clabSourceInterfaceState: src.state,
    clabTargetInterfaceState: tgt.state,
    clabSourceMtu: src.mtu,
    clabTargetMtu: tgt.mtu,
    clabSourceType: src.type,
    clabTargetType: tgt.type,
    clabSourceNetem: src.netemState,
    clabTargetNetem: tgt.netemState,
  };

  if (sourceStats) info.clabSourceStats = sourceStats;
  if (targetStats) info.clabTargetStats = targetStats;

  return info;
}

/**
 * Extracts extended link properties.
 */
export function extractExtLinkProps(linkObj: Record<string, unknown>): Record<string, unknown> {
  const {
    type: extType = "",
    mtu: extMtu = "",
    vars: extVars,
    labels: extLabels,
    "host-interface": extHostInterface = "",
    mode: extMode = "",
    remote: extRemote = "",
    vni: extVni = "",
    "dst-port": extDstPort = "",
    "src-port": extSrcPort = "",
  } = linkObj;

  return {
    extType,
    extMtu,
    extVars,
    extLabels,
    extHostInterface,
    extMode,
    extRemote,
    extVni,
    extDstPort,
    extSrcPort,
  };
}

/**
 * Extracts MAC addresses from endpoints.
 */
export function extractExtMacs(
  linkObj: Record<string, unknown>,
  endA: unknown,
  endB: unknown
): Record<string, unknown> {
  const endpoint = isRecord(linkObj.endpoint) ? linkObj.endpoint : undefined;
  return {
    extSourceMac: extractEndpointMac(endA),
    extTargetMac: extractEndpointMac(endB),
    extMac: endpoint?.mac ?? "",
  };
}

function endpointIp(endpoint: unknown, key: "ipv4" | "ipv6"): string {
  if (!isRecord(endpoint)) return "";
  const value = endpoint[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function indexedIp(linkObj: Record<string, unknown>, key: "ipv4" | "ipv6", index: number): string {
  const values: unknown[] = Array.isArray(linkObj[key]) ? linkObj[key] : [];
  if (values.length === 0) return "";
  const value = values[index];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * Extracts endpoint IP addresses from endpoint objects (extended format)
 * with fallback to ordered ipv4/ipv6 arrays (brief format).
 */
export function extractExtIps(
  linkObj: Record<string, unknown>,
  endA: unknown,
  endB: unknown
): Record<string, unknown> {
  return {
    extSourceIpv4: endpointIp(endA, "ipv4") || indexedIp(linkObj, "ipv4", 0),
    extSourceIpv6: endpointIp(endA, "ipv6") || indexedIp(linkObj, "ipv6", 0),
    extTargetIpv4: endpointIp(endB, "ipv4") || indexedIp(linkObj, "ipv4", 1),
    extTargetIpv6: endpointIp(endB, "ipv6") || indexedIp(linkObj, "ipv6", 1),
  };
}

/**
 * Creates extended info for an edge.
 */
export function createExtInfo(params: {
  linkObj: Record<string, unknown>;
  endA: unknown;
  endB: unknown;
}): Record<string, unknown> {
  const { linkObj, endA, endB } = params;
  const base = extractExtLinkProps(linkObj);
  const macs = extractExtMacs(linkObj, endA, endB);
  const ips = extractExtIps(linkObj, endA, endB);
  return { ...base, ...macs, ...ips };
}

// ============================================================================
// Edge Element Building
// ============================================================================

/**
 * Builds edge classes string.
 */
export function buildEdgeClasses(
  edgeClass: string,
  specialNodes: Map<string, SpecialNodeInfo>,
  actualSourceNode: string,
  actualTargetNode: string
): string {
  const stub =
    specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode) ? " stub-link" : "";
  return edgeClass + stub;
}

/**
 * Builds edge extra data.
 */
export function buildEdgeExtraData(params: {
  linkObj: Record<string, unknown>;
  endA: unknown;
  endB: unknown;
  sourceContainerName: string;
  targetContainerName: string;
  sourceIface: string;
  targetIface: string;
  sourceIfaceData: InterfaceInfo | undefined;
  targetIfaceData: InterfaceInfo | undefined;
  extValidationErrors: string[];
  sourceNodeId: string;
  targetNodeId: string;
}): Record<string, unknown> {
  const {
    linkObj,
    endA,
    endB,
    sourceContainerName,
    targetContainerName,
    sourceIface,
    targetIface,
    sourceIfaceData,
    targetIfaceData,
    extValidationErrors,
    sourceNodeId,
    targetNodeId,
  } = params;

  const yamlFormat = typeof linkObj.type === "string" && linkObj.type !== "" ? "extended" : "short";
  const extErrors = extValidationErrors.length ? extValidationErrors : undefined;

  const clabInfo = createClabInfo({
    sourceContainerName,
    targetContainerName,
    sourceIface,
    targetIface,
    sourceIfaceData,
    targetIfaceData,
  });

  const extInfo = createExtInfo({ linkObj, endA, endB });

  return {
    ...clabInfo,
    ...extInfo,
    yamlFormat,
    extValidationErrors: extErrors,
    yamlSourceNodeId: sourceNodeId,
    yamlTargetNodeId: targetNodeId,
  };
}

/**
 * Builds a single edge element.
 */
export function buildEdgeElement(params: {
  linkObj: Record<string, unknown>;
  endA: unknown;
  endB: unknown;
  sourceNode: string;
  targetNode: string;
  sourceIface: string;
  targetIface: string;
  actualSourceNode: string;
  actualTargetNode: string;
  sourceContainerName: string;
  targetContainerName: string;
  sourceIfaceData: InterfaceInfo | undefined;
  targetIfaceData: InterfaceInfo | undefined;
  edgeId: string;
  edgeClass: string;
  specialNodes: Map<string, SpecialNodeInfo>;
}): ParsedElement {
  const {
    linkObj,
    endA,
    endB,
    sourceNode,
    targetNode,
    sourceIface,
    targetIface,
    actualSourceNode,
    actualTargetNode,
    sourceContainerName,
    targetContainerName,
    sourceIfaceData,
    targetIfaceData,
    edgeId,
    edgeClass,
    specialNodes,
  } = params;

  const sourceEndpoint = shouldOmitEndpoint(sourceNode) ? "" : sourceIface;
  const targetEndpoint = shouldOmitEndpoint(targetNode) ? "" : targetIface;
  const classes = buildEdgeClasses(edgeClass, specialNodes, actualSourceNode, actualTargetNode);
  const extValidationErrors = validateExtendedLink(linkObj);
  const extraData = buildEdgeExtraData({
    linkObj,
    endA,
    endB,
    sourceContainerName,
    targetContainerName,
    sourceIface,
    targetIface,
    sourceIfaceData,
    targetIfaceData,
    extValidationErrors,
    sourceNodeId: sourceNode,
    targetNodeId: targetNode,
  });

  return {
    group: "edges",
    data: {
      id: edgeId,
      weight: "3",
      name: edgeId,
      parent: "",
      topoViewerRole: "link",
      sourceEndpoint,
      targetEndpoint,
      lat: "",
      lng: "",
      source: actualSourceNode,
      target: actualTargetNode,
      extraData,
    },
    position: { x: 0, y: 0 },
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes,
  };
}

/**
 * Adds edge elements to the elements array.
 */
export function addEdgeElements(
  parsed: ClabTopology,
  opts: EdgeBuildOptions,
  fullPrefix: string,
  labName: string,
  specialNodes: Map<string, SpecialNodeInfo>,
  ctx: DummyContext,
  elements: ParsedElement[]
): void {
  const log = opts.logger ?? nullLogger;
  const topology = parsed.topology;
  if (!topology?.links) return;

  let linkIndex = 0;
  for (const linkObj of topology.links) {
    const linkRecord: Record<string, unknown> = { ...linkObj };
    const norm = normalizeLinkToTwoEndpoints(linkRecord, ctx);
    if (!norm) {
      log.warn("Link does not have both endpoints. Skipping.");
      continue;
    }
    const { endA, endB } = norm;
    if (!isEndpointInput(endA) || !isEndpointInput(endB)) {
      log.warn("Link endpoints are not in a recognized format. Skipping.");
      continue;
    }
    const { node: sourceNode, iface: sourceIface } = splitEndpoint(endA);
    const { node: targetNode, iface: targetIface } = splitEndpoint(endB);
    const actualSourceNode = resolveActualNode(sourceNode, sourceIface);
    const actualTargetNode = resolveActualNode(targetNode, targetIface);
    const sourceInfo = resolveContainerAndInterface({
      parsed,
      nodeName: sourceNode,
      actualNodeName: actualSourceNode,
      ifaceName: sourceIface,
      fullPrefix,
      labName,
      includeContainerData: opts.includeContainerData,
      containerDataProvider: opts.containerDataProvider,
      logger: opts.logger,
    });
    const targetInfo = resolveContainerAndInterface({
      parsed,
      nodeName: targetNode,
      actualNodeName: actualTargetNode,
      ifaceName: targetIface,
      fullPrefix,
      labName,
      includeContainerData: opts.includeContainerData,
      containerDataProvider: opts.containerDataProvider,
      logger: opts.logger,
    });
    const { containerName: sourceContainerName, ifaceData: sourceIfaceData } = sourceInfo;
    const { containerName: targetContainerName, ifaceData: targetIfaceData } = targetInfo;
    const edgeId = `Clab-Link${linkIndex}`;
    const edgeClass =
      opts.includeContainerData === true
        ? computeEdgeClass(sourceNode, targetNode, sourceIfaceData, targetIfaceData, topology)
        : "";
    const edgeEl = buildEdgeElement({
      linkObj: linkRecord,
      endA,
      endB,
      sourceNode,
      targetNode,
      sourceIface,
      targetIface,
      actualSourceNode,
      actualTargetNode,
      sourceContainerName,
      targetContainerName,
      sourceIfaceData,
      targetIfaceData,
      edgeId,
      edgeClass,
      specialNodes,
    });
    elements.push(edgeEl);
    linkIndex++;
  }
}
