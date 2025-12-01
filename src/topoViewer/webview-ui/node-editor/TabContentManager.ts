// file: managerTabContent.ts

import { createFilterableDropdown } from "../utilities/FilterableDropdown";
import type { DynamicEntriesManager } from "./DynamicEntriesManager";

// Container names
const CN_BINDS = "binds" as const;
const CN_ENV = "env" as const;
const CN_ENV_FILES = "env-files" as const;
const CN_LABELS = "labels" as const;
const CN_EXEC = "exec" as const;
const CN_PORTS = "ports" as const;
const CN_DNS_SERVERS = "dns-servers" as const;
const CN_ALIASES = "network-aliases" as const;
const CN_CAP_ADD = "cap-add" as const;
const CN_SYSCTLS = "sysctls" as const;
const CN_DEVICES = "devices" as const;
const CN_SANS = "sans" as const;

// Placeholder constants
const PH_BIND = "Bind mount (host:container)" as const;
const PH_ENV_FILE = "Path to env file" as const;
const PH_EXEC = "Command to execute" as const;
const PH_PORT = "Host:Container (e.g., 8080:80)" as const;
const PH_DNS_SERVER = "DNS server IP" as const;
const PH_ALIAS = "Network alias" as const;
const PH_CAP = "Capability (e.g., NET_ADMIN)" as const;
const PH_DEVICE = "Device path (e.g., /dev/net/tun)" as const;
const PH_SAN = "SAN (e.g., test.com or 192.168.1.1)" as const;

// Field IDs
const ID_NODE_STARTUP_CONFIG = "node-startup-config" as const;
const ID_NODE_ENFORCE_STARTUP_CONFIG = "node-enforce-startup-config" as const;
const ID_NODE_SUPPRESS_STARTUP_CONFIG = "node-suppress-startup-config" as const;
const ID_NODE_LICENSE = "node-license" as const;
const ID_NODE_BINDS_CONTAINER = "node-binds-container" as const;
const ID_NODE_ENV_CONTAINER = "node-env-container" as const;
const ID_NODE_ENV_FILES_CONTAINER = "node-env-files-container" as const;
const ID_NODE_LABELS_CONTAINER = "node-labels-container" as const;
const ID_NODE_USER = "node-user" as const;
const ID_NODE_ENTRYPOINT = "node-entrypoint" as const;
const ID_NODE_CMD = "node-cmd" as const;
const ID_NODE_RP_DROPDOWN = "node-restart-policy-dropdown-container" as const;
const ID_NODE_RP_FILTER_INPUT = "node-restart-policy-dropdown-container-filter-input" as const;
const ID_NODE_AUTO_REMOVE = "node-auto-remove" as const;
const ID_NODE_STARTUP_DELAY = "node-startup-delay" as const;
const ID_NODE_EXEC_CONTAINER = "node-exec-container" as const;
const ID_NODE_MGMT_IPV4 = "node-mgmt-ipv4" as const;
const ID_NODE_MGMT_IPV6 = "node-mgmt-ipv6" as const;
const ID_NODE_NM_DROPDOWN = "node-network-mode-dropdown-container" as const;
const ID_NODE_NM_FILTER_INPUT = "node-network-mode-dropdown-container-filter-input" as const;
const ID_NODE_PORTS_CONTAINER = "node-ports-container" as const;
const ID_NODE_DNS_SERVERS_CONTAINER = "node-dns-servers-container" as const;
const ID_NODE_ALIASES_CONTAINER = "node-network-aliases-container" as const;
const ID_NODE_MEMORY = "node-memory" as const;
const ID_NODE_CPU = "node-cpu" as const;
const ID_NODE_CPU_SET = "node-cpu-set" as const;
const ID_NODE_SHM_SIZE = "node-shm-size" as const;
const ID_NODE_CAP_ADD_CONTAINER = "node-cap-add-container" as const;
const ID_NODE_SYSCTLS_CONTAINER = "node-sysctls-container" as const;
const ID_NODE_DEVICES_CONTAINER = "node-devices-container" as const;
const ID_NODE_CERT_ISSUE = "node-cert-issue" as const;
const ID_NODE_CERT_KEYSIZE_DROPDOWN = "node-cert-key-size-dropdown-container" as const;
const ID_NODE_CERT_KEYSIZE_FILTER_INPUT = "node-cert-key-size-dropdown-container-filter-input" as const;
const ID_NODE_CERT_VALIDITY = "node-cert-validity" as const;
const ID_HC_TEST = "node-healthcheck-test" as const;
const ID_HC_START = "node-healthcheck-start-period" as const;
const ID_HC_INTERVAL = "node-healthcheck-interval" as const;
const ID_HC_TIMEOUT = "node-healthcheck-timeout" as const;
const ID_HC_RETRIES = "node-healthcheck-retries" as const;
const ID_NODE_IPP_DROPDOWN = "node-image-pull-policy-dropdown-container" as const;
const ID_NODE_IPP_FILTER_INPUT = "node-image-pull-policy-dropdown-container-filter-input" as const;
const ID_NODE_RUNTIME_DROPDOWN = "node-runtime-dropdown-container" as const;
const ID_NODE_RUNTIME_FILTER_INPUT = "node-runtime-dropdown-container-filter-input" as const;

// Property names
const PROP_STARTUP_CONFIG = "startup-config" as const;
const PROP_ENFORCE_STARTUP_CONFIG = "enforce-startup-config" as const;
const PROP_SUPPRESS_STARTUP_CONFIG = "suppress-startup-config" as const;
const PROP_RESTART_POLICY = "restart-policy" as const;
const PROP_AUTO_REMOVE = "auto-remove" as const;
const PROP_STARTUP_DELAY = "startup-delay" as const;
const PROP_MGMT_IPV4 = "mgmt-ipv4" as const;
const PROP_MGMT_IPV6 = "mgmt-ipv6" as const;
const PROP_NETWORK_MODE = "network-mode" as const;
const PROP_PORTS = "ports" as const;
const PROP_DNS = "dns" as const;
const PROP_ALIASES = "aliases" as const;
const PROP_MEMORY = "memory" as const;
const PROP_CPU = "cpu" as const;
const PROP_CPU_SET = "cpu-set" as const;
const PROP_SHM_SIZE = "shm-size" as const;
const PROP_CAP_ADD = "cap-add" as const;
const PROP_SYSCTLS = "sysctls" as const;
const PROP_DEVICES = "devices" as const;
const PROP_CERTIFICATE = "certificate" as const;
const PROP_HEALTHCHECK = "healthcheck" as const;
const PROP_IMAGE_PULL_POLICY = "image-pull-policy" as const;
const PROP_RUNTIME = "runtime" as const;

// Dropdown placeholders
const PH_SEARCH_RP = "Search restart policy..." as const;
const PH_SEARCH_NM = "Search network mode..." as const;
const PH_SEARCH_KEY_SIZE = "Search key size..." as const;
const PH_SEARCH_IPP = "Search pull policy..." as const;
const PH_SEARCH_RUNTIME = "Search runtime..." as const;

const LABEL_DEFAULT = "Default" as const;

// Options
const OPTIONS_RP = [LABEL_DEFAULT, "no", "on-failure", "always", "unless-stopped"] as const;
const OPTIONS_NM = [LABEL_DEFAULT, "host", "none"] as const;
const OPTIONS_IPP = [LABEL_DEFAULT, "IfNotPresent", "Never", "Always"] as const;
const OPTIONS_RUNTIME = [LABEL_DEFAULT, "docker", "podman", "ignite"] as const;

/**
 * NodeProperties interface for node configuration
 */
export interface NodeProperties {
  name?: string;
  kind?: string;
  type?: string;
  image?: string;
  interfacePattern?: string;
  license?: string;
  binds?: string[];
  env?: Record<string, string>;
  labels?: Record<string, string>;
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  ports?: string[];
  dns?: { servers?: string[] };
  aliases?: string[];
  memory?: string;
  cpu?: number;
  sysctls?: Record<string, string | number>;
  devices?: string[];
  certificate?: {
    issue?: boolean;
    "key-size"?: number;
    "validity-duration"?: string;
    sans?: string[];
  };
  healthcheck?: {
    test?: string[];
    interval?: number;
    timeout?: number;
    "start-period"?: number;
    retries?: number;
  };
  components?: any[];
  runtime?: string;
  "restart-policy"?: string;
  "auto-remove"?: boolean;
  "startup-delay"?: number;
  "network-mode"?: string;
  "cap-add"?: string[];
  "image-pull-policy"?: string;
  [key: string]: any;
}

/**
 * Interface for form utilities needed from the parent manager
 */
/* eslint-disable no-unused-vars */
export interface FormUtilities {
  setInputValue: (id: string, value: string | number) => void;
  getInputValue: (id: string) => string;
  setCheckboxValue: (id: string, value: boolean) => void;
  getCheckboxValue: (id: string) => boolean;
  markFieldInheritance: (fieldId: string, inherited: boolean) => void;
}
/* eslint-enable no-unused-vars */

/**
 * TabContentManager handles loading and collecting node properties for each tab
 */
export class TabContentManager {
  private formUtils: FormUtilities;
  private dynamicEntriesManager: DynamicEntriesManager;

  constructor(formUtils: FormUtilities, dynamicEntriesManager: DynamicEntriesManager) {
    this.formUtils = formUtils;
    this.dynamicEntriesManager = dynamicEntriesManager;
  }

  // ============================================
  // LOADING METHODS
  // ============================================

  public loadConfigurationTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.formUtils.setInputValue(ID_NODE_STARTUP_CONFIG, extraData[PROP_STARTUP_CONFIG] || "");
    this.formUtils.markFieldInheritance(
      ID_NODE_STARTUP_CONFIG,
      actualInherited.includes(PROP_STARTUP_CONFIG)
    );
    this.formUtils.setCheckboxValue(
      ID_NODE_ENFORCE_STARTUP_CONFIG,
      extraData[PROP_ENFORCE_STARTUP_CONFIG] || false
    );
    this.formUtils.markFieldInheritance(
      ID_NODE_ENFORCE_STARTUP_CONFIG,
      actualInherited.includes(PROP_ENFORCE_STARTUP_CONFIG)
    );
    this.formUtils.setCheckboxValue(
      ID_NODE_SUPPRESS_STARTUP_CONFIG,
      extraData[PROP_SUPPRESS_STARTUP_CONFIG] || false
    );
    this.formUtils.markFieldInheritance(
      ID_NODE_SUPPRESS_STARTUP_CONFIG,
      actualInherited.includes(PROP_SUPPRESS_STARTUP_CONFIG)
    );
    this.formUtils.setInputValue(ID_NODE_LICENSE, extraData.license || "");
    this.formUtils.markFieldInheritance(ID_NODE_LICENSE, actualInherited.includes("license"));

    this.populateArrayProperty(extraData, CN_BINDS, CN_BINDS, PH_BIND, ID_NODE_BINDS_CONTAINER, actualInherited);
    this.populateKeyValueProperty(extraData, CN_ENV, CN_ENV, ID_NODE_ENV_CONTAINER, actualInherited);
    this.populateArrayProperty(extraData, CN_ENV_FILES, CN_ENV_FILES, PH_ENV_FILE, ID_NODE_ENV_FILES_CONTAINER, actualInherited);
    this.populateKeyValueProperty(extraData, CN_LABELS, CN_LABELS, ID_NODE_LABELS_CONTAINER, actualInherited);
  }

  public loadRuntimeTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.formUtils.setInputValue(ID_NODE_USER, extraData.user || "");
    this.formUtils.markFieldInheritance(ID_NODE_USER, actualInherited.includes("user"));
    this.formUtils.setInputValue(ID_NODE_ENTRYPOINT, extraData.entrypoint || "");
    this.formUtils.markFieldInheritance(ID_NODE_ENTRYPOINT, actualInherited.includes("entrypoint"));
    this.formUtils.setInputValue(ID_NODE_CMD, extraData.cmd || "");
    this.formUtils.markFieldInheritance(ID_NODE_CMD, actualInherited.includes("cmd"));

    const rpOptions = [...OPTIONS_RP];
    const rpInitial = extraData[PROP_RESTART_POLICY] || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_RP_DROPDOWN, rpOptions, rpInitial, () => {}, PH_SEARCH_RP);
    this.formUtils.markFieldInheritance(ID_NODE_RP_DROPDOWN, actualInherited.includes(PROP_RESTART_POLICY));

    this.formUtils.setCheckboxValue(ID_NODE_AUTO_REMOVE, extraData[PROP_AUTO_REMOVE] || false);
    this.formUtils.markFieldInheritance(ID_NODE_AUTO_REMOVE, actualInherited.includes(PROP_AUTO_REMOVE));
    this.formUtils.setInputValue(ID_NODE_STARTUP_DELAY, extraData[PROP_STARTUP_DELAY] || "");
    this.formUtils.markFieldInheritance(ID_NODE_STARTUP_DELAY, actualInherited.includes(PROP_STARTUP_DELAY));

    if (extraData.exec && Array.isArray(extraData.exec)) {
      extraData.exec.forEach((cmd: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_EXEC, cmd, PH_EXEC)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_EXEC_CONTAINER, actualInherited.includes("exec"));
  }

  public loadNetworkTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.formUtils.setInputValue(ID_NODE_MGMT_IPV4, extraData[PROP_MGMT_IPV4] || "");
    this.formUtils.markFieldInheritance(ID_NODE_MGMT_IPV4, actualInherited.includes(PROP_MGMT_IPV4));
    this.formUtils.setInputValue(ID_NODE_MGMT_IPV6, extraData[PROP_MGMT_IPV6] || "");
    this.formUtils.markFieldInheritance(ID_NODE_MGMT_IPV6, actualInherited.includes(PROP_MGMT_IPV6));

    const nmOptions = [...OPTIONS_NM];
    const nmInitial = extraData[PROP_NETWORK_MODE] || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_NM_DROPDOWN, nmOptions, nmInitial, () => {}, PH_SEARCH_NM);
    this.formUtils.markFieldInheritance(ID_NODE_NM_DROPDOWN, actualInherited.includes(PROP_NETWORK_MODE));

    if (extraData.ports && Array.isArray(extraData.ports)) {
      extraData.ports.forEach((port: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_PORTS, port, PH_PORT)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_PORTS_CONTAINER, actualInherited.includes(PROP_PORTS));

    if (extraData.dns && extraData.dns.servers && Array.isArray(extraData.dns.servers)) {
      extraData.dns.servers.forEach((server: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_DNS_SERVERS, server, PH_DNS_SERVER)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_DNS_SERVERS_CONTAINER, actualInherited.includes(PROP_DNS));

    if (extraData.aliases && Array.isArray(extraData.aliases)) {
      extraData.aliases.forEach((alias: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_ALIASES, alias, PH_ALIAS)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_ALIASES_CONTAINER, actualInherited.includes(PROP_ALIASES));
  }

  public loadAdvancedTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.loadResourceLimits(extraData, actualInherited);
    this.loadCapAdd(extraData, actualInherited);
    this.loadSysctls(extraData, actualInherited);
    this.loadDevices(extraData, actualInherited);
    this.loadCertificateSection(extraData, actualInherited);
    this.loadHealthcheckSection(extraData, actualInherited);
    this.loadImagePullPolicy(extraData, actualInherited);
    this.loadRuntimeOption(extraData, actualInherited);
  }

  private loadResourceLimits(extraData: Record<string, any>, actualInherited: string[]): void {
    this.formUtils.setInputValue(ID_NODE_MEMORY, extraData.memory || "");
    this.formUtils.markFieldInheritance(ID_NODE_MEMORY, actualInherited.includes(PROP_MEMORY));
    this.formUtils.setInputValue(ID_NODE_CPU, extraData.cpu || "");
    this.formUtils.markFieldInheritance(ID_NODE_CPU, actualInherited.includes(PROP_CPU));
    this.formUtils.setInputValue(ID_NODE_CPU_SET, extraData[PROP_CPU_SET] || "");
    this.formUtils.markFieldInheritance(ID_NODE_CPU_SET, actualInherited.includes(PROP_CPU_SET));
    this.formUtils.setInputValue(ID_NODE_SHM_SIZE, extraData[PROP_SHM_SIZE] || "");
    this.formUtils.markFieldInheritance(ID_NODE_SHM_SIZE, actualInherited.includes(PROP_SHM_SIZE));
  }

  private loadCapAdd(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData[PROP_CAP_ADD] && Array.isArray(extraData[PROP_CAP_ADD])) {
      extraData[PROP_CAP_ADD].forEach((cap: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_CAP_ADD, cap, PH_CAP)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_CAP_ADD_CONTAINER, actualInherited.includes(PROP_CAP_ADD));
  }

  private loadSysctls(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.sysctls && typeof extraData.sysctls === "object") {
      Object.entries(extraData.sysctls).forEach(([key, value]) =>
        this.dynamicEntriesManager.addDynamicKeyValueEntryWithValue(CN_SYSCTLS, key, String(value))
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_SYSCTLS_CONTAINER, actualInherited.includes(PROP_SYSCTLS));
  }

  private loadDevices(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.devices && Array.isArray(extraData.devices)) {
      extraData.devices.forEach((device: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(CN_DEVICES, device, PH_DEVICE)
      );
    }
    this.formUtils.markFieldInheritance(ID_NODE_DEVICES_CONTAINER, actualInherited.includes(PROP_DEVICES));
  }

  private loadCertificateSection(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.certificate) {
      this.formUtils.setCheckboxValue(ID_NODE_CERT_ISSUE, extraData.certificate.issue || false);
      this.formUtils.markFieldInheritance(ID_NODE_CERT_ISSUE, actualInherited.includes(PROP_CERTIFICATE));
      const keySizeOptions = ["2048", "4096"];
      const keySizeInitial = String(extraData.certificate["key-size"] || "2048");
      createFilterableDropdown(ID_NODE_CERT_KEYSIZE_DROPDOWN, keySizeOptions, keySizeInitial, () => {}, PH_SEARCH_KEY_SIZE);
      this.formUtils.setInputValue(ID_NODE_CERT_VALIDITY, extraData.certificate["validity-duration"] || "");
      if (extraData.certificate.sans && Array.isArray(extraData.certificate.sans)) {
        extraData.certificate.sans.forEach((san: string) =>
          this.dynamicEntriesManager.addDynamicEntryWithValue(CN_SANS, san, PH_SAN)
        );
      }
    }
  }

  private loadHealthcheckSection(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.healthcheck) {
      const hc = extraData.healthcheck;
      this.formUtils.setInputValue(ID_HC_TEST, hc.test ? hc.test.join(" ") : "");
      this.formUtils.setInputValue(ID_HC_START, hc["start-period"] || "");
      this.formUtils.setInputValue(ID_HC_INTERVAL, hc.interval || "");
      this.formUtils.setInputValue(ID_HC_TIMEOUT, hc.timeout || "");
      this.formUtils.setInputValue(ID_HC_RETRIES, hc.retries || "");
    }
    this.formUtils.markFieldInheritance(ID_HC_TEST, actualInherited.includes(PROP_HEALTHCHECK));
  }

  private loadImagePullPolicy(extraData: Record<string, any>, actualInherited: string[]): void {
    const ippOptions = [...OPTIONS_IPP];
    const ippInitial = extraData[PROP_IMAGE_PULL_POLICY] || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_IPP_DROPDOWN, ippOptions, ippInitial, () => {}, PH_SEARCH_IPP);
    this.formUtils.markFieldInheritance(ID_NODE_IPP_DROPDOWN, actualInherited.includes(PROP_IMAGE_PULL_POLICY));
  }

  private loadRuntimeOption(extraData: Record<string, any>, actualInherited: string[]): void {
    const runtimeOptions = [...OPTIONS_RUNTIME];
    const runtimeInitial = extraData.runtime || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_RUNTIME_DROPDOWN, runtimeOptions, runtimeInitial, () => {}, PH_SEARCH_RUNTIME);
    this.formUtils.markFieldInheritance(ID_NODE_RUNTIME_DROPDOWN, actualInherited.includes(PROP_RUNTIME));
  }

  private populateArrayProperty(
    source: Record<string, any>,
    propName: string,
    containerName: string,
    placeholder: string,
    containerId: string,
    actualInherited: string[]
  ): void {
    const values = source[propName];
    if (Array.isArray(values)) {
      values.forEach((value: string) =>
        this.dynamicEntriesManager.addDynamicEntryWithValue(containerName, value, placeholder)
      );
    }
    this.formUtils.markFieldInheritance(containerId, actualInherited.includes(propName));
  }

  private populateKeyValueProperty(
    source: Record<string, any>,
    propName: string,
    containerName: string,
    containerId: string,
    actualInherited: string[]
  ): void {
    const mapEntries = source[propName];
    if (mapEntries && typeof mapEntries === "object" && !Array.isArray(mapEntries)) {
      Object.entries(mapEntries).forEach(([key, value]) =>
        this.dynamicEntriesManager.addDynamicKeyValueEntryWithValue(containerName, key, value as string)
      );
    }
    this.formUtils.markFieldInheritance(containerId, actualInherited.includes(propName));
  }

  // ============================================
  // COLLECTION METHODS
  // ============================================

  public collectConfigurationProps(nodeProps: NodeProperties): void {
    const startupConfig = this.formUtils.getInputValue(ID_NODE_STARTUP_CONFIG);
    if (startupConfig) nodeProps[PROP_STARTUP_CONFIG] = startupConfig;

    if (this.formUtils.getCheckboxValue(ID_NODE_ENFORCE_STARTUP_CONFIG)) {
      nodeProps[PROP_ENFORCE_STARTUP_CONFIG] = true;
    }
    if (this.formUtils.getCheckboxValue(ID_NODE_SUPPRESS_STARTUP_CONFIG)) {
      nodeProps[PROP_SUPPRESS_STARTUP_CONFIG] = true;
    }

    const license = this.formUtils.getInputValue(ID_NODE_LICENSE);
    if (license) nodeProps.license = license;

    const binds = this.dynamicEntriesManager.collectDynamicEntries(CN_BINDS);
    if (binds.length > 0) nodeProps.binds = binds;

    const env = this.dynamicEntriesManager.collectDynamicKeyValueEntries("env");
    if (Object.keys(env).length > 0) nodeProps.env = env;

    const envFiles = this.dynamicEntriesManager.collectDynamicEntries(CN_ENV_FILES);
    if (envFiles.length > 0) nodeProps[CN_ENV_FILES] = envFiles;

    const labels = this.dynamicEntriesManager.collectDynamicKeyValueEntries("labels");
    if (Object.keys(labels).length > 0) nodeProps.labels = labels;
  }

  public collectRuntimeProps(nodeProps: NodeProperties): void {
    const user = this.formUtils.getInputValue(ID_NODE_USER);
    if (user) nodeProps.user = user;

    const entrypoint = this.formUtils.getInputValue(ID_NODE_ENTRYPOINT);
    if (entrypoint) nodeProps.entrypoint = entrypoint;

    const cmd = this.formUtils.getInputValue(ID_NODE_CMD);
    if (cmd) nodeProps.cmd = cmd;

    const exec = this.dynamicEntriesManager.collectDynamicEntries(CN_EXEC);
    if (exec.length > 0) nodeProps.exec = exec;

    const rpVal = (document.getElementById(ID_NODE_RP_FILTER_INPUT) as HTMLInputElement | null)?.value || "";
    if (rpVal && rpVal !== LABEL_DEFAULT) nodeProps["restart-policy"] = rpVal;

    if (this.formUtils.getCheckboxValue(ID_NODE_AUTO_REMOVE)) {
      nodeProps["auto-remove"] = true;
    }

    const startupDelay = this.formUtils.getInputValue(ID_NODE_STARTUP_DELAY);
    if (startupDelay) nodeProps["startup-delay"] = parseInt(startupDelay);
  }

  public collectNetworkProps(nodeProps: NodeProperties): void {
    const mgmtIpv4 = this.formUtils.getInputValue(ID_NODE_MGMT_IPV4);
    if (mgmtIpv4) nodeProps[PROP_MGMT_IPV4] = mgmtIpv4;

    const mgmtIpv6 = this.formUtils.getInputValue(ID_NODE_MGMT_IPV6);
    if (mgmtIpv6) nodeProps[PROP_MGMT_IPV6] = mgmtIpv6;

    const nmVal = (document.getElementById(ID_NODE_NM_FILTER_INPUT) as HTMLInputElement | null)?.value || "";
    if (nmVal && nmVal !== LABEL_DEFAULT) nodeProps["network-mode"] = nmVal;

    const ports = this.dynamicEntriesManager.collectDynamicEntries(CN_PORTS);
    if (ports.length > 0) nodeProps.ports = ports;

    const dnsServers = this.dynamicEntriesManager.collectDynamicEntries(CN_DNS_SERVERS);
    if (dnsServers.length > 0) {
      nodeProps.dns = nodeProps.dns || {};
      nodeProps.dns.servers = dnsServers;
    }

    const aliases = this.dynamicEntriesManager.collectDynamicEntries(CN_ALIASES);
    if (aliases.length > 0) nodeProps.aliases = aliases;
  }

  public collectAdvancedProps(nodeProps: NodeProperties): void {
    const memory = this.formUtils.getInputValue(ID_NODE_MEMORY);
    if (memory) nodeProps.memory = memory;

    const cpu = this.formUtils.getInputValue(ID_NODE_CPU);
    if (cpu) nodeProps.cpu = parseFloat(cpu);

    const cpuSet = this.formUtils.getInputValue(ID_NODE_CPU_SET);
    if (cpuSet) nodeProps[PROP_CPU_SET] = cpuSet;

    const shmSize = this.formUtils.getInputValue(ID_NODE_SHM_SIZE);
    if (shmSize) nodeProps[PROP_SHM_SIZE] = shmSize;

    const capAdd = this.dynamicEntriesManager.collectDynamicEntries(CN_CAP_ADD);
    if (capAdd.length > 0) nodeProps["cap-add"] = capAdd;

    const sysctls = this.dynamicEntriesManager.collectDynamicKeyValueEntries("sysctls");
    if (Object.keys(sysctls).length > 0) {
      nodeProps.sysctls = {};
      Object.entries(sysctls).forEach(([key, value]) => {
        const numValue = parseFloat(value);
        nodeProps.sysctls![key] = isNaN(numValue) ? value : numValue;
      });
    }

    const devices = this.dynamicEntriesManager.collectDynamicEntries(CN_DEVICES);
    if (devices.length > 0) nodeProps.devices = devices;
  }

  public collectCertificateProps(nodeProps: NodeProperties): void {
    if (!this.formUtils.getCheckboxValue(ID_NODE_CERT_ISSUE)) return;
    nodeProps.certificate = { issue: true };

    const keySize = (document.getElementById(ID_NODE_CERT_KEYSIZE_FILTER_INPUT) as HTMLInputElement | null)?.value || "";
    if (keySize) nodeProps.certificate["key-size"] = parseInt(keySize);

    const validity = this.formUtils.getInputValue(ID_NODE_CERT_VALIDITY);
    if (validity) nodeProps.certificate["validity-duration"] = validity;

    const sans = this.dynamicEntriesManager.collectDynamicEntries(CN_SANS);
    if (sans.length > 0) nodeProps.certificate.sans = sans;
  }

  public collectHealthcheckProps(nodeProps: NodeProperties): void {
    const hcTest = this.formUtils.getInputValue(ID_HC_TEST);
    if (hcTest) {
      this.ensureHealthcheck(nodeProps);
      nodeProps.healthcheck!.test = hcTest.split(" ");
    }

    this.setHealthcheckNumber(nodeProps, ID_HC_START, "start-period");
    this.setHealthcheckNumber(nodeProps, ID_HC_INTERVAL, "interval");
    this.setHealthcheckNumber(nodeProps, ID_HC_TIMEOUT, "timeout");
    this.setHealthcheckNumber(nodeProps, ID_HC_RETRIES, "retries");

    const ippVal = (document.getElementById(ID_NODE_IPP_FILTER_INPUT) as HTMLInputElement | null)?.value || "";
    if (ippVal && ippVal !== LABEL_DEFAULT) nodeProps["image-pull-policy"] = ippVal;

    const runtimeVal = (document.getElementById(ID_NODE_RUNTIME_FILTER_INPUT) as HTMLInputElement | null)?.value || "";
    if (runtimeVal && runtimeVal !== LABEL_DEFAULT) nodeProps.runtime = runtimeVal;
  }

  private ensureHealthcheck(nodeProps: NodeProperties): void {
    if (!nodeProps.healthcheck) nodeProps.healthcheck = {};
  }

  private setHealthcheckNumber(
    nodeProps: NodeProperties,
    inputId: string,
    prop: keyof NonNullable<NodeProperties["healthcheck"]>
  ): void {
    const value = this.formUtils.getInputValue(inputId);
    if (!value) return;
    this.ensureHealthcheck(nodeProps);
    (nodeProps.healthcheck as any)[prop] = parseInt(value);
  }
}
