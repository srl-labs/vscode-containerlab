// managerNodeEditor.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { createFilterableDropdown } from './utilities/filterableDropdown';
import { ManagerSaveTopo } from './managerSaveTopo';
import { VscodeMessageSender } from './managerVscodeWebview';
import { applyIconColorToNode, extractNodeIcons, getIconDataUriForRole } from './managerCytoscapeBaseStyles';
import { createNodeIconOptionElement } from './utilities/iconDropdownRenderer';
import { resolveNodeConfig } from '../core/nodeConfig';
import type { ClabTopology } from '../types/topoViewerType';
import { DEFAULT_INTERFACE_PATTERN } from './utilities/interfacePatternUtils';

// Reuse common literal types to avoid duplicate strings
type ExecTarget = 'container' | 'host';
type ExecPhase = 'on-enter' | 'on-exit';
type RestartPolicy = 'no' | 'on-failure' | 'always' | 'unless-stopped';
type ImagePullPolicy = 'IfNotPresent' | 'Never' | 'Always';
type Runtime = 'docker' | 'podman' | 'ignite';

// Common CSS classes and element IDs
const CLASS_HIDDEN = 'hidden' as const;
const CLASS_PANEL_TAB_BUTTON = 'panel-tab-button' as const;
const CLASS_TAB_CONTENT = 'tab-content' as const;
const CLASS_TAB_ACTIVE = 'tab-active' as const;
const CLASS_DYNAMIC_ENTRY = 'dynamic-entry' as const;
const CLASS_DYNAMIC_DELETE_BTN = 'dynamic-delete-btn' as const;
const CLASS_INPUT_FIELD = 'input-field' as const;
const HTML_TRASH_ICON = '<i class="fas fa-trash"></i>' as const;
const CLASS_COMPONENT_ENTRY = 'component-entry' as const;
const CLASS_COMPONENT_SFM_ENTRY = 'component-sfm-entry' as const;
const CLASS_COMPONENT_MDA_ENTRY = 'component-mda-entry' as const;
const CLASS_COMPONENT_XIOM_ENTRY = 'component-xiom-entry' as const;
const CLASS_COMPONENT_XIOM_MDA_ENTRY = 'component-xiom-mda-entry' as const;
const CLASS_INTEGRATED_MDA_ENTRY = 'integrated-mda-entry' as const;
const SELECTOR_COMPONENT_BODY = '[data-role="component-body"]' as const;
const SELECTOR_COMPONENT_CARET = '[data-role="component-caret"]' as const;
const SELECTOR_FORM_GROUP = '.form-group' as const;
const ICON_CHEVRON_RIGHT = 'fa-chevron-right' as const;
const ICON_CHEVRON_DOWN = 'fa-chevron-down' as const;
const ATTR_ARIA_HIDDEN = 'aria-hidden' as const;
const SELECTOR_SFM_VALUE = '[data-role="sfm-value"]' as const;
const SELECTOR_SFM_DROPDOWN = '[data-role="sfm-dropdown"]' as const;
const DEFAULT_ICON_COLOR = '#005aff' as const;
const DEFAULT_ICON_CORNER_RADIUS = 0;
const NODE_ICON_BASE_SIZE = 14;
const ICON_PREVIEW_DEFAULT_SIZE = 64;

const ID_PANEL_NODE_EDITOR = 'panel-node-editor' as const;
const ID_PANEL_EDITOR_CLOSE = 'panel-node-editor-close' as const;
const ID_PANEL_EDITOR_CANCEL = 'panel-node-editor-cancel' as const;
const ID_PANEL_EDITOR_SAVE = 'panel-node-editor-save' as const;
const ID_NODE_CERT_ISSUE = 'node-cert-issue' as const;
const ID_CERT_OPTIONS = 'cert-options' as const;
const ID_PANEL_NODE_EDITOR_HEADING = 'panel-node-editor-heading' as const;
const ID_PANEL_NODE_EDITOR_ID = 'panel-node-editor-id' as const;
const ID_TAB_COMPONENTS_BUTTON = 'tab-components-button' as const;
const ID_TAB_COMPONENTS_CONTENT = 'tab-components' as const;
const ID_NODE_COMPONENTS_CONTAINER = 'node-components-container' as const;
const ID_NODE_COMPONENTS_CPM_CONTAINER = 'node-components-cpm-container' as const;
const ID_NODE_COMPONENTS_CARD_CONTAINER = 'node-components-card-container' as const;
const ID_NODE_COMPONENTS_SFM_CONTAINER = 'node-components-sfm-container' as const;
const ID_NODE_COMPONENTS_ACTIONS_DISTRIBUTED = 'node-components-actions-distributed' as const;
const ID_NODE_COMPONENTS_ACTIONS_INTEGRATED = 'node-components-actions-integrated' as const;
const ID_NODE_COMPONENTS_INTEGRATED_SECTION = 'node-components-integrated-section' as const;
const ID_NODE_INTEGRATED_MDA_CONTAINER = 'node-integrated-mda-container' as const;
const ID_ADD_INTEGRATED_MDA_BUTTON = 'btn-add-integrated-mda' as const;
const ID_ADD_CPM_BUTTON = 'btn-add-cpm' as const;
const ID_ADD_CARD_BUTTON = 'btn-add-card' as const;
const SFM_ENTRY_ID_PREFIX = 'sfm-entry-' as const;
// Tab scroll controls
const ID_TAB_SCROLL_LEFT = 'node-editor-tab-scroll-left' as const;
const ID_TAB_SCROLL_RIGHT = 'node-editor-tab-scroll-right' as const;
const ID_TAB_VIEWPORT = 'node-editor-tab-viewport' as const;
const ID_TAB_STRIP = 'node-editor-tab-strip' as const;

// Frequently used Node Editor element IDs
const ID_NODE_KIND_DROPDOWN = 'node-kind-dropdown-container' as const;
const ID_NODE_KIND_FILTER_INPUT = 'node-kind-dropdown-container-filter-input' as const;
const ID_NODE_TYPE = 'node-type' as const;
const ID_NODE_TYPE_DROPDOWN = 'panel-node-type-dropdown-container' as const;
const ID_NODE_TYPE_FILTER_INPUT = 'panel-node-type-dropdown-container-filter-input' as const;
const ID_NODE_TYPE_WARNING = 'node-type-warning' as const;
const ID_NODE_VERSION_DROPDOWN = 'node-version-dropdown-container' as const;
const ID_NODE_VERSION_FILTER_INPUT = 'node-version-dropdown-container-filter-input' as const;
const ID_NODE_ICON_COLOR = 'node-icon-color' as const;
const ID_NODE_ICON_EDIT_BUTTON = 'node-icon-edit-button' as const;
const ID_NODE_ICON_ADD_BUTTON = 'node-icon-add-button' as const;
const ID_ICON_EDITOR_BACKDROP = 'node-icon-editor-backdrop' as const;
const ID_ICON_EDITOR_MODAL = 'node-icon-editor-modal' as const;
const ID_ICON_EDITOR_COLOR = 'node-icon-editor-color' as const;
const ID_ICON_EDITOR_HEX = 'node-icon-editor-hex' as const;
const ID_ICON_EDITOR_SHAPE = 'node-icon-editor-shape' as const;
const ID_ICON_EDITOR_PREVIEW = 'node-icon-editor-preview' as const;
const ID_ICON_EDITOR_SAVE = 'node-icon-editor-save' as const;
const ID_ICON_EDITOR_CANCEL = 'node-icon-editor-cancel' as const;
const ID_ICON_EDITOR_CLOSE = 'node-icon-editor-close' as const;
const ID_ICON_EDITOR_CORNER = 'node-icon-editor-corner' as const;
const ID_ICON_EDITOR_CORNER_VALUE = 'node-icon-editor-corner-value' as const;
const ID_NODE_RP_DROPDOWN = 'node-restart-policy-dropdown-container' as const;
const ID_NODE_RP_FILTER_INPUT = 'node-restart-policy-dropdown-container-filter-input' as const;
const ID_NODE_NM_DROPDOWN = 'node-network-mode-dropdown-container' as const;
const ID_NODE_NM_FILTER_INPUT = 'node-network-mode-dropdown-container-filter-input' as const;
const ID_NODE_CUSTOM_DEFAULT = 'node-custom-default' as const;
const ID_NODE_INTERFACE_PATTERN = 'node-interface-pattern' as const;

const ID_NODE_IPP_DROPDOWN = 'node-image-pull-policy-dropdown-container' as const;
const ID_NODE_IPP_FILTER_INPUT = 'node-image-pull-policy-dropdown-container-filter-input' as const;
const ID_NODE_RUNTIME_DROPDOWN = 'node-runtime-dropdown-container' as const;
const ID_NODE_RUNTIME_FILTER_INPUT = 'node-runtime-dropdown-container-filter-input' as const;
const ID_NODE_IMAGE_DROPDOWN = 'node-image-dropdown-container' as const;
const ID_NODE_IMAGE_FILTER_INPUT = 'node-image-dropdown-container-filter-input' as const;
const ID_NODE_IMAGE_FALLBACK_INPUT = 'node-image-fallback-input' as const;
const ID_NODE_VERSION_FALLBACK_INPUT = 'node-version-fallback-input' as const;
const ID_PANEL_NODE_TOPOROLE_CONTAINER = 'panel-node-topoviewerrole-dropdown-container' as const;
const ID_PANEL_NODE_TOPOROLE_FILTER_INPUT = 'panel-node-topoviewerrole-dropdown-container-filter-input' as const;
const ID_NODE_CERT_KEYSIZE_DROPDOWN = 'node-cert-key-size-dropdown-container' as const;
const ID_NODE_CERT_VALIDITY = 'node-cert-validity' as const;
const ID_NODE_SANS_CONTAINER = 'node-sans-container' as const;
const ID_NODE_CERT_KEYSIZE_FILTER_INPUT = 'node-cert-key-size-dropdown-container-filter-input' as const;
const ID_NODE_NAME = 'node-name' as const;
const ID_NODE_CUSTOM_NAME = 'node-custom-name' as const;
const ID_NODE_CUSTOM_NAME_GROUP = 'node-custom-name-group' as const;
const ID_NODE_NAME_GROUP = 'node-name-group' as const;

// Common labels and placeholders
const LABEL_DEFAULT = 'Default' as const;
const PH_SEARCH_KIND = 'Search for kind...' as const;
const PH_SEARCH_TYPE = 'Search for type...' as const;
const PH_SEARCH_RP = 'Search restart policy...' as const;
const PH_SEARCH_NM = 'Search network mode...' as const;
const PH_SEARCH_IPP = 'Search pull policy...' as const;
const PH_SEARCH_RUNTIME = 'Search runtime...' as const;
const PH_SEARCH_IMAGE = 'Search for image...' as const;
const PH_SELECT_VERSION = 'Select version...' as const;
const PH_IMAGE_EXAMPLE = 'e.g., ghcr.io/nokia/srlinux' as const;
const PH_VERSION_EXAMPLE = 'e.g., latest' as const;
const TYPE_UNSUPPORTED_WARNING_TEXT = 'Type is set in YAML, but the schema for this kind does not support it.' as const;
// Healthcheck IDs and prop
const ID_HC_TEST = 'node-healthcheck-test' as const;
const ID_HC_START = 'node-healthcheck-start-period' as const;
const ID_HC_INTERVAL = 'node-healthcheck-interval' as const;
const ID_HC_TIMEOUT = 'node-healthcheck-timeout' as const;
const ID_HC_RETRIES = 'node-healthcheck-retries' as const;
const PROP_HEALTHCHECK = 'healthcheck' as const;
const PH_SEARCH_KEY_SIZE = 'Search key size...' as const;

const PH_BIND = 'Bind mount (host:container)' as const;
const PH_ENV_KEY = 'ENV_NAME' as const;
const PH_VALUE = 'value' as const;
const PH_ENV_FILE = 'Path to env file' as const;
const PH_LABEL_KEY = 'label-key' as const;
const PH_LABEL_VALUE = 'label-value' as const;
const PH_EXEC = 'Command to execute' as const;
const PH_PORT = 'Host:Container (e.g., 8080:80)' as const;
const PH_DNS_SERVER = 'DNS server IP' as const;
const PH_ALIAS = 'Network alias' as const;
const PH_CAP = 'Capability (e.g., NET_ADMIN)' as const;
const PH_SYSCTL_KEY = 'sysctl.key' as const;
const PH_DEVICE = 'Device path (e.g., /dev/net/tun)' as const;
const PH_SAN = 'SAN (e.g., test.com or 192.168.1.1)' as const;

// Options
const OPTIONS_RP = [LABEL_DEFAULT, 'no', 'on-failure', 'always', 'unless-stopped'] as const;
const OPTIONS_NM = [LABEL_DEFAULT, 'host', 'none'] as const;
const OPTIONS_IPP = [LABEL_DEFAULT, 'IfNotPresent', 'Never', 'Always'] as const;
const OPTIONS_RUNTIME = [LABEL_DEFAULT, 'docker', 'podman', 'ignite'] as const;

// Common property keys used in extraData/inheritance
const PROP_STARTUP_CONFIG = 'startup-config' as const;
const PROP_ENFORCE_STARTUP_CONFIG = 'enforce-startup-config' as const;
const PROP_SUPPRESS_STARTUP_CONFIG = 'suppress-startup-config' as const;
const PROP_MGMT_IPV4 = 'mgmt-ipv4' as const;
const PROP_MGMT_IPV6 = 'mgmt-ipv6' as const;
const PROP_CPU_SET = 'cpu-set' as const;
const PROP_SHM_SIZE = 'shm-size' as const;
const PROP_RESTART_POLICY = 'restart-policy' as const;
const PROP_AUTO_REMOVE = 'auto-remove' as const;
const PROP_STARTUP_DELAY = 'startup-delay' as const;
const PROP_NETWORK_MODE = 'network-mode' as const;
const PROP_PORTS = 'ports' as const;
const PROP_DNS = 'dns' as const;
const PROP_ALIASES = 'aliases' as const;
const PROP_MEMORY = 'memory' as const;
const PROP_CPU = 'cpu' as const;
const PROP_CAP_ADD = 'cap-add' as const;
const PROP_SYSCTLS = 'sysctls' as const;
const PROP_DEVICES = 'devices' as const;
const PROP_CERTIFICATE = 'certificate' as const;
const PROP_IMAGE_PULL_POLICY = 'image-pull-policy' as const;
const PROP_RUNTIME = 'runtime' as const;

// Data attributes used for dynamic entry buttons
const DATA_ATTR_CONTAINER = 'data-container' as const;
const DATA_ATTR_ENTRY_ID = 'data-entry-id' as const;
const DATA_ATTR_FIELD = 'data-field' as const;

// Reused DOM IDs
const ID_NODE_STARTUP_CONFIG = 'node-startup-config' as const;
const ID_NODE_ENFORCE_STARTUP_CONFIG = 'node-enforce-startup-config' as const;
const ID_NODE_SUPPRESS_STARTUP_CONFIG = 'node-suppress-startup-config' as const;
const ID_NODE_LICENSE = 'node-license' as const;
const ID_NODE_BINDS_CONTAINER = 'node-binds-container' as const;
const ID_NODE_ENV_CONTAINER = 'node-env-container' as const;
const ID_NODE_ENV_FILES_CONTAINER = 'node-env-files-container' as const;
const ID_NODE_LABELS_CONTAINER = 'node-labels-container' as const;
const ID_NODE_USER = 'node-user' as const;
const ID_NODE_ENTRYPOINT = 'node-entrypoint' as const;
const ID_NODE_CMD = 'node-cmd' as const;
const ID_NODE_EXEC_CONTAINER = 'node-exec-container' as const;
const ID_NODE_AUTO_REMOVE = 'node-auto-remove' as const;
const ID_NODE_STARTUP_DELAY = 'node-startup-delay' as const;
const ID_NODE_PORTS_CONTAINER = 'node-ports-container' as const;
const ID_NODE_DNS_SERVERS_CONTAINER = 'node-dns-servers-container' as const;
const ID_NODE_ALIASES_CONTAINER = 'node-aliases-container' as const;
const ID_NODE_MEMORY = 'node-memory' as const;
const ID_NODE_CPU = 'node-cpu' as const;
const ID_NODE_CAP_ADD_CONTAINER = 'node-cap-add-container' as const;
const ID_NODE_SYSCTLS_CONTAINER = 'node-sysctls-container' as const;
const ID_NODE_DEVICES_CONTAINER = 'node-devices-container' as const;
const ID_NODE_MGMT_IPV4 = 'node-mgmt-ipv4' as const;
const ID_NODE_MGMT_IPV6 = 'node-mgmt-ipv6' as const;
const ID_NODE_CPU_SET = 'node-cpu-set' as const;
const ID_NODE_SHM_SIZE = 'node-shm-size' as const;

// Dynamic container names
const CN_BINDS = 'binds' as const;
const CN_ENV = 'env' as const;
const CN_ENV_FILES = 'env-files' as const;
const CN_LABELS = 'labels' as const;
const CN_EXEC = 'exec' as const;
const CN_PORTS = 'ports' as const;
const CN_DNS_SERVERS = 'dns-servers' as const;
const CN_ALIASES = 'aliases' as const;
const CN_CAP_ADD = 'cap-add' as const;
const CN_SYSCTLS = 'sysctls' as const;
const CN_DEVICES = 'devices' as const;
const CN_SANS = 'sans' as const;

// Special node IDs
const ID_TEMP_CUSTOM_NODE = 'temp-custom-node' as const;
const ID_EDIT_CUSTOM_NODE = 'edit-custom-node' as const;

// Shared field→prop mappings for inheritance badges and change listeners
type FieldMapping = { id: string; prop: string; badgeId?: string };
const FIELD_MAPPINGS_BASE: FieldMapping[] = [
  { id: ID_NODE_KIND_DROPDOWN, prop: 'kind' },
  { id: ID_NODE_TYPE, prop: 'type' },
  { id: ID_NODE_IMAGE_DROPDOWN, prop: 'image' },
  { id: ID_NODE_STARTUP_CONFIG, prop: PROP_STARTUP_CONFIG },
  { id: ID_NODE_ENFORCE_STARTUP_CONFIG, prop: PROP_ENFORCE_STARTUP_CONFIG },
  { id: ID_NODE_SUPPRESS_STARTUP_CONFIG, prop: PROP_SUPPRESS_STARTUP_CONFIG },
  { id: ID_NODE_LICENSE, prop: 'license' },
  { id: ID_NODE_BINDS_CONTAINER, prop: CN_BINDS },
  { id: ID_NODE_ENV_CONTAINER, prop: CN_ENV },
  { id: ID_NODE_ENV_FILES_CONTAINER, prop: CN_ENV_FILES },
  { id: ID_NODE_LABELS_CONTAINER, prop: CN_LABELS },
  { id: ID_NODE_USER, prop: 'user' },
  { id: ID_NODE_ENTRYPOINT, prop: 'entrypoint' },
  { id: ID_NODE_CMD, prop: 'cmd' },
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
  { id: ID_NODE_RUNTIME_DROPDOWN, prop: PROP_RUNTIME },
];

/**
 * Node properties that map to Containerlab configuration
 */
export interface NodeProperties {
  // Basic properties
  name: string;
  kind?: string;
  type?: string;
  image?: string;
  group?: string;
  interfacePattern?: string;

  // Configuration properties
  license?: string;
  'startup-config'?: string;
  'enforce-startup-config'?: boolean;
  'suppress-startup-config'?: boolean;
  binds?: string[];
  env?: Record<string, string>;
  'env-files'?: string[];
  labels?: Record<string, string>;

  // Runtime properties
  user?: string;
  entrypoint?: string;
  cmd?: string;
  exec?: string[];
  'restart-policy'?: RestartPolicy;
  'auto-remove'?: boolean;
  'startup-delay'?: number;

  // Network properties
  'mgmt-ipv4'?: string;
  'mgmt-ipv6'?: string;
  'network-mode'?: string;
  ports?: string[];
  dns?: {
    servers?: string[];
    search?: string[];
    options?: string[];
  };
  aliases?: string[];

  // Advanced properties
  memory?: string;
  cpu?: number;
  'cpu-set'?: string;
  'shm-size'?: string;
  'cap-add'?: string[];
  sysctls?: Record<string, string | number>;
  devices?: string[];
  certificate?: {
    issue?: boolean;
    'key-size'?: number;
    'validity-duration'?: string;
    sans?: string[];
  };
  healthcheck?: {
    test?: string[];
    'start-period'?: number;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  'image-pull-policy'?: ImagePullPolicy;
  runtime?: Runtime;
  components?: any[];

  // Metadata
  inherited?: string[];

  // Stages (for dependencies)
  stages?: {
    create?: {
      'wait-for'?: Array<{
        node: string;
        stage: string;
      }>;
      exec?: Array<{
        command: string;
        target?: ExecTarget;
        phase?: ExecPhase;
      }>;
    };
    'create-links'?: {
      exec?: Array<{
        command: string;
        target?: ExecTarget;
        phase?: ExecPhase;
      }>;
    };
    configure?: {
      exec?: Array<{
        command: string;
        target?: ExecTarget;
        phase?: ExecPhase;
      }>;
    };
  };
}

/**
 * ManagerNodeEditor handles the node editor with tabs for all Containerlab properties
 */
export class ManagerNodeEditor {
  private cy: cytoscape.Core;
  private saveManager: ManagerSaveTopo;
  private currentNode: cytoscape.NodeSingular | null = null;
  private panel: HTMLElement | null = null;
  private dynamicEntryCounters: Map<string, number> = new Map();
  private schemaKinds: string[] = [];
  private kindsLoaded = false;
  private imageVersionMap: Map<string, string[]> = new Map();
  private messageSender: VscodeMessageSender;
  private nodeTypeOptions: Map<string, string[]> = new Map();
  private typeSchemaLoaded = false;
  private kindsWithTypeSupport: Set<string> = new Set();
  // can add other kind which use components later...
  private componentKinds: Set<string> = new Set(['nokia_srsim']);
  private componentEntryCounter: number = 0;
  private componentMdaCounters: Map<number, number> = new Map();
  private componentXiomCounters: Map<number, number> = new Map();
  private xiomMdaCounters: Map<string, number> = new Map();
  private pendingExpandedComponentSlots: Set<string> | undefined;
  private cachedNodeIcons: string[] = [];
  private cachedCustomIconSignature: string = '';
  private currentIconColor: string | null = null;
  private currentIconCornerRadius: number = DEFAULT_ICON_CORNER_RADIUS;
  private iconEditorInitialized = false;
  // enums to be filled from schema
  private srosSfmTypes: string[] = [];
  private srosXiomTypes: string[] = [];
  private srosCpmTypes: string[] = [];
  private srosCardTypes: string[] = [];
  private srosXiomMdaTypes: string[] = [];
  private srosMdaTypes: string[] = [];
  private integratedSrosTypes: Set<string> = new Set(
    ['sr-1', 'sr-1s', 'ixr-r6', 'ixr-ec', 'ixr-e2', 'ixr-e2c'].map(t => t.toLowerCase())
  );
  private integratedMode = false;
  private integratedMdaCounter = 0;

  constructor(cy: cytoscape.Core, saveManager: ManagerSaveTopo) {
    this.cy = cy;
    this.saveManager = saveManager;
    this.messageSender = saveManager.getMessageSender();
    this.initializePanel();
  }

  /**
   * Parse docker images to extract base images and their versions
   */
  private parseDockerImages(dockerImages: string[]): void {
    this.imageVersionMap.clear();

    for (const image of dockerImages) {
      // Split by colon to separate repository from tag
      const lastColonIndex = image.lastIndexOf(':');
      if (lastColonIndex > 0) {
        const baseImage = image.substring(0, lastColonIndex);
        const version = image.substring(lastColonIndex + 1);

        if (!this.imageVersionMap.has(baseImage)) {
          this.imageVersionMap.set(baseImage, []);
        }
        this.imageVersionMap.get(baseImage)!.push(version);
      } else {
        // No version tag, treat whole thing as base image with 'latest' as version
        if (!this.imageVersionMap.has(image)) {
          this.imageVersionMap.set(image, ['latest']);
        }
      }
    }

    // Sort versions for each base image
    for (const versions of this.imageVersionMap.values()) {
      versions.sort((a, b) => {
        // Put 'latest' first
        if (a === 'latest') return -1;
        if (b === 'latest') return 1;
        // Then sort alphanumerically
        return b.localeCompare(a); // Reverse order to put newer versions first
      });
    }
  }

  /**
   * Handle base image change and update version dropdown
   */
  private handleBaseImageChange(selectedBaseImage: string): void {
    const versions = this.imageVersionMap.get(selectedBaseImage);

    if (versions && versions.length > 0) {
      // We have known versions for this image
      createFilterableDropdown(
        ID_NODE_VERSION_DROPDOWN,
        versions,
        versions[0] || 'latest',
        () => {},
        'Select version...',
        true // Allow free text for custom versions
      );
      log.debug(`Base image changed to ${selectedBaseImage}, available versions: ${versions.join(', ')}`);
    } else {
      // Unknown image - allow free text version entry
      createFilterableDropdown(
        ID_NODE_VERSION_DROPDOWN,
        ['latest'],
        'latest',
        () => {},
        'Enter version...',
        true // Allow free text
      );
      log.debug(`Base image changed to custom image ${selectedBaseImage}, allowing free text version entry`);
    }
  }

  /**
   * Handle kind change and update type field visibility
   */
  private handleKindChange(selectedKind: string): void {
    const typeFormGroup = document.getElementById(ID_NODE_TYPE)?.closest(SELECTOR_FORM_GROUP) as HTMLElement;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;

    if (!typeFormGroup) return;

    const typeOptions = this.getTypeOptionsForKind(selectedKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(typeFormGroup, typeDropdownContainer, typeInput, typeOptions, selectedKind);
    } else {
      this.toggleTypeInputForKind(selectedKind, typeFormGroup, typeDropdownContainer, typeInput);
    }

    // show/hide components based on kind
    this.updateComponentsTabVisibility(selectedKind);

    if (this.isCustomTemplateNode()) {
      const ifaceMap = (window as any).ifacePatternMapping || {};
      const defaultPattern = ifaceMap[selectedKind] || DEFAULT_INTERFACE_PATTERN;
      const ifaceInput = document.getElementById(ID_NODE_INTERFACE_PATTERN) as HTMLInputElement | null;
      if (ifaceInput && !ifaceInput.value) {
        ifaceInput.value = defaultPattern;
      }
    }

    log.debug(`Kind changed to ${selectedKind}, type field visibility: ${typeFormGroup?.style.display}`);
  }

  private updateComponentsTabVisibility(kind: string): void {
    const btn = document.getElementById(ID_TAB_COMPONENTS_BUTTON) as HTMLElement | null;
    const content = document.getElementById(ID_TAB_COMPONENTS_CONTENT) as HTMLElement | null;
    if (!btn || !content) return;

    if (this.componentKinds.has(kind)) {
      this.showComponentsTab(btn, content);
      this.updateComponentMode();
      return;
    }
    this.hideComponentsTab(btn, content);
    this.updateComponentMode(false);
  }

  private showComponentsTab(btn: HTMLElement, content: HTMLElement): void {
    btn.classList.remove(CLASS_HIDDEN);
    // Only reveal content if currently active tab
    if (btn.classList.contains(CLASS_TAB_ACTIVE)) {
      content.classList.remove(CLASS_HIDDEN);
    } else {
      content.classList.add(CLASS_HIDDEN);
    }
  }

  private hideComponentsTab(btn: HTMLElement, content: HTMLElement): void {
    if (btn.classList.contains(CLASS_TAB_ACTIVE)) {
      this.switchToTab('basic');
    }
    btn.classList.add(CLASS_HIDDEN);
    content.classList.add(CLASS_HIDDEN);
  }

  private getComponentContainers(): { cpmContainer: HTMLElement; cardContainer: HTMLElement; sfmContainer: HTMLElement } | null {
    const cpmContainer = document.getElementById(ID_NODE_COMPONENTS_CPM_CONTAINER) as HTMLElement | null;
    const cardContainer = document.getElementById(ID_NODE_COMPONENTS_CARD_CONTAINER) as HTMLElement | null;
    const sfmContainer = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER) as HTMLElement | null;
    if (!cpmContainer || !cardContainer || !sfmContainer) return null;
    return { cpmContainer, cardContainer, sfmContainer };
  }

  private loadComponentsFromNode(expandedSlots?: Set<string>): void {
    if (this.integratedMode) {
      this.resetIntegratedMdaContainer();
      if (!this.currentNode) {
        this.updateIntegratedAddButtonState();
        return;
      }
      const mdas = this.getIntegratedMdasForCurrentNode();
      mdas.forEach(mda => this.addIntegratedMdaEntry(mda));
      this.updateIntegratedAddButtonState();
      return;
    }

    if (!this.currentNode) return;
    const containers = this.getComponentContainers();
    if (!containers) return;
    this.resetComponentContainers(containers);

    const components = this.getComponentsForCurrentNode();
    this.ensureSfmEntry(components);
    if (components.length === 0) {
      this.updateComponentAddButtonStates();
      return;
    }

    const expandSet = this.resolveExpandedComponentSlots(expandedSlots);
    this.renderComponentEntries(components, expandSet);

    this.updateComponentAddButtonStates();
  }

  private resetComponentContainers(containers: { cpmContainer: HTMLElement; cardContainer: HTMLElement; sfmContainer: HTMLElement }): void {
    const { cpmContainer, cardContainer, sfmContainer } = containers;
    cpmContainer.innerHTML = '';
    cardContainer.innerHTML = '';
    sfmContainer.innerHTML = '';
    this.componentEntryCounter = 0;
    this.componentMdaCounters.clear();
    this.componentXiomCounters.clear();
    this.xiomMdaCounters.clear();
  }

  private resetIntegratedMdaContainer(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (container) container.innerHTML = '';
    this.integratedMdaCounter = 0;
  }

  private getComponentsForCurrentNode(): any[] {
    if (!this.currentNode) return [];
    const extra = this.currentNode.data('extraData') || {};
    return Array.isArray(extra.components) ? extra.components : [];
  }

  private getIntegratedMdasForCurrentNode(): any[] {
    const components = this.getComponentsForCurrentNode();
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue;
      if (Array.isArray(comp.mda) && (comp.slot == null || String(comp.slot).trim() === '')) {
        return comp.mda;
      }
    }
    return [];
  }

  private addIntegratedMdaEntry(prefill?: any): number {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    const tpl = document.getElementById('tpl-integrated-mda-entry') as HTMLTemplateElement | null;
    if (!container || !tpl) return -1;

    const next = this.integratedMdaCounter + 1;
    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_INTEGRATED_MDA_ENTRY}`) as HTMLElement | null;
    if (!row) return -1;

    this.integratedMdaCounter = next;

    row.id = `integrated-mda-entry-${next}`;

    const slot = row.querySelector('[data-role="integrated-mda-slot"]') as HTMLInputElement | null;
    const hiddenType = row.querySelector('[data-role="integrated-mda-type-value"]') as HTMLInputElement | null;
    const typeDropdown = row.querySelector('[data-role="integrated-mda-type-dropdown"]') as HTMLElement | null;
    const delBtn = row.querySelector('[data-action="remove-integrated-mda"]') as HTMLButtonElement | null;

    if (slot) {
      slot.id = `integrated-mda-${next}-slot`;
      slot.value = prefill?.slot != null ? String(prefill.slot) : String(next);
    }

    if (hiddenType) {
      hiddenType.id = `integrated-mda-${next}-type`;
      hiddenType.value = prefill?.type != null ? String(prefill.type) : '';
    }

    if (typeDropdown) {
      typeDropdown.id = `integrated-mda-${next}-type-dropdown`;
    }

    if (delBtn) {
      delBtn.onclick = () => this.removeIntegratedMdaEntry(next);
    }

    container.appendChild(frag);

    this.initIntegratedMdaTypeDropdown(next);
    this.updateIntegratedAddButtonState();
    return next;
  }

  private removeIntegratedMdaEntry(mdaId: number): void {
    const row = document.getElementById(`integrated-mda-entry-${mdaId}`);
    row?.remove();
    this.updateIntegratedAddButtonState();
  }

  private initIntegratedMdaTypeDropdown(mdaId: number): void {
    const initial = this.getInputValue(`integrated-mda-${mdaId}-type`);
    createFilterableDropdown(
      `integrated-mda-${mdaId}-type-dropdown`,
      this.srosMdaTypes,
      initial,
      (selected: string) => this.setInputValue(`integrated-mda-${mdaId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private updateIntegratedAddButtonState(): void {
    const addBtn = document.getElementById(ID_ADD_INTEGRATED_MDA_BUTTON) as HTMLButtonElement | null;
    if (!addBtn) return;
    addBtn.disabled = false;
    addBtn.title = 'Add an MDA slot';
  }

  private collectIntegratedMdas(): any[] {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)) as HTMLElement[];
    const list: any[] = [];
    for (const row of rows) {
      const mdaId = this.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const slotRaw = this.getInputValue(`integrated-mda-${mdaId}-slot`).trim();
      const typeVal = this.getInputValue(`integrated-mda-${mdaId}-type`).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  private commitIntegratedMdaDropdowns(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return;
    const rows = Array.from(container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)) as HTMLElement[];
    for (const row of rows) {
      const mdaId = this.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const filter = document.getElementById(`integrated-mda-${mdaId}-type-dropdown-filter-input`) as HTMLInputElement | null;
      const hidden = document.getElementById(`integrated-mda-${mdaId}-type`) as HTMLInputElement | null;
      if (filter && hidden) hidden.value = filter.value;
    }
  }

  private refreshIntegratedMdaDropdowns(): void {
    const container = document.getElementById(ID_NODE_INTEGRATED_MDA_CONTAINER);
    if (!container) return;
    const rows = Array.from(container.querySelectorAll(`.${CLASS_INTEGRATED_MDA_ENTRY}`)) as HTMLElement[];
    rows.forEach(row => {
      const mdaId = this.extractIndex(row.id, /integrated-mda-entry-(\d+)/);
      if (mdaId !== null) this.initIntegratedMdaTypeDropdown(mdaId);
    });
  }

  private ensureSfmEntry(components: any[]): void {
    const initialSfm = this.extractSharedSfmValue(components);
    this.addSfmEntry(initialSfm);
  }

  private resolveExpandedComponentSlots(expandedSlots?: Set<string>): Set<string> | undefined {
    const resolved = expandedSlots ?? this.pendingExpandedComponentSlots;
    this.pendingExpandedComponentSlots = undefined;
    return resolved;
  }

  private renderComponentEntries(components: any[], expandSet?: Set<string>): void {
    const sorted = [...components].sort((a, b) => this.compareComponentSlots(a?.slot, b?.slot));
    sorted.forEach(comp => {
      const slotVal = String(comp?.slot ?? '');
      const slotType = this.isCpmSlot(slotVal) ? 'cpm' : 'card';
      const prefill = this.createComponentPrefill(comp);
      const idx = this.addComponentEntry(prefill, { slotType });
      if (idx > 0 && expandSet) {
        const key = this.normalizeComponentSlot(slotVal);
        if (key && expandSet.has(key)) this.expandComponentEntry(idx);
      }
    });
  }

  private createComponentPrefill(comp: any): any {
    if (!comp || typeof comp !== 'object') return {};
    const prefill = { ...comp } as any;
    delete prefill.sfm;
    return prefill;
  }

  private extractSharedSfmValue(components: any[]): string | undefined {
    if (!Array.isArray(components) || components.length === 0) return undefined;
    for (const comp of components) {
      const sfmVal = typeof comp?.sfm === 'string' ? comp.sfm.trim() : '';
      if (sfmVal) return sfmVal;
    }
    return undefined;
  }

  private compareComponentSlots(a: unknown, b: unknown): number {
    const rank = (v: unknown): [number, number] => {
      if (typeof v === 'string') {
        const t = v.trim().toUpperCase();
        if (t === 'A') return [0, 0];
        if (t === 'B') return [1, 0];
        const n = parseInt(t, 10);
        if (!Number.isNaN(n)) return [2, n];
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        return [2, v];
      }
      // Unknown or empty -> push to end
      return [3, Number.POSITIVE_INFINITY];
    };
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] !== rb[0] ? ra[0] - rb[0] : ra[1] - rb[1];
  }

  private addComponentEntry(prefill?: any, options?: { slotType?: 'cpm' | 'card' }): number {
    const tpl = document.getElementById('tpl-component-entry') as HTMLTemplateElement | null;
    if (!tpl) return -1;

    const prefillSlot = prefill?.slot;
    const defaultType = this.isCpmSlot(String(prefillSlot ?? '')) ? 'cpm' : 'card';
    const slotType = options?.slotType ?? defaultType;
    const containerId = slotType === 'cpm' ? ID_NODE_COMPONENTS_CPM_CONTAINER : ID_NODE_COMPONENTS_CARD_CONTAINER;
    const container = document.getElementById(containerId);
    if (!container) return -1;

    // Compute suggested unique slot prior to render
    const suggestedSlot = this.findNextAvailableSlot(slotType);
    const idx = ++this.componentEntryCounter;
    this.componentMdaCounters.set(idx, 0);

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const entry = frag.querySelector(`.${CLASS_COMPONENT_ENTRY}`) as HTMLElement;
    entry.id = `component-entry-${idx}`;
    this.initializeComponentEntry(entry, idx, prefill);

    // Append to DOM
    container.appendChild(frag);

    this.autofillComponentSlotIfNeeded(idx, prefill, suggestedSlot);
    this.initComponentDropdownsAndValidators(idx);
    this.prefillSubcomponents(idx, prefill);

    // Expand newly added entry by default when user adds a slot
    if (!prefill) {
      this.expandComponentEntry(idx);
    }

    this.updateComponentAddButtonStates();

    return idx;
  }

  private autofillComponentSlotIfNeeded(idx: number, prefill: any, suggestedSlot: string): void {
    if (prefill && prefill.slot != null && String(prefill.slot).trim() !== '') return;
    const slot = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
    if (slot && suggestedSlot) slot.value = suggestedSlot;
  }

  private initComponentDropdownsAndValidators(idx: number): void {
    this.initComponentTypeDropdown(idx);
    this.enforceComponentSlotPattern(`component-${idx}-slot`);
    this.updateXiomSectionVisibility(idx);
    this.updateMdaSectionVisibility(idx);
  }

  private prefillSubcomponents(idx: number, prefill: any): void {
    const slotVal = (document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null)?.value || '';
    const isCpm = this.isCpmSlot(slotVal);
    if (!isCpm && Array.isArray(prefill?.mda)) prefill.mda.forEach((m: any) => this.addMdaEntry(idx, m));
    if (isCpm) return;
    if (Array.isArray(prefill?.xiom)) prefill.xiom.forEach((x: any) => this.addXiomEntry(idx, x));
    else if (typeof prefill?.xiom === 'string' && prefill.xiom) this.addXiomEntry(idx, { slot: 1, type: String(prefill.xiom) });
  }

  private normalizeComponentSlot(v: string): string {
    const t = (v || '').trim();
    if (t.toUpperCase() === 'A') return 'A';
    if (t.toUpperCase() === 'B') return 'B';
    if (/^[1-9]\d*$/.test(t)) return String(parseInt(t, 10));
    return '';
  }

  private collectUsedComponentSlots(excludeIdx?: number): Set<string> {
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    const used = new Set<string>();
    if (!container) return used;
    const entries = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)) as HTMLElement[];
    entries.forEach(entry => {
      const idx = this.extractIndex(entry.id, /component-entry-(\d+)/);
      if (excludeIdx != null && idx === excludeIdx) return;
      const input = entry.querySelector('[data-role="component-slot"]') as HTMLInputElement | null;
      const norm = this.normalizeComponentSlot(input?.value || '');
      if (norm) used.add(norm);
    });
    return used;
  }

  private sequenceValueByIndex(i: number): string {
    if (i <= 0) return 'A';
    if (i === 1) return 'B';
    return String(i - 1);
  }

  private sequenceIndexOf(val: string): number {
    const v = this.normalizeComponentSlot(val);
    if (v === 'A') return 0;
    if (v === 'B') return 1;
    if (/^[1-9]\d*$/.test(v)) return parseInt(v, 10) + 1; // 1 -> 2, 2 -> 3
    return 0;
  }

  private findNextAvailableSlot(slotType: 'cpm' | 'card'): string {
    const used = this.collectUsedComponentSlots();
    if (slotType === 'cpm') {
      if (!used.has('A')) return 'A';
      if (!used.has('B')) return 'B';
      return '';
    }

    const nums: number[] = [];
    used.forEach(v => {
      if (/^[1-9]\d*$/.test(v)) nums.push(parseInt(v, 10));
    });
    if (nums.length === 0) return '1';
    const next = Math.max(...nums) + 1;
    return String(next);
  }

  private stepComponentSlot(current: string, direction: 1 | -1, excludeIdx?: number): string {
    const used = this.collectUsedComponentSlots(excludeIdx);
    let idx = this.sequenceIndexOf(current);
    // Iterate to find next/prev unused slot; cap bounds at 0 when going backwards
    for (let guard = 0; guard < 1000; guard++) {
      idx = Math.max(0, idx + direction);
      const candidate = this.sequenceValueByIndex(idx);
      if (!used.has(candidate)) return candidate;
      if (direction === -1 && idx === 0) break;
    }
    return current;
  }

  private updateComponentAddButtonStates(): void {
    if (this.integratedMode) {
      this.updateIntegratedAddButtonState();
      return;
    }
    const addCpmBtn = document.getElementById(ID_ADD_CPM_BUTTON) as HTMLButtonElement | null;
    const addCardBtn = document.getElementById(ID_ADD_CARD_BUTTON) as HTMLButtonElement | null;
    const used = this.collectUsedComponentSlots();
    const cpmSlots: Array<'A' | 'B'> = ['A', 'B'];
    const cpmCount = cpmSlots.filter(slot => used.has(slot)).length;

    if (addCpmBtn) {
      const maxCpms = cpmSlots.length;
      addCpmBtn.disabled = cpmCount >= maxCpms;
      addCpmBtn.title = addCpmBtn.disabled
        ? 'CPM slots A and B are already defined'
        : 'Add a CPM slot (A or B)';
    }

    if (addCardBtn) {
      addCardBtn.disabled = false;
      addCardBtn.title = 'Add a line card slot';
    }

  }

  private addSfmEntry(prefill?: string): number {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER) as HTMLElement | null;
    const tpl = document.getElementById('tpl-sfm-entry') as HTMLTemplateElement | null;
    if (!container || !tpl) return -1;

    let entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      entry = frag.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
      if (!entry) return -1;
      entry.id = `${SFM_ENTRY_ID_PREFIX}1`;

      const hidden = entry.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
      const dropdown = entry.querySelector(SELECTOR_SFM_DROPDOWN) as HTMLElement | null;
      if (hidden) hidden.id = `${SFM_ENTRY_ID_PREFIX}1-value`;
      if (dropdown) dropdown.id = `${SFM_ENTRY_ID_PREFIX}1-dropdown`;

      container.appendChild(frag);
      this.initSfmEntryDropdown(1);
      entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    }

    const hidden = entry?.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
    if (hidden) hidden.value = prefill ?? '';
    this.refreshSfmDropdown();
    this.updateComponentAddButtonStates();
    return 1;
  }

  private initSfmEntryDropdown(entryId: number): void {
    const hiddenId = `${SFM_ENTRY_ID_PREFIX}${entryId}-value`;
    const dropdownId = `${SFM_ENTRY_ID_PREFIX}${entryId}-dropdown`;
    const initial = this.getInputValue(hiddenId);
    createFilterableDropdown(
      dropdownId,
      this.srosSfmTypes,
      initial,
      (selected: string) => this.setInputValue(hiddenId, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private refreshSfmDropdown(): void {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return;
    const entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) return;
    this.initSfmEntryDropdown(1);
  }

  private commitSfmDropdown(): void {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return;
    const entry = container.querySelector(`.${CLASS_COMPONENT_SFM_ENTRY}`) as HTMLElement | null;
    if (!entry) return;
    const hidden = document.getElementById(`${SFM_ENTRY_ID_PREFIX}1-value`) as HTMLInputElement | null;
    const filter = document.getElementById(`${SFM_ENTRY_ID_PREFIX}1-dropdown-filter-input`) as HTMLInputElement | null;
    if (hidden && filter) hidden.value = filter.value;
  }

  private getSfmValue(): string {
    const container = document.getElementById(ID_NODE_COMPONENTS_SFM_CONTAINER);
    if (!container) return '';
    const hidden = container.querySelector(SELECTOR_SFM_VALUE) as HTMLInputElement | null;
    return hidden?.value?.trim() ?? '';
  }

  private applySfmToComponents(components: any[], sfmVal: string): void {
    const normalized = (sfmVal || '').trim();
    components.forEach(comp => {
      if (!comp || typeof comp !== 'object') return;
      if (!normalized) {
        if ('sfm' in comp) delete comp.sfm;
        return;
      }
      comp.sfm = normalized;
    });
  }

  private relocateComponentEntryIfNeeded(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    if (!entry) return;
    const slotVal = this.getInputValue(`component-${idx}-slot`).trim();
    const targetContainerId = this.isCpmSlot(slotVal) ? ID_NODE_COMPONENTS_CPM_CONTAINER : ID_NODE_COMPONENTS_CARD_CONTAINER;
    const targetContainer = document.getElementById(targetContainerId);
    if (!targetContainer || entry.parentElement === targetContainer) return;
    targetContainer.appendChild(entry);
  }

  private initializeComponentEntry(entry: HTMLElement, idx: number, prefill?: any): void {
    const slotInput = entry.querySelector('[data-role="component-slot"]') as HTMLInputElement;
    const typeHidden = entry.querySelector('[data-role="component-type-value"]') as HTMLInputElement;
    const typeDropdown = entry.querySelector('[data-role="component-type-dropdown"]') as HTMLElement;
    const xiomList = entry.querySelector('[data-role="xiom-list"]') as HTMLElement;
    const addXiomBtn = entry.querySelector('[data-action="add-xiom"]') as HTMLButtonElement;
    const mdaList = entry.querySelector('[data-role="mda-list"]') as HTMLElement;
    const addMdaBtn = entry.querySelector('[data-action="add-mda"]') as HTMLButtonElement;
    const removeComponentBtn = entry.querySelector('[data-action="remove-component"]') as HTMLButtonElement;
    const header = entry.querySelector('[data-action="toggle-component"]') as HTMLElement | null;
    const caret = entry.querySelector(SELECTOR_COMPONENT_CARET) as HTMLElement | null;
    const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;

    slotInput.id = `component-${idx}-slot`;
    typeHidden.id = `component-${idx}-type`;
    typeDropdown.id = `component-${idx}-type-dropdown`;
    xiomList.id = `component-${idx}-xiom-container`;
    mdaList.id = `component-${idx}-mda-container`;

    slotInput.value = String(prefill?.slot ?? '');
    typeHidden.value = String(prefill?.type ?? '');

    this.wireComponentActions(idx, addMdaBtn, addXiomBtn, removeComponentBtn);
    // Prevent header toggle when interacting with the slot input (works before append)
    if (slotInput) {
      const stop = (e: Event) => e.stopPropagation();
      // Stop both capture and bubble to be safe across listeners
      slotInput.addEventListener('click', stop, true);
      slotInput.addEventListener('mousedown', stop, true);
      slotInput.addEventListener('pointerdown', stop, true);
      slotInput.addEventListener('focus', stop, true);
      slotInput.addEventListener('click', stop);
      slotInput.addEventListener('mousedown', stop);
      slotInput.addEventListener('pointerdown', stop);
      slotInput.addEventListener('focus', stop);
      slotInput.addEventListener('keydown', stop);
      slotInput.addEventListener('keyup', stop);
    }
    this.wireComponentSlotIncDec(idx, entry);
    this.attachAccordion(header, body, caret);
    // Initialize card-slot labels for existing MDAs (if any)
    this.updateMdaCardSlotLabels(idx);
    this.updateMdaSectionVisibility(idx);
  }

  private wireComponentSlotIncDec(idx: number, entry: HTMLElement): void {
    const slotInput = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
    const decBtn = entry.querySelector('[data-action="component-slot-dec"]') as HTMLButtonElement | null;
    const incBtn = entry.querySelector('[data-action="component-slot-inc"]') as HTMLButtonElement | null;
    if (!slotInput) return;
    // Prevent header accordion from toggling when interacting with slot input
    slotInput.addEventListener('click', (e) => e.stopPropagation());
    slotInput.addEventListener('mousedown', (e) => e.stopPropagation());
    slotInput.addEventListener('pointerdown', (e) => e.stopPropagation());
    decBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = this.stepComponentSlot(slotInput.value, -1, idx);
      slotInput.value = next;
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });
    incBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = this.stepComponentSlot(slotInput.value, 1, idx);
      slotInput.value = next;
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });

    // Enforce uniqueness and pattern on manual input
    let lastValid = this.normalizeComponentSlot(slotInput.value);
    slotInput.addEventListener('input', () => {
      const norm = this.normalizeComponentSlot(slotInput.value);
      if (!norm) {
        // allow empty while typing
        lastValid = '';
        this.updateComponentAddButtonStates();
        return;
      }
      const used = this.collectUsedComponentSlots(idx);
      if (used.has(norm)) {
        slotInput.value = lastValid;
      } else {
        lastValid = norm;
        slotInput.value = norm;
      }
      this.initComponentTypeDropdown(idx);
      this.updateMdaCardSlotLabels(idx);
      this.updateXiomSectionVisibility(idx);
      this.updateMdaSectionVisibility(idx);
      this.relocateComponentEntryIfNeeded(idx);
      this.updateComponentAddButtonStates();
    });
  }

  private updateMdaCardSlotLabels(componentIdx: number): void {
    const container = document.getElementById(`component-${componentIdx}-mda-container`);
    if (!container) return;
    const rawSlot = this.getInputValue(`component-${componentIdx}-slot`).trim();
    const hasSlot = rawSlot.length > 0;
    const slotPrefix = hasSlot ? `${rawSlot}/` : '--';
    container.querySelectorAll('[data-role="mda-card-slot"]').forEach((el) => {
      (el as HTMLElement).textContent = slotPrefix;
    });
    // Also update labels on XIOM-scoped MDA entries to include component slot and xiom slot
    const xiomContainer = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (xiomContainer) {
      const xiomRows = Array.from(xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
      xiomRows.forEach(row => {
        const xiomId = this.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
        if (xiomId == null) return;
        // Update the XIOM entry's left label with the component slot
        const xiomSlotLabel = row.querySelector('[data-role="xiom-card-slot"]') as HTMLElement | null;
        if (xiomSlotLabel) xiomSlotLabel.textContent = slotPrefix;
        const xiomSlotRaw = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-slot`).trim();
        const xiomDisplay = xiomSlotRaw ? `x${xiomSlotRaw}` : '';
        let xiomPrefix = '--';
        if (hasSlot) {
          xiomPrefix = `${rawSlot}/`;
          if (xiomDisplay) {
            xiomPrefix = `${rawSlot}/${xiomDisplay}`;
          }
        }
        row.querySelectorAll('[data-role="xiom-mda-card-slot"]').forEach((el) => {
          (el as HTMLElement).textContent = xiomPrefix;
        });
      });
    }
  }

  private isCpmSlot(v: string): boolean { return /^[aAbB]$/.test((v || '').trim()); }

  private updateXiomSectionVisibility(componentIdx: number): void {
    const slotVal = this.getInputValue(`component-${componentIdx}-slot`).trim();
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return;
    const group = (container.closest(SELECTOR_FORM_GROUP) as HTMLElement | null) || container;
    const isCpm = this.isCpmSlot(slotVal);
    if (isCpm) {
      group.classList.add(CLASS_HIDDEN);
      // Remove any XIOM entries and reset counters
      const rows = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
      rows.forEach(r => r.remove());
      this.componentXiomCounters.set(componentIdx, 0);
      Array.from(this.xiomMdaCounters.keys()).forEach(k => { if (k.startsWith(`${componentIdx}:`)) this.xiomMdaCounters.delete(k); });
    } else {
      group.classList.remove(CLASS_HIDDEN);
    }
    this.updateXiomAddButtonState(componentIdx);
  }

  private updateMdaSectionVisibility(componentIdx: number): void {
    const slotVal = this.getInputValue(`component-${componentIdx}-slot`).trim();
    const entry = document.getElementById(`component-entry-${componentIdx}`);
    if (!entry) return;
    const group = entry.querySelector('[data-role="component-mda-group"]') as HTMLElement | null;
    const list = document.getElementById(`component-${componentIdx}-mda-container`);
    const addBtn = entry.querySelector('[data-action="add-mda"]') as HTMLButtonElement | null;
    if (!group || !list) return;
    const isCpm = this.isCpmSlot(slotVal);
    if (isCpm) {
      group.classList.add(CLASS_HIDDEN);
      group.setAttribute(ATTR_ARIA_HIDDEN, 'true');
      Array.from(list.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)).forEach(el => el.remove());
      this.componentMdaCounters.set(componentIdx, 0);
    } else {
      group.classList.remove(CLASS_HIDDEN);
      group.setAttribute(ATTR_ARIA_HIDDEN, 'false');
    }
    if (addBtn) addBtn.disabled = isCpm;
  }

  private wireComponentActions(idx: number, addMdaBtn: HTMLButtonElement, addXiomBtn: HTMLButtonElement, removeComponentBtn: HTMLButtonElement): void {
    addMdaBtn.onclick = () => this.addMdaEntry(idx);
    addXiomBtn.onclick = () => this.addXiomEntry(idx);
    if (removeComponentBtn) {
      removeComponentBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeComponentEntry(idx);
      };
    }
  }

  private attachAccordion(header: HTMLElement | null, body: HTMLElement | null, caret: HTMLElement | null): void {
    if (!header || !body) return;
    header.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-action="remove-component"]')) return;
      // Do not toggle when clicking interactive controls (e.g., slot input)
      if (target.closest('input, textarea, select, [contenteditable], [data-role="component-slot"]')) return;
      const isHidden = body.classList.contains(CLASS_HIDDEN);
      if (isHidden) {
        body.classList.remove(CLASS_HIDDEN);
        if (caret) {
          caret.classList.remove(ICON_CHEVRON_RIGHT);
          caret.classList.add(ICON_CHEVRON_DOWN);
        }
      } else {
        body.classList.add(CLASS_HIDDEN);
        if (caret) {
          caret.classList.remove(ICON_CHEVRON_DOWN);
          caret.classList.add(ICON_CHEVRON_RIGHT);
        }
      }
    });
  }

  private expandComponentEntry(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    if (!entry) return;
    const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;
    const caret = entry.querySelector(SELECTOR_COMPONENT_CARET) as HTMLElement | null;
    if (body && body.classList.contains(CLASS_HIDDEN)) body.classList.remove(CLASS_HIDDEN);
    if (caret) {
      caret.classList.remove(ICON_CHEVRON_RIGHT);
      caret.classList.add(ICON_CHEVRON_DOWN);
    }
  }

  private collectExpandedComponentSlots(): Set<string> {
    const set = new Set<string>();
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    if (!container) return set;
    const entries = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)) as HTMLElement[];
    entries.forEach(entry => {
      const idx = this.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx == null) return;
      const body = entry.querySelector(SELECTOR_COMPONENT_BODY) as HTMLElement | null;
      const slotInput = document.getElementById(`component-${idx}-slot`) as HTMLInputElement | null;
      const raw = slotInput?.value ?? '';
      const key = this.normalizeComponentSlot(raw);
      if (key && body && !body.classList.contains(CLASS_HIDDEN)) set.add(key);
    });
    return set;
  }

  // Removed legacy XIOM listener (handled per-XIOM entry now)

  private removeComponentEntry(idx: number): void {
    const entry = document.getElementById(`component-entry-${idx}`);
    entry?.remove();
    this.componentMdaCounters.delete(idx);
    this.componentXiomCounters.delete(idx);
    Array.from(this.xiomMdaCounters.keys()).forEach(k => { if (k.startsWith(`${idx}:`)) this.xiomMdaCounters.delete(k); });
    this.updateComponentAddButtonStates();
  }

  private addMdaEntry(componentIdx: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-mda-container`);
    const tpl = document.getElementById('tpl-mda-entry') as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    const next = (this.componentMdaCounters.get(componentIdx) || 0) + 1;
    this.componentMdaCounters.set(componentIdx, next);
    const mdaId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector('.component-mda-entry') as HTMLElement;
    row.id = `component-${componentIdx}-mda-entry-${mdaId}`;
    const slot = row.querySelector('[data-role="mda-slot"]') as HTMLInputElement;
    const hiddenType = row.querySelector('[data-role="mda-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="mda-type-dropdown"]') as HTMLElement;
    // Card slot label will be set globally after append
    const delBtn = row.querySelector('[data-action="remove-mda"]') as HTMLButtonElement;

    slot.id = `component-${componentIdx}-mda-${mdaId}-slot`;
    // Autofill MDA slot index starting at 1; respect provided prefill
    slot.value = prefill?.slot != null ? String(prefill.slot) : String(mdaId);
    hiddenType.id = `component-${componentIdx}-mda-${mdaId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : '';
    typeDropdown.id = `component-${componentIdx}-mda-${mdaId}-type-dropdown`;
    delBtn.onclick = () => this.removeMdaEntry(componentIdx, mdaId);

    list.appendChild(frag);

    // Initialize MDA dropdown options based on XIOM presence
    this.initMdaTypeDropdown(componentIdx, mdaId);
    // Ensure card slot labels are up to date for all rows
    this.updateMdaCardSlotLabels(componentIdx);
  }

  private removeMdaEntry(componentIdx: number, mdaId: number): void {
    const row = document.getElementById(`component-${componentIdx}-mda-entry-${mdaId}`);
    row?.remove();
  }

  private enforceComponentSlotPattern(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    let lastValid = input.value || '';
    const re = /^([aAbB]|[1-9]\d*)?$/; // allow A/B or positive integers; empty while typing
    input.addEventListener('input', () => {
      const v = input.value;
      if (re.test(v)) {
        lastValid = v;
      } else {
        input.value = lastValid;
      }
    });
  }

  private initComponentTypeDropdown(componentIdx: number): void {
    const slotVal = this.getInputValue(`component-${componentIdx}-slot`).trim();
    const isCpm = /^[aAbB]$/.test(slotVal);
    const options = isCpm ? this.srosCpmTypes : this.srosCardTypes;
    const initial = this.getInputValue(`component-${componentIdx}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-type-dropdown`,
      options,
      initial,
      (selected: string) => this.setInputValue(`component-${componentIdx}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
    // Re-init on slot change
    const slotInput = document.getElementById(`component-${componentIdx}-slot`) as HTMLInputElement | null;
    slotInput?.addEventListener('input', () => this.initComponentTypeDropdown(componentIdx));
  }

  private initMdaTypeDropdown(componentIdx: number, mdaId: number): void {
    const initial = this.getInputValue(`component-${componentIdx}-mda-${mdaId}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-mda-${mdaId}-type-dropdown`,
      this.srosMdaTypes,
      initial,
      (selected: string) => this.setInputValue(`component-${componentIdx}-mda-${mdaId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private addXiomEntry(componentIdx: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-xiom-container`);
    const tpl = document.getElementById('tpl-xiom-entry') as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    if (this.shouldBlockAddXiom(componentIdx)) return;
    const next = (this.componentXiomCounters.get(componentIdx) || 0) + 1;
    this.componentXiomCounters.set(componentIdx, next);
    const xiomId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_COMPONENT_XIOM_ENTRY}`) as HTMLElement;
    row.id = `component-${componentIdx}-xiom-entry-${xiomId}`;
    const slotHidden = row.querySelector('[data-role="xiom-slot-value"]') as HTMLInputElement;
    const slotDropdown = row.querySelector('[data-role="xiom-slot-dropdown"]') as HTMLElement;
    const hiddenType = row.querySelector('[data-role="xiom-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="xiom-type-dropdown"]') as HTMLElement;
    const delBtn = row.querySelector('[data-action="remove-xiom"]') as HTMLButtonElement;
    const xiomMdaList = row.querySelector('[data-role="xiom-mda-list"]') as HTMLElement;
    const addXiomMdaBtn = row.querySelector('[data-action="add-xiom-mda"]') as HTMLButtonElement;

    slotHidden.id = `component-${componentIdx}-xiom-${xiomId}-slot`;
    // Decide slot value (1 or 2)
    slotHidden.value = String(this.computeInitialXiomSlot(componentIdx, prefill));
    hiddenType.id = `component-${componentIdx}-xiom-${xiomId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : '';
    typeDropdown.id = `component-${componentIdx}-xiom-${xiomId}-type-dropdown`;
    xiomMdaList.id = `component-${componentIdx}-xiom-${xiomId}-mda-container`;
    delBtn.onclick = () => this.removeXiomEntry(componentIdx, xiomId);
    addXiomMdaBtn.onclick = () => this.addXiomMdaEntry(componentIdx, xiomId);

    // Assign ID to slot dropdown container and append
    this.setXiomSlotDropdownId(componentIdx, xiomId, slotDropdown);
    list.appendChild(frag);

    this.initXiomTypeDropdown(componentIdx, xiomId);
    // Initialize XIOM slot dropdown with x1/x2, writing 1/2 into hidden
    this.initXiomSlotDropdown(componentIdx, xiomId);
    this.maybePrefillXiomMdas(componentIdx, xiomId, prefill);
    this.updateMdaCardSlotLabels(componentIdx);
    this.updateXiomAddButtonState(componentIdx);
  }

  private shouldBlockAddXiom(componentIdx: number): boolean {
    const slotVal = this.getInputValue(`component-${componentIdx}-slot`).trim();
    if (this.isCpmSlot(slotVal)) return true;
    return this.countXioms(componentIdx) >= 2;
  }

  private computeInitialXiomSlot(componentIdx: number, prefill?: any): number {
    const desired = (prefill?.slot != null ? Number(prefill.slot) : this.findNextAvailableXiomSlot(componentIdx)) || 1;
    return desired === 2 ? 2 : 1;
  }

  private maybePrefillXiomMdas(componentIdx: number, xiomId: number, prefill?: any): void {
    if (Array.isArray(prefill?.mda)) prefill.mda.forEach((m: any) => this.addXiomMdaEntry(componentIdx, xiomId, m));
  }

  private setXiomSlotDropdownId(componentIdx: number, xiomId: number, el: HTMLElement | null): void {
    if (el) el.id = `component-${componentIdx}-xiom-${xiomId}-slot-dropdown`;
  }

  private removeXiomEntry(componentIdx: number, xiomId: number): void {
    const row = document.getElementById(`component-${componentIdx}-xiom-entry-${xiomId}`);
    row?.remove();
    this.xiomMdaCounters.delete(`${componentIdx}:${xiomId}`);
    this.updateMdaCardSlotLabels(componentIdx);
    this.updateXiomAddButtonState(componentIdx);
  }

  private initXiomTypeDropdown(componentIdx: number, xiomId: number): void {
    const initial = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-xiom-${xiomId}-type-dropdown`,
      this.srosXiomTypes,
      initial,
      (selected: string) => this.setInputValue(`component-${componentIdx}-xiom-${xiomId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private addXiomMdaEntry(componentIdx: number, xiomId: number, prefill?: any): void {
    const list = document.getElementById(`component-${componentIdx}-xiom-${xiomId}-mda-container`);
    const tpl = document.getElementById('tpl-xiom-mda-entry') as HTMLTemplateElement | null;
    if (!list || !tpl) return;
    const key = `${componentIdx}:${xiomId}`;
    const next = (this.xiomMdaCounters.get(key) || 0) + 1;
    this.xiomMdaCounters.set(key, next);
    const mdaId = next;

    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const row = frag.querySelector(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`) as HTMLElement;
    row.id = `component-${componentIdx}-xiom-${xiomId}-mda-entry-${mdaId}`;
    const slot = row.querySelector('[data-role="xiom-mda-slot"]') as HTMLInputElement;
    const hiddenType = row.querySelector('[data-role="xiom-mda-type-value"]') as HTMLInputElement;
    const typeDropdown = row.querySelector('[data-role="xiom-mda-type-dropdown"]') as HTMLElement;
    const delBtn = row.querySelector('[data-action="remove-xiom-mda"]') as HTMLButtonElement;

    slot.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-slot`;
    slot.value = prefill?.slot != null ? String(prefill.slot) : String(mdaId);
    hiddenType.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`;
    hiddenType.value = prefill?.type != null ? String(prefill.type) : '';
    typeDropdown.id = `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown`;
    delBtn.onclick = () => this.removeXiomMdaEntry(componentIdx, xiomId, mdaId);

    list.appendChild(frag);

    this.initXiomMdaTypeDropdown(componentIdx, xiomId, mdaId);
    this.updateMdaCardSlotLabels(componentIdx);
  }

  private removeXiomMdaEntry(componentIdx: number, xiomId: number, mdaId: number): void {
    const row = document.getElementById(`component-${componentIdx}-xiom-${xiomId}-mda-entry-${mdaId}`);
    row?.remove();
  }

  private initXiomMdaTypeDropdown(componentIdx: number, xiomId: number, mdaId: number): void {
    const initial = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`);
    createFilterableDropdown(
      `component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown`,
      this.srosXiomMdaTypes,
      initial,
      (selected: string) => this.setInputValue(`component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`, selected),
      PH_SEARCH_TYPE,
      true
    );
  }

  private countXioms(componentIdx: number): number {
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return 0;
    return container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`).length;
  }

  private getUsedXiomSlots(componentIdx: number, excludeXiomId?: number): Set<number> {
    const used = new Set<number>();
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return used;
    const rows = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
    rows.forEach(row => {
      const xiomId = this.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (excludeXiomId != null && xiomId === excludeXiomId) return;
      const v = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-slot`).trim();
      const n = parseInt(v, 10);
      if (n === 1 || n === 2) used.add(n);
    });
    return used;
  }

  private findNextAvailableXiomSlot(componentIdx: number): number {
    const used = this.getUsedXiomSlots(componentIdx);
    if (!used.has(1)) return 1;
    if (!used.has(2)) return 2;
    return 1; // default fallback
  }

  private initXiomSlotDropdown(componentIdx: number, xiomId: number): void {
    const hidden = document.getElementById(`component-${componentIdx}-xiom-${xiomId}-slot`) as HTMLInputElement | null;
    if (!hidden) return;
    const initialDigit = hidden.value === '2' ? '2' : '1';
    const initialLabel = initialDigit === '2' ? 'x2' : 'x1';
    const containerId = `component-${componentIdx}-xiom-${xiomId}-slot-dropdown`;
    const options = ['x1', 'x2'];
    createFilterableDropdown(
      containerId,
      options,
      initialLabel,
      (selected: string) => {
        const chosen = selected === 'x2' ? 2 : 1;
        // Enforce uniqueness across XIOMs for this component
        const used = this.getUsedXiomSlots(componentIdx, xiomId);
        if (used.has(chosen)) {
          // Flip to other if available
          const other = chosen === 1 ? 2 : 1;
          if (!used.has(other)) {
            hidden.value = String(other);
            // also set the visible field to 'x' + other
            const filter = document.getElementById(`${containerId}-filter-input`) as HTMLInputElement | null;
            if (filter) filter.value = `x${other}`;
          }
        } else {
          hidden.value = String(chosen);
        }
        this.updateXiomAddButtonState(componentIdx);
        this.updateMdaCardSlotLabels(componentIdx);
      },
      PH_SEARCH_TYPE,
      false
    );
  }

  private updateXiomAddButtonState(componentIdx: number): void {
    const entry = document.getElementById(`component-entry-${componentIdx}`);
    if (!entry) return;
    const btn = entry.querySelector('[data-action="add-xiom"]') as HTMLButtonElement | null;
    if (!btn) return;
    const slotVal = this.getInputValue(`component-${componentIdx}-slot`).trim();
    btn.disabled = this.isCpmSlot(slotVal) || this.countXioms(componentIdx) >= 2;
  }

  private showTypeDropdown(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    typeOptions: string[],
    selectedKind: string,
  ) {
    typeFormGroup.style.display = 'block';
    if (!typeDropdownContainer || !typeInput) return;
    typeDropdownContainer.style.display = 'block';
    typeInput.style.display = 'none';

    const typeOptionsWithEmpty = ['', ...typeOptions];
    const currentType = typeInput.value || '';
    const typeToSelect = typeOptionsWithEmpty.includes(currentType) ? currentType : '';
    this.setTypeWarningVisibility(false);

    createFilterableDropdown(
      ID_NODE_TYPE_DROPDOWN,
      typeOptionsWithEmpty,
      typeToSelect,
      (selectedType: string) => {
        if (typeInput) typeInput.value = selectedType;
        log.debug(`Type ${selectedType || '(empty)'} selected for kind ${selectedKind}`);
        this.onTypeFieldChanged();
      },
      PH_SEARCH_TYPE,
      true
    );

    const filterInput = document.getElementById(ID_NODE_TYPE_FILTER_INPUT) as HTMLInputElement | null;
    if (filterInput) {
      const syncTypeValue = () => {
        if (typeInput) typeInput.value = filterInput.value;
        this.onTypeFieldChanged();
      };
      filterInput.oninput = syncTypeValue;
      if (typeInput) typeInput.value = filterInput.value;
    }
  }

  private toggleTypeInputForKind(
    selectedKind: string,
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
  ) {
    const schemaReady = this.typeSchemaLoaded;
    const hasTypeSupport = schemaReady ? this.kindSupportsType(selectedKind) : false;
    const hasTypeValue = this.hasTypeFieldValue();
    const shouldShowFreeformType = !schemaReady || hasTypeSupport || hasTypeValue;

    if (shouldShowFreeformType) {
      this.displayFreeformTypeField(typeFormGroup, typeDropdownContainer, typeInput);
      const shouldWarn = schemaReady && hasTypeValue && !hasTypeSupport;
      this.setTypeWarningVisibility(shouldWarn);
      return;
    }

    this.hideTypeField(typeFormGroup, typeDropdownContainer, typeInput, hasTypeValue);
  }

  private displayFreeformTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
  ): void {
    typeFormGroup.style.display = 'block';
    if (typeDropdownContainer && typeInput) {
      typeDropdownContainer.style.display = 'none';
      typeInput.style.display = 'block';
    }
    if (typeInput) {
      typeInput.oninput = () => this.onTypeFieldChanged();
    }
  }

  private hideTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    hasTypeValue: boolean,
  ): void {
    typeFormGroup.style.display = 'none';
    this.setTypeWarningVisibility(false);
    if (typeInput) {
      typeInput.style.display = 'none';
      if (!hasTypeValue) typeInput.value = '';
    }
    if (typeDropdownContainer) typeDropdownContainer.style.display = 'none';
  }

  private onTypeFieldChanged(): void {
    this.updateComponentMode();
  }

  private getCurrentKindValue(): string {
    const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
    return input?.value?.trim() ?? '';
  }

  private isIntegratedSrosType(kind: string | undefined, type: string | undefined): boolean {
    if (!kind || kind !== 'nokia_srsim') return false;
    const normalized = (type || '').trim().toLowerCase();
    if (!normalized) return false;
    return this.integratedSrosTypes.has(normalized);
  }

  private setElementVisibility(id: string, visible: boolean): void {
    const el = document.getElementById(id);
    if (!el) return;
    if (visible) {
      el.classList.remove(CLASS_HIDDEN);
      el.setAttribute(ATTR_ARIA_HIDDEN, 'false');
    } else {
      el.classList.add(CLASS_HIDDEN);
      el.setAttribute(ATTR_ARIA_HIDDEN, 'true');
    }
  }

  private setTypeWarningVisibility(visible: boolean): void {
    const warning = document.getElementById(ID_NODE_TYPE_WARNING);
    if (!warning) return;
    warning.style.display = visible ? 'block' : 'none';
    if (visible) {
      warning.textContent = TYPE_UNSUPPORTED_WARNING_TEXT;
    }
  }

  private configureComponentSectionsForMode(showComponents: boolean, integrated: boolean): void {
    const showDistributed = showComponents && !integrated;
    const showIntegrated = showComponents && integrated;
    this.setElementVisibility(ID_NODE_COMPONENTS_ACTIONS_DISTRIBUTED, showDistributed);
    this.setElementVisibility(ID_NODE_COMPONENTS_CONTAINER, showDistributed);
    this.setElementVisibility(ID_NODE_COMPONENTS_ACTIONS_INTEGRATED, showIntegrated);
    this.setElementVisibility(ID_NODE_COMPONENTS_INTEGRATED_SECTION, showIntegrated);
  }

  private updateComponentMode(reload = true): void {
    const kind = this.getCurrentKindValue();
    const kindSupportsComponents = kind ? this.componentKinds.has(kind) : false;
    const typeValue = this.getTypeFieldValue();
    const integrated = this.isIntegratedSrosType(kind, typeValue);

    if (!kindSupportsComponents) {
      this.integratedMode = false;
      this.configureComponentSectionsForMode(false, false);
      if (reload) {
        this.resetIntegratedMdaContainer();
        const containers = this.getComponentContainers();
        if (containers) this.resetComponentContainers(containers);
      }
      return;
    }

    this.integratedMode = integrated;
    this.configureComponentSectionsForMode(true, integrated);

    if (reload) {
      this.loadComponentsFromNode();
    } else if (integrated) {
      this.updateIntegratedAddButtonState();
    } else {
      this.updateComponentAddButtonStates();
    }
  }

  /**
   * Initialize the enhanced node editor panel
   */
  private initializePanel(): void {
    this.panel = document.getElementById(ID_PANEL_NODE_EDITOR);
    if (!this.panel) {
      log.error('Enhanced node editor panel not found in DOM');
      return;
    }

    // Populate the Kind dropdown from the JSON schema so all kinds are available
    this.populateKindsFromSchema().catch(err => {
      log.error(`Failed to populate kinds from schema: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Mark panel interaction to prevent closing, but don't stop propagation
    // as that breaks tabs and other interactive elements
    this.panel.addEventListener('mousedown', () => {
      // Mark that we clicked on the panel
      if ((window as any).viewportPanels) {
        (window as any).viewportPanels.setNodeClicked(true);
      }
    });

    // Set up event delegation for delete buttons
    this.panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Check if click is on a delete button or its child (the icon)
      const deleteBtn = target.closest(`.${CLASS_DYNAMIC_DELETE_BTN}`);
      if (!deleteBtn) return;

      // Get the container and entry ID from the button's data attributes
      const containerName = deleteBtn.getAttribute(DATA_ATTR_CONTAINER);
      const entryId = deleteBtn.getAttribute(DATA_ATTR_ENTRY_ID);

      if (!containerName || !entryId) {
        // Let other click handlers (e.g., component removal) process the event
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      log.debug(`Delete button clicked via delegation: ${containerName}-${entryId}`);

      // Mark panel as clicked to prevent closing
      if ((window as any).viewportPanels) {
        (window as any).viewportPanels.setNodeClicked(true);
      }

      // Remove the entry
      this.removeEntry(containerName, parseInt(entryId));
    }, true); // Use capture phase to ensure we get the event first

    // Initialize tab switching
    this.setupTabSwitching();
    // Initialize tab scroll arrows
    this.setupTabScrollArrows();

    // Initialize event handlers
    this.setupEventHandlers();
    this.setupIconEditorControls();

    // Setup dynamic entry handlers
    this.setupDynamicEntryHandlers();

    // Initialize static filterable dropdowns with default values
    this.initializeStaticDropdowns();

    // Setup listeners to clear inherited flags when fields are edited
    this.setupInheritanceChangeListeners();

    log.debug('Enhanced node editor panel initialized');
  }

  /**
   * Setup scrollable tab bar with arrow buttons
   */
  private setupTabScrollArrows(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const leftBtn = document.getElementById(ID_TAB_SCROLL_LEFT) as HTMLButtonElement | null;
    const rightBtn = document.getElementById(ID_TAB_SCROLL_RIGHT) as HTMLButtonElement | null;

    if (!viewport || !leftBtn || !rightBtn) return;

    const scrollByAmount = (dir: -1 | 1) => {
      const delta = Math.max(120, Math.floor(viewport.clientWidth * 0.6));
      viewport.scrollBy({ left: dir * delta, behavior: 'smooth' });
    };

    leftBtn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollByAmount(-1);
    });
    rightBtn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollByAmount(1);
    });

    viewport.addEventListener('scroll', () => this.updateTabScrollButtons(), { passive: true });
    window.addEventListener('resize', () => this.updateTabScrollButtons());

    // Initial state
    setTimeout(() => { this.ensureActiveTabVisible(); this.updateTabScrollButtons(); }, 0);
  }

  /** Ensure the active tab button is visible inside the viewport */
  private ensureActiveTabVisible(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const strip = document.getElementById(ID_TAB_STRIP) as HTMLElement | null;
    if (!viewport || !strip) return;
    const active = strip.querySelector(`.${CLASS_PANEL_TAB_BUTTON}.${CLASS_TAB_ACTIVE}`) as HTMLElement | null;
    if (!active) return;
    const vpLeft = viewport.scrollLeft;
    const vpRight = vpLeft + viewport.clientWidth;
    const elLeft = active.offsetLeft;
    const elRight = elLeft + active.offsetWidth;
    if (elLeft < vpLeft) {
      viewport.scrollTo({ left: Math.max(0, elLeft - 16), behavior: 'smooth' });
    } else if (elRight > vpRight) {
      viewport.scrollTo({ left: elRight - viewport.clientWidth + 16, behavior: 'smooth' });
    }
  }

  /** Show/hide left/right scroll buttons based on overflow */
  private updateTabScrollButtons(): void {
    const viewport = document.getElementById(ID_TAB_VIEWPORT) as HTMLElement | null;
    const leftBtn = document.getElementById(ID_TAB_SCROLL_LEFT) as HTMLButtonElement | null;
    const rightBtn = document.getElementById(ID_TAB_SCROLL_RIGHT) as HTMLButtonElement | null;
    if (!viewport || !leftBtn || !rightBtn) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const current = viewport.scrollLeft;
    const canLeft = current > 1;
    const canRight = current < maxScroll - 1;
    leftBtn.classList.toggle('hidden', !canLeft);
    rightBtn.classList.toggle('hidden', !canRight);
  }

  private initializeStaticDropdowns(): void {
    // Restart Policy
    const rpOptions = [...OPTIONS_RP];
    createFilterableDropdown(
      ID_NODE_RP_DROPDOWN,
      rpOptions,
      LABEL_DEFAULT,
      () => {},
      PH_SEARCH_RP
    );

    // Network Mode
    const nmOptions = [...OPTIONS_NM];
    createFilterableDropdown(
      ID_NODE_NM_DROPDOWN,
      nmOptions,
      LABEL_DEFAULT,
      () => {},
      PH_SEARCH_NM
    );

    // Cert key size
    const keySizeOptions = ['2048', '4096'];
    createFilterableDropdown(
      ID_NODE_CERT_KEYSIZE_DROPDOWN,
      keySizeOptions,
      '2048',
      () => {},
      PH_SEARCH_KEY_SIZE
    );

    // Image pull policy
    const ippOptions = [...OPTIONS_IPP];
    createFilterableDropdown(
      ID_NODE_IPP_DROPDOWN,
      ippOptions,
      LABEL_DEFAULT,
      () => {},
      PH_SEARCH_IPP
    );

    // Runtime
    const runtimeOptions = [...OPTIONS_RUNTIME];
    createFilterableDropdown(
      ID_NODE_RUNTIME_DROPDOWN,
      runtimeOptions,
      LABEL_DEFAULT,
      () => {},
      PH_SEARCH_RUNTIME
    );
  }

  private getSchemaUrl(): string | undefined {
    const url = (window as any).schemaUrl as string | undefined;
    if (!url) {
      log.warn('Schema URL is undefined; keeping existing Kind options');
    }
    return url;
  }

  private async fetchSchema(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private getSortedKinds(schema: any): string[] {
    const kinds: string[] = schema?.definitions?.['node-config']?.properties?.kind?.enum || [];
    const nokiaKinds = kinds
      .filter(k => k.startsWith('nokia_'))
      .sort((a, b) => a.localeCompare(b));
    const otherKinds = kinds
      .filter(k => !k.startsWith('nokia_'))
      .sort((a, b) => a.localeCompare(b));
    return [...nokiaKinds, ...otherKinds];
  }

  private determineInitialKind(desired: string): string {
    if (desired && this.schemaKinds.includes(desired)) {
      return desired;
    }
    const def = (window as any).defaultKind;
    if (def && this.schemaKinds.includes(def)) {
      return def;
    }
    return this.schemaKinds[0] || '';
  }

  /**
   * Fetch schema and populate the Kind dropdown with all enum values
   */
  private async populateKindsFromSchema(): Promise<void> {
    try {
      const url = this.getSchemaUrl();
      if (!url) return;

      const json = await this.fetchSchema(url);
      this.extractTypeOptionsFromSchema(json);
      this.extractComponentEnumsFromSchema(json);

      const kinds = this.getSortedKinds(json);
      if (kinds.length === 0) {
        log.warn('No kind enum found in schema; keeping existing Kind options');
        return;
      }
      this.schemaKinds = kinds;

      const desired =
        (this.currentNode?.data()?.extraData?.kind as string) ||
        ((window as any).defaultKind as string) ||
        '';
      const initial = this.determineInitialKind(desired);
      createFilterableDropdown(
        ID_NODE_KIND_DROPDOWN,
        this.schemaKinds,
        initial,
        (selectedKind: string) => this.handleKindChange(selectedKind),
        PH_SEARCH_KIND
      );

      this.kindsLoaded = true;
      log.debug(`Loaded ${this.schemaKinds.length} kinds from schema`);
    } catch (e) {
      log.error(`populateKindsFromSchema error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private extractComponentEnumsFromSchema(schema: any): void {
    const defs = schema?.definitions || {};
    this.srosSfmTypes = defs['sros-sfm-types']?.enum || [];
    this.srosXiomTypes = defs['sros-xiom-types']?.enum || [];
    this.srosCpmTypes = defs['sros-cpm-types']?.enum || [];
    this.srosCardTypes = defs['sros-card-types']?.enum || [];
    this.srosXiomMdaTypes = defs['sros-xiom-mda-types']?.enum || [];
    this.srosMdaTypes = defs['sros-mda-types']?.enum || [];

    // If Components are already rendered, ensure dropdowns get initialized now that enums are present
    this.refreshComponentsDropdowns();
  }

  private refreshComponentsDropdowns(): void {
    if (this.integratedMode) {
      this.refreshIntegratedMdaDropdowns();
      return;
    }
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    if (!container) return;
    const entries = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)) as HTMLElement[];
    entries.forEach(entry => {
      const idx = this.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx === null) return;
      this.initComponentTypeDropdown(idx);
      // Initialize XIOM dropdowns for existing XIOM entries
      const xiomContainer = document.getElementById(`component-${idx}-xiom-container`);
      if (xiomContainer) {
        const xiomRows = Array.from(xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
        xiomRows.forEach(row => {
          const xiomId = this.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
          if (xiomId !== null) {
            this.initXiomTypeDropdown(idx, xiomId);
            const xmdaRows = Array.from(row.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)) as HTMLElement[];
            xmdaRows.forEach(xmda => {
              const mdaId = this.extractIndex(xmda.id, /component-\d+-xiom-\d+-mda-entry-(\d+)/);
              if (mdaId !== null) this.initXiomMdaTypeDropdown(idx, xiomId, mdaId);
        });
      }
    });
    this.refreshSfmDropdown();
  }
      const mdaContainer = document.getElementById(`component-${idx}-mda-container`);
      if (!mdaContainer) return;
      const rows = Array.from(mdaContainer.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)) as HTMLElement[];
      rows.forEach(row => {
        const mdaId = this.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
        if (mdaId !== null) this.initMdaTypeDropdown(idx, mdaId);
      });
    });
  }

  /**
   * Extract type options from schema for each kind
   */
  private extractTypeOptionsFromSchema(schema: any): void {
    this.typeSchemaLoaded = false;
    this.nodeTypeOptions.clear();
    this.kindsWithTypeSupport.clear();
    const allOf = schema?.definitions?.['node-config']?.allOf;
    if (!allOf) {
      this.typeSchemaLoaded = true;
      this.refreshTypeFieldVisibility();
      return;
    }

    for (const condition of allOf) {
      const kind = this.getKindFromCondition(condition);
      if (!kind) continue;
      const typeProp = condition?.then?.properties?.type;
      if (!typeProp) continue;
      this.kindsWithTypeSupport.add(kind);
      const typeOptions = this.extractTypeOptions(typeProp);
      if (typeOptions.length > 0) {
        this.nodeTypeOptions.set(kind, typeOptions);
        log.debug(`Extracted ${typeOptions.length} type options for kind ${kind}`);
      }
    }
    this.typeSchemaLoaded = true;
    this.refreshTypeFieldVisibility();
  }

  private refreshTypeFieldVisibility(): void {
    const typeFormGroup = document.getElementById(ID_NODE_TYPE)?.closest(SELECTOR_FORM_GROUP) as HTMLElement | null;
    if (!typeFormGroup) return;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement | null;
    if (!typeDropdownContainer || !typeInput) return;
    const currentKind = this.getCurrentKindValue();
    if (!currentKind) return;

    const typeOptions = this.getTypeOptionsForKind(currentKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(typeFormGroup, typeDropdownContainer, typeInput, typeOptions, currentKind);
    } else {
      this.toggleTypeInputForKind(currentKind, typeFormGroup, typeDropdownContainer, typeInput);
    }
  }

  private getKindFromCondition(condition: any): string | null {
    const pattern = condition?.if?.properties?.kind?.pattern as string | undefined;
    if (!pattern) return null;
    const start = pattern.indexOf('(');
    const end = start >= 0 ? pattern.indexOf(')', start + 1) : -1;
    if (start < 0 || end <= start) return null;
    return pattern.slice(start + 1, end);
  }

  private extractTypeOptions(typeProp: any): string[] {
    if (typeProp.enum) return typeProp.enum;
    if (Array.isArray(typeProp.anyOf)) {
      return typeProp.anyOf.flatMap((sub: any) => (sub.enum ? sub.enum : []));
    }
    return [];
  }

  private kindSupportsType(kind: string): boolean {
    return this.kindsWithTypeSupport.has(kind);
  }

  /**
   * Get type options for a specific kind
   */
  private getTypeOptionsForKind(kind: string): string[] {
    return this.nodeTypeOptions.get(kind) || [];
  }

  /**
   * Setup tab switching functionality
   */
  private setupTabSwitching(): void {
    const tabButtons = this.panel?.querySelectorAll(`.${CLASS_PANEL_TAB_BUTTON}`);
    const tabContents = this.panel?.querySelectorAll(`.${CLASS_TAB_CONTENT}`);

    tabButtons?.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove(CLASS_TAB_ACTIVE));
        button.classList.add(CLASS_TAB_ACTIVE);

        // Show corresponding tab content
        tabContents?.forEach(content => {
          if (content.id === `tab-${targetTab}`) {
            content.classList.remove(CLASS_HIDDEN);
          } else {
            content.classList.add(CLASS_HIDDEN);
          }
        });

        // Keep tab visible and update scroll buttons
        this.ensureActiveTabVisible();
        this.updateTabScrollButtons();
      });
    });
  }

  /**
   * Setup event handlers for save/cancel buttons
   */
  private setupEventHandlers(): void {
    // Close button
    const closeBtn = document.getElementById(ID_PANEL_EDITOR_CLOSE);
    closeBtn?.addEventListener('click', () => this.close());

    // Cancel button
    const cancelBtn = document.getElementById(ID_PANEL_EDITOR_CANCEL);
    cancelBtn?.addEventListener('click', () => this.close());

    // Save button
    const saveBtn = document.getElementById(ID_PANEL_EDITOR_SAVE);
    saveBtn?.addEventListener('click', () => this.save());

    // Certificate checkbox toggle
    const certCheckbox = document.getElementById(ID_NODE_CERT_ISSUE) as HTMLInputElement;
    const certOptions = document.getElementById(ID_CERT_OPTIONS);
    certCheckbox?.addEventListener('change', () => {
      if (certCheckbox.checked) {
        certOptions?.classList.remove(CLASS_HIDDEN);
      } else {
        certOptions?.classList.add(CLASS_HIDDEN);
      }
    });
  }

  private setupIconEditorControls(): void {
    if (this.iconEditorInitialized) return;
    const editButton = document.getElementById(ID_NODE_ICON_EDIT_BUTTON) as HTMLButtonElement | null;
    const addButton = document.getElementById(ID_NODE_ICON_ADD_BUTTON) as HTMLButtonElement | null;
    const modal = document.getElementById(ID_ICON_EDITOR_MODAL);
    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP);
    if (!editButton || !modal || !backdrop) return;
    this.iconEditorInitialized = true;

    editButton.addEventListener('click', () => this.openIconEditor());
    addButton?.addEventListener('click', () => {
      void this.handleIconUpload();
    });
    this.registerIconEditorDismissHandlers();
    this.registerIconEditorActionHandlers();
    this.registerIconEditorInputHandlers();
  }

  private registerIconEditorDismissHandlers(): void {
    const cancelBtn = document.getElementById(ID_ICON_EDITOR_CANCEL) as HTMLButtonElement | null;
    cancelBtn?.addEventListener('click', () => this.closeIconEditor());

    const closeBtn = document.getElementById(ID_ICON_EDITOR_CLOSE) as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => this.closeIconEditor());

    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP) as HTMLDivElement | null;
    backdrop?.addEventListener('click', () => this.closeIconEditor());
  }

  private registerIconEditorActionHandlers(): void {
    const saveBtn = document.getElementById(ID_ICON_EDITOR_SAVE) as HTMLButtonElement | null;
    saveBtn?.addEventListener('click', () => this.applyIconEditorSelection());
  }

  private registerIconEditorInputHandlers(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    if (colorInput) {
      colorInput.addEventListener('input', () => this.handleIconEditorColorInput(colorInput, hexInput));
    }
    if (hexInput) {
      hexInput.addEventListener('input', () => this.handleIconEditorHexInput(hexInput, colorInput));
    }

    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    if (shapeSelect) {
      this.populateIconShapeOptions(shapeSelect);
      shapeSelect.addEventListener('change', () => this.updateIconPreviewElement());
    }

    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    if (cornerInput) {
      cornerInput.addEventListener('input', () => this.handleIconEditorCornerInput(cornerInput));
    }
  }

  private handleIconEditorColorInput(colorInput: HTMLInputElement, hexInput: HTMLInputElement | null): void {
    const normalized = this.normalizeIconColor(colorInput.value, DEFAULT_ICON_COLOR);
    if (hexInput && normalized) {
      hexInput.value = normalized;
    }
    this.updateIconPreviewElement();
  }

  private handleIconEditorHexInput(hexInput: HTMLInputElement, colorInput: HTMLInputElement | null): void {
    const normalized = this.normalizeIconColor(hexInput.value, null);
    if (normalized && colorInput) {
      colorInput.value = normalized;
      hexInput.value = normalized;
      this.updateIconPreviewElement();
    }
  }

  private updateCornerRadiusLabel(value: number): void {
    const radiusLabel = document.getElementById(ID_ICON_EDITOR_CORNER_VALUE);
    if (radiusLabel) {
      const normalized = Math.max(0, Math.round(value));
      radiusLabel.textContent = `${normalized}px`;
    }
  }

  private handleIconEditorCornerInput(cornerInput: HTMLInputElement): void {
    this.updateCornerRadiusLabel(Number(cornerInput.value));
    this.updateIconPreviewElement();
  }

  private scaleRadiusForPreview(value: number, preview: HTMLImageElement): number {
    const previewSize = preview?.clientWidth || ICON_PREVIEW_DEFAULT_SIZE;
    const normalizedRadius = Math.max(0, Number.isFinite(value) ? value : 0);
    const scaled = (normalizedRadius / NODE_ICON_BASE_SIZE) * previewSize;
    return Math.min(scaled, previewSize / 2);
  }

  private populateIconShapeOptions(select: HTMLSelectElement): void {
    select.innerHTML = '';
    for (const role of this.getNodeIconOptions()) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      select.appendChild(option);
    }
  }

  private openIconEditor(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const currentShape = this.getCurrentIconValue();
    if (shapeSelect) {
      if (!Array.from(shapeSelect.options).some(opt => opt.value === currentShape)) {
        this.populateIconShapeOptions(shapeSelect);
      }
      shapeSelect.value = currentShape;
    }
    const colorValue = this.currentIconColor ?? DEFAULT_ICON_COLOR;
    if (colorInput) colorInput.value = colorValue;
    if (hexInput) hexInput.value = this.currentIconColor ?? '';
    if (cornerInput) {
      cornerInput.value = `${this.currentIconCornerRadius}`;
      this.updateCornerRadiusLabel(this.currentIconCornerRadius);
    }
    this.toggleIconEditor(true);
    this.updateIconPreviewElement();
  }

  private closeIconEditor(): void {
    this.toggleIconEditor(false);
  }

  private toggleIconEditor(show: boolean): void {
    const modal = document.getElementById(ID_ICON_EDITOR_MODAL) as HTMLDivElement | null;
    const backdrop = document.getElementById(ID_ICON_EDITOR_BACKDROP) as HTMLDivElement | null;
    if (!modal || !backdrop) return;
    modal.style.display = show ? 'block' : 'none';
    backdrop.style.display = show ? 'block' : 'none';
  }

  private updateIconPreviewElement(): void {
    const preview = document.getElementById(ID_ICON_EDITOR_PREVIEW) as HTMLImageElement | null;
    if (!preview) return;
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const color = this.normalizeIconColor(colorInput?.value || this.currentIconColor || DEFAULT_ICON_COLOR, DEFAULT_ICON_COLOR) ?? DEFAULT_ICON_COLOR;
    const shape = shapeSelect?.value || this.getCurrentIconValue();
    const dataUri = getIconDataUriForRole(shape, color);
    if (dataUri) {
      preview.src = dataUri;
    }
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const radius = cornerInput ? Number(cornerInput.value) : this.currentIconCornerRadius;
    preview.style.borderRadius = `${this.scaleRadiusForPreview(radius, preview)}px`;
  }

  private applyIconEditorSelection(): void {
    const colorInput = document.getElementById(ID_ICON_EDITOR_COLOR) as HTMLInputElement | null;
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    const cornerInput = document.getElementById(ID_ICON_EDITOR_CORNER) as HTMLInputElement | null;
    const rawColor = colorInput?.value || '';
    const normalized = this.normalizeIconColor(rawColor, null);
    const effectiveColor =
      normalized && normalized.toLowerCase() !== DEFAULT_ICON_COLOR ? normalized : null;
    this.setIconColor(effectiveColor);
    const hexInput = document.getElementById(ID_ICON_EDITOR_HEX) as HTMLInputElement | null;
    if (hexInput) {
      hexInput.value = effectiveColor ?? '';
    }
    const shape = shapeSelect?.value || this.getCurrentIconValue();
    this.setIconShapeValue(shape);
    const cornerRadius = cornerInput ? Number(cornerInput.value) : DEFAULT_ICON_CORNER_RADIUS;
    this.setIconCornerRadius(Number.isFinite(cornerRadius) ? cornerRadius : DEFAULT_ICON_CORNER_RADIUS);
    this.closeIconEditor();
  }

  private setIconShapeValue(shape: string): void {
    const input = document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null;
    if (!input) return;
    input.value = shape;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Setup handlers for dynamic entry management (binds, env vars, etc.)
   */
  private setupDynamicEntryHandlers(): void {
    // Expose functions globally for onclick handlers in HTML
    (window as any).addBindEntry = () => this.addDynamicEntry(CN_BINDS, PH_BIND);
    (window as any).addEnvEntry = () => this.addDynamicKeyValueEntry(CN_ENV, PH_ENV_KEY, PH_VALUE);
    (window as any).addEnvFileEntry = () => this.addDynamicEntry(CN_ENV_FILES, PH_ENV_FILE);
    (window as any).addLabelEntry = () => this.addDynamicKeyValueEntry(CN_LABELS, PH_LABEL_KEY, PH_LABEL_VALUE);
    (window as any).addExecEntry = () => this.addDynamicEntry(CN_EXEC, PH_EXEC);
    (window as any).addPortEntry = () => this.addDynamicEntry(CN_PORTS, PH_PORT);
    (window as any).addDnsServerEntry = () => this.addDynamicEntry(CN_DNS_SERVERS, PH_DNS_SERVER);
    (window as any).addAliasEntry = () => this.addDynamicEntry(CN_ALIASES, PH_ALIAS);
    (window as any).addCapabilityEntry = () => this.addDynamicEntry(CN_CAP_ADD, PH_CAP);
    (window as any).addSysctlEntry = () => this.addDynamicKeyValueEntry(CN_SYSCTLS, PH_SYSCTL_KEY, PH_VALUE);
    (window as any).addDeviceEntry = () => this.addDynamicEntry(CN_DEVICES, PH_DEVICE);
    (window as any).addSanEntry = () => this.addDynamicEntry(CN_SANS, PH_SAN);
    this.registerComponentEntryHandlers();

    // Register remove entry function globally (no longer needed with event listeners)
    // but keeping for backward compatibility if any inline handlers remain
    (window as any).removeEntry = (containerName: string, entryId: number) => {
      log.debug(`Global removeEntry called: ${containerName}, ${entryId}`);
      this.removeEntry(containerName, entryId);
      return false; // Prevent default behavior
    };
  }

  private registerComponentEntryHandlers(): void {
    (window as any).addComponentEntry = () => { this.addComponentEntry(undefined, { slotType: 'card' }); };
    (window as any).addCpmComponentEntry = () => { this.addComponentEntry(undefined, { slotType: 'cpm' }); };
    (window as any).addCardComponentEntry = () => { this.addComponentEntry(undefined, { slotType: 'card' }); };
    (window as any).addIntegratedMdaEntry = () => { this.addIntegratedMdaEntry(); };
  }

  /**
   * Remove a dynamic entry from the DOM (without saving)
   */
  private removeEntry(containerName: string, entryId: number): void {
    log.debug(`Removing entry: ${containerName}-entry-${entryId}`);
    const entry = document.getElementById(`${containerName}-entry-${entryId}`);
    if (entry) {
      entry.remove();
      log.debug(`Entry removed from DOM`);
      // Don't save automatically - wait for user to click Save button
    } else {
      log.error(`Entry not found: ${containerName}-entry-${entryId}`);
    }
  }

  /**
   * Add a dynamic entry field for array-based properties
   */
  private addDynamicEntry(containerName: string, placeholder: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = CLASS_INPUT_FIELD;
    input.placeholder = placeholder;
    input.setAttribute(DATA_ATTR_FIELD, containerName);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(input);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a dynamic key-value entry field for object-based properties
   */
  private addDynamicKeyValueEntry(containerName: string, keyPlaceholder: string, valuePlaceholder: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Refreshes docker images from the backend with a timeout
   */
  private async refreshDockerImages(): Promise<void> {
    try {
      // Create a timeout promise that rejects after 2 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Docker image refresh timeout')), 2000);
      });

      // Race between the refresh and timeout
      const response: any = await Promise.race([
        this.messageSender.sendMessageToVscodeEndpointPost('refresh-docker-images', {}),
        timeoutPromise
      ]);

      if (response && response.dockerImages) {
        (window as any).dockerImages = response.dockerImages;
        log.debug(`Docker images refreshed, found ${response.dockerImages.length} images`);
      }
    } catch (error: any) {
      // Fail gracefully - just log and continue
      log.debug(`Failed to refresh docker images (continuing): ${error.message}`);
    }
  }

  /**
   * Open the enhanced node editor for a specific node
   */
  public async open(node: cytoscape.NodeSingular): Promise<void> {
    this.currentNode = node;
    if (!this.panel) {
      log.error('Panel not initialized');
      return;
    }

    // Refresh docker images before loading node data
    await this.refreshDockerImages();

    await this.refreshNodeExtraData(node);
    this.clearAllDynamicEntries();
    this.switchToTab('basic');
    this.loadNodeData(node);
    this.alignKindSelection(node);
    this.panel.style.display = 'block';
    // After the panel becomes visible, update tab scroll UI once layout is ready
    const afterVisible = () => {
      try {
        this.ensureActiveTabVisible();
        this.updateTabScrollButtons();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.debug(`Post-open tab scroll update skipped: ${msg}`);
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => afterVisible());
      // Also schedule a secondary tick to be safe after dynamic content inflates
      setTimeout(afterVisible, 50);
    } else {
      setTimeout(afterVisible, 0);
    }
    log.debug(`Opened enhanced node editor for node: ${node.id()}`);
  }

  private async refreshNodeExtraData(node: cytoscape.NodeSingular): Promise<void> {
    try {
      const sender = this.saveManager.getMessageSender();
      const nodeName = node.data('name') || node.id();
      const freshData = await sender.sendMessageToVscodeEndpointPost('topo-editor-get-node-config', { node: nodeName });
      if (freshData && typeof freshData === 'object') {
        node.data('extraData', freshData);
      }
    } catch (err) {
      log.warn(`Failed to refresh node data from YAML: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private alignKindSelection(node: cytoscape.NodeSingular): void {
    try {
    const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
      const desired = (node.data()?.extraData?.kind as string) || (window as any).defaultKind || '';
      if (!input || !desired || !this.kindsLoaded || this.schemaKinds.length === 0) {
        return;
      }
      input.value = this.determineInitialKind(desired);
    } catch (e) {
      log.warn(`Kind selection alignment warning: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Clear all dynamic entry containers
   */
  private clearAllDynamicEntries(): void {
    const containers = [
      CN_BINDS, CN_ENV, CN_ENV_FILES, CN_LABELS, CN_EXEC, CN_PORTS, CN_DNS_SERVERS,
      CN_ALIASES, CN_CAP_ADD, CN_SYSCTLS, CN_DEVICES, CN_SANS
    ];

    containers.forEach(name => {
      const container = document.getElementById(`node-${name}-container`);
      if (container) {
        container.innerHTML = '';
      }
    });

    this.dynamicEntryCounters.clear();
  }

  /**
   * Switch to a specific tab
   */
  private switchToTab(tabName: string): void {
    const tabButton = this.panel?.querySelector(`[data-tab="${tabName}"]`) as HTMLElement;
    tabButton?.click();
  }

  /**
   * Determine which properties should actually be shown as inherited
   */
  private computeActualInheritedProps(nodeProps: any, topology?: any): string[] {
    // Properties that should never be marked as inherited
    const neverInherited = ['kind', 'name', 'group'];

    // If we have the pre-calculated inherited list from the topology loader, use it
    // This list was calculated when the topology was loaded and knows exactly which
    // properties were not explicitly defined in the node's YAML
    if (nodeProps.inherited && Array.isArray(nodeProps.inherited)) {
      // Filter out properties that should never show as inherited
      return nodeProps.inherited.filter((prop: string) => !neverInherited.includes(prop));
    }

    // Fallback: calculate inherited properties if not provided
    // This happens when creating new nodes or in other edge cases
    // Get the topology configuration
    if (!topology) {
      topology = {
        topology: {
          defaults: (window as any).topologyDefaults || {},
          kinds: (window as any).topologyKinds || {},
          groups: (window as any).topologyGroups || {},
        }
      };
    }

    const kindName = nodeProps.kind;
    const groupName = nodeProps.group;
    const inheritBase = resolveNodeConfig(topology, { group: groupName, kind: kindName });

    const shouldPersist = (val: any) => this.shouldPersistValue(val);
    const deepEqual = (a: any, b: any) => this.deepEqualNormalized(a, b);

    const actualInherited: string[] = [];

    Object.keys(nodeProps).forEach(prop => {
      // Skip properties that should never be inherited
      if (neverInherited.includes(prop)) {
        return;
      }

      const val = nodeProps[prop];
      const inheritedVal = (inheritBase as any)[prop];

      const hasValue = shouldPersist(val);
      const hasInheritedValue = shouldPersist(inheritedVal);

      // Only mark as inherited if there's actually an inherited value from the topology config
      // AND the node's value matches it (or the node doesn't have a value)
      if (hasInheritedValue) {
        if (!hasValue || deepEqual(val, inheritedVal)) {
          // Either user didn't set a value, or user set a value that matches the inherited value
          actualInherited.push(prop);
        }
      }
      // Don't mark as inherited if there's no inherited value from topology config
    });

    return actualInherited;
  }

  /**
   * Load node data into the form
   */
  private loadNodeData(node: cytoscape.NodeSingular): void {
    const nodeData = node.data();
    const extraData = nodeData.extraData || {};
    const actualInherited = this.computeActualInheritedProps(extraData);

    this.displayNodeId(node);
    this.loadBasicTab(node, extraData, actualInherited);
    this.loadConfigurationTab(extraData, actualInherited);
    this.loadRuntimeTab(extraData, actualInherited);
    this.loadNetworkTab(extraData, actualInherited);
    this.loadAdvancedTab(extraData, actualInherited);
  }

  private displayNodeId(node: cytoscape.NodeSingular): void {
    const idElement = document.getElementById(ID_PANEL_NODE_EDITOR_ID);
    if (idElement) {
      idElement.textContent = node.id();
    }
  }

  private loadBasicTab(node: cytoscape.NodeSingular, extraData: Record<string, any>, actualInherited: string[]): void {
    const nodeData = node.data();
    this.setInputValue(ID_NODE_NAME, nodeData.name || node.id());
    this.setupKindAndTypeFields(extraData, actualInherited);
    this.setupIconField(nodeData);
    this.setupImageFields(extraData, actualInherited);
    this.setupCustomNodeFields(node);
  }

  private getNodeIconOptions(): string[] {
    const signature = this.computeCustomIconSignature();
    if (!this.cachedNodeIcons.length || this.cachedCustomIconSignature !== signature) {
      this.cachedNodeIcons = extractNodeIcons();
      this.cachedCustomIconSignature = signature;
    }
    return this.cachedNodeIcons;
  }

  private computeCustomIconSignature(): string {
    const customIcons = (window as any)?.customIcons;
    if (!customIcons || typeof customIcons !== 'object') {
      return '';
    }
    return Object.keys(customIcons)
      .sort()
      .map(key => `${key}-${(customIcons[key] as string)?.length ?? 0}`)
      .join('|');
  }

  private setupKindAndTypeFields(extraData: Record<string, any>, actualInherited: string[]): void {
    const desiredKind = extraData.kind || ((window as any).defaultKind || 'nokia_srlinux');
    const kindInitial =
      this.schemaKinds.length > 0 && this.schemaKinds.includes(desiredKind)
        ? desiredKind
        : this.schemaKinds[0] || desiredKind;
    createFilterableDropdown(
      ID_NODE_KIND_DROPDOWN,
      this.schemaKinds,
      kindInitial,
      (selectedKind: string) => this.handleKindChange(selectedKind),
      PH_SEARCH_KIND
    );
    this.markFieldInheritance(ID_NODE_KIND_DROPDOWN, actualInherited.includes('kind'));

    const typeValue = extraData.type || '';
    this.setInputValue(ID_NODE_TYPE, typeValue);
    this.markFieldInheritance(ID_NODE_TYPE, actualInherited.includes('type'));
    this.handleKindChange(kindInitial);
    if (typeValue) {
      const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;
      if (typeInput) {
        typeInput.value = typeValue;
      }
    }
  }

  private setupIconField(nodeData: Record<string, any>): void {
    const nodeIcons = this.getNodeIconOptions();
    let iconInitial = 'pe';
    if (nodeData.topoViewerRole && typeof nodeData.topoViewerRole === 'string') {
      iconInitial = nodeData.topoViewerRole;
    } else if (nodeData.extraData?.icon && typeof nodeData.extraData.icon === 'string') {
      iconInitial = nodeData.extraData.icon;
    }
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      nodeIcons,
      iconInitial,
      () => {},
      'Search for icon...',
      false,
      {
        menuClassName: 'max-h-96',
        dropdownWidth: 320,
        renderOption: createNodeIconOptionElement,
      }
    );
    this.initializeIconColorState(nodeData);
  }

  private initializeIconColorState(nodeData: Record<string, any>): void {
    const fromNode = typeof nodeData.iconColor === 'string' ? nodeData.iconColor : '';
    const fromExtra =
      typeof nodeData.extraData?.iconColor === 'string' ? (nodeData.extraData.iconColor as string) : '';
    const normalized = this.normalizeIconColor(fromNode || fromExtra, null);
    this.setIconColor(normalized);
    const radiusSource = this.resolveNumericIconValue(
      nodeData.iconCornerRadius,
      nodeData.extraData?.iconCornerRadius
    );
    this.setIconCornerRadius(radiusSource);
  }

  private setIconColor(color: string | null): void {
    this.currentIconColor = color;
    const hidden = document.getElementById(ID_NODE_ICON_COLOR) as HTMLInputElement | null;
    if (hidden) {
      hidden.value = color ?? '';
    }
  }

  private setIconCornerRadius(radius: number | null): void {
    if (typeof radius === 'number' && Number.isFinite(radius)) {
      this.currentIconCornerRadius = Math.max(0, Math.min(40, radius));
      return;
    }
    this.currentIconCornerRadius = DEFAULT_ICON_CORNER_RADIUS;
  }

  private resolveNumericIconValue(primary: unknown, fallback: unknown): number | null {
    if (typeof primary === 'number' && Number.isFinite(primary)) {
      return primary;
    }
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
      return fallback;
    }
    return null;
  }

  private normalizeIconColor(color: string | undefined, fallback: string | null = DEFAULT_ICON_COLOR): string | null {
    if (!color) {
      return fallback;
    }
    let candidate = color.trim();
    if (!candidate) {
      return fallback;
    }
    if (!candidate.startsWith('#')) {
      candidate = `#${candidate}`;
    }
    const hexRegex = /^#([0-9a-fA-F]{6})$/;
    if (!hexRegex.test(candidate)) {
      return fallback;
    }
    return `#${candidate.slice(1).toLowerCase()}`;
  }

  private getCurrentIconValue(): string {
    const input = document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null;
    return input?.value?.trim() || 'pe';
  }

  private async handleIconUpload(): Promise<void> {
    if (!this.messageSender) {
      return;
    }
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost('topo-editor-upload-icon', {});
      if (!response || response.cancelled || response.success !== true) {
        return;
      }
      if (response.customIcons && typeof response.customIcons === 'object') {
        (window as any).customIcons = response.customIcons;
        this.cachedNodeIcons = [];
        this.cachedCustomIconSignature = '';
        this.refreshIconDropdownAfterUpload(response.lastAddedIcon);
      }
    } catch (error) {
      log.error(`Failed to upload custom icon: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private refreshIconDropdownAfterUpload(newIconName?: string): void {
    const selectedIcon = newIconName || this.getCurrentIconValue();
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      this.getNodeIconOptions(),
      selectedIcon,
      () => {},
      'Search for icon...',
      false,
      {
        menuClassName: 'max-h-96',
        dropdownWidth: 320,
        renderOption: createNodeIconOptionElement,
      }
    );
    const filterInput = document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null;
    if (filterInput) {
      filterInput.value = selectedIcon;
    }
    const shapeSelect = document.getElementById(ID_ICON_EDITOR_SHAPE) as HTMLSelectElement | null;
    if (shapeSelect) {
      this.populateIconShapeOptions(shapeSelect);
      if (newIconName) {
        shapeSelect.value = newIconName;
      }
    }
    this.updateIconPreviewElement();
  }

  private setupCustomNodeFields(node: cytoscape.NodeSingular): void {
    this.setInputValue(ID_NODE_CUSTOM_NAME, '');
    this.setCheckboxValue(ID_NODE_CUSTOM_DEFAULT, false);
    this.setInputValue(ID_NODE_INTERFACE_PATTERN, '');

    const customNameGroup = document.getElementById(ID_NODE_CUSTOM_NAME_GROUP);
    const nodeNameGroup = document.getElementById(ID_NODE_NAME_GROUP);
    const isTempNode = node.id() === ID_TEMP_CUSTOM_NODE;
    const isEditNode = node.id() === ID_EDIT_CUSTOM_NODE;

    if (customNameGroup) {
      customNameGroup.style.display = isTempNode || isEditNode ? 'block' : 'none';
    }
    if (nodeNameGroup) {
      nodeNameGroup.style.display = isTempNode || isEditNode ? 'none' : 'block';
    }

      const heading = document.getElementById(ID_PANEL_NODE_EDITOR_HEADING);
    if (heading) {
      if (isTempNode) {
        heading.textContent = 'Create Custom Node Template';
      } else if (isEditNode) {
        heading.textContent = 'Edit Custom Node Template';
      } else {
        heading.textContent = 'Node Editor';
      }
    }
  }

  private loadConfigurationTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.setInputValue(ID_NODE_STARTUP_CONFIG, extraData[PROP_STARTUP_CONFIG] || '');
    this.markFieldInheritance(ID_NODE_STARTUP_CONFIG, actualInherited.includes(PROP_STARTUP_CONFIG));
    this.setCheckboxValue(ID_NODE_ENFORCE_STARTUP_CONFIG, extraData[PROP_ENFORCE_STARTUP_CONFIG] || false);
    this.markFieldInheritance(ID_NODE_ENFORCE_STARTUP_CONFIG, actualInherited.includes(PROP_ENFORCE_STARTUP_CONFIG));
    this.setCheckboxValue(ID_NODE_SUPPRESS_STARTUP_CONFIG, extraData[PROP_SUPPRESS_STARTUP_CONFIG] || false);
    this.markFieldInheritance(ID_NODE_SUPPRESS_STARTUP_CONFIG, actualInherited.includes(PROP_SUPPRESS_STARTUP_CONFIG));
    this.setInputValue(ID_NODE_LICENSE, extraData.license || '');
    this.markFieldInheritance(ID_NODE_LICENSE, actualInherited.includes('license'));

    this.populateArrayProperty(extraData, CN_BINDS, CN_BINDS, PH_BIND, ID_NODE_BINDS_CONTAINER, actualInherited);
    this.populateKeyValueProperty(extraData, CN_ENV, CN_ENV, ID_NODE_ENV_CONTAINER, actualInherited);
    this.populateArrayProperty(extraData, CN_ENV_FILES, CN_ENV_FILES, PH_ENV_FILE, ID_NODE_ENV_FILES_CONTAINER, actualInherited);
    this.populateKeyValueProperty(extraData, CN_LABELS, CN_LABELS, ID_NODE_LABELS_CONTAINER, actualInherited);
  }

  private populateArrayProperty(
    source: Record<string, any>,
    propName: string,
    containerName: string,
    placeholder: string,
    containerId: string,
    actualInherited: string[],
  ): void {
    const values = source[propName];
    if (Array.isArray(values)) {
      values.forEach((value: string) => this.addDynamicEntryWithValue(containerName, value, placeholder));
    }
    this.markFieldInheritance(containerId, actualInherited.includes(propName));
  }

  private populateKeyValueProperty(
    source: Record<string, any>,
    propName: string,
    containerName: string,
    containerId: string,
    actualInherited: string[],
  ): void {
    const mapEntries = source[propName];
    if (mapEntries && typeof mapEntries === 'object' && !Array.isArray(mapEntries)) {
      Object.entries(mapEntries).forEach(([key, value]) =>
        this.addDynamicKeyValueEntryWithValue(containerName, key, value as string),
      );
    }
    this.markFieldInheritance(containerId, actualInherited.includes(propName));
  }

  private loadRuntimeTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.setInputValue(ID_NODE_USER, extraData.user || '');
    this.markFieldInheritance(ID_NODE_USER, actualInherited.includes('user'));
    this.setInputValue(ID_NODE_ENTRYPOINT, extraData.entrypoint || '');
    this.markFieldInheritance(ID_NODE_ENTRYPOINT, actualInherited.includes('entrypoint'));
    this.setInputValue(ID_NODE_CMD, extraData.cmd || '');
    this.markFieldInheritance(ID_NODE_CMD, actualInherited.includes('cmd'));
    const rpOptions = [...OPTIONS_RP];
    const rpInitial = extraData[PROP_RESTART_POLICY] || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_RP_DROPDOWN, rpOptions, rpInitial, () => {}, PH_SEARCH_RP);
    this.markFieldInheritance(ID_NODE_RP_DROPDOWN, actualInherited.includes(PROP_RESTART_POLICY));
    this.setCheckboxValue(ID_NODE_AUTO_REMOVE, extraData[PROP_AUTO_REMOVE] || false);
    this.markFieldInheritance(ID_NODE_AUTO_REMOVE, actualInherited.includes(PROP_AUTO_REMOVE));
    this.setInputValue(ID_NODE_STARTUP_DELAY, extraData[PROP_STARTUP_DELAY] || '');
    this.markFieldInheritance(ID_NODE_STARTUP_DELAY, actualInherited.includes(PROP_STARTUP_DELAY));

    if (extraData.exec && Array.isArray(extraData.exec)) {
      extraData.exec.forEach((cmd: string) => this.addDynamicEntryWithValue(CN_EXEC, cmd, PH_EXEC));
    }
    this.markFieldInheritance(ID_NODE_EXEC_CONTAINER, actualInherited.includes('exec'));
  }

  private loadNetworkTab(extraData: Record<string, any>, actualInherited: string[]): void {
    this.setInputValue(ID_NODE_MGMT_IPV4, extraData[PROP_MGMT_IPV4] || '');
    this.markFieldInheritance(ID_NODE_MGMT_IPV4, actualInherited.includes(PROP_MGMT_IPV4));
    this.setInputValue(ID_NODE_MGMT_IPV6, extraData[PROP_MGMT_IPV6] || '');
    this.markFieldInheritance(ID_NODE_MGMT_IPV6, actualInherited.includes(PROP_MGMT_IPV6));
    const nmOptions = [...OPTIONS_NM];
    const nmInitial = extraData[PROP_NETWORK_MODE] || LABEL_DEFAULT;
    createFilterableDropdown(ID_NODE_NM_DROPDOWN, nmOptions, nmInitial, () => {}, PH_SEARCH_NM);
    this.markFieldInheritance(ID_NODE_NM_DROPDOWN, actualInherited.includes(PROP_NETWORK_MODE));

    if (extraData.ports && Array.isArray(extraData.ports)) {
      extraData.ports.forEach((port: string) => this.addDynamicEntryWithValue(CN_PORTS, port, PH_PORT));
    }
    this.markFieldInheritance(ID_NODE_PORTS_CONTAINER, actualInherited.includes(PROP_PORTS));

    if (extraData.dns && extraData.dns.servers && Array.isArray(extraData.dns.servers)) {
      extraData.dns.servers.forEach((server: string) => this.addDynamicEntryWithValue(CN_DNS_SERVERS, server, PH_DNS_SERVER));
    }
    this.markFieldInheritance(ID_NODE_DNS_SERVERS_CONTAINER, actualInherited.includes(PROP_DNS));

    if (extraData.aliases && Array.isArray(extraData.aliases)) {
      extraData.aliases.forEach((alias: string) => this.addDynamicEntryWithValue(CN_ALIASES, alias, PH_ALIAS));
    }
    this.markFieldInheritance(ID_NODE_ALIASES_CONTAINER, actualInherited.includes(PROP_ALIASES));
  }

  private loadAdvancedTab(extraData: Record<string, any>, actualInherited: string[]): void {
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
    this.setInputValue(ID_NODE_MEMORY, extraData.memory || '');
    this.markFieldInheritance(ID_NODE_MEMORY, actualInherited.includes(PROP_MEMORY));
    this.setInputValue(ID_NODE_CPU, extraData.cpu || '');
    this.markFieldInheritance(ID_NODE_CPU, actualInherited.includes(PROP_CPU));
    this.setInputValue(ID_NODE_CPU_SET, extraData[PROP_CPU_SET] || '');
    this.markFieldInheritance(ID_NODE_CPU_SET, actualInherited.includes(PROP_CPU_SET));
    this.setInputValue(ID_NODE_SHM_SIZE, extraData[PROP_SHM_SIZE] || '');
    this.markFieldInheritance(ID_NODE_SHM_SIZE, actualInherited.includes(PROP_SHM_SIZE));
  }

  private loadCapAdd(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData[PROP_CAP_ADD] && Array.isArray(extraData[PROP_CAP_ADD])) {
      extraData[PROP_CAP_ADD].forEach((cap: string) => this.addDynamicEntryWithValue(CN_CAP_ADD, cap, PH_CAP));
    }
    this.markFieldInheritance(ID_NODE_CAP_ADD_CONTAINER, actualInherited.includes(PROP_CAP_ADD));
  }

  private loadSysctls(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.sysctls && typeof extraData.sysctls === 'object') {
      Object.entries(extraData.sysctls).forEach(([key, value]) =>
        this.addDynamicKeyValueEntryWithValue(CN_SYSCTLS, key, String(value))
      );
    }
    this.markFieldInheritance(ID_NODE_SYSCTLS_CONTAINER, actualInherited.includes(PROP_SYSCTLS));
  }

  private loadDevices(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.devices && Array.isArray(extraData.devices)) {
      extraData.devices.forEach((device: string) => this.addDynamicEntryWithValue(CN_DEVICES, device, PH_DEVICE));
    }
    this.markFieldInheritance(ID_NODE_DEVICES_CONTAINER, actualInherited.includes(PROP_DEVICES));
  }

  private loadCertificateSection(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.certificate) {
      this.setCheckboxValue(ID_NODE_CERT_ISSUE, extraData.certificate.issue || false);
      this.markFieldInheritance(ID_NODE_CERT_ISSUE, actualInherited.includes(PROP_CERTIFICATE));
      const keySizeOptions = ['2048', '4096'];
      const keySizeInitial = String(extraData.certificate['key-size'] || '2048');
      createFilterableDropdown(
        ID_NODE_CERT_KEYSIZE_DROPDOWN,
        keySizeOptions,
        keySizeInitial,
        () => {},
        PH_SEARCH_KEY_SIZE
      );
      this.setInputValue(ID_NODE_CERT_VALIDITY, extraData.certificate['validity-duration'] || '');
      if (extraData.certificate.sans && Array.isArray(extraData.certificate.sans)) {
        extraData.certificate.sans.forEach((san: string) => this.addDynamicEntryWithValue(CN_SANS, san, PH_SAN));
      }
    }
  }

  private loadHealthcheckSection(extraData: Record<string, any>, actualInherited: string[]): void {
    if (extraData.healthcheck) {
      const hc = extraData.healthcheck;
      this.setInputValue(ID_HC_TEST, hc.test ? hc.test.join(' ') : '');
      this.setInputValue(ID_HC_START, hc['start-period'] || '');
      this.setInputValue(ID_HC_INTERVAL, hc.interval || '');
      this.setInputValue(ID_HC_TIMEOUT, hc.timeout || '');
      this.setInputValue(ID_HC_RETRIES, hc.retries || '');
    }
    this.markFieldInheritance(ID_HC_TEST, actualInherited.includes(PROP_HEALTHCHECK));
  }

  private loadImagePullPolicy(extraData: Record<string, any>, actualInherited: string[]): void {
    const ippOptions = [...OPTIONS_IPP];
    const ippInitial = extraData['image-pull-policy'] || LABEL_DEFAULT;
    createFilterableDropdown(
      ID_NODE_IPP_DROPDOWN,
      ippOptions,
      ippInitial,
      () => {},
      PH_SEARCH_IPP
    );
    this.markFieldInheritance(ID_NODE_IPP_DROPDOWN, actualInherited.includes(PROP_IMAGE_PULL_POLICY));
  }

  private loadRuntimeOption(extraData: Record<string, any>, actualInherited: string[]): void {
    const runtimeOptions = [...OPTIONS_RUNTIME];
    const runtimeInitial = extraData.runtime || LABEL_DEFAULT;
    createFilterableDropdown(
      ID_NODE_RUNTIME_DROPDOWN,
      runtimeOptions,
      runtimeInitial,
      () => {},
      PH_SEARCH_RUNTIME
    );
    this.markFieldInheritance(ID_NODE_RUNTIME_DROPDOWN, actualInherited.includes(PROP_RUNTIME));
  }

  private setupImageFields(extraData: Record<string, any>, actualInherited: string[]): void {
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const imageInitial = extraData.image || '';
    this.markFieldInheritance(ID_NODE_IMAGE_DROPDOWN, actualInherited.includes('image'));

    if (this.shouldUseImageDropdowns(dockerImages)) {
      this.setupImageDropdowns(dockerImages!, imageInitial);
    } else {
      this.setupFallbackImageInputs(imageInitial);
    }
  }

  private shouldUseImageDropdowns(dockerImages: string[] | undefined): boolean {
    return Array.isArray(dockerImages) && dockerImages.some(img => img && img.trim() !== '');
  }

  private setupImageDropdowns(dockerImages: string[], imageInitial: string): void {
    this.parseDockerImages(dockerImages);
    const baseImages = Array.from(this.imageVersionMap.keys()).sort((a, b) => {
      const aIsNokia = a.includes('nokia');
      const bIsNokia = b.includes('nokia');
      if (aIsNokia && !bIsNokia) return -1;
      if (!aIsNokia && bIsNokia) return 1;
      return a.localeCompare(b);
    });

    const { base: initialBaseImage, version: initialVersion } = this.splitImageName(imageInitial, baseImages);

    createFilterableDropdown(
      ID_NODE_IMAGE_DROPDOWN,
      baseImages,
      initialBaseImage,
      (selectedBaseImage: string) => this.handleBaseImageChange(selectedBaseImage),
      PH_SEARCH_IMAGE,
      true
    );

    const versions = this.imageVersionMap.get(initialBaseImage) || ['latest'];
    const versionToSelect = initialVersion || versions[0] || 'latest';
    createFilterableDropdown(
      ID_NODE_VERSION_DROPDOWN,
      versions,
      versionToSelect,
      () => {},
      PH_SELECT_VERSION,
      true
    );
  }

  private splitImageName(imageInitial: string, baseImages: string[]): { base: string; version: string } {
    let base = '';
    let version = 'latest';
    if (imageInitial) {
      const lastColonIndex = imageInitial.lastIndexOf(':');
      if (lastColonIndex > 0) {
        base = imageInitial.substring(0, lastColonIndex);
        version = imageInitial.substring(lastColonIndex + 1);
      } else {
        base = imageInitial;
      }
      // If the image isn't in our known list, keep the user-provided base and
      // version so the dropdown shows the custom image
      if (!this.imageVersionMap.has(base)) {
        return { base, version };
      }
    } else if (baseImages.length > 0) {
      base = baseImages[0];
    }
    return { base, version };
  }

  private setupFallbackImageInputs(imageInitial: string): void {
    const container = document.getElementById(ID_NODE_IMAGE_DROPDOWN);
    if (container) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = `${CLASS_INPUT_FIELD} w-full`;
      input.placeholder = PH_IMAGE_EXAMPLE;
      input.id = ID_NODE_IMAGE_FALLBACK_INPUT;
      input.value = imageInitial.includes(':') ? imageInitial.substring(0, imageInitial.lastIndexOf(':')) : imageInitial;
      container.appendChild(input);
    }

    const versionContainer = document.getElementById(ID_NODE_VERSION_DROPDOWN);
    if (versionContainer) {
      const versionInput = document.createElement('input');
      versionInput.type = 'text';
      versionInput.className = `${CLASS_INPUT_FIELD} w-full`;
      versionInput.placeholder = PH_VERSION_EXAMPLE;
      versionInput.id = ID_NODE_VERSION_FALLBACK_INPUT;
      const colon = imageInitial.lastIndexOf(':');
      versionInput.value = colon > 0 ? imageInitial.substring(colon + 1) : 'latest';
      versionContainer.appendChild(versionInput);
    }
  }

  /**
   * Add a dynamic entry with a pre-filled value
   */
  private addDynamicEntryWithValue(containerName: string, value: string, placeholder: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = CLASS_INPUT_FIELD;
    input.placeholder = placeholder;
    input.value = value;
    input.setAttribute(DATA_ATTR_FIELD, containerName);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(input);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a dynamic key-value entry with pre-filled values
   */
  private addDynamicKeyValueEntryWithValue(containerName: string, key: string, value: string): void {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return;

    const count = (this.dynamicEntryCounters.get(containerName) || 0) + 1;
    this.dynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(DATA_ATTR_FIELD, `${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = CLASS_DYNAMIC_DELETE_BTN;
    button.setAttribute(DATA_ATTR_CONTAINER, containerName);
    button.setAttribute(DATA_ATTR_ENTRY_ID, count.toString());
    button.innerHTML = HTML_TRASH_ICON;

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Set input field value
   */
  private setInputValue(id: string, value: string | number): void {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (element) {
      element.value = String(value);
    }
  }

  /**
   * Set checkbox value
   */
  private setCheckboxValue(id: string, value: boolean): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (element) {
      element.checked = value;
    }
  }

  /**
   * Get input field value
   */
  private getInputValue(id: string): string {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    return element?.value || '';
  }

  /**
   * Get checkbox value
   */
  private getCheckboxValue(id: string): boolean {
    const element = document.getElementById(id) as HTMLInputElement;
    return element?.checked || false;
  }

  /**
   * Get type field value from dropdown or input
   */
  private getTypeFieldValue(): string {
    return this.getInputValue(ID_NODE_TYPE);
  }

  private hasTypeFieldValue(): boolean {
    return this.getTypeFieldValue().trim().length > 0;
  }

  private getExistingNodeTypeValue(): string | undefined {
    const currentType = this.currentNode?.data('extraData')?.type;
    if (typeof currentType === 'string') {
      const trimmed = currentType.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  /**
   * Mark a form field as inherited or remove the indication
   */
  private markFieldInheritance(fieldId: string, inherited: boolean): void {
    const el = document.getElementById(fieldId) as HTMLElement | null;
    const formGroup = el?.closest(SELECTOR_FORM_GROUP) as HTMLElement | null;
    if (!formGroup) return;
    let badge = formGroup.querySelector('.inherited-badge') as HTMLElement | null;
    if (inherited) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'inherited-badge ml-2 px-1 py-0.5 text-xs bg-gray-200 text-gray-700 rounded';
        badge.textContent = 'inherited';
        const label = formGroup.querySelector('label');
        label?.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  /**
   * Update all inherited badges in the UI based on the current inherited properties
   */
  private updateInheritedBadges(inheritedProps: string[]): void {
    // Properties that should never show inherited badge
    const neverInherited = ['kind', 'name', 'group'];

    // Use shared mappings
    FIELD_MAPPINGS_BASE.forEach(({ id, prop }) => {
      // Never show inherited badge for certain properties
      const isInherited = !neverInherited.includes(prop) && inheritedProps.includes(prop);
      this.markFieldInheritance(id, isInherited);
    });
  }

  /**
   * Remove inherited flag for a property when the field is edited
   */
  private clearInherited(prop: string, fieldId: string): void {
    const data = this.currentNode?.data();
    if (!data?.extraData?.inherited) return;
    const arr = data.extraData.inherited as string[];
    const idx = arr.indexOf(prop);
    if (idx !== -1) {
      arr.splice(idx, 1);
      this.currentNode?.data('extraData', data.extraData);
      this.markFieldInheritance(fieldId, false);
    }
  }

  /**
   * Set up listeners to update inheritance indicators when fields change
   */
  private setupInheritanceChangeListeners(): void {
    const extraMappings: FieldMapping[] = [
      { id: ID_NODE_CERT_KEYSIZE_DROPDOWN, prop: 'certificate', badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_NODE_CERT_VALIDITY, prop: 'certificate', badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_NODE_SANS_CONTAINER, prop: 'certificate', badgeId: ID_NODE_CERT_ISSUE },
      { id: ID_HC_START, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_INTERVAL, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_TIMEOUT, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
      { id: ID_HC_RETRIES, prop: PROP_HEALTHCHECK, badgeId: ID_HC_TEST },
    ];
    const mappings: FieldMapping[] = [...FIELD_MAPPINGS_BASE, ...extraMappings];

    mappings.forEach(({ id, prop, badgeId }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.clearInherited(prop, badgeId || id));
      el.addEventListener('change', () => this.clearInherited(prop, badgeId || id));
    });
  }

  /**
   * Collect values from dynamic entries
   */
  private collectDynamicEntries(containerName: string): string[] {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return [];

    const inputs = container.querySelectorAll(`input[data-field="${containerName}"]`);
    const values: string[] = [];

    inputs.forEach((input: Element) => {
      const value = (input as HTMLInputElement).value.trim();
      if (value) {
        values.push(value);
      }
    });

    return values;
  }

  /**
   * Collect key-value pairs from dynamic entries
   */
  private collectDynamicKeyValueEntries(containerName: string): Record<string, string> {
    const container = document.getElementById(`node-${containerName}-container`);
    if (!container) return {};

    const entries = container.querySelectorAll(`.${CLASS_DYNAMIC_ENTRY}`);
    const result: Record<string, string> = {};

    entries.forEach((entry: Element) => {
      const keyInput = entry.querySelector(`input[data-field="${containerName}-key"]`) as HTMLInputElement;
      const valueInput = entry.querySelector(`input[data-field="${containerName}-value"]`) as HTMLInputElement;

      if (keyInput && valueInput) {
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (key) {
          result[key] = value;
        }
      }
    });

    return result;
  }

  /**
   * Validate IPv4 address format
   */
  private validateIPv4(ip: string): boolean {
    if (!ip) return true; // Empty is valid
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (const p of parts) {
      if (p.length === 0 || p.length > 3) return false;
      if (!/^\d+$/.test(p)) return false;
      const n = parseInt(p, 10);
      if (n < 0 || n > 255) return false;
      // Disallow leading zeros like 01 unless the value is exactly '0'
      if (p.length > 1 && p.startsWith('0')) return false;
    }
    return true;
  }

  /**
   * Validate IPv6 address format
   */
  private validateIPv6(ip: string): boolean {
    if (!ip) return true; // Empty is valid
    // Handle IPv4-mapped addresses
    const lastColon = ip.lastIndexOf(':');
    if (lastColon !== -1 && ip.indexOf('.') > lastColon) {
      const v6 = ip.slice(0, lastColon);
      const v4 = ip.slice(lastColon + 1);
      return this.validateIPv6(v6 + '::') && this.validateIPv4(v4);
    }

    const hasDoubleColon = ip.includes('::');
    if (hasDoubleColon && ip.indexOf('::') !== ip.lastIndexOf('::')) return false;

    const parts = ip.split(':').filter(s => s.length > 0);
    if (!hasDoubleColon && parts.length !== 8) return false;
    if (hasDoubleColon && parts.length > 7) return false;

    const hexRe = /^[0-9a-fA-F]{1,4}$/;
    for (const part of parts) {
      if (!hexRe.test(part)) return false;
    }
    return true;
  }

  /**
   * Validate port mapping format (host:container or host:container/protocol)
   */
  private validatePortMapping(port: string): boolean {
    if (!port) return true; // Empty is valid
    const portRegex = /^(\d+):(\d+)(\/(?:tcp|udp))?$/;
    const match = portRegex.exec(port);
    if (!match) return false;

    const hostPort = parseInt(match[1]);
    const containerPort = parseInt(match[2]);

    return hostPort > 0 && hostPort <= 65535 && containerPort > 0 && containerPort <= 65535;
  }

  /**
   * Validate memory format (e.g., 1Gb, 512Mb, 1024Kib)
   */
  private validateMemory(memory: string): boolean {
    if (!memory) return true; // Empty is valid
    const memoryRegex = /^\d+(\.\d+)?\s*(b|kib|kb|mib|mb|gib|gb)$/i;
    return memoryRegex.test(memory);
  }

  /**
   * Validate CPU set format (e.g., 0-3, 0,3, 0-1,4-5)
   */
  private validateCpuSet(cpuSet: string): boolean {
    if (!cpuSet) return true; // Empty is valid
    const cpuSetRegex = /^(\d+(-\d+)?)(,\d+(-\d+)?)*$/;
    return cpuSetRegex.test(cpuSet);
  }

  /**
   * Validate bind mount format (host:container or host:container:mode)
   */
  private validateBindMount(bind: string): boolean {
    if (!bind) return true; // Empty is valid
    // Basic validation - check for at least host:container format
    const parts = bind.split(':');
    return parts.length >= 2 && parts[0].length > 0 && parts[1].length > 0;
  }

  /**
   * Show validation error
   */
  private showValidationError(field: string, message: string): void {
    // Find the input element and add error styling
    const element = document.getElementById(field);
    if (element) {
      element.classList.add('border-red-500');

      // Create or update error message
      let errorElement = document.getElementById(`${field}-error`);
      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = `${field}-error`;
        errorElement.className = 'text-red-500 text-xs mt-1';
        element.parentElement?.appendChild(errorElement);
      }
      errorElement.textContent = message;
    }

    log.warn(`Validation error for ${field}: ${message}`);
  }


  /**
   * Clear all validation errors
   */
  private clearAllValidationErrors(): void {
    // Clear all error styling and messages
    this.panel?.querySelectorAll('.border-red-500').forEach(element => {
      element.classList.remove('border-red-500');
    });
    this.panel?.querySelectorAll('[id$="-error"]').forEach(element => {
      element.remove();
    });
  }

  /**
   * Validate all form inputs
   */
  private validateForm(): boolean {
    this.clearAllValidationErrors();
    const validators = [
      () => this.validateMgmtIpv4(),
      () => this.validateMgmtIpv6(),
      () => this.validateMemoryField(),
      () => this.validateCpuField(),
      () => this.validateCpuSetField(),
      () => this.validatePortsField(),
      () => this.validateBindsField(),
      () => this.validateNodeNameField()
    ];
    return validators.every(validate => validate());
  }

  private validateMgmtIpv4(): boolean {
    const value = this.getInputValue(ID_NODE_MGMT_IPV4);
    if (value && !this.validateIPv4(value)) {
      this.showValidationError(ID_NODE_MGMT_IPV4, 'Invalid IPv4 address format');
      return false;
    }
    return true;
  }

  private validateMgmtIpv6(): boolean {
    const value = this.getInputValue(ID_NODE_MGMT_IPV6);
    if (value && !this.validateIPv6(value)) {
      this.showValidationError(ID_NODE_MGMT_IPV6, 'Invalid IPv6 address format');
      return false;
    }
    return true;
  }

  private validateMemoryField(): boolean {
    const value = this.getInputValue(ID_NODE_MEMORY);
    if (value && !this.validateMemory(value)) {
      this.showValidationError(ID_NODE_MEMORY, 'Invalid memory format (e.g., 1Gb, 512Mb)');
      return false;
    }
    return true;
  }

  private validateCpuField(): boolean {
    const value = this.getInputValue(ID_NODE_CPU);
    if (!value) return true;
    const cpuValue = parseFloat(value);
    if (isNaN(cpuValue) || cpuValue <= 0) {
      this.showValidationError(ID_NODE_CPU, 'CPU must be a positive number');
      return false;
    }
    return true;
  }

  private validateCpuSetField(): boolean {
    const value = this.getInputValue(ID_NODE_CPU_SET);
    if (value && !this.validateCpuSet(value)) {
      this.showValidationError(ID_NODE_CPU_SET, 'Invalid CPU set format (e.g., 0-3, 0,3)');
      return false;
    }
    return true;
  }

  private validatePortsField(): boolean {
    const ports = this.collectDynamicEntries(CN_PORTS);
    for (const port of ports) {
      if (!this.validatePortMapping(port)) {
        this.showValidationError(ID_NODE_PORTS_CONTAINER, 'Invalid port format (e.g., 8080:80 or 8080:80/tcp)');
        return false;
      }
    }
    return true;
  }

  private validateBindsField(): boolean {
    const binds = this.collectDynamicEntries(CN_BINDS);
    for (const bind of binds) {
      if (!this.validateBindMount(bind)) {
        this.showValidationError(ID_NODE_BINDS_CONTAINER, 'Invalid bind mount format (e.g., /host/path:/container/path)');
        return false;
      }
    }
    return true;
  }

  private validateNodeNameField(): boolean {
    const nodeName = this.getInputValue(ID_NODE_NAME);
    if (!nodeName || nodeName.trim() === '') {
      this.showValidationError(ID_NODE_NAME, 'Node name is required');
      return false;
    }
    return true;
  }

  private buildCustomNodePayload(params: {
    name: string;
    nodeProps: NodeProperties;
    setDefault: boolean;
    iconValue: string;
    baseName: string;
    interfacePattern: string;
    iconColor: string | null;
    oldName?: string;
  }): any {
    const { name, nodeProps, setDefault, iconValue, baseName, interfacePattern, iconColor, oldName } = params;
    const payload: any = {
      name,
      kind: nodeProps.kind || '',
      type: nodeProps.type,
      image: nodeProps.image,
      icon: iconValue,
      baseName,
      setDefault,
      ...(oldName && { oldName })
    };
    if (this.currentIconCornerRadius > 0) {
      payload.iconCornerRadius = this.currentIconCornerRadius;
    }
    if (iconColor) {
      payload.iconColor = iconColor;
    }
    if (interfacePattern) {
      payload.interfacePattern = interfacePattern;
    }
    Object.keys(nodeProps).forEach(key => {
      if (!['name', 'kind', 'type', 'image'].includes(key)) {
        payload[key] = nodeProps[key as keyof NodeProperties];
      }
    });
    return payload;
  }

  private async saveCustomNodeTemplate(name: string, nodeProps: NodeProperties, setDefault: boolean, oldName?: string): Promise<void> {
    try {
      // Get the icon/role value
      const iconValue = (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)?.value || 'pe';

      // Get the base name value
      const baseName = this.getInputValue('node-base-name') || '';
      const interfacePattern = this.getInputValue(ID_NODE_INTERFACE_PATTERN).trim();

      const iconColor = this.currentIconColor;

      const payload = this.buildCustomNodePayload({
        name,
        nodeProps,
        setDefault,
        iconValue,
        baseName,
        interfacePattern,
        iconColor,
        oldName
      });

      const resp = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-custom-node',
        payload
      );
      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }
    } catch (err) {
      log.error(
        `Failed to save custom node template: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Save the node data
   */
  private async save(): Promise<void> {
    if (!this.currentNode) return;

    if (!this.validateForm()) {
      log.warn('Form validation failed, cannot save');
      return;
    }

    try {
      // Remember which component slots are currently expanded
      const expanded = this.collectExpandedComponentSlots();
      // Ensure all filterable dropdowns (esp. components) commit their values
      this.commitComponentDropdowns();
      const nodeProps = this.collectNodeProperties();
      const handled = await this.handleCustomNode(nodeProps);
      if (handled || this.isCustomTemplateNode()) {
        return;
      }
      await this.updateNode(nodeProps, expanded);
    } catch (error) {
      log.error(`Failed to save node properties: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Commit visible dropdown input values into their hidden fields for components/MDAs.
   * Without this, typing into the dropdown and clicking Save may not update hidden inputs.
   */
  private commitComponentDropdowns(): void {
    if (this.integratedMode) {
      this.commitIntegratedMdaDropdowns();
      return;
    }
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    if (!container) return;
    const entries = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)) as HTMLElement[];
    for (const entry of entries) {
      const idx = this.extractIndex(entry.id, /component-entry-(\d+)/);
      if (idx === null) continue;
      this.commitComponentBaseDropdowns(idx);
      this.commitXiomDropdowns(idx);
      this.commitMdaDropdowns(idx);
    }
    this.commitSfmDropdown();
  }

  private commitComponentBaseDropdowns(idx: number): void {
    const typeFilter = document.getElementById(`component-${idx}-type-dropdown-filter-input`) as HTMLInputElement | null;
    const typeHidden = document.getElementById(`component-${idx}-type`) as HTMLInputElement | null;
    if (typeFilter && typeHidden) typeHidden.value = typeFilter.value;
  }

  private commitXiomDropdowns(idx: number): void {
    const xiomContainer = document.getElementById(`component-${idx}-xiom-container`);
    if (!xiomContainer) return;
    const xiomRows = Array.from(xiomContainer.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
    for (const row of xiomRows) {
      const xiomId = this.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (xiomId === null) continue;
      const xiomTypeFilter = document.getElementById(`component-${idx}-xiom-${xiomId}-type-dropdown-filter-input`) as HTMLInputElement | null;
      const xiomTypeHidden = document.getElementById(`component-${idx}-xiom-${xiomId}-type`) as HTMLInputElement | null;
      if (xiomTypeFilter && xiomTypeHidden) xiomTypeHidden.value = xiomTypeFilter.value;
      this.commitXiomMdaDropdowns(idx, xiomId, row);
    }
  }

  private commitXiomMdaDropdowns(idx: number, xiomId: number, xiomRow: HTMLElement): void {
    const xmdaRows = Array.from(xiomRow.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)) as HTMLElement[];
    for (const xmda of xmdaRows) {
      const mdaId = this.extractIndex(xmda.id, /component-\d+-xiom-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const mdaFilter = document.getElementById(`component-${idx}-xiom-${xiomId}-mda-${mdaId}-type-dropdown-filter-input`) as HTMLInputElement | null;
      const mdaHidden = document.getElementById(`component-${idx}-xiom-${xiomId}-mda-${mdaId}-type`) as HTMLInputElement | null;
      if (mdaFilter && mdaHidden) mdaHidden.value = mdaFilter.value;
    }
  }

  private commitMdaDropdowns(idx: number): void {
    const mdaContainer = document.getElementById(`component-${idx}-mda-container`);
    if (!mdaContainer) return;
    const rows = Array.from(mdaContainer.querySelectorAll(`.${CLASS_COMPONENT_MDA_ENTRY}`)) as HTMLElement[];
    for (const row of rows) {
      const mdaId = this.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const mdaFilter = document.getElementById(`component-${idx}-mda-${mdaId}-type-dropdown-filter-input`) as HTMLInputElement | null;
      const mdaHidden = document.getElementById(`component-${idx}-mda-${mdaId}-type`) as HTMLInputElement | null;
      if (mdaFilter && mdaHidden) mdaHidden.value = mdaFilter.value;
    }
  }

  private collectNodeProperties(): NodeProperties {
    const nodeProps: NodeProperties = {
      name: this.getInputValue(ID_NODE_NAME),
      kind: (document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null)?.value || undefined,
    };
    this.applyTypeFieldValue(nodeProps);

    const interfacePatternValue = this.getInputValue(ID_NODE_INTERFACE_PATTERN).trim();
    if (interfacePatternValue) {
      nodeProps.interfacePattern = interfacePatternValue;
    }

    this.collectImage(nodeProps);
    this.collectConfigurationProps(nodeProps);
    this.collectRuntimeProps(nodeProps);
    this.collectNetworkProps(nodeProps);
    this.collectAdvancedProps(nodeProps);
    this.collectCertificateProps(nodeProps);
    this.collectHealthcheckProps(nodeProps);
    this.collectComponentsProps(nodeProps);

    return nodeProps;
  }

  private applyTypeFieldValue(nodeProps: NodeProperties): void {
    const rawTypeValue = this.getTypeFieldValue();
    const trimmedTypeValue = rawTypeValue.trim();
    if (trimmedTypeValue.length > 0) {
      nodeProps.type = trimmedTypeValue;
      return;
    }
    const existingType = this.getExistingNodeTypeValue();
    if (existingType) {
      nodeProps.type = '';
    }
  }

  private collectComponentsProps(nodeProps: NodeProperties): void {
    const kind = nodeProps.kind || (this.currentNode?.data('extraData')?.kind as string | undefined);
    if (!kind || !this.componentKinds.has(kind)) return;
    if (this.integratedMode) {
      this.commitIntegratedMdaDropdowns();
      const mdas = this.collectIntegratedMdas();
      nodeProps.components = mdas.length > 0 ? [{ mda: mdas }] : [];
      return;
    }
    const container = document.getElementById(ID_NODE_COMPONENTS_CONTAINER);
    if (!container) return;
    const entries = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_ENTRY}`)) as HTMLElement[];
    const components = entries
      .map((entry) => this.buildComponentFromEntry(entry))
      .filter((c): c is any => !!c);
    const sfmVal = this.getSfmValue();
    this.applySfmToComponents(components, sfmVal);
    if (components.length > 0) nodeProps.components = components;
  }

  private buildComponentFromEntry(entryEl: HTMLElement): any | null {
    const idx = this.extractIndex(entryEl.id, /component-entry-(\d+)/);
    if (idx === null) return null;

    const comp: any = {};
    const slotRaw = this.getInputValue(`component-${idx}-slot`).trim();
    const slotParsed = this.parseComponentSlot(slotRaw);
    if (slotParsed && slotParsed.value !== undefined) comp.slot = slotParsed.value;

    const typeVal = this.getInputValue(`component-${idx}-type`).trim();
    if (typeVal) comp.type = typeVal;

    // Collect XIOMs (array)
    const xioms = this.collectXioms(idx);
    if (xioms.length > 0) comp.xiom = xioms;

    const mdaList = this.collectMdas(idx);
    if (mdaList.length > 0) comp.mda = mdaList;

    return Object.keys(comp).length > 0 ? comp : null;
  }

  private parseComponentSlot(value: string): { value?: string | number } | null {
    if (!value) return null;
    if (/^[aAbB]$/.test(value)) return { value: value.toUpperCase() };
    if (/^\d+$/.test(value)) return { value: parseInt(value, 10) };
    return null;
  }

  private collectMdas(componentIdx: number): any[] {
    const container = document.getElementById(`component-${componentIdx}-mda-container`);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll('.component-mda-entry')) as HTMLElement[];
    const list: any[] = [];
    for (const row of rows) {
      const mdaId = this.extractIndex(row.id, /component-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const slotRaw = this.getInputValue(`component-${componentIdx}-mda-${mdaId}-slot`).trim();
      const typeVal = this.getInputValue(`component-${componentIdx}-mda-${mdaId}-type`).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  private collectXioms(componentIdx: number): any[] {
    const compSlot = this.getInputValue(`component-${componentIdx}-slot`).trim();
    if (this.isCpmSlot(compSlot)) return [];
    const container = document.getElementById(`component-${componentIdx}-xiom-container`);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_ENTRY}`)) as HTMLElement[];
    const list: any[] = [];
    for (const row of rows) {
      const xiomId = this.extractIndex(row.id, /component-\d+-xiom-entry-(\d+)/);
      if (xiomId === null) continue;
      const slotRaw = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-slot`).trim();
      const typeVal = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-type`).trim();
      const xiom: any = {};
      if (/^\d+$/.test(slotRaw)) xiom.slot = parseInt(slotRaw, 10);
      if (typeVal) xiom.type = typeVal;
      const xmda = this.collectXiomMdas(componentIdx, xiomId);
      if (xmda.length > 0) xiom.mda = xmda;
      if (xiom.slot != null && xiom.type) list.push(xiom);
    }
    return list;
  }

  private collectXiomMdas(componentIdx: number, xiomId: number): any[] {
    const container = document.getElementById(`component-${componentIdx}-xiom-${xiomId}-mda-container`);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll(`.${CLASS_COMPONENT_XIOM_MDA_ENTRY}`)) as HTMLElement[];
    const list: any[] = [];
    for (const row of rows) {
      const mdaId = this.extractIndex(row.id, /component-\d+-xiom-\d+-mda-entry-(\d+)/);
      if (mdaId === null) continue;
      const slotRaw = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-slot`).trim();
      const typeVal = this.getInputValue(`component-${componentIdx}-xiom-${xiomId}-mda-${mdaId}-type`).trim();
      const mda: any = {};
      if (/^\d+$/.test(slotRaw)) mda.slot = parseInt(slotRaw, 10);
      if (typeVal) mda.type = typeVal;
      if (mda.slot != null && mda.type) list.push(mda);
    }
    return list;
  }

  private extractIndex(id: string, re: RegExp): number | null {
    const m = re.exec(id);
    return m ? parseInt(m[1], 10) : null;
  }

  private collectImage(nodeProps: NodeProperties): void {
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const hasDockerImages = Array.isArray(dockerImages) && dockerImages.length > 0 && dockerImages.some(img => img && img.trim() !== '');
    if (hasDockerImages) {
      const baseImg = (document.getElementById(ID_NODE_IMAGE_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    const version = (document.getElementById(ID_NODE_VERSION_FILTER_INPUT) as HTMLInputElement | null)?.value || 'latest';
      if (baseImg) {
        nodeProps.image = `${baseImg}:${version}`;
      }
    } else {
      const baseImg = (document.getElementById(ID_NODE_IMAGE_FALLBACK_INPUT) as HTMLInputElement | null)?.value || '';
    const version = (document.getElementById(ID_NODE_VERSION_FALLBACK_INPUT) as HTMLInputElement | null)?.value || 'latest';
      if (baseImg) {
        nodeProps.image = `${baseImg}:${version}`;
      }
    }
  }

  private collectConfigurationProps(nodeProps: NodeProperties): void {
    const startupConfig = this.getInputValue(ID_NODE_STARTUP_CONFIG);
    if (startupConfig) nodeProps[PROP_STARTUP_CONFIG] = startupConfig as any;

    if (this.getCheckboxValue(ID_NODE_ENFORCE_STARTUP_CONFIG)) {
      nodeProps[PROP_ENFORCE_STARTUP_CONFIG] = true as any;
    }
    if (this.getCheckboxValue(ID_NODE_SUPPRESS_STARTUP_CONFIG)) {
      nodeProps[PROP_SUPPRESS_STARTUP_CONFIG] = true as any;
    }

    const license = this.getInputValue('node-license');
    if (license) nodeProps.license = license;

    const binds = this.collectDynamicEntries(CN_BINDS);
    if (binds.length > 0) nodeProps.binds = binds;

    const env = this.collectDynamicKeyValueEntries('env');
    if (Object.keys(env).length > 0) nodeProps.env = env;

    const envFiles = this.collectDynamicEntries(CN_ENV_FILES);
    if (envFiles.length > 0) nodeProps[CN_ENV_FILES] = envFiles;

    const labels = this.collectDynamicKeyValueEntries('labels');
    if (Object.keys(labels).length > 0) nodeProps.labels = labels;
  }

  private collectRuntimeProps(nodeProps: NodeProperties): void {
    const user = this.getInputValue('node-user');
    if (user) nodeProps.user = user;

    const entrypoint = this.getInputValue('node-entrypoint');
    if (entrypoint) nodeProps.entrypoint = entrypoint;

    const cmd = this.getInputValue('node-cmd');
    if (cmd) nodeProps.cmd = cmd;

    const exec = this.collectDynamicEntries(CN_EXEC);
    if (exec.length > 0) nodeProps.exec = exec;

    const rpVal = (document.getElementById(ID_NODE_RP_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    if (rpVal && rpVal !== LABEL_DEFAULT) nodeProps['restart-policy'] = rpVal as any;

    if (this.getCheckboxValue('node-auto-remove')) {
      nodeProps['auto-remove'] = true;
    }

    const startupDelay = this.getInputValue('node-startup-delay');
    if (startupDelay) nodeProps['startup-delay'] = parseInt(startupDelay);
  }

  private collectNetworkProps(nodeProps: NodeProperties): void {
    const mgmtIpv4 = this.getInputValue(ID_NODE_MGMT_IPV4);
    if (mgmtIpv4) (nodeProps as any)[PROP_MGMT_IPV4] = mgmtIpv4;

    const mgmtIpv6 = this.getInputValue(ID_NODE_MGMT_IPV6);
    if (mgmtIpv6) (nodeProps as any)[PROP_MGMT_IPV6] = mgmtIpv6;

    const nmVal = (document.getElementById(ID_NODE_NM_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    if (nmVal && nmVal !== LABEL_DEFAULT) nodeProps['network-mode'] = nmVal;

    const ports = this.collectDynamicEntries(CN_PORTS);
    if (ports.length > 0) nodeProps.ports = ports;

    const dnsServers = this.collectDynamicEntries(CN_DNS_SERVERS);
    if (dnsServers.length > 0) {
      nodeProps.dns = nodeProps.dns || {};
      nodeProps.dns.servers = dnsServers;
    }

    const aliases = this.collectDynamicEntries(CN_ALIASES);
    if (aliases.length > 0) nodeProps.aliases = aliases;
  }

  private collectAdvancedProps(nodeProps: NodeProperties): void {
    const memory = this.getInputValue('node-memory');
    if (memory) nodeProps.memory = memory;

    const cpu = this.getInputValue(ID_NODE_CPU);
    if (cpu) nodeProps.cpu = parseFloat(cpu);

    const cpuSet = this.getInputValue(ID_NODE_CPU_SET);
    if (cpuSet) (nodeProps as any)[PROP_CPU_SET] = cpuSet;

    const shmSize = this.getInputValue(ID_NODE_SHM_SIZE);
    if (shmSize) (nodeProps as any)[PROP_SHM_SIZE] = shmSize;

    const capAdd = this.collectDynamicEntries(CN_CAP_ADD);
    if (capAdd.length > 0) nodeProps['cap-add'] = capAdd;

    const sysctls = this.collectDynamicKeyValueEntries('sysctls');
    if (Object.keys(sysctls).length > 0) {
      nodeProps.sysctls = {};
      Object.entries(sysctls).forEach(([key, value]) => {
        const numValue = parseFloat(value);
        nodeProps.sysctls![key] = isNaN(numValue) ? value : numValue;
      });
    }

    const devices = this.collectDynamicEntries(CN_DEVICES);
    if (devices.length > 0) nodeProps.devices = devices;
  }

  private collectCertificateProps(nodeProps: NodeProperties): void {
    if (!this.getCheckboxValue(ID_NODE_CERT_ISSUE)) return;
    nodeProps.certificate = { issue: true };

    const keySize = (document.getElementById(ID_NODE_CERT_KEYSIZE_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    if (keySize) nodeProps.certificate['key-size'] = parseInt(keySize);

    const validity = this.getInputValue(ID_NODE_CERT_VALIDITY);
    if (validity) nodeProps.certificate['validity-duration'] = validity;

    const sans = this.collectDynamicEntries(CN_SANS);
    if (sans.length > 0) nodeProps.certificate.sans = sans;
  }

  private collectHealthcheckProps(nodeProps: NodeProperties): void {
    const hcTest = this.getInputValue(ID_HC_TEST);
    if (hcTest) {
      this.ensureHealthcheck(nodeProps);
      nodeProps.healthcheck!.test = hcTest.split(' ');
    }

    this.setHealthcheckNumber(nodeProps, ID_HC_START, 'start-period');
    this.setHealthcheckNumber(nodeProps, ID_HC_INTERVAL, 'interval');
    this.setHealthcheckNumber(nodeProps, ID_HC_TIMEOUT, 'timeout');
    this.setHealthcheckNumber(nodeProps, ID_HC_RETRIES, 'retries');

    const ippVal = (document.getElementById(ID_NODE_IPP_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    if (ippVal && ippVal !== LABEL_DEFAULT) nodeProps['image-pull-policy'] = ippVal as any;

    const runtimeVal = (document.getElementById(ID_NODE_RUNTIME_FILTER_INPUT) as HTMLInputElement | null)?.value || '';
    if (runtimeVal && runtimeVal !== LABEL_DEFAULT) nodeProps.runtime = runtimeVal as any;
  }

  private ensureHealthcheck(nodeProps: NodeProperties): void {
    if (!nodeProps.healthcheck) nodeProps.healthcheck = {};
  }

  private setHealthcheckNumber(
    nodeProps: NodeProperties,
    inputId: string,
    prop: keyof NonNullable<NodeProperties['healthcheck']>
  ): void {
    const value = this.getInputValue(inputId);
    if (!value) return;
    this.ensureHealthcheck(nodeProps);
    (nodeProps.healthcheck as any)[prop] = parseInt(value);
  }

  private async handleCustomNode(nodeProps: NodeProperties): Promise<boolean> {
    const customName = this.getInputValue(ID_NODE_CUSTOM_NAME);
    const setDefault = this.getCheckboxValue(ID_NODE_CUSTOM_DEFAULT);
    if (!customName) return false;
    const currentNodeData = this.currentNode!.data();
    const editingNodeName = currentNodeData.extraData?.editingCustomNodeName;
    const isTempNode = this.currentNode!.id() === ID_TEMP_CUSTOM_NODE;
    const isEditNode = this.currentNode!.id() === ID_EDIT_CUSTOM_NODE;
    if (isTempNode || isEditNode) {
      await this.saveCustomNodeTemplate(customName, nodeProps, setDefault, editingNodeName);
      this.close();
      return true;
    }
    await this.saveCustomNodeTemplate(customName, nodeProps, setDefault);
    return false;
  }

  private isCustomTemplateNode(): boolean {
    const nodeId = this.currentNode?.id();
    return nodeId === ID_TEMP_CUSTOM_NODE || nodeId === ID_EDIT_CUSTOM_NODE;
  }

  private async updateNode(nodeProps: NodeProperties, expandedSlots?: Set<string>): Promise<void> {
    const currentData = this.currentNode!.data();
    const { updatedExtraData, inheritedProps } = this.mergeNodeData(nodeProps, currentData);
    const iconValue =
      (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)?.value ||
      'pe';
    const updatedData = { ...currentData, name: nodeProps.name, topoViewerRole: iconValue, extraData: updatedExtraData };
    if (this.currentIconColor) {
      updatedData.iconColor = this.currentIconColor;
    } else {
      delete updatedData.iconColor;
    }
    if (this.currentIconCornerRadius > 0) {
      updatedData.iconCornerRadius = this.currentIconCornerRadius;
    } else {
      delete updatedData.iconCornerRadius;
    }
    this.currentNode!.data(updatedData);
    const hadColorBefore = typeof currentData.iconColor === 'string' && currentData.iconColor.trim() !== '';
    const preserveBackground = !hadColorBefore && !this.currentIconColor;
    applyIconColorToNode(
      this.currentNode!,
      this.currentIconColor || undefined,
      { cornerRadius: this.currentIconCornerRadius },
      preserveBackground
    );
    await this.saveManager.saveTopo(this.cy, false);
    await this.refreshNodeData(expandedSlots);
    this.updateInheritedBadges(inheritedProps);
    log.info(`Node ${this.currentNode!.id()} updated with enhanced properties`);
  }

  private mergeNodeData(nodeProps: NodeProperties, currentData: any): { updatedExtraData: any; inheritedProps: string[] } {
    const updatedExtraData = this.prepareExtraData(nodeProps, currentData.extraData || {});

    const topology: ClabTopology = {
      topology: {
        defaults: (window as any).topologyDefaults || {},
        kinds: (window as any).topologyKinds || {},
        groups: (window as any).topologyGroups || {},
      }
    };
    const kindName = nodeProps.kind ?? currentData.extraData?.kind;
    const groupName = currentData.extraData?.group;
    const inheritBase = resolveNodeConfig(topology, { group: groupName, kind: kindName });
    const mergedNode = resolveNodeConfig(topology, { ...nodeProps, group: groupName, kind: kindName });
    const inheritedProps = this.computeInheritedProps(mergedNode, nodeProps, inheritBase);

    Object.assign(updatedExtraData, mergedNode);
    updatedExtraData.inherited = inheritedProps;
    updatedExtraData.kind = kindName;
    if (groupName !== undefined) {
      updatedExtraData.group = groupName;
    }
    return { updatedExtraData, inheritedProps };
  }

  private prepareExtraData(nodeProps: NodeProperties, currentExtraData: any): any {
    const updatedExtraData: any = { ...currentExtraData };
    const formManagedProperties = [
      'name', 'kind', 'type', 'image',
      PROP_STARTUP_CONFIG, PROP_ENFORCE_STARTUP_CONFIG, PROP_SUPPRESS_STARTUP_CONFIG,
      'license', CN_BINDS, CN_ENV, CN_ENV_FILES, CN_LABELS, 'user',
      'entrypoint', 'cmd', 'exec', PROP_RESTART_POLICY, PROP_AUTO_REMOVE, PROP_STARTUP_DELAY,
      PROP_MGMT_IPV4, PROP_MGMT_IPV6, PROP_NETWORK_MODE, PROP_PORTS, PROP_DNS, PROP_ALIASES,
      PROP_MEMORY, PROP_CPU, PROP_CPU_SET, PROP_SHM_SIZE, PROP_CAP_ADD, PROP_SYSCTLS, PROP_DEVICES,
      PROP_CERTIFICATE, 'healthcheck', PROP_IMAGE_PULL_POLICY, PROP_RUNTIME, 'components', 'inherited'
    ];
    formManagedProperties.forEach(prop => { delete updatedExtraData[prop]; });
    Object.assign(updatedExtraData, nodeProps);
    return updatedExtraData;
  }

  private computeInheritedProps(mergedNode: any, nodeProps: NodeProperties, inheritBase: any): string[] {
    const deepEqual = (a: any, b: any) => this.deepEqualNormalized(a, b);
    const shouldPersist = (val: any) => this.shouldPersistValue(val);
    const inheritedProps: string[] = [];
    const neverInherited = ['kind', 'name', 'group'];
    Object.keys(mergedNode).forEach(prop => {
      if (neverInherited.includes(prop)) {
        return;
      }
      const val = (nodeProps as any)[prop];
      const inheritedVal = (inheritBase as any)[prop];
      const hasValue = shouldPersist(val);
      const hasInheritedValue = shouldPersist(inheritedVal);
      if ((hasValue && deepEqual(val, inheritedVal)) || (!hasValue && hasInheritedValue)) {
        inheritedProps.push(prop);
      }
    });
    return inheritedProps;
  }

  private normalizeObject(obj: any): any {
    if (Array.isArray(obj)) return obj.map(o => this.normalizeObject(o));
    if (obj && typeof obj === 'object') {
      return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = this.normalizeObject(obj[k]);
        return acc;
      }, {} as any);
    }
    return obj;
  }

  private deepEqualNormalized(a: any, b: any): boolean {
    return JSON.stringify(this.normalizeObject(a)) === JSON.stringify(this.normalizeObject(b));
  }

  private shouldPersistValue(val: any): boolean {
    if (val === undefined) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (val && typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  }

  private async refreshNodeData(expandedSlots?: Set<string>): Promise<void> {
    try {
      const sender = this.saveManager.getMessageSender();
      const nodeName = this.currentNode!.data('name') || this.currentNode!.id();
      const freshData = await sender.sendMessageToVscodeEndpointPost('topo-editor-get-node-config', { node: nodeName });
      if (freshData && typeof freshData === 'object') {
        this.currentNode!.data('extraData', freshData);
        this.clearAllDynamicEntries();
        // Defer restoration to the next components render that happens in handleKindChange
        this.pendingExpandedComponentSlots = expandedSlots;
        this.loadNodeData(this.currentNode!);
      }
    } catch (err) {
      log.warn(`Failed to refresh node data from YAML after save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Close the enhanced node editor
   */
  private close(): void {
    if (this.panel) {
      this.panel.style.display = 'none';
    }
    this.currentNode = null;
    this.clearAllDynamicEntries();
  }
}
