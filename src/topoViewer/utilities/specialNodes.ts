/**
 * Determines if a node ID represents a special endpoint.
 * @param nodeId - The node ID to check.
 * @returns True if the node is a special endpoint (host, mgmt-net, macvlan, vxlan, vxlan-stitch, dummy, bridge, ovs-bridge).
 */
import { isSpecialEndpointId } from './linkTypes';

export function isSpecialEndpoint(nodeId: string): boolean {
  return isSpecialEndpointId(nodeId);
}

/**
 * Determines if a node ID represents a special endpoint or bridge node.
 * This is a more comprehensive check that includes both special endpoints and bridge nodes.
 * @param nodeId - The node ID to check.
 * @param cy - Optional Cytoscape instance to check node data for bridge types.
 * @returns True if the node is a special endpoint or bridge node.
 */
export function isSpecialNodeOrBridge(nodeId: string, cy?: any): boolean {
  // First check if it's a special endpoint
  if (isSpecialEndpoint(nodeId)) {
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
