/**
 * Common link/node type constants and helpers for React TopoViewer.
 */

export const STR_HOST = "host" as const;
export const STR_MGMT_NET = "mgmt-net" as const;
export const PREFIX_MACVLAN = "macvlan:" as const;
export const PREFIX_VXLAN = "vxlan:" as const;
export const PREFIX_VXLAN_STITCH = "vxlan-stitch:" as const;
export const PREFIX_DUMMY = "dummy" as const;
export const PREFIX_BRIDGE = "bridge:" as const;
export const PREFIX_OVS_BRIDGE = "ovs-bridge:" as const;

export const TYPE_DUMMY = "dummy" as const;

export const SINGLE_ENDPOINT_TYPES = new Set<string>([
  STR_HOST,
  STR_MGMT_NET,
  "macvlan",
  TYPE_DUMMY,
  "vxlan",
  "vxlan-stitch",
]);

export const VX_TYPES = new Set<string>(["vxlan", "vxlan-stitch"]);
export const HOSTY_TYPES = new Set<string>([STR_HOST, STR_MGMT_NET, "macvlan"]);

type CytoscapeNodeLike = {
  length: number;
  data: (key: string) => unknown;
};

type CytoscapeLike = {
  getElementById: (id: string) => CytoscapeNodeLike;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function isCytoscapeLike(value: unknown): value is CytoscapeLike {
  const record = asRecord(value);
  return typeof record.getElementById === "function";
}

/**
 * Determines if a node ID represents a special endpoint.
 */
export function isSpecialEndpointId(nodeId: string): boolean {
  return (
    nodeId.startsWith(`${STR_HOST}:`) ||
    nodeId.startsWith(`${STR_MGMT_NET}:`) ||
    nodeId.startsWith(PREFIX_MACVLAN) ||
    nodeId.startsWith(PREFIX_VXLAN) ||
    nodeId.startsWith(PREFIX_VXLAN_STITCH) ||
    nodeId.startsWith("dummy") ||
    nodeId.startsWith(PREFIX_BRIDGE) ||
    nodeId.startsWith(PREFIX_OVS_BRIDGE)
  );
}

/**
 * Determines if a node ID represents a special endpoint or bridge node.
 */
export function isSpecialNodeOrBridge(nodeId: string, cy?: unknown): boolean {
  if (isSpecialEndpointId(nodeId)) {
    return true;
  }

  if (cy !== undefined && isCytoscapeLike(cy)) {
    const node = cy.getElementById(nodeId);
    if (node.length > 0) {
      const extraData = asRecord(node.data("extraData"));
      const kind = typeof extraData.kind === "string" ? extraData.kind : undefined;
      return kind === "bridge" || kind === "ovs-bridge";
    }
  }

  return false;
}

/**
 * Splits an endpoint string or object into node and interface components.
 */
export function splitEndpointLike(endpoint: string | { node: string; interface?: string }): {
  node: string;
  iface: string;
} {
  if (typeof endpoint === "string") {
    if (
      endpoint.startsWith(PREFIX_MACVLAN) ||
      endpoint.startsWith(PREFIX_DUMMY) ||
      endpoint.startsWith(PREFIX_VXLAN) ||
      endpoint.startsWith(PREFIX_VXLAN_STITCH)
    ) {
      return { node: endpoint, iface: "" };
    }
    const parts = endpoint.split(":");
    if (parts.length === 2) return { node: parts[0], iface: parts[1] };
    return { node: endpoint, iface: "" };
  }
  return { node: endpoint.node, iface: endpoint.interface ?? "" };
}
