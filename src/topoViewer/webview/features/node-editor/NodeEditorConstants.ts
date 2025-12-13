// NodeEditorConstants.ts - Constants for the Node Editor

import { FieldMapping } from "./InheritanceBadgeManager";

// Common CSS classes and element IDs
export const CLASS_HIDDEN = "hidden" as const;
export const CLASS_DYNAMIC_DELETE_BTN = "dynamic-delete-btn" as const;
export const SELECTOR_FORM_GROUP = ".form-group" as const;
export const DEFAULT_ICON_COLOR = "#005aff" as const;
export const DEFAULT_ICON_CORNER_RADIUS = 0;

export const ID_PANEL_NODE_EDITOR = "panel-node-editor" as const;
export const ID_PANEL_EDITOR_CLOSE = "panel-node-editor-close" as const;
export const ID_PANEL_EDITOR_APPLY = "panel-node-editor-apply" as const;
export const ID_PANEL_EDITOR_SAVE = "panel-node-editor-save" as const;
export const CLASS_HAS_CHANGES = "btn-has-changes" as const;
export const ID_NODE_CERT_ISSUE = "node-cert-issue" as const;
export const ID_CERT_OPTIONS = "cert-options" as const;
export const ID_PANEL_NODE_EDITOR_ID = "panel-node-editor-id" as const;

// Frequently used Node Editor element IDs
export const ID_NODE_KIND_DROPDOWN = "node-kind-dropdown-container" as const;
export const ID_NODE_KIND_FILTER_INPUT = "node-kind-dropdown-container-filter-input" as const;
export const ID_NODE_TYPE = "node-type" as const;
export const ID_NODE_TYPE_DROPDOWN = "panel-node-type-dropdown-container" as const;
export const ID_NODE_TYPE_FILTER_INPUT = "panel-node-type-dropdown-container-filter-input" as const;
export const ID_NODE_TYPE_WARNING = "node-type-warning" as const;
export const ID_NODE_ICON_COLOR = "node-icon-color" as const;
export const ID_NODE_RP_DROPDOWN = "node-restart-policy-dropdown-container" as const;
export const ID_NODE_NM_DROPDOWN = "node-network-mode-dropdown-container" as const;
export const ID_NODE_INTERFACE_PATTERN = "node-interface-pattern" as const;

export const ID_NODE_IPP_DROPDOWN = "node-image-pull-policy-dropdown-container" as const;
export const ID_NODE_RUNTIME_DROPDOWN = "node-runtime-dropdown-container" as const;
export const ID_NODE_IMAGE_DROPDOWN = "node-image-dropdown-container" as const;
export const ID_PANEL_NODE_TOPOROLE_CONTAINER = "panel-node-topoviewerrole-dropdown-container" as const;
export const ID_PANEL_NODE_TOPOROLE_FILTER_INPUT =
  "panel-node-topoviewerrole-dropdown-container-filter-input" as const;
export const ID_NODE_CERT_KEYSIZE_DROPDOWN = "node-cert-key-size-dropdown-container" as const;
export const ID_NODE_NAME = "node-name" as const;

// Common labels and placeholders
export const LABEL_DEFAULT = "Default" as const;
export const PH_SEARCH_KIND = "Search for kind..." as const;
export const PH_SEARCH_TYPE = "Search for type..." as const;
export const PH_SEARCH_RP = "Search restart policy..." as const;
export const PH_SEARCH_NM = "Search network mode..." as const;
export const PH_SEARCH_IPP = "Search pull policy..." as const;
export const PH_SEARCH_RUNTIME = "Search runtime..." as const;
export const TYPE_UNSUPPORTED_WARNING_TEXT =
  "Type is set in YAML, but the schema for this kind does not support it." as const;
// Healthcheck IDs and prop
export const ID_HC_TEST = "node-healthcheck-test" as const;
export const PROP_HEALTHCHECK = "healthcheck" as const;
export const PH_SEARCH_KEY_SIZE = "Search key size..." as const;

// Options
export const OPTIONS_RP = [LABEL_DEFAULT, "no", "on-failure", "always", "unless-stopped"] as const;
export const OPTIONS_NM = [LABEL_DEFAULT, "host", "none"] as const;
export const OPTIONS_IPP = [LABEL_DEFAULT, "IfNotPresent", "Never", "Always"] as const;
export const OPTIONS_RUNTIME = [LABEL_DEFAULT, "docker", "podman", "ignite"] as const;

// Common property keys used in extraData/inheritance
export const PROP_STARTUP_CONFIG = "startup-config" as const;
export const PROP_ENFORCE_STARTUP_CONFIG = "enforce-startup-config" as const;
export const PROP_SUPPRESS_STARTUP_CONFIG = "suppress-startup-config" as const;
export const PROP_MGMT_IPV4 = "mgmt-ipv4" as const;
export const PROP_MGMT_IPV6 = "mgmt-ipv6" as const;
export const PROP_CPU_SET = "cpu-set" as const;
export const PROP_SHM_SIZE = "shm-size" as const;
export const PROP_RESTART_POLICY = "restart-policy" as const;
export const PROP_AUTO_REMOVE = "auto-remove" as const;
export const PROP_STARTUP_DELAY = "startup-delay" as const;
export const PROP_NETWORK_MODE = "network-mode" as const;
export const PROP_PORTS = "ports" as const;
export const PROP_DNS = "dns" as const;
export const PROP_ALIASES = "aliases" as const;
export const PROP_MEMORY = "memory" as const;
export const PROP_CPU = "cpu" as const;
export const PROP_CAP_ADD = "cap-add" as const;
export const PROP_SYSCTLS = "sysctls" as const;
export const PROP_DEVICES = "devices" as const;
export const PROP_CERTIFICATE = "certificate" as const;
export const PROP_IMAGE_PULL_POLICY = "image-pull-policy" as const;
export const PROP_RUNTIME = "runtime" as const;

// Data attributes used for dynamic entry buttons
export const DATA_ATTR_CONTAINER = "data-container" as const;
export const DATA_ATTR_ENTRY_ID = "data-entry-id" as const;

// Reused DOM IDs
export const ID_NODE_STARTUP_CONFIG = "node-startup-config" as const;
export const ID_NODE_ENFORCE_STARTUP_CONFIG = "node-enforce-startup-config" as const;
export const ID_NODE_SUPPRESS_STARTUP_CONFIG = "node-suppress-startup-config" as const;
export const ID_NODE_LICENSE = "node-license" as const;
export const ID_NODE_BINDS_CONTAINER = "node-binds-container" as const;
export const ID_NODE_ENV_CONTAINER = "node-env-container" as const;
export const ID_NODE_ENV_FILES_CONTAINER = "node-env-files-container" as const;
export const ID_NODE_LABELS_CONTAINER = "node-labels-container" as const;
export const ID_NODE_USER = "node-user" as const;
export const ID_NODE_ENTRYPOINT = "node-entrypoint" as const;
export const ID_NODE_CMD = "node-cmd" as const;
export const ID_NODE_EXEC_CONTAINER = "node-exec-container" as const;
export const ID_NODE_AUTO_REMOVE = "node-auto-remove" as const;
export const ID_NODE_STARTUP_DELAY = "node-startup-delay" as const;
export const ID_NODE_PORTS_CONTAINER = "node-ports-container" as const;
export const ID_NODE_DNS_SERVERS_CONTAINER = "node-dns-servers-container" as const;
export const ID_NODE_ALIASES_CONTAINER = "node-aliases-container" as const;
export const ID_NODE_MEMORY = "node-memory" as const;
export const ID_NODE_CPU = "node-cpu" as const;
export const ID_NODE_CAP_ADD_CONTAINER = "node-cap-add-container" as const;
export const ID_NODE_SYSCTLS_CONTAINER = "node-sysctls-container" as const;
export const ID_NODE_DEVICES_CONTAINER = "node-devices-container" as const;
export const ID_NODE_MGMT_IPV4 = "node-mgmt-ipv4" as const;
export const ID_NODE_MGMT_IPV6 = "node-mgmt-ipv6" as const;
export const ID_NODE_CPU_SET = "node-cpu-set" as const;
export const ID_NODE_SHM_SIZE = "node-shm-size" as const;

// Dynamic container names
export const CN_BINDS = "binds" as const;
export const CN_ENV = "env" as const;
export const CN_ENV_FILES = "env-files" as const;
export const CN_LABELS = "labels" as const;
export const CN_EXEC = "exec" as const;

// Special node IDs
export const ID_TEMP_CUSTOM_NODE = "temp-custom-node" as const;
export const ID_EDIT_CUSTOM_NODE = "edit-custom-node" as const;

// Shared field→prop mappings for inheritance badges and change listeners
export const FIELD_MAPPINGS_BASE: FieldMapping[] = [
  { id: ID_NODE_KIND_DROPDOWN, prop: "kind" },
  { id: ID_NODE_TYPE, prop: "type" },
  { id: ID_NODE_IMAGE_DROPDOWN, prop: "image" },
  { id: ID_NODE_STARTUP_CONFIG, prop: PROP_STARTUP_CONFIG },
  { id: ID_NODE_ENFORCE_STARTUP_CONFIG, prop: PROP_ENFORCE_STARTUP_CONFIG },
  { id: ID_NODE_SUPPRESS_STARTUP_CONFIG, prop: PROP_SUPPRESS_STARTUP_CONFIG },
  { id: ID_NODE_LICENSE, prop: "license" },
  { id: ID_NODE_BINDS_CONTAINER, prop: CN_BINDS },
  { id: ID_NODE_ENV_CONTAINER, prop: CN_ENV },
  { id: ID_NODE_ENV_FILES_CONTAINER, prop: CN_ENV_FILES },
  { id: ID_NODE_LABELS_CONTAINER, prop: CN_LABELS },
  { id: ID_NODE_USER, prop: "user" },
  { id: ID_NODE_ENTRYPOINT, prop: "entrypoint" },
  { id: ID_NODE_CMD, prop: "cmd" },
  { id: ID_NODE_EXEC_CONTAINER, prop: CN_EXEC },
  { id: ID_NODE_RP_DROPDOWN, prop: PROP_RESTART_POLICY },
  { id: ID_NODE_AUTO_REMOVE, prop: PROP_AUTO_REMOVE },
  { id: ID_NODE_STARTUP_DELAY, prop: PROP_STARTUP_DELAY },
  { id: ID_NODE_MGMT_IPV4, prop: PROP_MGMT_IPV4 },
  { id: ID_NODE_MGMT_IPV6, prop: PROP_MGMT_IPV6 },
  { id: ID_NODE_NM_DROPDOWN, prop: PROP_NETWORK_MODE },
  { id: ID_NODE_PORTS_CONTAINER, prop: PROP_PORTS },
  { id: ID_NODE_DNS_SERVERS_CONTAINER, prop: PROP_DNS },
  { id: ID_NODE_ALIASES_CONTAINER, prop: PROP_ALIASES },
  { id: ID_NODE_MEMORY, prop: PROP_MEMORY },
  { id: ID_NODE_CPU, prop: PROP_CPU },
  { id: ID_NODE_CPU_SET, prop: PROP_CPU_SET },
  { id: ID_NODE_SHM_SIZE, prop: PROP_SHM_SIZE },
  { id: ID_NODE_CAP_ADD_CONTAINER, prop: PROP_CAP_ADD },
  { id: ID_NODE_SYSCTLS_CONTAINER, prop: PROP_SYSCTLS },
  { id: ID_NODE_DEVICES_CONTAINER, prop: PROP_DEVICES },
  { id: ID_NODE_CERT_ISSUE, prop: PROP_CERTIFICATE },
  { id: ID_HC_TEST, prop: PROP_HEALTHCHECK },
  { id: ID_NODE_IPP_DROPDOWN, prop: PROP_IMAGE_PULL_POLICY },
  { id: ID_NODE_RUNTIME_DROPDOWN, prop: PROP_RUNTIME }
];
