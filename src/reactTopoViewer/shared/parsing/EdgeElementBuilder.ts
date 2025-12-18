/**
 * Edge element builder for creating Cytoscape edge elements.
 * Pure functions - no VS Code dependencies.
 */

import { ClabNode, CyElement, ClabTopology, TopologyAnnotations } from '../types/topology';
import { resolveNodeConfig } from './NodeConfigResolver';
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
} from './LinkNormalizer';
import { isDistributedSrosNode, findDistributedSrosInterface } from './DistributedSrosMapper';
import type {
  ContainerDataProvider,
  InterfaceInfo,
  DummyContext,
  SpecialNodeInfo,
  ParserLogger,
} from './types';
import { nullLogger } from './types';

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
    nodeName === 'host' ||
    nodeName === 'mgmt-net' ||
    nodeName.startsWith('macvlan:') ||
    nodeName.startsWith('vxlan:') ||
    nodeName.startsWith(PREFIX_VXLAN_STITCH) ||
    nodeName.startsWith('dummy')
  );
}

// ============================================================================
// Edge Class Computation
// ============================================================================

/**
 * Gets edge class from interface state.
 */
export function classFromState(ifaceData: { state?: string } | undefined): string {
  if (!ifaceData?.state) return '';
  return ifaceData.state === 'up' ? 'link-up' : 'link-down';
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
  return 'link-up';
}

/**
 * Computes edge class based on interface states.
 */
export function computeEdgeClass(
  sourceNode: string,
  targetNode: string,
  sourceIfaceData: { state?: string } | undefined,
  targetIfaceData: { state?: string } | undefined,
  topology: NonNullable<ClabTopology['topology']>
): string {
  const sourceNodeData = topology.nodes?.[sourceNode];
  const targetNodeData = topology.nodes?.[targetNode];
  const sourceIsSpecial = isSpecialNode(sourceNodeData, sourceNode);
  const targetIsSpecial = isSpecialNode(targetNodeData, targetNode);
  if (sourceIsSpecial || targetIsSpecial) {
    return edgeClassForSpecial(sourceIsSpecial, targetIsSpecial, sourceIfaceData, targetIfaceData);
  }
  if (sourceIfaceData?.state && targetIfaceData?.state) {
    return sourceIfaceData.state === 'up' && targetIfaceData.state === 'up'
      ? 'link-up'
      : 'link-down';
  }
  return '';
}

/**
 * Computes edge class from states (public API).
 */
export function computeEdgeClassFromStates(
  topology: NonNullable<ClabTopology['topology']>,
  sourceNode: string,
  targetNode: string,
  sourceState?: string,
  targetState?: string
): string {
  const sourceNodeData = topology.nodes?.[sourceNode];
  const targetNodeData = topology.nodes?.[targetNode];
  const sourceIsSpecial = isSpecialNode(sourceNodeData, sourceNode);
  const targetIsSpecial = isSpecialNode(targetNodeData, targetNode);
  if (sourceIsSpecial || targetIsSpecial) {
    return edgeClassForSpecial(
      sourceIsSpecial,
      targetIsSpecial,
      { state: sourceState },
      { state: targetState }
    );
  }
  if (sourceState && targetState) {
    return sourceState === 'up' && targetState === 'up' ? 'link-up' : 'link-down';
  }
  return '';
}

// ============================================================================
// Link Validation
// ============================================================================

/**
 * Validates a veth link.
 */
export function validateVethLink(linkObj: Record<string, unknown>): string[] {
  const eps = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
  const ok =
    eps.length >= 2 &&
    typeof eps[0] === 'object' &&
    typeof eps[1] === 'object' &&
    (eps[0] as Record<string, unknown>)?.node &&
    (eps[0] as Record<string, unknown>)?.interface !== undefined &&
    (eps[1] as Record<string, unknown>)?.node &&
    (eps[1] as Record<string, unknown>)?.interface !== undefined;
  return ok ? [] : ['invalid-veth-endpoints'];
}

/**
 * Validates a special link type.
 */
export function validateSpecialLink(
  linkType: string,
  linkObj: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const ep = linkObj.endpoint as Record<string, unknown> | undefined;
  if (!(ep && ep.node && ep.interface !== undefined)) errors.push('invalid-endpoint');
  if (['mgmt-net', 'host', 'macvlan'].includes(linkType) && !linkObj['host-interface']) {
    errors.push('missing-host-interface');
  }
  if ([TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as typeof TYPES.VXLAN)) {
    if (!linkObj.remote) errors.push('missing-remote');
    if (linkObj.vni === undefined || linkObj.vni === '') errors.push('missing-vni');
    if (linkObj['dst-port'] === undefined || linkObj['dst-port'] === '')
      errors.push('missing-dst-port');
  }
  return errors;
}

/**
 * Validates an extended link.
 */
export function validateExtendedLink(linkObj: Record<string, unknown>): string[] {
  const linkType = typeof linkObj?.type === 'string' ? linkObj.type : '';
  if (!linkType) return [];

  if (linkType === 'veth') {
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

  if (!includeContainerData || !containerDataProvider) {
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
    const distributedMatch = findDistributedSrosInterface({
      baseNodeName: nodeName,
      ifaceName,
      fullPrefix,
      labName,
      provider: containerDataProvider,
      components: ((resolvedNode as Record<string, unknown>).components as unknown[]) ?? [],
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
export function extractEdgeInterfaceStats(
  ifaceData: unknown
): Record<string, number> | undefined {
  if (!ifaceData || typeof ifaceData !== 'object') {
    return undefined;
  }

  const ifaceObj = ifaceData as { stats?: Record<string, unknown>; name?: string };
  const sourceStats = ifaceObj.stats ?? ifaceData;
  if (!sourceStats || typeof sourceStats !== 'object') {
    return undefined;
  }

  const keys = [
    'rxBps',
    'rxPps',
    'rxBytes',
    'rxPackets',
    'txBps',
    'txPps',
    'txBytes',
    'txPackets',
    'statsIntervalSeconds',
  ];

  const stats: Record<string, number> = {};
  for (const key of keys) {
    const value = (sourceStats as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
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
function extractIfaceProps(ifaceData?: InterfaceInfo): { mac: string; state: string; mtu: string | number; type: string } {
  return {
    mac: ifaceData?.mac ?? '',
    state: ifaceData?.state ?? '',
    mtu: ifaceData?.mtu ?? '',
    type: ifaceData?.type ?? '',
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
  const { sourceContainerName, targetContainerName, sourceIface, targetIface, sourceIfaceData, targetIfaceData } = params;

  const src = extractIfaceProps(sourceIfaceData);
  const tgt = extractIfaceProps(targetIfaceData);
  const sourceStats = extractEdgeInterfaceStats(sourceIfaceData);
  const targetStats = extractEdgeInterfaceStats(targetIfaceData);

  const info: Record<string, unknown> = {
    clabServerUsername: 'asad',
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
    type: extType = '',
    mtu: extMtu = '',
    vars: extVars,
    labels: extLabels,
    'host-interface': extHostInterface = '',
    mode: extMode = '',
    remote: extRemote = '',
    vni: extVni = '',
    'dst-port': extDstPort = '',
    'src-port': extSrcPort = '',
  } = linkObj ?? {};

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
  const endpoint = linkObj?.endpoint as Record<string, unknown> | undefined;
  return {
    extSourceMac: extractEndpointMac(endA),
    extTargetMac: extractEndpointMac(endB),
    extMac: endpoint?.mac ?? '',
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
  return { ...base, ...macs };
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
    specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode) ? ' stub-link' : '';
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

  const yamlFormat = typeof linkObj?.type === 'string' && linkObj.type ? 'extended' : 'short';
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
}): CyElement {
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

  const sourceEndpoint = shouldOmitEndpoint(sourceNode) ? '' : sourceIface;
  const targetEndpoint = shouldOmitEndpoint(targetNode) ? '' : targetIface;
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
    group: 'edges',
    data: {
      id: edgeId,
      weight: '3',
      name: edgeId,
      parent: '',
      topoViewerRole: 'link',
      sourceEndpoint,
      targetEndpoint,
      lat: '',
      lng: '',
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
  elements: CyElement[]
): void {
  const log = opts.logger ?? nullLogger;
  const topology = parsed.topology;
  if (!topology?.links) return;

  let linkIndex = 0;
  for (const linkObj of topology.links) {
    const norm = normalizeLinkToTwoEndpoints(linkObj as Record<string, unknown>, ctx);
    if (!norm) {
      log.warn('Link does not have both endpoints. Skipping.');
      continue;
    }
    const { endA, endB } = norm;
    const { node: sourceNode, iface: sourceIface } = splitEndpoint(
      endA as string | { node: string; interface?: string }
    );
    const { node: targetNode, iface: targetIface } = splitEndpoint(
      endB as string | { node: string; interface?: string }
    );
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
    const edgeClass = opts.includeContainerData
      ? computeEdgeClass(sourceNode, targetNode, sourceIfaceData, targetIfaceData, topology)
      : '';
    const edgeEl = buildEdgeElement({
      linkObj: linkObj as Record<string, unknown>,
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
