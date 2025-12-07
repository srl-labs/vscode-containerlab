// file: src/topoViewer/extension/services/EdgeElementBuilder.ts

import { log } from '../../webview/platform/logging/logger';
import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topoViewerType';
import { ClabLabTreeNode, ClabInterfaceTreeNode } from "../../../treeView/common";
import { resolveNodeConfig } from '../../webview/core/nodeConfig';
import { findInterfaceNode } from './TreeUtils';
import {
  TYPES,
  SpecialNodeType,
  PREFIX_VXLAN_STITCH,
  NODE_KIND_BRIDGE,
  NODE_KIND_OVS_BRIDGE,
  SINGLE_ENDPOINT_TYPES,
  DummyContext,
  splitEndpoint,
  normalizeLinkToTwoEndpoints,
  resolveActualNode,
  buildContainerName,
  shouldOmitEndpoint,
  extractEndpointMac,
} from './LinkParser';
import { isDistributedSrosNode, findDistributedSrosInterface } from './DistributedSrosHandler';

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

/**
 * Gets edge class from interface state.
 */
export function classFromState(ifaceData: any | undefined): string {
  if (!ifaceData?.state) return '';
  return ifaceData.state === 'up' ? 'link-up' : 'link-down';
}

/**
 * Computes edge class for special nodes.
 */
export function edgeClassForSpecial(
  sourceIsSpecial: boolean,
  targetIsSpecial: boolean,
  sourceIfaceData: any | undefined,
  targetIfaceData: any | undefined
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
  sourceIfaceData: any | undefined,
  targetIfaceData: any | undefined,
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
    return sourceIfaceData.state === 'up' && targetIfaceData.state === 'up' ? 'link-up' : 'link-down';
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

/**
 * Validates a veth link.
 */
export function validateVethLink(linkObj: any): string[] {
  const eps = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
  const ok =
    eps.length >= 2 &&
    typeof eps[0] === 'object' &&
    typeof eps[1] === 'object' &&
    eps[0]?.node &&
    eps[0]?.interface !== undefined &&
    eps[1]?.node &&
    eps[1]?.interface !== undefined;
  return ok ? [] : ['invalid-veth-endpoints'];
}

/**
 * Validates a special link type.
 */
export function validateSpecialLink(linkType: string, linkObj: any): string[] {
  const errors: string[] = [];
  const ep = linkObj.endpoint;
  if (!(ep && ep.node && ep.interface !== undefined)) errors.push('invalid-endpoint');
  if (['mgmt-net', 'host', 'macvlan'].includes(linkType) && !linkObj['host-interface']) {
    errors.push('missing-host-interface');
  }
  if ([TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as any)) {
    if (!linkObj.remote) errors.push('missing-remote');
    if (linkObj.vni === undefined || linkObj.vni === '') errors.push('missing-vni');
    if (linkObj['dst-port'] === undefined || linkObj['dst-port'] === '') errors.push('missing-dst-port');
  }
  return errors;
}

/**
 * Validates an extended link.
 */
export function validateExtendedLink(linkObj: any): string[] {
  const linkType = typeof linkObj?.type === 'string' ? linkObj.type : '';
  if (!linkType) return [];

  if (linkType === 'veth') {
    return validateVethLink(linkObj);
  }

  if (SINGLE_ENDPOINT_TYPES.includes(linkType)) {
    return validateSpecialLink(linkType, linkObj);
  }

  return [];
}

/**
 * Resolves container and interface for an endpoint.
 */
export function resolveContainerAndInterface(params: {
  parsed: ClabTopology;
  nodeName: string;
  actualNodeName: string;
  ifaceName: string;
  fullPrefix: string;
  clabName: string;
  includeContainerData: boolean;
  clabTreeData?: Record<string, ClabLabTreeNode>;
}): { containerName: string; ifaceData?: ClabInterfaceTreeNode } {
  const {
    parsed,
    nodeName,
    actualNodeName,
    ifaceName,
    fullPrefix,
    clabName,
    includeContainerData,
    clabTreeData,
  } = params;

  const containerName = buildContainerName(nodeName, actualNodeName, fullPrefix);

  if (!includeContainerData) {
    return { containerName };
  }

  const directIface = findInterfaceNode(clabTreeData ?? {}, containerName, ifaceName, clabName);
  if (directIface) {
    return { containerName, ifaceData: directIface };
  }

  const topologyNode = parsed.topology?.nodes?.[nodeName] ?? {};
  const resolvedNode = resolveNodeConfig(parsed, topologyNode || {});

  if (isDistributedSrosNode(resolvedNode)) {
    const distributedMatch = findDistributedSrosInterface({
      baseNodeName: nodeName,
      ifaceName,
      fullPrefix,
      clabName,
      clabTreeData,
      components: resolvedNode.components ?? [],
    });
    if (distributedMatch) {
      return distributedMatch;
    }
  }

  return { containerName };
}

/**
 * Extracts interface stats for an edge.
 */
export function extractEdgeInterfaceStats(ifaceData: any): Record<string, number> | undefined {
  if (!ifaceData || typeof ifaceData !== 'object') {
    return undefined;
  }

  const sourceStats = (ifaceData as { stats?: Record<string, unknown> }).stats || ifaceData;
  if (!sourceStats || typeof sourceStats !== 'object') {
    return undefined;
  }

  const keys: Array<keyof Record<string, unknown>> = [
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
    const value = (sourceStats as Record<string, unknown>)[key as string];
    if (typeof value === 'number' && Number.isFinite(value)) {
      stats[key as string] = value;
    }
  }

  return Object.keys(stats).length > 0 ? stats : undefined;
}

/**
 * Creates clab info for an edge.
 */
export function createClabInfo(params: {
  sourceContainerName: string;
  targetContainerName: string;
  sourceIface: string;
  targetIface: string;
  sourceIfaceData?: any;
  targetIfaceData?: any;
}): any {
  const {
    sourceContainerName,
    targetContainerName,
    sourceIface,
    targetIface,
    sourceIfaceData = {},
    targetIfaceData = {},
  } = params;

  const {
    mac: srcMac = '',
    state: srcState = '',
    mtu: srcMtu = '',
    type: srcType = '',
  } = sourceIfaceData;

  const {
    mac: tgtMac = '',
    state: tgtState = '',
    mtu: tgtMtu = '',
    type: tgtType = '',
  } = targetIfaceData;

  const sourceStats = extractEdgeInterfaceStats(sourceIfaceData);
  const targetStats = extractEdgeInterfaceStats(targetIfaceData);

  const info: Record<string, unknown> = {
    clabServerUsername: 'asad',
    clabSourceLongName: sourceContainerName,
    clabTargetLongName: targetContainerName,
    clabSourcePort: sourceIface,
    clabTargetPort: targetIface,
    clabSourceMacAddress: srcMac,
    clabTargetMacAddress: tgtMac,
    clabSourceInterfaceState: srcState,
    clabTargetInterfaceState: tgtState,
    clabSourceMtu: srcMtu,
    clabTargetMtu: tgtMtu,
    clabSourceType: srcType,
    clabTargetType: tgtType,
  };

  if (sourceStats) {
    info.clabSourceStats = sourceStats;
  }
  if (targetStats) {
    info.clabTargetStats = targetStats;
  }

  return info;
}

/**
 * Extracts extended link properties.
 */
export function extractExtLinkProps(linkObj: any): any {
  const {
    type: extType = '',
    mtu: extMtu = '',
    vars: extVars,
    labels: extLabels,
    ['host-interface']: extHostInterface = '',
    mode: extMode = '',
    remote: extRemote = '',
    vni: extVni = '',
    ['dst-port']: extDstPort = '',
    ['src-port']: extSrcPort = '',
  } = linkObj ?? {};

  return { extType, extMtu, extVars, extLabels, extHostInterface, extMode, extRemote, extVni, extDstPort, extSrcPort };
}

/**
 * Extracts MAC addresses from endpoints.
 */
export function extractExtMacs(linkObj: any, endA: any, endB: any): any {
  return {
    extSourceMac: extractEndpointMac(endA),
    extTargetMac: extractEndpointMac(endB),
    extMac: (linkObj as any)?.endpoint?.mac ?? '',
  };
}

/**
 * Creates extended info for an edge.
 */
export function createExtInfo(params: { linkObj: any; endA: any; endB: any }): any {
  const { linkObj, endA, endB } = params;
  const base = extractExtLinkProps(linkObj);
  const macs = extractExtMacs(linkObj, endA, endB);
  return { ...base, ...macs };
}

/**
 * Builds edge classes string.
 */
export function buildEdgeClasses(
  edgeClass: string,
  specialNodes: Map<string, { type: string; label: string }>,
  actualSourceNode: string,
  actualTargetNode: string
): string {
  const stub =
    specialNodes.has(actualSourceNode) || specialNodes.has(actualTargetNode)
      ? ' stub-link'
      : '';
  return edgeClass + stub;
}

/**
 * Builds edge extra data.
 */
export function buildEdgeExtraData(params: {
  linkObj: any;
  endA: any;
  endB: any;
  sourceContainerName: string;
  targetContainerName: string;
  sourceIface: string;
  targetIface: string;
  sourceIfaceData: any;
  targetIfaceData: any;
  extValidationErrors: string[];
  sourceNodeId: string;
  targetNodeId: string;
}): any {
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
  linkObj: any;
  endA: any;
  endB: any;
  sourceNode: string;
  targetNode: string;
  sourceIface: string;
  targetIface: string;
  actualSourceNode: string;
  actualTargetNode: string;
  sourceContainerName: string;
  targetContainerName: string;
  sourceIfaceData: any;
  targetIfaceData: any;
  edgeId: string;
  edgeClass: string;
  specialNodes: Map<string, { type: string; label: string }>;
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
  opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> },
  fullPrefix: string,
  clabName: string,
  specialNodes: Map<string, { type: SpecialNodeType; label: string }>,
  ctx: DummyContext,
  elements: CyElement[]
): void {
  const topology = parsed.topology!;
  if (!topology.links) return;
  let linkIndex = 0;
  for (const linkObj of topology.links) {
    const norm = normalizeLinkToTwoEndpoints(linkObj, ctx);
    if (!norm) {
      log.warn('Link does not have both endpoints. Skipping.');
      continue;
    }
    const { endA, endB } = norm;
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
      clabName,
      includeContainerData: opts.includeContainerData,
      clabTreeData: opts.clabTreeData,
    });
    const targetInfo = resolveContainerAndInterface({
      parsed,
      nodeName: targetNode,
      actualNodeName: actualTargetNode,
      ifaceName: targetIface,
      fullPrefix,
      clabName,
      includeContainerData: opts.includeContainerData,
      clabTreeData: opts.clabTreeData,
    });
    const { containerName: sourceContainerName, ifaceData: sourceIfaceData } = sourceInfo;
    const { containerName: targetContainerName, ifaceData: targetIfaceData } = targetInfo;
    const edgeId = `Clab-Link${linkIndex}`;
    const edgeClass = opts.includeContainerData
      ? computeEdgeClass(sourceNode, targetNode, sourceIfaceData, targetIfaceData, topology)
      : '';
    const edgeEl = buildEdgeElement({
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
    });
    elements.push(edgeEl);
    linkIndex++;
  }
}
