/**
 * Type definitions for node editor
 */

export type NodeEditorTabId = 'basic' | 'components' | 'config' | 'runtime' | 'network' | 'advanced';

/**
 * Node editor data structure
 */
export interface NodeEditorData {
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
  // Advanced
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
  // Components (SROS)
  isDistributed?: boolean;
}

export interface HealthCheckConfig {
  test?: string;
  startPeriod?: number;
  interval?: number;
  timeout?: number;
  retries?: number;
}

/**
 * Props for tab components
 */
export interface TabProps {
  data: NodeEditorData;
  onChange: (updates: Partial<NodeEditorData>) => void;
}
