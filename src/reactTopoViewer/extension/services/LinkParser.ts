/**
 * Constants and utilities for parsing containerlab link endpoints.
 */

import {
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  PREFIX_DUMMY,
  splitEndpointLike,
} from '../../shared/utilities/LinkTypes';

export { STR_HOST, STR_MGMT_NET, PREFIX_MACVLAN, PREFIX_VXLAN, PREFIX_VXLAN_STITCH, PREFIX_DUMMY };

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

export const NODE_KIND_BRIDGE = TYPES.BRIDGE;
export const NODE_KIND_OVS_BRIDGE = TYPES.OVS_BRIDGE;
export const SINGLE_ENDPOINT_TYPES: string[] = [
  STR_HOST, STR_MGMT_NET, TYPES.MACVLAN, TYPES.DUMMY, TYPES.VXLAN, TYPES.VXLAN_STITCH
];

export type DummyContext = { dummyCounter: number; dummyLinkMap: Map<unknown, string> };

export interface EndpointParts {
  node: string;
  iface: string;
}

export interface NormalizedLink {
  endA: unknown;
  endB: unknown;
  type?: string;
}

/**
 * Splits an endpoint string into node and interface components.
 */
export function splitEndpoint(
  endpoint: string | { node: string; interface?: string }
): EndpointParts {
  return splitEndpointLike(endpoint);
}

const HOSTY_SINGLE_TYPES = ['host', 'mgmt-net', 'macvlan'];
const VX_SINGLE_TYPES = ['vxlan', 'vxlan-stitch'];

function buildHostyId(t: string, linkObj: Record<string, unknown>): string {
  return `${t}:${linkObj?.['host-interface'] ?? ''}`;
}

function buildVxlanId(t: string, linkObj: Record<string, unknown>): string {
  const remote = linkObj?.remote ?? '';
  const vni = linkObj?.vni ?? '';
  const dstPort = linkObj?.['dst-port'] ?? '';
  const srcPort = linkObj?.['src-port'] ?? '';
  return `${t}:${remote}/${vni}/${dstPort}/${srcPort}`;
}

function buildDummyId(linkObj: unknown, ctx: DummyContext): string {
  const cached = ctx.dummyLinkMap.get(linkObj);
  if (cached) return cached;
  ctx.dummyCounter += 1;
  const dummyId = `dummy${ctx.dummyCounter}`;
  ctx.dummyLinkMap.set(linkObj, dummyId);
  return dummyId;
}

/**
 * Normalizes a single-endpoint type to a special node ID.
 */
export function normalizeSingleTypeToSpecialId(
  t: string,
  linkObj: Record<string, unknown>,
  ctx: DummyContext
): string {
  if (HOSTY_SINGLE_TYPES.includes(t)) return buildHostyId(t, linkObj);
  if (VX_SINGLE_TYPES.includes(t)) return buildVxlanId(t, linkObj);
  if (t === 'dummy') return buildDummyId(linkObj, ctx);
  return '';
}

/**
 * Normalizes a link object to a consistent two-endpoint format.
 */
export function normalizeLinkToTwoEndpoints(
  linkObj: Record<string, unknown>,
  ctx: DummyContext
): NormalizedLink | null {
  const t = linkObj?.type as string | undefined;
  if (t === 'veth') {
    const endpoints = linkObj?.endpoints as unknown[] | undefined;
    const [a, b] = endpoints ?? [];
    if (!a || !b) return null;
    return { endA: a, endB: b, type: t };
  }

  if (SINGLE_ENDPOINT_TYPES.includes(t ?? '')) {
    const a = linkObj?.endpoint;
    if (!a) return null;
    const special = normalizeSingleTypeToSpecialId(t!, linkObj, ctx);
    return { endA: a, endB: special, type: t };
  }

  const endpoints = linkObj?.endpoints as unknown[] | undefined;
  const [a, b] = endpoints ?? [];
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
    ? (endpoint as Record<string, unknown>)?.mac as string ?? ''
    : '';
}
