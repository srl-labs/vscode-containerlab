/**
 * Editor type definitions - shared between webview and extension
 *
 * These types are used by both the webview editor panels and the
 * shared conversion utilities. Keeping them in shared/ ensures
 * proper dependency direction (shared does not import from webview).
 */

// ============================================================================
// Node Editor Types
// ============================================================================

export type NodeEditorTabId = 'basic' | 'components' | 'config' | 'runtime' | 'network' | 'advanced';

/**
 * Integrated SROS types (simpler chassis with just MDA slots)
 */
export const INTEGRATED_SROS_TYPES = new Set([
  'sr-1', 'sr-1s', 'ixr-r6', 'ixr-ec', 'ixr-e2', 'ixr-e2c'
]);

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  test?: string;
  startPeriod?: number;
  interval?: number;
  timeout?: number;
  retries?: number;
}

/**
 * SROS MDA (Media Dependent Adapter) configuration
 */
export interface SrosMda {
  slot?: number;
  type?: string;
}

/**
 * SROS XIOM (Extension I/O Module) configuration
 */
export interface SrosXiom {
  slot?: number;
  type?: string;
  mda?: SrosMda[];
}

/**
 * SROS Component configuration (CPM, Card)
 */
export interface SrosComponent {
  slot?: string | number;
  type?: string;
  sfm?: string;
  mda?: SrosMda[];
  xiom?: SrosXiom[];
}

/**
 * Advanced node fields shared between NodeEditorData and CustomTemplateEditorData
 */
export interface AdvancedNodeFields {
  cpu?: number;
  cpuSet?: string;
  memory?: string;
  shmSize?: string;
  capAdd?: string[];
  sysctls?: Record<string, string>;
  devices?: string[];
  certIssue?: boolean;
  certKeySize?: string;
  certValidity?: string;
  sans?: string[];
  healthCheck?: HealthCheckConfig;
  imagePullPolicy?: string;
  runtime?: string;
}

/**
 * Node editor data structure
 */
export interface NodeEditorData extends AdvancedNodeFields {
  id: string;
  name: string;
  /** Whether this is a custom node template (temp-custom-node or edit-custom-node) */
  isCustomTemplate?: boolean;
  kind?: string;
  type?: string;
  image?: string;
  version?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  // Custom node settings
  customName?: string;
  baseName?: string;
  interfacePattern?: string;
  isDefaultCustomNode?: boolean;
  // Configuration
  startupConfig?: string;
  enforceStartupConfig?: boolean;
  suppressStartupConfig?: boolean;
  license?: string;
  binds?: string[];
  env?: Record<string, string>;
  envFiles?: string[];
  labels?: Record<string, string>;
  // Runtime
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  restartPolicy?: string;
  autoRemove?: boolean;
  startupDelay?: number;
  // Network
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  networkMode?: string;
  ports?: string[];
  dnsServers?: string[];
  aliases?: string[];
  // Components (SROS)
  isDistributed?: boolean;
  components?: SrosComponent[];
}

// ============================================================================
// Network Editor Types
// ============================================================================

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

// ============================================================================
// Link Editor Types
// ============================================================================

export type LinkEditorTabId = 'basic' | 'extended';

/**
 * Link endpoint data structure
 */
export interface LinkEndpoint {
  node: string;
  interface: string;
  mac?: string;
}

/**
 * Link editor data structure
 */
export interface LinkEditorData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint: string;
  targetEndpoint: string;
  type?: 'veth' | 'host' | 'mgmt-net' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | string;
  // Extended properties
  sourceMac?: string;
  targetMac?: string;
  mtu?: number | string;
  vars?: Record<string, string>;
  labels?: Record<string, string>;
  endpointLabelOffsetEnabled?: boolean;
  endpointLabelOffset?: number;
  // Original values for finding the link when endpoints change
  originalSource?: string;
  originalTarget?: string;
  originalSourceEndpoint?: string;
  originalTargetEndpoint?: string;
  // Network endpoint flags (for read-only handling)
  sourceIsNetwork?: boolean;
  targetIsNetwork?: boolean;
}

// ============================================================================
// Custom Node Template Types
// ============================================================================

/**
 * Custom node template definition - stored configuration for reusable node types
 */
export interface CustomNodeTemplate {
  name: string;
  kind: string;
  type?: string;
  image?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  baseName?: string;
  interfacePattern?: string;
  setDefault?: boolean;
  [key: string]: unknown;
}

/**
 * Custom template editor data - used when editing custom node templates.
 * Has 'id' field to track whether it's a new template or editing existing.
 * Includes all NodeEditorData fields so templates can have default values
 * for license, startup-config, env, binds, etc.
 */
export interface CustomTemplateEditorData extends AdvancedNodeFields {
  id: string;  // 'temp-custom-node' for new, 'edit-custom-node' for editing
  isCustomTemplate: true;
  customName: string;
  kind: string;
  /** When editing, track the original name to find and update it */
  originalName?: string;

  // Basic tab fields
  type?: string;
  image?: string;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;

  // Custom template specific
  baseName?: string;
  interfacePattern?: string;
  isDefaultCustomNode?: boolean;

  // Configuration tab fields
  license?: string;
  startupConfig?: string;
  enforceStartupConfig?: boolean;
  suppressStartupConfig?: boolean;
  binds?: string[];
  env?: Record<string, string>;
  envFiles?: string[];
  labels?: Record<string, string>;

  // Runtime tab fields
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  restartPolicy?: string;
  autoRemove?: boolean;
  startupDelay?: number;

  // Network tab fields
  mgmtIpv4?: string;
  mgmtIpv6?: string;
  networkMode?: string;
  ports?: string[];
  dnsServers?: string[];
  aliases?: string[];

  // Components tab fields (SROS)
  isDistributed?: boolean;
  components?: SrosComponent[];
}
