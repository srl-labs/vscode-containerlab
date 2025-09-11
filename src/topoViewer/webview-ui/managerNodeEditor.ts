// managerNodeEditor.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { createFilterableDropdown } from './utilities/filterableDropdown';
import { ManagerSaveTopo } from './managerSaveTopo';
import { VscodeMessageSender } from './managerVscodeWebview';
import { extractNodeIcons } from './managerCytoscapeBaseStyles';
import { resolveNodeConfig } from '../core/nodeConfig';
import type { ClabTopology } from '../types/topoViewerType';

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

const ID_PANEL_NODE_EDITOR = 'panel-node-editor' as const;
const ID_PANEL_EDITOR_CLOSE = 'panel-node-editor-close' as const;
const ID_PANEL_EDITOR_CANCEL = 'panel-node-editor-cancel' as const;
const ID_PANEL_EDITOR_SAVE = 'panel-node-editor-save' as const;
const ID_NODE_CERT_ISSUE = 'node-cert-issue' as const;
const ID_CERT_OPTIONS = 'cert-options' as const;
const ID_PANEL_NODE_EDITOR_HEADING = 'panel-node-editor-heading' as const;
const ID_PANEL_NODE_EDITOR_ID = 'panel-node-editor-id' as const;

// Frequently used Node Editor element IDs
const ID_NODE_KIND_DROPDOWN = 'node-kind-dropdown-container' as const;
const ID_NODE_KIND_FILTER_INPUT = 'node-kind-dropdown-container-filter-input' as const;
const ID_NODE_TYPE = 'node-type' as const;
const ID_NODE_TYPE_DROPDOWN = 'panel-node-type-dropdown-container' as const;
const ID_NODE_TYPE_FILTER_INPUT = 'panel-node-type-dropdown-container-filter-input' as const;
const ID_NODE_VERSION_DROPDOWN = 'node-version-dropdown-container' as const;
const ID_NODE_VERSION_FILTER_INPUT = 'node-version-dropdown-container-filter-input' as const;
const ID_NODE_RP_DROPDOWN = 'node-restart-policy-dropdown-container' as const;
const ID_NODE_RP_FILTER_INPUT = 'node-restart-policy-dropdown-container-filter-input' as const;
const ID_NODE_NM_DROPDOWN = 'node-network-mode-dropdown-container' as const;
const ID_NODE_NM_FILTER_INPUT = 'node-network-mode-dropdown-container-filter-input' as const;
const ID_NODE_CUSTOM_DEFAULT = 'node-custom-default' as const;

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
    const typeFormGroup = document.getElementById(ID_NODE_TYPE)?.closest('.form-group') as HTMLElement;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;

    if (!typeFormGroup) return;

    const typeOptions = this.getTypeOptionsForKind(selectedKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(typeFormGroup, typeDropdownContainer, typeInput, typeOptions, selectedKind);
    } else {
      this.toggleTypeInputForKind(selectedKind, typeFormGroup, typeDropdownContainer, typeInput);
    }

    log.debug(`Kind changed to ${selectedKind}, type field visibility: ${typeFormGroup?.style.display}`);
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

    createFilterableDropdown(
      ID_NODE_TYPE_DROPDOWN,
      typeOptionsWithEmpty,
      typeToSelect,
      (selectedType: string) => log.debug(`Type ${selectedType || '(empty)'} selected for kind ${selectedKind}`),
      PH_SEARCH_TYPE,
      true
    );
  }

  private toggleTypeInputForKind(
    selectedKind: string,
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
  ) {
    const isNokiaKind = ['nokia_srlinux', 'nokia_sros', 'nokia_srsim'].includes(selectedKind);
    if (isNokiaKind) {
      typeFormGroup.style.display = 'block';
      if (typeDropdownContainer && typeInput) {
        typeDropdownContainer.style.display = 'none';
        typeInput.style.display = 'block';
      }
      return;
    }
    typeFormGroup.style.display = 'none';
    if (typeInput) typeInput.value = '';
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
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();

        // Get the container and entry ID from the button's data attributes
        const containerName = deleteBtn.getAttribute(DATA_ATTR_CONTAINER);
        const entryId = deleteBtn.getAttribute(DATA_ATTR_ENTRY_ID);

        log.debug(`Delete button clicked via delegation: ${containerName}-${entryId}`);

        if (containerName && entryId) {
          // Mark panel as clicked to prevent closing
          if ((window as any).viewportPanels) {
            (window as any).viewportPanels.setNodeClicked(true);
          }

          // Remove the entry
          this.removeEntry(containerName, parseInt(entryId));
        }
      }
    }, true); // Use capture phase to ensure we get the event first

    // Initialize tab switching
    this.setupTabSwitching();

    // Initialize event handlers
    this.setupEventHandlers();

    // Setup dynamic entry handlers
    this.setupDynamicEntryHandlers();

    // Initialize static filterable dropdowns with default values
    this.initializeStaticDropdowns();

    // Setup listeners to clear inherited flags when fields are edited
    this.setupInheritanceChangeListeners();

    log.debug('Enhanced node editor panel initialized');
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

  /**
   * Extract type options from schema for each kind
   */
  private extractTypeOptionsFromSchema(schema: any): void {
    this.nodeTypeOptions.clear();
    const allOf = schema?.definitions?.['node-config']?.allOf;
    if (!allOf) return;

    for (const condition of allOf) {
      const kind = this.getKindFromCondition(condition);
      if (!kind) continue;
      const typeProp = condition?.then?.properties?.type;
      const typeOptions = this.extractTypeOptions(typeProp);
      if (typeOptions.length === 0) continue;
      this.nodeTypeOptions.set(kind, typeOptions);
      log.debug(`Extracted ${typeOptions.length} type options for kind ${kind}`);
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

  /**
   * Setup handlers for dynamic entry management (binds, env vars, etc.)
   */
  private setupDynamicEntryHandlers(): void {
    // Expose functions globally for onclick handlers in HTML
    (window as any).addBindEntry = () => this.addDynamicEntry(CN_BINDS, PH_BIND);
    (window as any).addEnvEntry = () => this.addDynamicKeyValueEntry(CN_ENV, PH_ENV_KEY, PH_VALUE);
    (window as any).addLabelEntry = () => this.addDynamicKeyValueEntry(CN_LABELS, PH_LABEL_KEY, PH_LABEL_VALUE);
    (window as any).addExecEntry = () => this.addDynamicEntry(CN_EXEC, PH_EXEC);
    (window as any).addPortEntry = () => this.addDynamicEntry(CN_PORTS, PH_PORT);
    (window as any).addDnsServerEntry = () => this.addDynamicEntry(CN_DNS_SERVERS, PH_DNS_SERVER);
    (window as any).addAliasEntry = () => this.addDynamicEntry(CN_ALIASES, PH_ALIAS);
    (window as any).addCapabilityEntry = () => this.addDynamicEntry(CN_CAP_ADD, PH_CAP);
    (window as any).addSysctlEntry = () => this.addDynamicKeyValueEntry(CN_SYSCTLS, PH_SYSCTL_KEY, PH_VALUE);
    (window as any).addDeviceEntry = () => this.addDynamicEntry(CN_DEVICES, PH_DEVICE);
    (window as any).addSanEntry = () => this.addDynamicEntry(CN_SANS, PH_SAN);

    // Register remove entry function globally (no longer needed with event listeners)
    // but keeping for backward compatibility if any inline handlers remain
    (window as any).removeEntry = (containerName: string, entryId: number) => {
      log.debug(`Global removeEntry called: ${containerName}, ${entryId}`);
      this.removeEntry(containerName, entryId);
      return false; // Prevent default behavior
    };
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
   * Open the enhanced node editor for a specific node
   */
  public async open(node: cytoscape.NodeSingular): Promise<void> {
    this.currentNode = node;
    if (!this.panel) {
      log.error('Panel not initialized');
      return;
    }
    await this.refreshNodeExtraData(node);
    this.clearAllDynamicEntries();
    this.switchToTab('basic');
    this.loadNodeData(node);
    this.alignKindSelection(node);
    this.panel.style.display = 'block';
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
      CN_BINDS, CN_ENV, CN_LABELS, CN_EXEC, CN_PORTS, CN_DNS_SERVERS,
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
    const nodeIcons = extractNodeIcons();
    let iconInitial = 'pe';
    if (nodeData.topoViewerRole && typeof nodeData.topoViewerRole === 'string') {
      iconInitial = nodeData.topoViewerRole;
    } else if (nodeData.extraData?.icon && typeof nodeData.extraData.icon === 'string') {
      iconInitial = nodeData.extraData.icon;
    }
    createFilterableDropdown(ID_PANEL_NODE_TOPOROLE_CONTAINER, nodeIcons, iconInitial, () => {}, 'Search for icon...');
  }

  private setupCustomNodeFields(node: cytoscape.NodeSingular): void {
    this.setInputValue(ID_NODE_CUSTOM_NAME, '');
    this.setCheckboxValue(ID_NODE_CUSTOM_DEFAULT, false);

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

    if (extraData.binds && Array.isArray(extraData.binds)) {
      extraData.binds.forEach((bind: string) => this.addDynamicEntryWithValue(CN_BINDS, bind, PH_BIND));
    }
    this.markFieldInheritance(ID_NODE_BINDS_CONTAINER, actualInherited.includes(CN_BINDS));

    if (extraData.env && typeof extraData.env === 'object') {
      Object.entries(extraData.env).forEach(([key, value]) =>
        this.addDynamicKeyValueEntryWithValue(CN_ENV, key, value as string),
      );
    }
    this.markFieldInheritance(ID_NODE_ENV_CONTAINER, actualInherited.includes(CN_ENV));

    if (extraData.labels && typeof extraData.labels === 'object') {
      Object.entries(extraData.labels).forEach(([key, value]) =>
        this.addDynamicKeyValueEntryWithValue(CN_LABELS, key, value as string),
      );
    }
    this.markFieldInheritance(ID_NODE_LABELS_CONTAINER, actualInherited.includes(CN_LABELS));
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
      if (!this.imageVersionMap.has(base) && baseImages.length > 0) {
        base = baseImages[0];
        version = 'latest';
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
    // First check if dropdown is visible
    const dropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    if (dropdownContainer && dropdownContainer.style.display !== 'none') {
      // Get value from dropdown filter input
      const dropdownInput = document.getElementById(ID_NODE_TYPE_FILTER_INPUT) as HTMLInputElement;
      if (dropdownInput) {
        return dropdownInput.value;
      }
    }
    // Otherwise get from regular input
    return this.getInputValue(ID_NODE_TYPE);
  }

  /**
   * Mark a form field as inherited or remove the indication
   */
  private markFieldInheritance(fieldId: string, inherited: boolean): void {
    const el = document.getElementById(fieldId) as HTMLElement | null;
    const formGroup = el?.closest('.form-group') as HTMLElement | null;
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

  private async saveCustomNodeTemplate(name: string, nodeProps: NodeProperties, setDefault: boolean, oldName?: string): Promise<void> {
    try {
      // Get the icon/role value
      const iconValue = (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)?.value || 'pe';

      // Get the base name value
      const baseName = this.getInputValue('node-base-name') || '';

      const payload: any = {
        name,
        kind: nodeProps.kind || '',
        type: nodeProps.type,
        image: nodeProps.image,
        icon: iconValue,  // Add icon to the saved template
        baseName,  // Add base name for canvas nodes
        setDefault,
        // Include the old name if we're editing an existing template
        ...(oldName && { oldName })
      };

      // Always save all properties from nodeProps (excluding basic ones that are already set)
      Object.keys(nodeProps).forEach(key => {
        if (key !== 'name' && key !== 'kind' && key !== 'type' && key !== 'image') {
          payload[key] = nodeProps[key as keyof NodeProperties];
        }
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
      const nodeProps = this.collectNodeProperties();
      const handled = await this.handleCustomNode(nodeProps);
      if (handled || this.isCustomTemplateNode()) {
        return;
      }
      await this.updateNode(nodeProps);
    } catch (error) {
      log.error(`Failed to save node properties: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private collectNodeProperties(): NodeProperties {
    const nodeProps: NodeProperties = {
      name: this.getInputValue(ID_NODE_NAME),
      kind: (document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null)?.value || undefined,
      type: this.getTypeFieldValue() || undefined,
    };

    this.collectImage(nodeProps);
    this.collectConfigurationProps(nodeProps);
    this.collectRuntimeProps(nodeProps);
    this.collectNetworkProps(nodeProps);
    this.collectAdvancedProps(nodeProps);
    this.collectCertificateProps(nodeProps);
    this.collectHealthcheckProps(nodeProps);

    return nodeProps;
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

  private async updateNode(nodeProps: NodeProperties): Promise<void> {
    const currentData = this.currentNode!.data();
    const { updatedExtraData, inheritedProps } = this.mergeNodeData(nodeProps, currentData);
    const iconValue =
      (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)?.value ||
      'pe';
    const updatedData = { ...currentData, name: nodeProps.name, topoViewerRole: iconValue, extraData: updatedExtraData };
    this.currentNode!.data(updatedData);
    await this.saveManager.saveTopo(this.cy, false);
    await this.refreshNodeData();
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
      'license', CN_BINDS, CN_ENV, CN_LABELS, 'user',
      'entrypoint', 'cmd', 'exec', PROP_RESTART_POLICY, PROP_AUTO_REMOVE, PROP_STARTUP_DELAY,
      PROP_MGMT_IPV4, PROP_MGMT_IPV6, PROP_NETWORK_MODE, PROP_PORTS, PROP_DNS, PROP_ALIASES,
      PROP_MEMORY, PROP_CPU, PROP_CPU_SET, PROP_SHM_SIZE, PROP_CAP_ADD, PROP_SYSCTLS, PROP_DEVICES,
      PROP_CERTIFICATE, 'healthcheck', PROP_IMAGE_PULL_POLICY, PROP_RUNTIME, 'inherited'
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

  private async refreshNodeData(): Promise<void> {
    try {
      const sender = this.saveManager.getMessageSender();
      const nodeName = this.currentNode!.data('name') || this.currentNode!.id();
      const freshData = await sender.sendMessageToVscodeEndpointPost('topo-editor-get-node-config', { node: nodeName });
      if (freshData && typeof freshData === 'object') {
        this.currentNode!.data('extraData', freshData);
        this.clearAllDynamicEntries();
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
