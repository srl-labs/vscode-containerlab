/**
 * Network Editor Types
 * Types and constants for the network node editor panel
 */

/**
 * Network endpoint types supported by containerlab
 */
export type NetworkType =
  | 'host'
  | 'mgmt-net'
  | 'macvlan'
  | 'vxlan'
  | 'vxlan-stitch'
  | 'dummy'
  | 'bridge'
  | 'ovs-bridge';

/**
 * Data structure for editing network nodes
 */
export interface NetworkEditorData {
  /** Node ID in the graph */
  id: string;
  /** Type of network endpoint */
  networkType: NetworkType;
  /** Interface or bridge name */
  interfaceName: string;
  /** Display label/alias */
  label: string;
  /** VXLAN remote endpoint address */
  vxlanRemote?: string;
  /** VXLAN Network Identifier */
  vxlanVni?: string;
  /** VXLAN destination port */
  vxlanDstPort?: string;
  /** VXLAN source port */
  vxlanSrcPort?: string;
  /** MACVLAN mode (bridge, vepa, private, passthru) */
  macvlanMode?: string;
  /** MAC address */
  mac?: string;
  /** MTU value */
  mtu?: string;
  /** Custom variables */
  vars?: Record<string, string>;
  /** Custom labels */
  labels?: Record<string, string>;
}

/** All available network types */
export const NETWORK_TYPES: NetworkType[] = [
  'host',
  'mgmt-net',
  'macvlan',
  'vxlan',
  'vxlan-stitch',
  'dummy',
  'bridge',
  'ovs-bridge'
];

/** VXLAN network types */
export const VXLAN_TYPES: NetworkType[] = ['vxlan', 'vxlan-stitch'];

/** Bridge network types */
export const BRIDGE_TYPES: NetworkType[] = ['bridge', 'ovs-bridge'];

/** Host-like network types (use host interface) */
export const HOST_TYPES: NetworkType[] = ['host', 'mgmt-net', 'macvlan'];

/** MACVLAN mode options */
export const MACVLAN_MODES = ['bridge', 'vepa', 'private', 'passthru'] as const;

/**
 * Get the interface field label based on network type
 */
export function getInterfaceLabel(networkType: NetworkType): string {
  if (BRIDGE_TYPES.includes(networkType)) {
    return 'Bridge Name';
  }
  if (HOST_TYPES.includes(networkType)) {
    return 'Host Interface';
  }
  return 'Interface';
}

/**
 * Get the interface field placeholder based on network type
 */
export function getInterfacePlaceholder(networkType: NetworkType): string {
  if (BRIDGE_TYPES.includes(networkType)) {
    return 'Enter bridge name';
  }
  if (networkType === 'macvlan') {
    return 'Parent interface (e.g., eth0)';
  }
  if (HOST_TYPES.includes(networkType)) {
    return 'e.g., eth0, eth1';
  }
  return 'Enter interface name';
}

/**
 * Check if interface field should be shown for the network type
 */
export function showInterfaceField(networkType: NetworkType): boolean {
  return networkType !== 'dummy' && !VXLAN_TYPES.includes(networkType);
}

/**
 * Check if the network type supports extended properties (mtu, vars, labels)
 * Note: bridge and ovs-bridge are node kinds, not link endpoint types,
 * so they don't support these properties in the containerlab schema
 */
export function supportsExtendedProps(type: NetworkType): boolean {
  return !BRIDGE_TYPES.includes(type);
}
