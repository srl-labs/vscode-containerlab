/**
 * Utility functions for converting between NetworkEditorData and
 * Cytoscape node data format for network nodes
 */

import { NetworkEditorData, NetworkType } from '../../webview/components/panels/network-editor/types';

/** Helper to safely get string values */
function getString(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

/** Helper to safely get record */
function getRecord(val: unknown): Record<string, string> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? val as Record<string, string>
    : undefined;
}

/**
 * Parse network type from node data
 * Checks in order: extraData.kind, top-level kind, top-level type, parse from ID
 * Network node IDs follow patterns like: "host:eth0", "mgmt-net:eth1", "bridge:br0"
 */
function parseNetworkType(nodeId: string, rawData: Record<string, unknown>, extraData: Record<string, unknown>): NetworkType {
  // Check extraData.kind first (new network creation format)
  const extraKind = getString(extraData.kind);
  if (extraKind && isValidNetworkType(extraKind)) {
    return extraKind as NetworkType;
  }

  // Check top-level kind field
  const topKind = getString(rawData.kind);
  if (topKind && isValidNetworkType(topKind)) {
    return topKind as NetworkType;
  }

  // Check top-level type field (mock data format)
  const topType = getString(rawData.type);
  if (topType && isValidNetworkType(topType)) {
    return topType as NetworkType;
  }

  // Fall back to parsing from node ID
  const parts = nodeId.split(':');
  const prefix = parts[0];
  if (isValidNetworkType(prefix)) {
    return prefix as NetworkType;
  }

  // Default to host if we can't determine
  return 'host';
}

/**
 * Check if a string is a valid network type
 */
function isValidNetworkType(type: string): boolean {
  return [
    'host', 'mgmt-net', 'macvlan', 'vxlan',
    'vxlan-stitch', 'dummy', 'bridge', 'ovs-bridge'
  ].includes(type);
}

/**
 * Parse interface name from node ID
 * For network nodes, the interface is typically after the colon (e.g., "host:eth0" -> "eth0")
 * For bridges, it might be the full ID or from extYamlNodeId
 */
function parseInterfaceName(nodeId: string, networkType: NetworkType, extraData: Record<string, unknown>): string {
  // For bridges, prefer extYamlNodeId if available
  if (networkType === 'bridge' || networkType === 'ovs-bridge') {
    const yamlId = getString(extraData.extYamlNodeId);
    if (yamlId) return yamlId;
    return nodeId;
  }

  // For dummy, there's no interface
  if (networkType === 'dummy') {
    return '';
  }

  // For other types, extract from node ID
  const parts = nodeId.split(':');
  return parts[1] || 'eth1';
}

/**
 * Converts raw network node data (from Cytoscape) to NetworkEditorData format
 */
export function convertToNetworkEditorData(rawData: Record<string, unknown> | null): NetworkEditorData | null {
  if (!rawData) return null;

  const nodeId = getString(rawData.id);
  const extra = (rawData.extraData as Record<string, unknown>) || {};
  const networkType = parseNetworkType(nodeId, rawData, extra);

  return {
    id: nodeId,
    networkType,
    interfaceName: parseInterfaceName(nodeId, networkType, extra),
    label: getString(rawData.name) || nodeId,
    // VXLAN fields
    vxlanRemote: getString(extra.extRemote),
    vxlanVni: getString(extra.extVni),
    vxlanDstPort: getString(extra.extDstPort),
    vxlanSrcPort: getString(extra.extSrcPort),
    // MACVLAN mode
    macvlanMode: getString(extra.extMode),
    // MAC address
    mac: getString(extra.extMac),
    // MTU
    mtu: getString(extra.extMtu),
    // Optional metadata
    vars: getRecord(extra.vars),
    labels: getRecord(extra.labels)
  };
}

/**
 * Convert NetworkEditorData back to extraData format for saving
 */
export function convertNetworkEditorDataToYaml(data: NetworkEditorData): Record<string, unknown> {
  const result: Record<string, unknown> = {
    kind: data.networkType
  };

  // VXLAN-specific fields
  if (data.vxlanRemote) result.extRemote = data.vxlanRemote;
  if (data.vxlanVni) result.extVni = data.vxlanVni;
  if (data.vxlanDstPort) result.extDstPort = data.vxlanDstPort;
  if (data.vxlanSrcPort) result.extSrcPort = data.vxlanSrcPort;

  // MACVLAN mode
  if (data.macvlanMode) result.extMode = data.macvlanMode;

  // MAC address
  if (data.mac) result.extMac = data.mac;

  // MTU
  if (data.mtu) result.extMtu = data.mtu;

  // Metadata
  if (data.vars && Object.keys(data.vars).length > 0) result.vars = data.vars;
  if (data.labels && Object.keys(data.labels).length > 0) result.labels = data.labels;

  return result;
}
