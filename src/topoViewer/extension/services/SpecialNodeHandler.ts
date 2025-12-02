// file: src/topoViewer/extension/services/SpecialNodeHandler.ts

import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topoViewerType';
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
export function determineSpecialNode(node: string, iface: string): { id: string; type: string; label: string } | null {
  if (node === 'host') return { id: `host:${iface}`, type: 'host', label: `host:${iface || 'host'}` };
  if (node === 'mgmt-net') return { id: `mgmt-net:${iface}`, type: 'mgmt-net', label: `mgmt-net:${iface || 'mgmt-net'}` };
  if (node.startsWith(PREFIX_MACVLAN)) return { id: node, type: 'macvlan', label: node };
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return { id: node, type: TYPES.VXLAN_STITCH, label: node };
  if (node.startsWith('vxlan:')) return { id: node, type: 'vxlan', label: node };
  if (node.startsWith('dummy')) return { id: node, type: 'dummy', label: 'dummy' };
  return null;
}

/**
 * Registers an endpoint as a special node if applicable.
 */
export function registerEndpoint(
  specialNodes: Map<string, { type: string; label: string }>,
  end: any
): void {
  const { node, iface } = splitEndpoint(end);
  const info = determineSpecialNode(node, iface);
  if (info) specialNodes.set(info.id, { type: info.type, label: info.label });
}

/**
 * Gets the special ID for an endpoint.
 */
export function getSpecialId(end: any): string | null {
  const { node, iface } = splitEndpoint(end);
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
export function assignCommonLinkProps(linkObj: any, baseProps: any): void {
  if (linkObj?.mtu !== undefined) baseProps.extMtu = linkObj.mtu;
  if (linkObj?.vars !== undefined) baseProps.extVars = linkObj.vars;
  if (linkObj?.labels !== undefined) baseProps.extLabels = linkObj.labels;
}

/**
 * Assigns host/mgmt-net specific properties.
 */
export function assignHostMgmtProps(linkType: string, linkObj: any, baseProps: any): void {
  if (!['host', 'mgmt-net', 'macvlan'].includes(linkType)) return;
  if (linkObj?.['host-interface'] !== undefined) baseProps.extHostInterface = linkObj['host-interface'];
  if (linkType === 'macvlan' && linkObj?.mode !== undefined) baseProps.extMode = linkObj.mode;
}

/**
 * Assigns vxlan/vxlan-stitch specific properties.
 */
export function assignVxlanProps(linkType: string, linkObj: any, baseProps: any): void {
  if (![TYPES.VXLAN, TYPES.VXLAN_STITCH].includes(linkType as any)) return;
  if (linkObj?.remote !== undefined) baseProps.extRemote = linkObj.remote;
  if (linkObj?.vni !== undefined) baseProps.extVni = linkObj.vni;
  if (linkObj?.['udp-port'] !== undefined) baseProps.extUdpPort = linkObj['udp-port'];
}

/**
 * Builds base properties for a special node.
 */
export function buildBaseProps(linkObj: any, linkType: string): any {
  const baseProps: any = { extType: linkType };
  assignCommonLinkProps(linkObj, baseProps);
  assignHostMgmtProps(linkType, linkObj, baseProps);
  assignVxlanProps(linkType, linkObj, baseProps);
  const epMac = linkObj?.endpoint?.mac;
  if (epMac !== undefined) baseProps.extMac = epMac;
  return baseProps;
}

/**
 * Merges special node properties from a link object.
 */
export function mergeSpecialNodeProps(
  linkObj: any,
  endA: any,
  endB: any,
  specialNodeProps: Map<string, any>
): void {
  const linkType = typeof linkObj?.type === 'string' ? String(linkObj.type) : '';
  if (!linkType || linkType === 'veth') return;

  const ids = [getSpecialId(endA), getSpecialId(endB)];
  const baseProps: any = buildBaseProps(linkObj, linkType);
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
  specialNodeProps: Map<string, any>;
} {
  const specialNodes = initSpecialNodes(parsed.topology?.nodes);
  const specialNodeProps: Map<string, any> = new Map();
  const links = parsed.topology?.links;
  if (!links) return { specialNodes, specialNodeProps };

  for (const linkObj of links) {
    const norm = normalizeLinkToTwoEndpoints(linkObj, ctx);
    if (!norm) continue;
    const { endA, endB } = norm;
    registerEndpoint(specialNodes, endA);
    registerEndpoint(specialNodes, endB);
    mergeSpecialNodeProps(linkObj, endA, endB, specialNodeProps);
  }

  return { specialNodes, specialNodeProps };
}

/**
 * Adds cloud nodes (special nodes) to the elements array.
 */
export function addCloudNodes(
  specialNodes: Map<string, SpecialNodeInfo>,
  specialNodeProps: Map<string, any>,
  opts: { annotations?: any },
  elements: CyElement[]
): void {
  for (const [nodeId, nodeInfo] of specialNodes) {
    let position = { x: 0, y: 0 };
    let parent: string | undefined;
    if (opts.annotations?.cloudNodeAnnotations) {
      const savedCloudNode = opts.annotations.cloudNodeAnnotations.find((cn: any) => cn.id === nodeId);
      if (savedCloudNode) {
        if (savedCloudNode.position) position = savedCloudNode.position;
        if (savedCloudNode.group && savedCloudNode.level) parent = `${savedCloudNode.group}:${savedCloudNode.level}`;
      }
    }
    const cloudNodeEl: CyElement = {
      group: 'nodes',
      data: {
        id: nodeId,
        weight: '30',
        name: nodeInfo.label,
        parent,
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
          name: nodeInfo.label,
          shortname: nodeInfo.label,
          state: '',
          weight: '3',
          ...(specialNodeProps.get(nodeId) || {}),
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
    elements.push(cloudNodeEl);
  }
}
