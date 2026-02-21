/**
 * Link normalization utilities for parsing containerlab links.
 * Pure functions - no VS Code dependencies.
 */

import {
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  SINGLE_ENDPOINT_TYPES,
  HOSTY_TYPES,
  splitEndpointLike,
  isSpecialEndpointId
} from "../utilities/LinkTypes";

// Re-export for convenience
export {
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  splitEndpointLike,
  isSpecialEndpointId
};

import type { DummyContext } from "./types";

// ============================================================================
// Constants
// ============================================================================

export const TYPES = {
  HOST: "host",
  MGMT_NET: "mgmt-net",
  MACVLAN: "macvlan",
  VXLAN: "vxlan",
  VXLAN_STITCH: "vxlan-stitch",
  BRIDGE: "bridge",
  OVS_BRIDGE: "ovs-bridge",
  DUMMY: "dummy"
} as const;

export type SpecialNodeType = (typeof TYPES)[keyof typeof TYPES];

export const NODE_KIND_BRIDGE = TYPES.BRIDGE;
export const NODE_KIND_OVS_BRIDGE = TYPES.OVS_BRIDGE;

export const SINGLE_ENDPOINT_TYPE_LIST: string[] = [
  STR_HOST,
  STR_MGMT_NET,
  TYPES.MACVLAN,
  TYPES.DUMMY,
  TYPES.VXLAN,
  TYPES.VXLAN_STITCH
];

// ============================================================================
// Types
// ============================================================================

export interface EndpointParts {
  node: string;
  iface: string;
}

export interface NormalizedLink {
  endA: unknown;
  endB: unknown;
  type?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ============================================================================
// Endpoint Parsing
// ============================================================================

/**
 * Splits an endpoint string into node and interface components.
 */
export function splitEndpoint(
  endpoint: string | { node: string; interface?: string }
): EndpointParts {
  return splitEndpointLike(endpoint);
}

// ============================================================================
// Special Node ID Generation
// ============================================================================

/**
 * Builds a host/mgmt-net/macvlan ID.
 */
function buildHostyId(t: string, linkObj: Record<string, unknown>): string {
  return `${t}:${linkObj["host-interface"] ?? ""}`;
}

/**
 * Builds a vxlan ID using the context counter.
 * Uses counter-based ID like "vxlan:vxlan0" to match UI-created nodes.
 */
function buildVxlanId(linkObj: unknown, ctx: DummyContext): string {
  const cached = ctx.vxlanLinkMap.get(linkObj);
  if (cached !== undefined && cached !== "") return cached;
  const vxlanId = `vxlan:vxlan${ctx.vxlanCounter}`;
  ctx.vxlanCounter += 1;
  ctx.vxlanLinkMap.set(linkObj, vxlanId);
  return vxlanId;
}

/**
 * Builds a vxlan-stitch ID using the context counter.
 * Uses counter-based ID like "vxlan-stitch:vxlan0" to match UI-created nodes.
 */
function buildVxlanStitchId(linkObj: unknown, ctx: DummyContext): string {
  const cached = ctx.vxlanStitchLinkMap.get(linkObj);
  if (cached !== undefined && cached !== "") return cached;
  const vxlanId = `vxlan-stitch:vxlan${ctx.vxlanStitchCounter}`;
  ctx.vxlanStitchCounter += 1;
  ctx.vxlanStitchLinkMap.set(linkObj, vxlanId);
  return vxlanId;
}

/**
 * Builds a dummy ID using the context counter.
 * Uses counter then increments to match UI behavior (dummy0, dummy1, ...).
 */
function buildDummyId(linkObj: unknown, ctx: DummyContext): string {
  const cached = ctx.dummyLinkMap.get(linkObj);
  if (cached !== undefined && cached !== "") return cached;
  const dummyId = `dummy${ctx.dummyCounter}`;
  ctx.dummyCounter += 1;
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
  if (HOSTY_TYPES.has(t)) return buildHostyId(t, linkObj);
  if (t === "vxlan") return buildVxlanId(linkObj, ctx);
  if (t === "vxlan-stitch") return buildVxlanStitchId(linkObj, ctx);
  if (t === "dummy") return buildDummyId(linkObj, ctx);
  return "";
}

function toEndpointPair(endpoints: unknown[]): { endA: unknown; endB: unknown } | null {
  const [a, b] = endpoints;
  if (a === undefined || a === null || b === undefined || b === null) return null;
  return { endA: a, endB: b };
}

// ============================================================================
// Link Normalization
// ============================================================================

/**
 * Normalizes a link object to a consistent two-endpoint format.
 */
export function normalizeLinkToTwoEndpoints(
  linkObj: Record<string, unknown>,
  ctx: DummyContext
): NormalizedLink | null {
  const t = typeof linkObj.type === "string" ? linkObj.type : undefined;
  if (t === "veth") {
    const endpoints: unknown[] = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
    const pair = toEndpointPair(endpoints);
    return pair ? { ...pair, type: t } : null;
  }

  if (SINGLE_ENDPOINT_TYPES.has(t ?? "")) {
    const a = linkObj.endpoint;
    if (a === undefined || a === null) return null;
    const special = normalizeSingleTypeToSpecialId(t ?? "", linkObj, ctx);
    return { endA: a, endB: special, type: t };
  }

  const endpoints: unknown[] = Array.isArray(linkObj.endpoints) ? linkObj.endpoints : [];
  const pair = toEndpointPair(endpoints);
  return pair ? { ...pair, type: t } : null;
}

// ============================================================================
// Node Resolution
// ============================================================================

/**
 * Resolves the actual node ID for special endpoint types.
 */
export function resolveActualNode(node: string, iface: string): string {
  if (node === "host") return `host:${iface}`;
  if (node === "mgmt-net") return `mgmt-net:${iface}`;
  if (node.startsWith(PREFIX_MACVLAN)) return node;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return node;
  if (node.startsWith("vxlan:")) return node;
  if (node.startsWith("dummy")) return node;
  return node;
}

/**
 * Builds the container name for a node.
 */
export function buildContainerName(node: string, actualNode: string, fullPrefix: string): string {
  if (
    node === "host" ||
    node === "mgmt-net" ||
    node.startsWith(PREFIX_MACVLAN) ||
    node.startsWith("vxlan:") ||
    node.startsWith(PREFIX_VXLAN_STITCH) ||
    node.startsWith("dummy")
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
    node === "host" ||
    node === "mgmt-net" ||
    node.startsWith(PREFIX_MACVLAN) ||
    node.startsWith("dummy")
  );
}

/**
 * Extracts MAC address from an endpoint object.
 */
export function extractEndpointMac(endpoint: unknown): string {
  if (!isRecord(endpoint)) return "";
  return typeof endpoint.mac === "string" ? endpoint.mac : "";
}

// ============================================================================
// Context Creation
// ============================================================================

/**
 * Creates a new DummyContext for link processing.
 */
export function createDummyContext(): DummyContext {
  return {
    dummyCounter: 0,
    dummyLinkMap: new Map(),
    vxlanCounter: 0,
    vxlanLinkMap: new Map(),
    vxlanStitchCounter: 0,
    vxlanStitchLinkMap: new Map()
  };
}
