/**
 * Utility functions for converting between NodeEditorData (camelCase) and
 * YAML extraData format (kebab-case)
 */

import { NodeEditorData, HealthCheckConfig } from '../../webview/components/panels/node-editor/types';

// ============================================================================
// Type Helpers
// ============================================================================

/** Helper to safely get string values */
function getString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

/** Helper to safely get number values */
function getNumber(val: unknown): number | undefined {
  return typeof val === 'number' ? val : undefined;
}

/** Helper to safely get boolean values */
function getBoolean(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined;
}

/** Helper to safely get string array */
function getStringArray(val: unknown): string[] | undefined {
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : undefined;
}

/** Helper to safely get record */
function getRecord(val: unknown): Record<string, string> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? val as Record<string, string>
    : undefined;
}

// ============================================================================
// YAML -> NodeEditorData (for loading into editor)
// ============================================================================

/** Parse basic properties from extraData */
function parseBasicProps(
  rawData: Record<string, unknown>,
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'id' | 'name' | 'kind' | 'type' | 'image' | 'icon' | 'iconColor' | 'iconCornerRadius'> {
  return {
    id: rawData.id as string || '',
    name: rawData.name as string || rawData.id as string || '',
    kind: getString(extra.kind),
    type: getString(extra.type),
    image: getString(extra.image),
    icon: rawData.topoViewerRole as string || '',
    iconColor: rawData.iconColor as string | undefined,
    iconCornerRadius: rawData.iconCornerRadius as number | undefined
  };
}

/** Parse configuration properties from extraData */
function parseConfigProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'startupConfig' | 'enforceStartupConfig' | 'suppressStartupConfig' | 'license' | 'binds' | 'env' | 'envFiles' | 'labels'> {
  return {
    startupConfig: getString(extra['startup-config']),
    enforceStartupConfig: getBoolean(extra['enforce-startup-config']),
    suppressStartupConfig: getBoolean(extra['suppress-startup-config']),
    license: getString(extra.license),
    binds: getStringArray(extra.binds),
    env: getRecord(extra.env),
    envFiles: getStringArray(extra['env-files']),
    labels: getRecord(extra.labels)
  };
}

/** Parse runtime properties from extraData */
function parseRuntimeProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'user' | 'entrypoint' | 'cmd' | 'exec' | 'restartPolicy' | 'autoRemove' | 'startupDelay'> {
  return {
    user: getString(extra.user),
    entrypoint: getString(extra.entrypoint),
    cmd: getString(extra.cmd),
    exec: getStringArray(extra.exec),
    restartPolicy: getString(extra['restart-policy']),
    autoRemove: getBoolean(extra['auto-remove']),
    startupDelay: getNumber(extra['startup-delay'])
  };
}

/** Parse network properties from extraData */
function parseNetworkProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'mgmtIpv4' | 'mgmtIpv6' | 'networkMode' | 'ports' | 'dnsServers' | 'aliases'> {
  return {
    mgmtIpv4: getString(extra['mgmt-ipv4']),
    mgmtIpv6: getString(extra['mgmt-ipv6']),
    networkMode: getString(extra['network-mode']),
    ports: getStringArray(extra.ports),
    dnsServers: getStringArray(extra.dns),
    aliases: getStringArray(extra.aliases)
  };
}

/** Parse resource/advanced properties from extraData */
function parseAdvancedProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'cpu' | 'cpuSet' | 'memory' | 'shmSize' | 'capAdd' | 'sysctls' | 'devices' | 'imagePullPolicy' | 'runtime'> {
  return {
    cpu: getNumber(extra.cpu),
    cpuSet: getString(extra['cpu-set']),
    memory: getString(extra.memory),
    shmSize: getString(extra['shm-size']),
    capAdd: getStringArray(extra['cap-add']),
    sysctls: getRecord(extra.sysctls),
    devices: getStringArray(extra.devices),
    imagePullPolicy: getString(extra['image-pull-policy']),
    runtime: getString(extra.runtime)
  };
}

/** Parse certificate properties from extraData */
function parseCertProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, 'certIssue' | 'certKeySize' | 'certValidity' | 'sans'> {
  const certRaw = extra.certificate as Record<string, unknown> | undefined;
  if (!certRaw) return {};

  return {
    certIssue: certRaw.issue !== undefined ? Boolean(certRaw.issue) : undefined,
    certKeySize: getString(certRaw['key-size']),
    certValidity: getString(certRaw['validity-duration']),
    sans: getStringArray(certRaw.SANs)
  };
}

/** Parse healthcheck properties from extraData */
function parseHealthCheckProps(extra: Record<string, unknown>): { healthCheck?: HealthCheckConfig } {
  const healthcheckRaw = extra.healthcheck as Record<string, unknown> | undefined;
  if (!healthcheckRaw) return {};

  return {
    healthCheck: {
      test: getString(healthcheckRaw.test),
      startPeriod: getNumber(healthcheckRaw['start-period']),
      interval: getNumber(healthcheckRaw.interval),
      timeout: getNumber(healthcheckRaw.timeout),
      retries: getNumber(healthcheckRaw.retries)
    }
  };
}

/**
 * Converts raw node data (from Cytoscape/YAML) to NodeEditorData format
 * Maps from YAML kebab-case properties (in extraData) to camelCase NodeEditorData
 */
export function convertToEditorData(rawData: Record<string, unknown> | null): NodeEditorData | null {
  if (!rawData) return null;
  const extra = (rawData.extraData as Record<string, unknown>) || {};

  return {
    ...parseBasicProps(rawData, extra),
    ...parseConfigProps(extra),
    ...parseRuntimeProps(extra),
    ...parseNetworkProps(extra),
    ...parseAdvancedProps(extra),
    ...parseCertProps(extra),
    ...parseHealthCheckProps(extra)
  };
}

// ============================================================================
// NodeEditorData -> YAML extraData (for saving to YAML)
// ============================================================================

/** YAML extraData type matching TopologyIO */
export interface YamlExtraData {
  kind?: string;
  type?: string;
  image?: string;
  group?: string;
  'startup-config'?: string;
  'enforce-startup-config'?: boolean;
  'suppress-startup-config'?: boolean;
  license?: string;
  binds?: string[];
  env?: Record<string, unknown>;
  'env-files'?: string[];
  labels?: Record<string, unknown>;
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  'restart-policy'?: string;
  'auto-remove'?: boolean;
  'startup-delay'?: number;
  'mgmt-ipv4'?: string;
  'mgmt-ipv6'?: string;
  'network-mode'?: string;
  ports?: string[];
  dns?: string[];
  aliases?: string[];
  cpu?: number;
  'cpu-set'?: string;
  memory?: string;
  'shm-size'?: string;
  'cap-add'?: string[];
  sysctls?: Record<string, unknown>;
  devices?: string[];
  certificate?: Record<string, unknown>;
  healthcheck?: Record<string, unknown>;
  'image-pull-policy'?: string;
  runtime?: string;
  [key: string]: unknown;
}

/** Convert basic properties to YAML format */
function convertBasicToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.kind) extraData.kind = String(data.kind);
  if (data.type) extraData.type = String(data.type);
  if (data.image) extraData.image = String(data.image);
  if (data.group) extraData.group = String(data.group);
}

/** Convert startup config properties to YAML format */
function convertStartupConfigToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.startupConfig) extraData['startup-config'] = String(data.startupConfig);
  if (data.enforceStartupConfig !== undefined) extraData['enforce-startup-config'] = Boolean(data.enforceStartupConfig);
  if (data.suppressStartupConfig !== undefined) extraData['suppress-startup-config'] = Boolean(data.suppressStartupConfig);
  if (data.license) extraData.license = String(data.license);
}

/** Convert container config properties to YAML format */
function convertContainerConfigToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.binds && Array.isArray(data.binds) && data.binds.length > 0) extraData.binds = data.binds as string[];
  if (data.env && typeof data.env === 'object' && Object.keys(data.env as object).length > 0) {
    extraData.env = data.env as Record<string, unknown>;
  }
  if (data.envFiles && Array.isArray(data.envFiles) && data.envFiles.length > 0) {
    extraData['env-files'] = data.envFiles as string[];
  }
  if (data.labels && typeof data.labels === 'object' && Object.keys(data.labels as object).length > 0) {
    extraData.labels = data.labels as Record<string, unknown>;
  }
}

/** Convert configuration properties to YAML format */
function convertConfigToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  convertStartupConfigToYaml(data, extraData);
  convertContainerConfigToYaml(data, extraData);
}

/** Convert runtime properties to YAML format */
function convertRuntimeToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.user) extraData.user = String(data.user);
  if (data.entrypoint) extraData.entrypoint = String(data.entrypoint);
  if (data.cmd) extraData.cmd = String(data.cmd);
  if (data.exec && Array.isArray(data.exec) && data.exec.length > 0) extraData.exec = data.exec as string[];
  if (data.restartPolicy) extraData['restart-policy'] = String(data.restartPolicy);
  if (data.autoRemove !== undefined) extraData['auto-remove'] = Boolean(data.autoRemove);
  if (data.startupDelay !== undefined && data.startupDelay !== null) {
    extraData['startup-delay'] = Number(data.startupDelay);
  }
}

/** Convert network properties to YAML format */
function convertNetworkToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.mgmtIpv4) extraData['mgmt-ipv4'] = String(data.mgmtIpv4);
  if (data.mgmtIpv6) extraData['mgmt-ipv6'] = String(data.mgmtIpv6);
  if (data.networkMode) extraData['network-mode'] = String(data.networkMode);
  if (data.ports && Array.isArray(data.ports) && data.ports.length > 0) extraData.ports = data.ports as string[];
  if (data.dnsServers && Array.isArray(data.dnsServers) && data.dnsServers.length > 0) {
    extraData.dns = data.dnsServers as string[];
  }
  if (data.aliases && Array.isArray(data.aliases) && data.aliases.length > 0) {
    extraData.aliases = data.aliases as string[];
  }
}

/** Convert resource limit properties to YAML format */
function convertResourceLimitsToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.cpu !== undefined && data.cpu !== null) extraData.cpu = Number(data.cpu);
  if (data.cpuSet) extraData['cpu-set'] = String(data.cpuSet);
  if (data.memory) extraData.memory = String(data.memory);
  if (data.shmSize) extraData['shm-size'] = String(data.shmSize);
}

/** Convert container capabilities and sysctls to YAML format */
function convertCapabilitiesToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.capAdd && Array.isArray(data.capAdd) && data.capAdd.length > 0) {
    extraData['cap-add'] = data.capAdd as string[];
  }
  if (data.sysctls && typeof data.sysctls === 'object' && Object.keys(data.sysctls as object).length > 0) {
    extraData.sysctls = data.sysctls as Record<string, unknown>;
  }
  if (data.devices && Array.isArray(data.devices) && data.devices.length > 0) {
    extraData.devices = data.devices as string[];
  }
}

/** Convert advanced/resource properties to YAML format */
function convertAdvancedToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  convertResourceLimitsToYaml(data, extraData);
  convertCapabilitiesToYaml(data, extraData);
  if (data.imagePullPolicy) extraData['image-pull-policy'] = String(data.imagePullPolicy);
  if (data.runtime) extraData.runtime = String(data.runtime);
}

/** Convert certificate properties to YAML format */
function convertCertToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (data.certIssue === undefined && !data.certKeySize && !data.certValidity && !data.sans) return;

  const cert: Record<string, unknown> = {};
  if (data.certIssue !== undefined) cert.issue = Boolean(data.certIssue);
  if (data.certKeySize) cert['key-size'] = String(data.certKeySize);
  if (data.certValidity) cert['validity-duration'] = String(data.certValidity);
  if (data.sans && Array.isArray(data.sans) && data.sans.length > 0) cert.SANs = data.sans;
  if (Object.keys(cert).length > 0) extraData.certificate = cert;
}

/** Convert healthcheck properties to YAML format */
function convertHealthcheckToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  const hc = data.healthCheck as Record<string, unknown> | undefined;
  if (!hc || typeof hc !== 'object') return;

  const healthcheck: Record<string, unknown> = {};
  if (hc.test) healthcheck.test = String(hc.test);
  if (hc.startPeriod !== undefined) healthcheck['start-period'] = Number(hc.startPeriod);
  if (hc.interval !== undefined) healthcheck.interval = Number(hc.interval);
  if (hc.timeout !== undefined) healthcheck.timeout = Number(hc.timeout);
  if (hc.retries !== undefined) healthcheck.retries = Number(hc.retries);
  if (Object.keys(healthcheck).length > 0) extraData.healthcheck = healthcheck;
}

/**
 * Convert NodeEditorData (camelCase) to extraData format (kebab-case) for YAML
 */
export function convertEditorDataToYaml(data: Record<string, unknown>): YamlExtraData {
  const extraData: YamlExtraData = {};

  convertBasicToYaml(data, extraData);
  convertConfigToYaml(data, extraData);
  convertRuntimeToYaml(data, extraData);
  convertNetworkToYaml(data, extraData);
  convertAdvancedToYaml(data, extraData);
  convertCertToYaml(data, extraData);
  convertHealthcheckToYaml(data, extraData);

  return extraData;
}
