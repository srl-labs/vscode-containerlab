/**
 * Utility functions for converting between NodeEditorData (camelCase) and
 * YAML extraData format (kebab-case)
 */

import type { NodeEditorData, HealthCheckConfig, SrosComponent } from "../types/editors";
import type { NodeSaveData } from "../../shared/io/NodePersistenceIO";

import { getString, getNumber, getBoolean, getStringArray, getRecord } from "./typeHelpers";

// ============================================================================
// YAML -> NodeEditorData (for loading into editor)
// ============================================================================

/** Parse basic properties from extraData (with fallback to top-level data) */
function parseBasicProps(
  rawData: Record<string, unknown>,
  extra: Record<string, unknown>
): Pick<
  NodeEditorData,
  | "id"
  | "name"
  | "kind"
  | "type"
  | "image"
  | "icon"
  | "iconColor"
  | "iconCornerRadius"
  | "labelPosition"
  | "direction"
  | "labelBackgroundColor"
> {
  return {
    id: (rawData.id as string) || "",
    name: (rawData.name as string) || (rawData.id as string) || "",
    // Check extraData first, then fall back to top-level data (for mock/dev mode)
    kind: getString(extra.kind) || getString(rawData.kind),
    type: getString(extra.type) || getString(rawData.type),
    image: getString(extra.image) || getString(rawData.image),
    // ReactFlow node data uses "role", parsed element format uses "topoViewerRole"
    icon: (rawData.role as string) || (rawData.topoViewerRole as string) || "",
    iconColor: rawData.iconColor as string | undefined,
    iconCornerRadius: rawData.iconCornerRadius as number | undefined,
    labelPosition:
      (rawData.labelPosition as string | undefined) || (extra.labelPosition as string | undefined),
    direction: (rawData.direction as string | undefined) || (extra.direction as string | undefined),
    labelBackgroundColor:
      (rawData.labelBackgroundColor as string | undefined) ||
      (extra.labelBackgroundColor as string | undefined)
  };
}

/** Parse configuration properties from extraData */
function parseConfigProps(
  extra: Record<string, unknown>
): Pick<
  NodeEditorData,
  | "startupConfig"
  | "enforceStartupConfig"
  | "suppressStartupConfig"
  | "license"
  | "binds"
  | "env"
  | "envFiles"
  | "labels"
> {
  return {
    startupConfig: getString(extra["startup-config"]),
    enforceStartupConfig: getBoolean(extra["enforce-startup-config"]),
    suppressStartupConfig: getBoolean(extra["suppress-startup-config"]),
    license: getString(extra.license),
    binds: getStringArray(extra.binds),
    env: getRecord(extra.env),
    envFiles: getStringArray(extra["env-files"]),
    labels: getRecord(extra.labels)
  };
}

/** Parse runtime properties from extraData */
function parseRuntimeProps(
  extra: Record<string, unknown>
): Pick<
  NodeEditorData,
  "user" | "entrypoint" | "cmd" | "exec" | "restartPolicy" | "autoRemove" | "startupDelay"
> {
  return {
    user: getString(extra.user),
    entrypoint: getString(extra.entrypoint),
    cmd: getString(extra.cmd),
    exec: getStringArray(extra.exec),
    restartPolicy: getString(extra["restart-policy"]),
    autoRemove: getBoolean(extra["auto-remove"]),
    startupDelay: getNumber(extra["startup-delay"])
  };
}

/** Parse network properties from extraData */
function parseNetworkProps(
  extra: Record<string, unknown>
): Pick<
  NodeEditorData,
  "mgmtIpv4" | "mgmtIpv6" | "networkMode" | "ports" | "dnsServers" | "aliases"
> {
  return {
    mgmtIpv4: getString(extra["mgmt-ipv4"]),
    mgmtIpv6: getString(extra["mgmt-ipv6"]),
    networkMode: getString(extra["network-mode"]),
    ports: getStringArray(extra.ports),
    dnsServers: getStringArray(extra.dns),
    aliases: getStringArray(extra.aliases)
  };
}

/** Parse resource/advanced properties from extraData */
function parseAdvancedProps(
  extra: Record<string, unknown>
): Pick<
  NodeEditorData,
  | "cpu"
  | "cpuSet"
  | "memory"
  | "shmSize"
  | "capAdd"
  | "sysctls"
  | "devices"
  | "imagePullPolicy"
  | "runtime"
> {
  return {
    cpu: getNumber(extra.cpu),
    cpuSet: getString(extra["cpu-set"]),
    memory: getString(extra.memory),
    shmSize: getString(extra["shm-size"]),
    capAdd: getStringArray(extra["cap-add"]),
    sysctls: getRecord(extra.sysctls),
    devices: getStringArray(extra.devices),
    imagePullPolicy: getString(extra["image-pull-policy"]),
    runtime: getString(extra.runtime)
  };
}

/** Parse certificate properties from extraData */
function parseCertProps(
  extra: Record<string, unknown>
): Pick<NodeEditorData, "certIssue" | "certKeySize" | "certValidity" | "sans"> {
  const certRaw = extra.certificate as Record<string, unknown> | undefined;
  if (!certRaw) return {};

  return {
    certIssue: certRaw.issue !== undefined ? Boolean(certRaw.issue) : undefined,
    certKeySize: getString(certRaw["key-size"]),
    certValidity: getString(certRaw["validity-duration"]),
    sans: getStringArray(certRaw.SANs)
  };
}

/** Parse healthcheck properties from extraData */
function parseHealthCheckProps(extra: Record<string, unknown>): {
  healthCheck?: HealthCheckConfig;
} {
  const healthcheckRaw = extra.healthcheck as Record<string, unknown> | undefined;
  if (!healthcheckRaw) return {};

  return {
    healthCheck: {
      test: getString(healthcheckRaw.test),
      startPeriod: getNumber(healthcheckRaw["start-period"]),
      interval: getNumber(healthcheckRaw.interval),
      timeout: getNumber(healthcheckRaw.timeout),
      retries: getNumber(healthcheckRaw.retries)
    }
  };
}

/** Parse MDA items from an array */
function parseMdaItems(arr: unknown[]): { slot?: number; type?: string }[] {
  return arr
    .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
    .map((m) => ({
      slot: getNumber(m.slot),
      type: getString(m.type)
    }));
}

/** Parse SROS components from extraData */
function parseComponentsProps(extra: Record<string, unknown>): { components?: SrosComponent[] } {
  const componentsRaw = extra.components;
  if (!Array.isArray(componentsRaw)) return {};

  const components: SrosComponent[] = componentsRaw
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
    .map((c: Record<string, unknown>) => ({
      slot: c.slot as string | number | undefined,
      type: getString(c.type),
      sfm: getString(c.sfm),
      mda: Array.isArray(c.mda) ? parseMdaItems(c.mda) : undefined,
      xiom: Array.isArray(c.xiom)
        ? (c.xiom as unknown[])
            .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object")
            .map((x) => ({
              slot: getNumber(x.slot),
              type: getString(x.type),
              mda: Array.isArray(x.mda) ? parseMdaItems(x.mda) : undefined
            }))
        : undefined
    }));

  return components.length > 0 ? { components } : {};
}

/**
 * Converts raw node data (from the graph/YAML) to NodeEditorData format
 * Maps from YAML kebab-case properties (in extraData) to camelCase NodeEditorData
 */
export function convertToEditorData(
  rawData: Record<string, unknown> | null
): NodeEditorData | null {
  if (!rawData) return null;
  const extra = (rawData.extraData as Record<string, unknown>) || {};

  return {
    ...parseBasicProps(rawData, extra),
    ...parseConfigProps(extra),
    ...parseRuntimeProps(extra),
    ...parseNetworkProps(extra),
    ...parseAdvancedProps(extra),
    ...parseCertProps(extra),
    ...parseHealthCheckProps(extra),
    ...parseComponentsProps(extra)
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
  "startup-config"?: string;
  "enforce-startup-config"?: boolean;
  "suppress-startup-config"?: boolean;
  license?: string;
  binds?: string[];
  env?: Record<string, unknown>;
  "env-files"?: string[];
  labels?: Record<string, unknown>;
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  "restart-policy"?: string;
  "auto-remove"?: boolean;
  "startup-delay"?: number;
  "mgmt-ipv4"?: string;
  "mgmt-ipv6"?: string;
  "network-mode"?: string;
  ports?: string[];
  dns?: string[];
  aliases?: string[];
  cpu?: number;
  "cpu-set"?: string;
  memory?: string;
  "shm-size"?: string;
  "cap-add"?: string[];
  sysctls?: Record<string, unknown>;
  devices?: string[];
  certificate?: Record<string, unknown>;
  healthcheck?: Record<string, unknown>;
  "image-pull-policy"?: string;
  runtime?: string;
  components?: unknown[];
  [key: string]: unknown;
}

// ============================================================================
// Helper functions for clearable field conversion
// These helpers reduce cognitive complexity by encapsulating the null-or-value pattern
// ============================================================================

/** Convert a string field: returns value if truthy, null if empty (for deletion) */
function toStringOrNull(value: unknown): string | null {
  return value ? String(value) : null;
}

/** Convert an array field: returns value if non-empty, null if empty (for deletion) */
function toArrayOrNull<T>(arr: T[]): T[] | null {
  return arr.length > 0 ? arr : null;
}

/** Convert a record field: returns value if non-empty, null if empty (for deletion) */
function toRecordOrNull(obj: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(obj).length > 0 ? obj : null;
}

/**
 * Convert a boolean field: returns true only if explicitly true, null otherwise (for deletion).
 * This matches containerlab behavior where most boolean fields default to false,
 * so explicit false is redundant and should be omitted.
 */
function toBooleanOrNull(value: unknown): true | null {
  return value === true ? true : null;
}

/**
 * Convert a number field: returns value if it's a valid positive number, null otherwise.
 * Empty strings, 0, NaN, undefined all result in null (deletion).
 */
function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  // Only return if it's a valid non-NaN number (allow 0 for explicit zero values)
  // But for most fields, 0 is the default, so we delete it
  return !isNaN(num) && num !== 0 ? num : null;
}

/** Convert basic properties to YAML format */
function convertBasicToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  // kind is typically required, so only set if present
  if (data.kind) extraData.kind = String(data.kind);
  // String fields: set value if non-empty, null if empty string (to trigger deletion)
  // Use 'in' check to detect when user explicitly cleared the field (set to undefined)
  if ("type" in data) extraData.type = toStringOrNull(data.type) as string;
  if ("image" in data) extraData.image = toStringOrNull(data.image) as string;
  if ("group" in data) extraData.group = toStringOrNull(data.group) as string;
}

/** Convert startup config properties to YAML format */
function convertStartupConfigToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if ("startupConfig" in data)
    extraData["startup-config"] = toStringOrNull(data.startupConfig) as string;
  // Boolean fields: only write true, otherwise delete (null)
  if ("enforceStartupConfig" in data) {
    extraData["enforce-startup-config"] = toBooleanOrNull(data.enforceStartupConfig) as boolean;
  }
  if ("suppressStartupConfig" in data) {
    extraData["suppress-startup-config"] = toBooleanOrNull(data.suppressStartupConfig) as boolean;
  }
  if ("license" in data) extraData.license = toStringOrNull(data.license) as string;
}

/** Convert container config properties to YAML format */
function convertContainerConfigToYaml(
  data: Record<string, unknown>,
  extraData: YamlExtraData
): void {
  if (Array.isArray(data.binds)) extraData.binds = toArrayOrNull(data.binds) as string[];
  if (typeof data.env === "object" && data.env !== null) {
    extraData.env = toRecordOrNull(data.env as Record<string, unknown>) as Record<string, unknown>;
  }
  if (Array.isArray(data.envFiles))
    extraData["env-files"] = toArrayOrNull(data.envFiles) as string[];
  if (typeof data.labels === "object" && data.labels !== null) {
    extraData.labels = toRecordOrNull(data.labels as Record<string, unknown>) as Record<
      string,
      unknown
    >;
  }
}

/** Convert configuration properties to YAML format */
function convertConfigToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  convertStartupConfigToYaml(data, extraData);
  convertContainerConfigToYaml(data, extraData);
}

/** Convert runtime properties to YAML format */
function convertRuntimeToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if ("user" in data) extraData.user = toStringOrNull(data.user) as string;
  if ("entrypoint" in data) extraData.entrypoint = toStringOrNull(data.entrypoint) as string;
  if ("cmd" in data) extraData.cmd = toStringOrNull(data.cmd) as string;
  if (Array.isArray(data.exec)) extraData.exec = toArrayOrNull(data.exec) as string[];
  if ("restartPolicy" in data)
    extraData["restart-policy"] = toStringOrNull(data.restartPolicy) as string;
  // Boolean field: only write true, otherwise delete (null)
  if ("autoRemove" in data) {
    extraData["auto-remove"] = toBooleanOrNull(data.autoRemove) as boolean;
  }
  // Number field: only write if non-zero, otherwise delete (null)
  // Use 'in' check to detect when user explicitly cleared the field (set to undefined)
  if ("startupDelay" in data) {
    extraData["startup-delay"] = toNumberOrNull(data.startupDelay) as number;
  }
}

/** Convert network properties to YAML format */
function convertNetworkToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if ("mgmtIpv4" in data) extraData["mgmt-ipv4"] = toStringOrNull(data.mgmtIpv4) as string;
  if ("mgmtIpv6" in data) extraData["mgmt-ipv6"] = toStringOrNull(data.mgmtIpv6) as string;
  if ("networkMode" in data) extraData["network-mode"] = toStringOrNull(data.networkMode) as string;
  if (Array.isArray(data.ports)) extraData.ports = toArrayOrNull(data.ports) as string[];
  if (Array.isArray(data.dnsServers)) extraData.dns = toArrayOrNull(data.dnsServers) as string[];
  if (Array.isArray(data.aliases)) extraData.aliases = toArrayOrNull(data.aliases) as string[];
}

/** Convert resource limit properties to YAML format */
function convertResourceLimitsToYaml(
  data: Record<string, unknown>,
  extraData: YamlExtraData
): void {
  // Number field: only write if non-zero, otherwise delete (null)
  if ("cpu" in data) {
    extraData.cpu = toNumberOrNull(data.cpu) as number;
  }
  if ("cpuSet" in data) extraData["cpu-set"] = toStringOrNull(data.cpuSet) as string;
  if ("memory" in data) extraData.memory = toStringOrNull(data.memory) as string;
  if ("shmSize" in data) extraData["shm-size"] = toStringOrNull(data.shmSize) as string;
}

/** Convert container capabilities and sysctls to YAML format */
function convertCapabilitiesToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  if (Array.isArray(data.capAdd)) extraData["cap-add"] = toArrayOrNull(data.capAdd) as string[];
  if (typeof data.sysctls === "object" && data.sysctls !== null) {
    extraData.sysctls = toRecordOrNull(data.sysctls as Record<string, unknown>) as Record<
      string,
      unknown
    >;
  }
  if (Array.isArray(data.devices)) extraData.devices = toArrayOrNull(data.devices) as string[];
}

/** Convert advanced/resource properties to YAML format */
function convertAdvancedToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  convertResourceLimitsToYaml(data, extraData);
  convertCapabilitiesToYaml(data, extraData);
  if ("imagePullPolicy" in data)
    extraData["image-pull-policy"] = toStringOrNull(data.imagePullPolicy) as string;
  if ("runtime" in data) extraData.runtime = toStringOrNull(data.runtime) as string;
}

/** Convert certificate properties to YAML format */
function convertCertToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  // Check if ANY certificate field is defined (even if empty - we need to know if user touched them)
  const hasCertFields =
    data.certIssue !== undefined ||
    data.certKeySize !== undefined ||
    data.certValidity !== undefined ||
    data.sans !== undefined;
  if (!hasCertFields) return;

  const cert: Record<string, unknown> = {};
  // Boolean field: only write true
  if (data.certIssue === true) cert.issue = true;
  // String fields
  const keySize = toStringOrNull(data.certKeySize);
  if (keySize) cert["key-size"] = keySize;
  const validity = toStringOrNull(data.certValidity);
  if (validity) cert["validity-duration"] = validity;
  // Array field
  const sansArr = Array.isArray(data.sans) ? toArrayOrNull(data.sans) : null;
  if (sansArr) cert.SANs = sansArr;

  // If all fields are empty, signal deletion; otherwise set the certificate object
  if (Object.keys(cert).length > 0) {
    extraData.certificate = cert;
  } else {
    // All certificate fields were cleared - delete the certificate
    extraData.certificate = null as unknown as Record<string, unknown>;
  }
}

/** Convert healthcheck properties to YAML format */
function convertHealthcheckToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  const hc = data.healthCheck as Record<string, unknown> | undefined;
  if (!hc || typeof hc !== "object") return;

  const healthcheck: Record<string, unknown> = {};
  // String field
  const test = toStringOrNull(hc.test);
  if (test) healthcheck.test = test;
  // Number fields - use toNumberOrNull for proper empty/zero handling
  const startPeriod = toNumberOrNull(hc.startPeriod);
  if (startPeriod !== null) healthcheck["start-period"] = startPeriod;
  const interval = toNumberOrNull(hc.interval);
  if (interval !== null) healthcheck.interval = interval;
  const timeout = toNumberOrNull(hc.timeout);
  if (timeout !== null) healthcheck.timeout = timeout;
  const retries = toNumberOrNull(hc.retries);
  if (retries !== null) healthcheck.retries = retries;

  // If all fields are empty, signal deletion; otherwise set the healthcheck object
  if (Object.keys(healthcheck).length > 0) {
    extraData.healthcheck = healthcheck;
  } else {
    // All healthcheck fields were cleared - delete the healthcheck
    extraData.healthcheck = null as unknown as Record<string, unknown>;
  }
}

/** Check if a component object has any meaningful properties */
function isNonEmptyComponent(comp: Record<string, unknown>): boolean {
  return Object.keys(comp).length > 0;
}

/** Convert MDA array to YAML format */
function convertMdaArray(
  mdaList: Array<{ slot?: string | number; type?: string }>
): Array<Record<string, unknown>> {
  return mdaList
    .map((m) => {
      const mda: Record<string, unknown> = {};
      if (m.slot !== undefined) mda.slot = m.slot;
      if (m.type) mda.type = m.type;
      return mda;
    })
    .filter(isNonEmptyComponent);
}

/** Convert a single SROS component to YAML format, returns null if empty */
function convertSingleComponent(c: SrosComponent): Record<string, unknown> | null {
  const comp: Record<string, unknown> = {};

  if (c.slot !== undefined && c.slot !== "") comp.slot = c.slot;
  if (c.type) comp.type = c.type;
  if (c.sfm) comp.sfm = c.sfm;

  if (c.mda && c.mda.length > 0) {
    const mdaList = convertMdaArray(c.mda);
    if (mdaList.length > 0) comp.mda = mdaList;
  }

  if (c.xiom && c.xiom.length > 0) {
    const xiomList = c.xiom
      .map((x) => {
        const xiom: Record<string, unknown> = {};
        if (x.slot !== undefined) xiom.slot = x.slot;
        if (x.type) xiom.type = x.type;
        if (x.mda && x.mda.length > 0) {
          const xMdaList = convertMdaArray(x.mda);
          if (xMdaList.length > 0) xiom.mda = xMdaList;
        }
        return xiom;
      })
      .filter(isNonEmptyComponent);
    if (xiomList.length > 0) comp.xiom = xiomList;
  }

  return isNonEmptyComponent(comp) ? comp : null;
}

/** Convert SROS components to YAML format */
function convertComponentsToYaml(data: Record<string, unknown>, extraData: YamlExtraData): void {
  const kind = data.kind as string | undefined;
  const components = data.components as SrosComponent[] | undefined;

  // If kind is not nokia_srsim, delete any existing components
  if (kind && kind !== "nokia_srsim") {
    extraData.components = null as unknown as undefined[];
    return;
  }

  // If components is explicitly set to empty array, signal deletion
  if (Array.isArray(components) && components.length === 0) {
    extraData.components = null as unknown as undefined[];
    return;
  }

  if (!components || !Array.isArray(components)) return;

  // Convert components, filtering out empty ones
  const converted = components
    .map(convertSingleComponent)
    .filter((c): c is Record<string, unknown> => c !== null);

  // If all components were empty, signal deletion
  if (converted.length === 0) {
    extraData.components = null as unknown as undefined[];
    return;
  }

  extraData.components = converted;
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
  convertComponentsToYaml(data, extraData);

  return extraData;
}

// ============================================================================
// NodeEditorData -> NodeSaveData (for TopologyIO service)
// ============================================================================

function mapDefaultToNull(
  value: string | undefined,
  defaultValue: string
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === defaultValue ? null : value;
}

function normalizeLabelBackgroundColor(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return null;
  }

  const normalizedValue = trimmedValue.replace(/\s+/g, "").toLowerCase();
  if (normalizedValue === "rgba(0,0,0,0.7)") {
    return null;
  }

  return trimmedValue;
}

/**
 * Convert NodeEditorData to NodeSaveData format for TopologyIO.
 * This is used when saving node editor changes via the services.
 *
 * @param data - NodeEditorData from the editor panel
 * @param oldName - Optional original name if node is being renamed
 * @returns NodeSaveData for TopologyIO.editNode()
 */
export function convertEditorDataToNodeSaveData(
  data: NodeEditorData,
  oldName?: string
): NodeSaveData {
  const yamlExtraData = convertEditorDataToYaml(data as unknown as Record<string, unknown>);
  const labelPosition = mapDefaultToNull(data.labelPosition, "bottom");
  const direction = mapDefaultToNull(data.direction, "right");
  const labelBackgroundColor = normalizeLabelBackgroundColor(data.labelBackgroundColor);

  // Build the extraData with annotation props.
  const extraData: NodeSaveData["extraData"] = {
    ...yamlExtraData,
    // Annotation properties (saved to annotations.json, not YAML)
    topoViewerRole: data.icon,
    iconColor: data.iconColor,
    iconCornerRadius: data.iconCornerRadius,
    interfacePattern: data.interfacePattern,
    labelPosition,
    direction,
    labelBackgroundColor
  };

  const saveData: NodeSaveData = {
    id: data.id,
    name: data.name,
    extraData
  };

  // If renaming, include the old name so TopologyIO can find and rename the node
  if (oldName && oldName !== data.name) {
    (saveData as NodeSaveData & { oldName?: string }).oldName = oldName;
  }

  return saveData;
}
