// Common link/node type constants and helpers used across TopoViewer

export const STR_HOST = 'host' as const;
export const STR_MGMT_NET = 'mgmt-net' as const;
export const PREFIX_MACVLAN = 'macvlan:' as const;
export const PREFIX_VXLAN = 'vxlan:' as const;
export const PREFIX_VXLAN_STITCH = 'vxlan-stitch:' as const;
export const PREFIX_DUMMY = 'dummy' as const;
export const PREFIX_BRIDGE = 'bridge:' as const;
export const PREFIX_OVS_BRIDGE = 'ovs-bridge:' as const;

export const TYPE_DUMMY = 'dummy' as const;

export const SINGLE_ENDPOINT_TYPES = new Set<string>([
  STR_HOST,
  STR_MGMT_NET,
  'macvlan',
  TYPE_DUMMY,
  'vxlan',
  'vxlan-stitch'
]);

export const VX_TYPES = new Set<string>(['vxlan', 'vxlan-stitch']);
export const HOSTY_TYPES = new Set<string>([STR_HOST, STR_MGMT_NET, 'macvlan']);

/**
 * Determines if a node ID represents a special endpoint.
 * @param nodeId - The node ID to check.
 * @returns True if the node is a special endpoint (host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge).
 */
export function isSpecialEndpointId(nodeId: string): boolean {
  return (
    nodeId.startsWith(`${STR_HOST}:`) ||
    nodeId.startsWith(`${STR_MGMT_NET}:`) ||
    nodeId.startsWith(PREFIX_MACVLAN) ||
    nodeId.startsWith(PREFIX_VXLAN) ||
    nodeId.startsWith(PREFIX_VXLAN_STITCH) ||
    nodeId.startsWith('dummy') ||
    nodeId.startsWith(PREFIX_BRIDGE) ||
    nodeId.startsWith(PREFIX_OVS_BRIDGE)
  );
}

/** Alias for isSpecialEndpointId for backwards compatibility */
export const isSpecialEndpoint = isSpecialEndpointId;

/**
 * Determines if a node ID represents a special endpoint or bridge node.
 * This is a more comprehensive check that includes both special endpoints and bridge nodes.
 * @param nodeId - The node ID to check.
 * @param cy - Optional Cytoscape instance to check node data for bridge types.
 * @returns True if the node is a special endpoint or bridge node.
 */

export function isSpecialNodeOrBridge(nodeId: string, cy?: any): boolean {
  // First check if it's a special endpoint
  if (isSpecialEndpointId(nodeId)) {
    return true;
  }

  // If we have a Cytoscape instance, also check if it's a bridge node by examining node data
  if (cy) {
    const node = cy.getElementById(nodeId);
    if (node.length > 0) {
      const kind = node.data('extraData')?.kind;
      return kind === 'bridge' || kind === 'ovs-bridge';
    }
  }

  return false;
}

export function splitEndpointLike(endpoint: string | { node: string; interface?: string }): { node: string; iface: string } {
  if (typeof endpoint === 'string') {
    if (
      endpoint.startsWith(PREFIX_MACVLAN) ||
      endpoint.startsWith(PREFIX_DUMMY) ||
      endpoint.startsWith(PREFIX_VXLAN) ||
      endpoint.startsWith(PREFIX_VXLAN_STITCH)
    ) {
      return { node: endpoint, iface: '' };
    }
    const parts = endpoint.split(':');
    if (parts.length === 2) return { node: parts[0], iface: parts[1] };
    return { node: endpoint, iface: '' };
  }
  if (endpoint && typeof endpoint === 'object') {
    return { node: endpoint.node, iface: endpoint.interface ?? '' };
  }
  return { node: '', iface: '' };
}

