/**
 * Special node handler for host, mgmt-net, macvlan, vxlan, etc.
 */

import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topology';
import {
  TYPES,
  SpecialNodeType,
  PREFIX_MACVLAN,
  PREFIX_VXLAN_STITCH,
  NODE_KIND_BRIDGE,
  NODE_KIND_OVS_BRIDGE,
  DummyContext,
  splitEndpoint,
  normalizeLinkToTwoEndpoints,
} from './LinkParser';

export interface SpecialNodeInfo {
  type: SpecialNodeType;
  label: string;
}

/**
 * Initializes special nodes from the topology nodes (bridges).
 */
export function initSpecialNodes(nodes?: Record<string, ClabNode>): Map<string, SpecialNodeInfo> {
  const specialNodes = new Map<string, SpecialNodeInfo>();
  if (!nodes) return specialNodes;
  for (const [nodeName, nodeData] of Object.entries(nodes)) {
    if (nodeData.kind === NODE_KIND_BRIDGE || nodeData.kind === NODE_KIND_OVS_BRIDGE) {
      specialNodes.set(nodeName, { type: nodeData.kind as SpecialNodeType, label: nodeName });
    }
  }
  return specialNodes;
}

/**
 * Determines if a node is a special endpoint type.
 */
export function determineSpecialNode(
  node: string,
  iface: string
): { id: string; type: string; label: string } | null {
  if (node === 'host') return { id: `host:${iface}`, type: 'host', label: `host:${iface || 'host'}` };
  if (node === 'mgmt-net') return { id: `mgmt-net:${iface}`, type: 'mgmt-net', label: `mgmt-net:${iface || 'mgmt-net'}` };
  if (node.startsWith(PREFIX_MACVLAN)) return { id: node, type: 'macvlan', label: node };
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return { id: node, type: TYPES.VXLAN_STITCH, label: node };
  if (node.startsWith('vxlan:')) return { id: node, type: 'vxlan', label: node };
  if (node.startsWith('dummy')) return { id: node, type: 'dummy', label: node };
  return null;
}

/**
 * Registers an endpoint as a special node if applicable.
 */
export function registerEndpoint(
  specialNodes: Map<string, { type: string; label: string }>,
  end: unknown
): void {
  const { node, iface } = splitEndpoint(end as string | { node: string; interface?: string });
  const info = determineSpecialNode(node, iface);
  if (info) specialNodes.set(info.id, { type: info.type, label: info.label });
}

/**
 * Gets the special ID for an endpoint.
 */
export function getSpecialId(end: unknown): string | null {
  const { node, iface } = splitEndpoint(end as string | { node: string; interface?: string });
  if (node === 'host') return `host:${iface}`;
  if (node === 'mgmt-net') return `mgmt-net:${iface}`;
  if (node.startsWith(PREFIX_MACVLAN)) return node;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
  if (node.startsWith('vxlan:')) return node;
  if (node.startsWith('dummy')) return node;
  return null;
}

/**
 * Assigns common link properties to base props.
 */
export function assignCommonLinkProps(linkObj: Record<string, unknown>, baseProps: Record<string, unknown>): void {
  if (linkObj?.mtu !== undefined) baseProps.extMtu = linkObj.mtu;
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
  if (!['host', 'mgmt-net', 'macvlan'].includes(linkType)) return;
  if (linkObj?.['host-interface'] !== undefined) baseProps.extHostInterface = linkObj['host-interface'];
  if (linkType === 'macvlan' && linkObj?.mode !== undefined) baseProps.extMode = linkObj.mode;
}

/**
 * Assigns vxlan/vxlan-stitch specific properties.
 */
export function assignVxlanProps(
  linkType: string,
  linkObj: Record<string, unknown>,
  baseProps: Record<string, unknown>
): void {
  if (![TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as typeof TYPES.VXLAN)) return;
  if (linkObj?.remote !== undefined) baseProps.extRemote = linkObj.remote;
  if (linkObj?.vni !== undefined) baseProps.extVni = linkObj.vni;
  if (linkObj?.['dst-port'] !== undefined) baseProps.extDstPort = linkObj['dst-port'];
  if (linkObj?.['src-port'] !== undefined) baseProps.extSrcPort = linkObj['src-port'];
}

/**
 * Builds base properties for a special node.
 */
export function buildBaseProps(linkObj: Record<string, unknown>, linkType: string): Record<string, unknown> {
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
  const linkType = typeof linkObj?.type === 'string' ? String(linkObj.type) : '';
  if (!linkType || linkType === 'veth') return;

  const ids = [getSpecialId(endA), getSpecialId(endB)];
  const baseProps = buildBaseProps(linkObj, linkType);
  ids.forEach(id => {
    if (!id) return;
    const prev = specialNodeProps.get(id) || {};
    specialNodeProps.set(id, { ...prev, ...baseProps });
  });
}

/**
 * Collects special nodes from the topology.
 */
export function collectSpecialNodes(
  parsed: ClabTopology,
  ctx: DummyContext
): {
  specialNodes: Map<string, SpecialNodeInfo>;
  specialNodeProps: Map<string, Record<string, unknown>>;
} {
  const specialNodes = initSpecialNodes(parsed.topology?.nodes);
  const specialNodeProps: Map<string, Record<string, unknown>> = new Map();
  const links = parsed.topology?.links;
  if (!links) return { specialNodes, specialNodeProps };

  for (const linkObj of links) {
    const norm = normalizeLinkToTwoEndpoints(linkObj as Record<string, unknown>, ctx);
    if (!norm) continue;
    const { endA, endB } = norm;
    registerEndpoint(specialNodes, endA);
    registerEndpoint(specialNodes, endB);
    mergeSpecialNodeProps(linkObj as Record<string, unknown>, endA, endB, specialNodeProps);
  }

  return { specialNodes, specialNodeProps };
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
 * Resolves position and label from cloud node annotations.
 */
function resolveCloudNodePlacement(
  nodeId: string,
  annotations: Record<string, unknown> | undefined
): { position: { x: number; y: number }; label?: string } {
  let position = { x: 0, y: 0 };
  let label: string | undefined;
  const cloudAnns = (annotations as { cloudNodeAnnotations?: Array<{ id: string; position?: { x: number; y: number }; label?: string }> })?.cloudNodeAnnotations;
  if (!cloudAnns) return { position, label };

  const saved = cloudAnns.find((cn) => cn.id === nodeId);
  if (saved?.position) position = saved.position;
  if (saved?.label) label = saved.label;
  return { position, label };
}

/**
 * Creates a cloud node element.
 */
function createCloudNodeElement(
  nodeId: string,
  nodeInfo: SpecialNodeInfo,
  position: { x: number; y: number },
  extraProps: Record<string, unknown>,
  savedLabel?: string
): CyElement {
  const displayLabel = savedLabel || nodeInfo.label;
  return {
    group: 'nodes',
    data: {
      id: nodeId,
      weight: '30',
      name: displayLabel,
      topoViewerRole: 'cloud',
      lat: '',
      lng: '',
      extraData: {
        clabServerUsername: '',
        fqdn: '',
        group: '',
        id: nodeId,
        image: '',
        index: '999',
        kind: nodeInfo.type,
        type: nodeInfo.type,
        labdir: '',
        labels: {},
        longname: nodeId,
        macAddress: '',
        mgmtIntf: '',
        mgmtIpv4AddressLength: 0,
        mgmtIpv4Address: '',
        mgmtIpv6Address: '',
        mgmtIpv6AddressLength: 0,
        mgmtNet: '',
        name: displayLabel,
        shortname: displayLabel,
        state: '',
        weight: '3',
        ...extraProps,
      },
    },
    position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: 'special-endpoint',
  };
}

/**
 * Adds cloud nodes (special nodes) to the elements array.
 */
export function addCloudNodes(
  specialNodes: Map<string, SpecialNodeInfo>,
  specialNodeProps: Map<string, Record<string, unknown>>,
  opts: { annotations?: Record<string, unknown> },
  elements: CyElement[],
  yamlNodeIds?: Set<string>
): void {
  for (const [nodeId, nodeInfo] of specialNodes) {
    if (shouldSkipCloudNode(nodeId, nodeInfo, yamlNodeIds)) continue;

    const { position, label } = resolveCloudNodePlacement(nodeId, opts.annotations);
    const extraProps = specialNodeProps.get(nodeId) || {};
    const cloudNodeEl = createCloudNodeElement(nodeId, nodeInfo, position, extraProps, label);
    elements.push(cloudNodeEl);
  }
}
