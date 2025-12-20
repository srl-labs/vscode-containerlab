/**
 * Utility functions for converting between NetworkEditorData and
 * Cytoscape node data format for network nodes
 */

import type { NetworkEditorData, NetworkType } from '../types/editors';

import { getStringOrEmpty, getRecord } from './typeHelpers';

/**
 * Parse network type from node data
 * Checks in order: extraData.kind, top-level kind, top-level type, parse from ID
 * Network node IDs follow patterns like: "host:eth0", "mgmt-net:eth1", "bridge:br0"
 */
function parseNetworkType(nodeId: string, rawData: Record<string, unknown>, extraData: Record<string, unknown>): NetworkType {
  // Check extraData.kind first (new network creation format)
  const extraKind = getStringOrEmpty(extraData.kind);
  if (extraKind && isValidNetworkType(extraKind)) {
    return extraKind as NetworkType;
  }

  // Check top-level kind field
  const topKind = getStringOrEmpty(rawData.kind);
  if (topKind && isValidNetworkType(topKind)) {
    return topKind as NetworkType;
  }

  // Check top-level type field (mock data format)
  const topType = getStringOrEmpty(rawData.type);
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
    const yamlId = getStringOrEmpty(extraData.extYamlNodeId);
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

  const nodeId = getStringOrEmpty(rawData.id);
  const extra = (rawData.extraData as Record<string, unknown>) || {};
  const networkType = parseNetworkType(nodeId, rawData, extra);

  return {
    id: nodeId,
    networkType,
    interfaceName: parseInterfaceName(nodeId, networkType, extra),
    label: getStringOrEmpty(rawData.name) || nodeId,
    // VXLAN fields
    vxlanRemote: getStringOrEmpty(extra.extRemote),
    vxlanVni: getStringOrEmpty(extra.extVni),
    vxlanDstPort: getStringOrEmpty(extra.extDstPort),
    vxlanSrcPort: getStringOrEmpty(extra.extSrcPort),
    // MACVLAN mode
    macvlanMode: getStringOrEmpty(extra.extMode),
    // MAC address
    mac: getStringOrEmpty(extra.extMac),
    // MTU
    mtu: getStringOrEmpty(extra.extMtu),
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
