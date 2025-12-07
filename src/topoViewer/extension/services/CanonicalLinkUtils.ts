import * as YAML from 'yaml';

import {
  isSpecialEndpoint,
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN_STITCH,
  PREFIX_VXLAN,
  PREFIX_DUMMY,
  TYPE_DUMMY,
  SINGLE_ENDPOINT_TYPES,
  splitEndpointLike,
} from '../../shared/utilities/LinkTypes';

// Common string literals used for link types
export const TYPE_MACVLAN = 'macvlan' as const;
export const TYPE_VXLAN_STITCH = 'vxlan-stitch' as const;
export const TYPE_VXLAN = 'vxlan' as const;
export const TYPE_UNKNOWN = 'unknown' as const;

// Re-export TYPE_DUMMY from LinkTypes for convenience
export { TYPE_DUMMY };

/**
 * Represents a canonical endpoint with node and interface
 */
export type CanonicalEndpoint = { node: string; iface: string };

/**
 * Represents a canonical link key for matching links between YAML and payload
 */
export type CanonicalLinkKey = {
  type: 'veth' | 'mgmt-net' | 'host' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | 'unknown';
  a: CanonicalEndpoint;
  b?: CanonicalEndpoint; // present for veth
  // Optional, reserved for future matching refinements
  hostIface?: string;
  mode?: string;
  vni?: string | number;
  dstPort?: string | number;
  srcPort?: string | number;
};

/**
 * Checks if an endpoint is a special endpoint (host, mgmt-net, macvlan, vxlan, etc.)
 */
export function endpointIsSpecial(ep: CanonicalEndpoint | string): boolean {
  const epStr = typeof ep === 'string' ? ep : `${ep.node}:${ep.iface}`;
  return (
    isSpecialEndpoint(epStr) ||
    epStr.startsWith(PREFIX_MACVLAN) ||
    epStr.startsWith(PREFIX_VXLAN) ||
    epStr.startsWith(PREFIX_VXLAN_STITCH) ||
    epStr.startsWith(PREFIX_DUMMY)
  );
}

/**
 * Splits an endpoint string or object into a CanonicalEndpoint
 */
export function splitEndpointCanonical(endpoint: string | { node: string; interface?: string }): CanonicalEndpoint {
  const { node, iface } = splitEndpointLike(endpoint);
  return { node, iface };
}

/**
 * Determines the link type from a special endpoint
 */
export function linkTypeFromSpecial(special: CanonicalEndpoint): CanonicalLinkKey['type'] {
  const { node } = special;
  if (node === STR_HOST) return STR_HOST;
  if (node === STR_MGMT_NET) return STR_MGMT_NET;
  if (node.startsWith(PREFIX_MACVLAN)) return TYPE_MACVLAN;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return TYPE_VXLAN_STITCH;
  if (node.startsWith(PREFIX_VXLAN)) return TYPE_VXLAN;
  if (node.startsWith(PREFIX_DUMMY)) return TYPE_DUMMY;
  return TYPE_UNKNOWN;
}

/**
 * Selects the non-special endpoint from a pair
 */
export function selectNonSpecial(a: CanonicalEndpoint, b?: CanonicalEndpoint): CanonicalEndpoint {
  if (!b) return a;
  return endpointIsSpecial(a) && !endpointIsSpecial(b) ? b : a;
}

/**
 * Converts a canonical link key to a string for comparison/hashing
 */
export function canonicalKeyToString(key: CanonicalLinkKey): string {
  if (key.type === 'veth' && key.b) {
    const aStr = `${key.a.node}:${key.a.iface}`;
    const bStr = `${key.b.node}:${key.b.iface}`;
    const [first, second] = aStr < bStr ? [aStr, bStr] : [bStr, aStr];
    return `veth|${first}|${second}`;
  }
  // Single-endpoint types: only endpoint A determines identity for now
  return `${key.type}|${key.a.node}:${key.a.iface}`;
}

/**
 * Extracts the type string from a YAML link map
 */
export function getTypeString(linkItem: YAML.YAMLMap): string | undefined {
  const typeNode = linkItem.get('type', true) as any;
  if (typeNode && typeof typeNode.value === 'string') {
    return typeNode.value as string;
  }
  if (typeof typeNode === 'string') {
    return typeNode;
  }
  return undefined;
}

/**
 * Parses an extended veth link from YAML
 */
export function parseExtendedVeth(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const eps = linkItem.get('endpoints', true);
  if (YAML.isSeq(eps) && eps.items.length >= 2) {
    const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
    const b = splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any));
    return { type: 'veth', a, b };
  }
  return null;
}

/**
 * Parses an extended single-endpoint link from YAML
 */
export function parseExtendedSingle(linkItem: YAML.YAMLMap, t: CanonicalLinkKey['type']): CanonicalLinkKey | null {
  const ep = linkItem.get('endpoint', true);
  if (ep) {
    return { type: t, a: splitEndpointLike((ep as any)?.toJSON?.() ?? ep) };
  }

  const eps = linkItem.get('endpoints', true);
  if (!YAML.isSeq(eps) || eps.items.length === 0) return null;

  const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
  const b = eps.items.length > 1
    ? splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any))
    : undefined;

  return { type: t, a: selectNonSpecial(a, b) };
}

/**
 * Parses a short-format link from YAML
 */
export function parseShortLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const eps = linkItem.get('endpoints', true);
  if (!YAML.isSeq(eps) || eps.items.length < 2) return null;

  const epA = String((eps.items[0] as any).value ?? eps.items[0]);
  const epB = String((eps.items[1] as any).value ?? eps.items[1]);
  const a = splitEndpointCanonical(epA);
  const b = splitEndpointCanonical(epB);
  return canonicalFromPair(a, b);
}

/**
 * Creates a canonical link key from a YAML link map
 */
export function canonicalFromYamlLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const typeStr = getTypeString(linkItem);
  if (typeStr) {
    const t = typeStr as CanonicalLinkKey['type'];
    if (t === 'veth') return parseExtendedVeth(linkItem);
    if (SINGLE_ENDPOINT_TYPES.has(t)) {
      return parseExtendedSingle(linkItem, t);
    }
    return null;
  }
  return parseShortLink(linkItem);
}

/**
 * Creates a canonical link key from a payload edge data object
 */
export function canonicalFromPayloadEdge(data: any): CanonicalLinkKey | null {
  const source: string = data.source;
  const target: string = data.target;
  const sourceEp = data.sourceEndpoint ? `${source}:${data.sourceEndpoint}` : source;
  const targetEp = data.targetEndpoint ? `${target}:${data.targetEndpoint}` : target;
  const a = splitEndpointCanonical(sourceEp);
  const b = splitEndpointCanonical(targetEp);
  return canonicalFromPair(a, b);
}

/**
 * Creates a canonical link key from a pair of endpoints
 */
export function canonicalFromPair(a: CanonicalEndpoint, b: CanonicalEndpoint): CanonicalLinkKey {
  const aIsSpecial = endpointIsSpecial(a);
  const bIsSpecial = endpointIsSpecial(b);
  if (aIsSpecial !== bIsSpecial) {
    const special = aIsSpecial ? a : b;
    const nonSpecial = aIsSpecial ? b : a;
    return { type: linkTypeFromSpecial(special), a: nonSpecial };
  }
  return { type: 'veth', a, b };
}
