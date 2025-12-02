// file: src/topoViewer/extension/services/LinkParser.ts

/**
 * Constants and utilities for parsing containerlab link endpoints.
 */

export const TYPES = {
  HOST: 'host',
  MGMT_NET: 'mgmt-net',
  MACVLAN: 'macvlan',
  VXLAN: 'vxlan',
  VXLAN_STITCH: 'vxlan-stitch',
  BRIDGE: 'bridge',
  OVS_BRIDGE: 'ovs-bridge',
  DUMMY: 'dummy',
} as const;

export type SpecialNodeType = typeof TYPES[keyof typeof TYPES];

export const PREFIX_MACVLAN = 'macvlan:';
export const PREFIX_VXLAN = 'vxlan:';
export const PREFIX_VXLAN_STITCH = 'vxlan-stitch:';
export const PREFIX_DUMMY = 'dummy';
export const STR_HOST = 'host';
export const STR_MGMT_NET = 'mgmt-net';
export const NODE_KIND_BRIDGE = TYPES.BRIDGE;
export const NODE_KIND_OVS_BRIDGE = TYPES.OVS_BRIDGE;
export const SINGLE_ENDPOINT_TYPES = [STR_HOST, STR_MGMT_NET, TYPES.MACVLAN, TYPES.DUMMY, TYPES.VXLAN, TYPES.VXLAN_STITCH];

export type DummyContext = { dummyCounter: number; dummyLinkMap: Map<any, string> };

export interface EndpointParts {
  node: string;
  iface: string;
}

export interface NormalizedLink {
  endA: any;
  endB: any;
  type?: string;
}

/**
 * Splits an endpoint string into node and interface components.
 *
 * Example:
 * - "Spine-01:e1-1" => { node: "Spine-01", iface: "e1-1" }
 * - "Spine-01" => { node: "Spine-01", iface: "" }
 * - "macvlan:enp0s3" => { node: "macvlan:enp0s3", iface: "" } (special case)
 */
export function splitEndpoint(
  endpoint: string | { node: string; interface?: string }
): EndpointParts {
  if (typeof endpoint === 'string') {
    // Special handling for macvlan endpoints
    if (
      endpoint.startsWith(PREFIX_MACVLAN) ||
      endpoint.startsWith(PREFIX_VXLAN) ||
      endpoint.startsWith(PREFIX_VXLAN_STITCH) ||
      endpoint.startsWith(PREFIX_DUMMY)
    ) {
      return { node: endpoint, iface: '' };
    }

    const parts = endpoint.split(':');
    if (parts.length === 2) {
      return { node: parts[0], iface: parts[1] };
    }
    return { node: endpoint, iface: '' };
  }

  if (endpoint && typeof endpoint === 'object') {
    return { node: endpoint.node, iface: endpoint.interface ?? '' };
  }

  return { node: '', iface: '' };
}

/**
 * Normalizes a single-endpoint type to a special node ID.
 */
export function normalizeSingleTypeToSpecialId(t: string, linkObj: any, ctx: DummyContext): string {
  if (['host', 'mgmt-net', 'macvlan'].includes(t)) {
    return `${t}:${linkObj?.['host-interface'] ?? ''}`;
  }

  if (t === 'vxlan' || t === 'vxlan-stitch') {
    const remote = linkObj?.remote ?? '';
    const vni = linkObj?.vni ?? '';
    const udp = linkObj?.['udp-port'] ?? '';
    return `${t}:${remote}/${vni}/${udp}`;
  }

  if (t === 'dummy') {
    const cached = ctx.dummyLinkMap.get(linkObj);
    if (cached) return cached;
    ctx.dummyCounter += 1;
    const dummyId = `dummy${ctx.dummyCounter}`;
    ctx.dummyLinkMap.set(linkObj, dummyId);
    return dummyId;
  }

  return '';
}

/**
 * Normalizes a link object to a consistent two-endpoint format.
 */
export function normalizeLinkToTwoEndpoints(linkObj: any, ctx: DummyContext): NormalizedLink | null {
  const t = linkObj?.type as string | undefined;
  if (t === 'veth') {
    const [a, b] = linkObj?.endpoints ?? [];
    if (!a || !b) return null;
    return { endA: a, endB: b, type: t };
  }

  if (SINGLE_ENDPOINT_TYPES.includes(t ?? '')) {
    const a = linkObj?.endpoint;
    if (!a) return null;
    const special = normalizeSingleTypeToSpecialId(t!, linkObj, ctx);
    return { endA: a, endB: special, type: t };
  }

  const [a, b] = linkObj?.endpoints ?? [];
  if (!a || !b) return null;
  return { endA: a, endB: b, type: t };
}

/**
 * Resolves the actual node ID for special endpoint types.
 */
export function resolveActualNode(node: string, iface: string): string {
  if (node === 'host') return `host:${iface}`;
  if (node === 'mgmt-net') return `mgmt-net:${iface}`;
  if (node.startsWith(PREFIX_MACVLAN)) return node;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
  if (node.startsWith('vxlan:')) return node;
  if (node.startsWith('dummy')) return node;
  return node;
}

/**
 * Builds the container name for a node.
 */
export function buildContainerName(node: string, actualNode: string, fullPrefix: string): string {
  if (
    node === 'host' ||
    node === 'mgmt-net' ||
    node.startsWith(PREFIX_MACVLAN) ||
    node.startsWith('vxlan:') ||
    node.startsWith(PREFIX_VXLAN_STITCH) ||
    node.startsWith('dummy')
  ) {
    return actualNode;
  }
  return fullPrefix ? `${fullPrefix}-${node}` : node;
}

/**
 * Checks if an endpoint should omit interface info.
 */
export function shouldOmitEndpoint(node: string): boolean {
  return (
    node === 'host' ||
    node === 'mgmt-net' ||
    node.startsWith(PREFIX_MACVLAN) ||
    node.startsWith('dummy')
  );
}

/**
 * Extracts MAC address from an endpoint object.
 */
export function extractEndpointMac(endpoint: unknown): string {
  return typeof endpoint === 'object' && endpoint !== null
    ? (endpoint as any)?.mac ?? ''
    : '';
}
