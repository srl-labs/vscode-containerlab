// managerNodeEditor.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { createFilterableDropdown } from './utilities/filterableDropdown';
import { ManagerSaveTopo } from './managerSaveTopo';

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
  'restart-policy'?: 'no' | 'on-failure' | 'always' | 'unless-stopped';
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
  'image-pull-policy'?: 'IfNotPresent' | 'Never' | 'Always';
  runtime?: 'docker' | 'podman' | 'ignite';

  // Stages (for dependencies)
  stages?: {
    create?: {
      'wait-for'?: Array<{
        node: string;
        stage: string;
      }>;
      exec?: Array<{
        command: string;
        target?: 'container' | 'host';
        phase?: 'on-enter' | 'on-exit';
      }>;
    };
    'create-links'?: {
      exec?: Array<{
        command: string;
        target?: 'container' | 'host';
        phase?: 'on-enter' | 'on-exit';
      }>;
    };
    configure?: {
      exec?: Array<{
        command: string;
        target?: 'container' | 'host';
        phase?: 'on-enter' | 'on-exit';
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

  constructor(cy: cytoscape.Core, saveManager: ManagerSaveTopo) {
    this.cy = cy;
    this.saveManager = saveManager;
    this.initializePanel();
  }

  /**
   * Handle kind change and update type field visibility
   */
  private handleKindChange(selectedKind: string): void {
    const typeFormGroup = document.querySelector('#node-type')?.closest('.form-group') as HTMLElement;

    if (typeFormGroup) {
      // Show type field only for Nokia kinds (nokia_srlinux, nokia_sros, nokia_srsim)
      const isNokiaKind = ['nokia_srlinux', 'nokia_sros', 'nokia_srsim'].includes(selectedKind);

      if (isNokiaKind) {
        typeFormGroup.style.display = 'block';
      } else {
        typeFormGroup.style.display = 'none';
        // Clear the type field value when hiding
        const typeInput = document.getElementById('node-type') as HTMLInputElement;
        if (typeInput) {
          typeInput.value = '';
        }
      }
    }

    log.debug(`Kind changed to ${selectedKind}, type field visibility: ${['nokia_srlinux', 'nokia_sros', 'nokia_srsim'].includes(selectedKind) ? 'visible' : 'hidden'}`);
  }

  /**
   * Initialize the enhanced node editor panel
   */
  private initializePanel(): void {
    this.panel = document.getElementById('panel-node-editor');
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
      const deleteBtn = target.closest('.dynamic-delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();

        // Get the container and entry ID from the button's data attributes
        const containerName = deleteBtn.getAttribute('data-container');
        const entryId = deleteBtn.getAttribute('data-entry-id');

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

    log.debug('Enhanced node editor panel initialized');
  }

  private initializeStaticDropdowns(): void {
    // Restart Policy
    const rpOptions = ['Default', 'no', 'on-failure', 'always', 'unless-stopped'];
    createFilterableDropdown(
      'node-restart-policy-dropdown-container',
      rpOptions,
      'Default',
      () => {},
      'Search restart policy...'
    );

    // Network Mode
    const nmOptions = ['Default', 'host', 'none'];
    createFilterableDropdown(
      'node-network-mode-dropdown-container',
      nmOptions,
      'Default',
      () => {},
      'Search network mode...'
    );

    // Cert key size
    const keySizeOptions = ['2048', '4096'];
    createFilterableDropdown(
      'node-cert-key-size-dropdown-container',
      keySizeOptions,
      '2048',
      () => {},
      'Search key size...'
    );

    // Image pull policy
    const ippOptions = ['Default', 'IfNotPresent', 'Never', 'Always'];
    createFilterableDropdown(
      'node-image-pull-policy-dropdown-container',
      ippOptions,
      'Default',
      () => {},
      'Search pull policy...'
    );

    // Runtime
    const runtimeOptions = ['Default', 'docker', 'podman', 'ignite'];
    createFilterableDropdown(
      'node-runtime-dropdown-container',
      runtimeOptions,
      'Default',
      () => {},
      'Search runtime...'
    );
  }

  /**
   * Fetch schema and populate the Kind dropdown with all enum values
   */
  private async populateKindsFromSchema(): Promise<void> {
    try {
      const url = (window as any).schemaUrl as string | undefined;
      if (!url) {
        log.warn('Schema URL is undefined; keeping existing Kind options');
        return;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const kinds: string[] = json?.definitions?.['node-config']?.properties?.kind?.enum || [];
      if (!Array.isArray(kinds) || kinds.length === 0) {
        log.warn('No kind enum found in schema; keeping existing Kind options');
        return;
      }
      // Group Nokia kinds on top (prefix 'nokia_'), each group sorted alphabetically
      const nokiaKinds = kinds.filter(k => k.startsWith('nokia_')).sort((a, b) => a.localeCompare(b));
      const otherKinds = kinds.filter(k => !k.startsWith('nokia_')).sort((a, b) => a.localeCompare(b));
      this.schemaKinds = [...nokiaKinds, ...otherKinds];

      const desired = ((this.currentNode?.data()?.extraData?.kind as string) || (window as any).defaultKind || '') as string;
      const initial = desired && this.schemaKinds.includes(desired)
        ? desired
        : ((window as any).defaultKind && this.schemaKinds.includes((window as any).defaultKind)
            ? (window as any).defaultKind
            : (this.schemaKinds[0] || ''));
      createFilterableDropdown(
        'node-kind-dropdown-container',
        this.schemaKinds,
        initial,
        (selectedKind: string) => this.handleKindChange(selectedKind),
        'Search for kind...'
      );

      this.kindsLoaded = true;
      log.debug(`Loaded ${this.schemaKinds.length} kinds from schema`);
    } catch (e) {
      log.error(`populateKindsFromSchema error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Setup tab switching functionality
   */
  private setupTabSwitching(): void {
    const tabButtons = this.panel?.querySelectorAll('.panel-tab-button');
    const tabContents = this.panel?.querySelectorAll('.tab-content');

    tabButtons?.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('tab-active'));
        button.classList.add('tab-active');

        // Show corresponding tab content
        tabContents?.forEach(content => {
          if (content.id === `tab-${targetTab}`) {
            content.classList.remove('hidden');
          } else {
            content.classList.add('hidden');
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
    const closeBtn = document.getElementById('panel-node-editor-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Cancel button
    const cancelBtn = document.getElementById('panel-node-editor-cancel');
    cancelBtn?.addEventListener('click', () => this.close());

    // Save button
    const saveBtn = document.getElementById('panel-node-editor-save');
    saveBtn?.addEventListener('click', () => this.save());

    // Certificate checkbox toggle
    const certCheckbox = document.getElementById('node-cert-issue') as HTMLInputElement;
    const certOptions = document.getElementById('cert-options');
    certCheckbox?.addEventListener('change', () => {
      if (certCheckbox.checked) {
        certOptions?.classList.remove('hidden');
      } else {
        certOptions?.classList.add('hidden');
      }
    });
  }

  /**
   * Setup handlers for dynamic entry management (binds, env vars, etc.)
   */
  private setupDynamicEntryHandlers(): void {
    // Expose functions globally for onclick handlers in HTML
    (window as any).addBindEntry = () => this.addDynamicEntry('binds', 'Bind mount (host:container)');
    (window as any).addEnvEntry = () => this.addDynamicKeyValueEntry('env', 'ENV_NAME', 'value');
    (window as any).addLabelEntry = () => this.addDynamicKeyValueEntry('labels', 'label-key', 'label-value');
    (window as any).addExecEntry = () => this.addDynamicEntry('exec', 'Command to execute');
    (window as any).addPortEntry = () => this.addDynamicEntry('ports', 'Host:Container (e.g., 8080:80)');
    (window as any).addDnsServerEntry = () => this.addDynamicEntry('dns-servers', 'DNS server IP');
    (window as any).addAliasEntry = () => this.addDynamicEntry('aliases', 'Network alias');
    (window as any).addCapabilityEntry = () => this.addDynamicEntry('cap-add', 'Capability (e.g., NET_ADMIN)');
    (window as any).addSysctlEntry = () => this.addDynamicKeyValueEntry('sysctls', 'sysctl.key', 'value');
    (window as any).addDeviceEntry = () => this.addDynamicEntry('devices', 'Device path (e.g., /dev/net/tun)');
    (window as any).addSanEntry = () => this.addDynamicEntry('sans', 'SAN (e.g., test.com or 192.168.1.1)');

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
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field';
    input.placeholder = placeholder;
    input.setAttribute('data-field', containerName);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = 'dynamic-delete-btn';
    button.setAttribute('data-container', containerName);
    button.setAttribute('data-entry-id', count.toString());
    button.innerHTML = '<i class="fas fa-trash"></i>';

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
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute('data-field', `${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute('data-field', `${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = 'dynamic-delete-btn';
    button.setAttribute('data-container', containerName);
    button.setAttribute('data-entry-id', count.toString());
    button.innerHTML = '<i class="fas fa-trash"></i>';

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Open the enhanced node editor for a specific node
   */
  public open(node: cytoscape.NodeSingular): void {
    this.currentNode = node;

    if (!this.panel) {
      log.error('Panel not initialized');
      return;
    }


    // Clear all dynamic entries
    this.clearAllDynamicEntries();

    // Reset to first tab
    this.switchToTab('basic');

    // Load node data into form
    this.loadNodeData(node);

    // Ensure kind selection matches loaded options (fallback gracefully)
    try {
      const input = document.getElementById('node-kind-dropdown-container-filter-input') as HTMLInputElement | null;
      const desired = (node.data()?.extraData?.kind as string) || (window as any).defaultKind || '';
      if (input && desired && this.kindsLoaded && this.schemaKinds.length > 0) {
        input.value = this.schemaKinds.includes(desired)
          ? desired
          : ((window as any).defaultKind && this.schemaKinds.includes((window as any).defaultKind) ? (window as any).defaultKind : (this.schemaKinds[0] || ''));
      }
    } catch (e) {
      log.warn(`Kind selection alignment warning: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Show the panel
    this.panel.style.display = 'block';

    log.debug(`Opened enhanced node editor for node: ${node.id()}`);
  }

  /**
   * Clear all dynamic entry containers
   */
  private clearAllDynamicEntries(): void {
    const containers = [
      'binds', 'env', 'labels', 'exec', 'ports', 'dns-servers',
      'aliases', 'cap-add', 'sysctls', 'devices', 'sans'
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
   * Load node data into the form
   */
  private loadNodeData(node: cytoscape.NodeSingular): void {
    const nodeData = node.data();
    const extraData = nodeData.extraData || {};

    // Display node ID
    const idElement = document.getElementById('panel-node-editor-id');
    if (idElement) {
      idElement.textContent = node.id();
    }

    // Basic tab
    this.setInputValue('node-name', nodeData.name || node.id());
    // Kind dropdown
    const desiredKind = extraData.kind || ((window as any).defaultKind || 'nokia_srlinux');
    const kindInitial = (this.schemaKinds.length > 0 && this.schemaKinds.includes(desiredKind))
      ? desiredKind
      : (this.schemaKinds[0] || desiredKind);
    createFilterableDropdown('node-kind-dropdown-container', this.schemaKinds, kindInitial, (selectedKind: string) => this.handleKindChange(selectedKind), 'Search for kind...');
    this.setInputValue('node-type', extraData.type || '');

    // Set initial type field visibility based on the kind
    this.handleKindChange(kindInitial);
    // Image dropdown: prefer docker images if provided by the extension
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const imageInitial = extraData.image || '';
    if (Array.isArray(dockerImages) && dockerImages.length > 0) {
      // For image field only: allow free-text input (do not force nearest match)
      createFilterableDropdown('node-image-dropdown-container', dockerImages, imageInitial, () => {}, 'Search for image...', true);
    } else {
      // Fallback to plain input if docker images not available
      const container = document.getElementById('node-image-dropdown-container');
      if (container) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-field w-full';
        input.placeholder = 'e.g., ghcr.io/nokia/srlinux:latest';
        input.id = 'node-image-fallback-input';
        input.value = imageInitial;
        container.appendChild(input);
      }
    }
    const parentNode = node.parent();
    const parentId = parentNode.nonempty() ? parentNode[0].id() : '';
    this.setInputValue('node-group', parentId);

    // Configuration tab
    this.setInputValue('node-startup-config', extraData['startup-config'] || '');
    this.setCheckboxValue('node-enforce-startup-config', extraData['enforce-startup-config'] || false);
    this.setCheckboxValue('node-suppress-startup-config', extraData['suppress-startup-config'] || false);
    this.setInputValue('node-license', extraData.license || '');

    // Load binds
    if (extraData.binds && Array.isArray(extraData.binds)) {
      extraData.binds.forEach((bind: string) => {
        this.addDynamicEntryWithValue('binds', bind, 'Bind mount (host:container)');
      });
    }

    // Load environment variables
    if (extraData.env && typeof extraData.env === 'object') {
      Object.entries(extraData.env).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('env', key, value as string);
      });
    }

    // Load labels
    if (extraData.labels && typeof extraData.labels === 'object') {
      Object.entries(extraData.labels).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('labels', key, value as string);
      });
    }

    // Runtime tab
    this.setInputValue('node-user', extraData.user || '');
    this.setInputValue('node-entrypoint', extraData.entrypoint || '');
    this.setInputValue('node-cmd', extraData.cmd || '');
    const rpOptions = ['Default', 'no', 'on-failure', 'always', 'unless-stopped'];
    const rpInitial = extraData['restart-policy'] || 'Default';
    createFilterableDropdown('node-restart-policy-dropdown-container', rpOptions, rpInitial, () => {}, 'Search restart policy...');
    this.setCheckboxValue('node-auto-remove', extraData['auto-remove'] || false);
    this.setInputValue('node-startup-delay', extraData['startup-delay'] || '');

    // Load exec commands
    if (extraData.exec && Array.isArray(extraData.exec)) {
      extraData.exec.forEach((cmd: string) => {
        this.addDynamicEntryWithValue('exec', cmd, 'Command to execute');
      });
    }

    // Network tab
    this.setInputValue('node-mgmt-ipv4', extraData['mgmt-ipv4'] || '');
    this.setInputValue('node-mgmt-ipv6', extraData['mgmt-ipv6'] || '');
    const nmOptions = ['Default', 'host', 'none'];
    const nmInitial = extraData['network-mode'] || 'Default';
    createFilterableDropdown('node-network-mode-dropdown-container', nmOptions, nmInitial, () => {}, 'Search network mode...');

    // Load ports
    if (extraData.ports && Array.isArray(extraData.ports)) {
      extraData.ports.forEach((port: string) => {
        this.addDynamicEntryWithValue('ports', port, 'Host:Container');
      });
    }

    // Load DNS configuration
    if (extraData.dns) {
      if (extraData.dns.servers && Array.isArray(extraData.dns.servers)) {
        extraData.dns.servers.forEach((server: string) => {
          this.addDynamicEntryWithValue('dns-servers', server, 'DNS server IP');
        });
      }
    }

    // Load aliases
    if (extraData.aliases && Array.isArray(extraData.aliases)) {
      extraData.aliases.forEach((alias: string) => {
        this.addDynamicEntryWithValue('aliases', alias, 'Network alias');
      });
    }

    // Advanced tab
    this.setInputValue('node-memory', extraData.memory || '');
    this.setInputValue('node-cpu', extraData.cpu || '');
    this.setInputValue('node-cpu-set', extraData['cpu-set'] || '');
    this.setInputValue('node-shm-size', extraData['shm-size'] || '');

    // Load capabilities
    if (extraData['cap-add'] && Array.isArray(extraData['cap-add'])) {
      extraData['cap-add'].forEach((cap: string) => {
        this.addDynamicEntryWithValue('cap-add', cap, 'Capability');
      });
    }

    // Load sysctls
    if (extraData.sysctls && typeof extraData.sysctls === 'object') {
      Object.entries(extraData.sysctls).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('sysctls', key, String(value));
      });
    }

    // Load devices
    if (extraData.devices && Array.isArray(extraData.devices)) {
      extraData.devices.forEach((device: string) => {
        this.addDynamicEntryWithValue('devices', device, 'Device path');
      });
    }

    // Load certificate configuration
    if (extraData.certificate) {
      this.setCheckboxValue('node-cert-issue', extraData.certificate.issue || false);
      const keySizeOptions = ['2048', '4096'];
      const keySizeInitial = String(extraData.certificate['key-size'] || '2048');
      createFilterableDropdown('node-cert-key-size-dropdown-container', keySizeOptions, keySizeInitial, () => {}, 'Search key size...');
      this.setInputValue('node-cert-validity', extraData.certificate['validity-duration'] || '');

      if (extraData.certificate.sans && Array.isArray(extraData.certificate.sans)) {
        extraData.certificate.sans.forEach((san: string) => {
          this.addDynamicEntryWithValue('sans', san, 'SAN');
        });
      }
    }

    // Load healthcheck configuration
    if (extraData.healthcheck) {
      const hc = extraData.healthcheck;
      this.setInputValue('node-healthcheck-test', hc.test ? hc.test.join(' ') : '');
      this.setInputValue('node-healthcheck-start-period', hc['start-period'] || '');
      this.setInputValue('node-healthcheck-interval', hc.interval || '');
      this.setInputValue('node-healthcheck-timeout', hc.timeout || '');
      this.setInputValue('node-healthcheck-retries', hc.retries || '');
    }

    const ippOptions = ['Default', 'IfNotPresent', 'Never', 'Always'];
    const ippInitial = extraData['image-pull-policy'] || 'Default';
    createFilterableDropdown('node-image-pull-policy-dropdown-container', ippOptions, ippInitial, () => {}, 'Search pull policy...');

    const runtimeOptions = ['Default', 'docker', 'podman', 'ignite'];
    const runtimeInitial = extraData.runtime || 'Default';
    createFilterableDropdown('node-runtime-dropdown-container', runtimeOptions, runtimeInitial, () => {}, 'Search runtime...');
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
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `${containerName}-entry-${count}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field';
    input.placeholder = placeholder;
    input.value = value;
    input.setAttribute('data-field', containerName);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = 'dynamic-delete-btn';
    button.setAttribute('data-container', containerName);
    button.setAttribute('data-entry-id', count.toString());
    button.innerHTML = '<i class="fas fa-trash"></i>';

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
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.value = key;
    keyInput.setAttribute('data-field', `${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.value = value;
    valueInput.setAttribute('data-field', `${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button'; // Prevent form submission
    button.className = 'dynamic-delete-btn';
    button.setAttribute('data-container', containerName);
    button.setAttribute('data-entry-id', count.toString());
    button.innerHTML = '<i class="fas fa-trash"></i>';

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

    const entries = container.querySelectorAll('.dynamic-entry');
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
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  /**
   * Validate IPv6 address format
   */
  private validateIPv6(ip: string): boolean {
    if (!ip) return true; // Empty is valid
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return ipv6Regex.test(ip);
  }

  /**
   * Validate port mapping format (host:container or host:container/protocol)
   */
  private validatePortMapping(port: string): boolean {
    if (!port) return true; // Empty is valid
    const portRegex = /^(\d+):(\d+)(\/(?:tcp|udp))?$/;
    const match = port.match(portRegex);
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
    let isValid = true;
    this.clearAllValidationErrors();

    // Validate IPv4
    const mgmtIpv4 = this.getInputValue('node-mgmt-ipv4');
    if (mgmtIpv4 && !this.validateIPv4(mgmtIpv4)) {
      this.showValidationError('node-mgmt-ipv4', 'Invalid IPv4 address format');
      isValid = false;
    }

    // Validate IPv6
    const mgmtIpv6 = this.getInputValue('node-mgmt-ipv6');
    if (mgmtIpv6 && !this.validateIPv6(mgmtIpv6)) {
      this.showValidationError('node-mgmt-ipv6', 'Invalid IPv6 address format');
      isValid = false;
    }

    // Validate memory
    const memory = this.getInputValue('node-memory');
    if (memory && !this.validateMemory(memory)) {
      this.showValidationError('node-memory', 'Invalid memory format (e.g., 1Gb, 512Mb)');
      isValid = false;
    }

    // Validate CPU
    const cpu = this.getInputValue('node-cpu');
    if (cpu) {
      const cpuValue = parseFloat(cpu);
      if (isNaN(cpuValue) || cpuValue <= 0) {
        this.showValidationError('node-cpu', 'CPU must be a positive number');
        isValid = false;
      }
    }

    // Validate CPU set
    const cpuSet = this.getInputValue('node-cpu-set');
    if (cpuSet && !this.validateCpuSet(cpuSet)) {
      this.showValidationError('node-cpu-set', 'Invalid CPU set format (e.g., 0-3, 0,3)');
      isValid = false;
    }

    // Validate ports
    const ports = this.collectDynamicEntries('ports');
    for (const port of ports) {
      if (!this.validatePortMapping(port)) {
        this.showValidationError('node-ports-container', 'Invalid port format (e.g., 8080:80 or 8080:80/tcp)');
        isValid = false;
        break;
      }
    }

    // Validate bind mounts
    const binds = this.collectDynamicEntries('binds');
    for (const bind of binds) {
      if (!this.validateBindMount(bind)) {
        this.showValidationError('node-binds-container', 'Invalid bind mount format (e.g., /host/path:/container/path)');
        isValid = false;
        break;
      }
    }

    // Validate node name is not empty
    const nodeName = this.getInputValue('node-name');
    if (!nodeName || nodeName.trim() === '') {
      this.showValidationError('node-name', 'Node name is required');
      isValid = false;
    }

    return isValid;
  }

  /**
   * Save the node data
   */
  private async save(): Promise<void> {
    if (!this.currentNode) return;

    // Validate form before saving
    if (!this.validateForm()) {
      log.warn('Form validation failed, cannot save');
      return;
    }

    try {
      // Collect all the data
      const nodeProps: NodeProperties = {
        name: this.getInputValue('node-name'),
        kind: (document.getElementById('node-kind-dropdown-container-filter-input') as HTMLInputElement | null)?.value || undefined,
        type: this.getInputValue('node-type') || undefined,
      };
      // Image from dropdown or fallback
      const dockerImages = (window as any).dockerImages as string[] | undefined;
      if (Array.isArray(dockerImages) && dockerImages.length > 0) {
        const img = (document.getElementById('node-image-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
        if (img) nodeProps.image = img;
      } else {
        const img = (document.getElementById('node-image-fallback-input') as HTMLInputElement | null)?.value || '';
        if (img) nodeProps.image = img;
      }

      // Configuration properties
      const startupConfig = this.getInputValue('node-startup-config');
      if (startupConfig) {
        nodeProps['startup-config'] = startupConfig;
      }

      // For checkboxes: only include if checked (true)
      if (this.getCheckboxValue('node-enforce-startup-config')) {
        nodeProps['enforce-startup-config'] = true;
      }

      if (this.getCheckboxValue('node-suppress-startup-config')) {
        nodeProps['suppress-startup-config'] = true;
      }

      const license = this.getInputValue('node-license');
      if (license) {
        nodeProps.license = license;
      }

      const binds = this.collectDynamicEntries('binds');
      if (binds.length > 0) {
        nodeProps.binds = binds;
      }

      const env = this.collectDynamicKeyValueEntries('env');
      if (Object.keys(env).length > 0) {
        nodeProps.env = env;
      }

      const labels = this.collectDynamicKeyValueEntries('labels');
      if (Object.keys(labels).length > 0) {
        nodeProps.labels = labels;
      }

      // Runtime properties
      const user = this.getInputValue('node-user');
      if (user) {
        nodeProps.user = user;
      }

      const entrypoint = this.getInputValue('node-entrypoint');
      if (entrypoint) {
        nodeProps.entrypoint = entrypoint;
      }

      const cmd = this.getInputValue('node-cmd');
      if (cmd) {
        nodeProps.cmd = cmd;
      }

      const exec = this.collectDynamicEntries('exec');
      if (exec.length > 0) {
        nodeProps.exec = exec;
      }

      const rpVal = (document.getElementById('node-restart-policy-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
      if (rpVal && rpVal !== 'Default') {
        nodeProps['restart-policy'] = rpVal as any;
      }

      if (this.getCheckboxValue('node-auto-remove')) {
        nodeProps['auto-remove'] = true;
      }

      const startupDelay = this.getInputValue('node-startup-delay');
      if (startupDelay) {
        nodeProps['startup-delay'] = parseInt(startupDelay);
      }

      // Network properties
      const mgmtIpv4 = this.getInputValue('node-mgmt-ipv4');
      if (mgmtIpv4) {
        nodeProps['mgmt-ipv4'] = mgmtIpv4;
      }

      const mgmtIpv6 = this.getInputValue('node-mgmt-ipv6');
      if (mgmtIpv6) {
        nodeProps['mgmt-ipv6'] = mgmtIpv6;
      }

      const nmVal = (document.getElementById('node-network-mode-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
      if (nmVal && nmVal !== 'Default') {
        nodeProps['network-mode'] = nmVal;
      }

      const ports = this.collectDynamicEntries('ports');
      if (ports.length > 0) {
        nodeProps.ports = ports;
      }

      const dnsServers = this.collectDynamicEntries('dns-servers');
      if (dnsServers.length > 0) {
        nodeProps.dns = nodeProps.dns || {};
        nodeProps.dns.servers = dnsServers;
      }

      const aliases = this.collectDynamicEntries('aliases');
      if (aliases.length > 0) {
        nodeProps.aliases = aliases;
      }

      // Advanced properties
      const memory = this.getInputValue('node-memory');
      if (memory) {
        nodeProps.memory = memory;
      }

      const cpu = this.getInputValue('node-cpu');
      if (cpu) {
        nodeProps.cpu = parseFloat(cpu);
      }

      const cpuSet = this.getInputValue('node-cpu-set');
      if (cpuSet) {
        nodeProps['cpu-set'] = cpuSet;
      }

      const shmSize = this.getInputValue('node-shm-size');
      if (shmSize) {
        nodeProps['shm-size'] = shmSize;
      }

      const capAdd = this.collectDynamicEntries('cap-add');
      if (capAdd.length > 0) {
        nodeProps['cap-add'] = capAdd;
      }

      const sysctls = this.collectDynamicKeyValueEntries('sysctls');
      if (Object.keys(sysctls).length > 0) {
        nodeProps.sysctls = {};
        Object.entries(sysctls).forEach(([key, value]) => {
          // Try to parse as number, otherwise keep as string
          const numValue = parseFloat(value);
          nodeProps.sysctls![key] = isNaN(numValue) ? value : numValue;
        });
      }

      const devices = this.collectDynamicEntries('devices');
      if (devices.length > 0) {
        nodeProps.devices = devices;
      }

      // Certificate configuration
      if (this.getCheckboxValue('node-cert-issue')) {
        nodeProps.certificate = { issue: true };

        const keySize = (document.getElementById('node-cert-key-size-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
        if (keySize) nodeProps.certificate['key-size'] = parseInt(keySize);

        const validity = this.getInputValue('node-cert-validity');
        if (validity) nodeProps.certificate['validity-duration'] = validity;

        const sans = this.collectDynamicEntries('sans');
        if (sans.length > 0) nodeProps.certificate.sans = sans;
      }

      // Healthcheck configuration
      const hcTest = this.getInputValue('node-healthcheck-test');
      if (hcTest) {
        nodeProps.healthcheck = nodeProps.healthcheck || {};
        nodeProps.healthcheck.test = hcTest.split(' ');
      }

      const hcStartPeriod = this.getInputValue('node-healthcheck-start-period');
      if (hcStartPeriod) {
        nodeProps.healthcheck = nodeProps.healthcheck || {};
        nodeProps.healthcheck['start-period'] = parseInt(hcStartPeriod);
      }

      const hcInterval = this.getInputValue('node-healthcheck-interval');
      if (hcInterval) {
        nodeProps.healthcheck = nodeProps.healthcheck || {};
        nodeProps.healthcheck.interval = parseInt(hcInterval);
      }

      const hcTimeout = this.getInputValue('node-healthcheck-timeout');
      if (hcTimeout) {
        nodeProps.healthcheck = nodeProps.healthcheck || {};
        nodeProps.healthcheck.timeout = parseInt(hcTimeout);
      }

      const hcRetries = this.getInputValue('node-healthcheck-retries');
      if (hcRetries) {
        nodeProps.healthcheck = nodeProps.healthcheck || {};
        nodeProps.healthcheck.retries = parseInt(hcRetries);
      }

      const ippVal = (document.getElementById('node-image-pull-policy-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
      if (ippVal && ippVal !== 'Default') {
        nodeProps['image-pull-policy'] = ippVal as any;
      }

      const runtimeVal = (document.getElementById('node-runtime-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
      if (runtimeVal && runtimeVal !== 'Default') {
        nodeProps.runtime = runtimeVal as any;
      }

      // Update the node data
      const currentData = this.currentNode.data();

      // Start with existing extraData to preserve properties not managed by the form
      const updatedExtraData: any = { ...(currentData.extraData || {}) };

      // List of all properties managed by the form
      const formManagedProperties = [
        'name', 'kind', 'type', 'image', 'startup-config', 'enforce-startup-config',
        'suppress-startup-config', 'license', 'binds', 'env', 'labels', 'user',
        'entrypoint', 'cmd', 'exec', 'restart-policy', 'auto-remove', 'startup-delay',
        'mgmt-ipv4', 'mgmt-ipv6', 'network-mode', 'ports', 'dns', 'aliases',
        'memory', 'cpu', 'cpu-set', 'shm-size', 'cap-add', 'sysctls', 'devices',
        'certificate', 'healthcheck', 'image-pull-policy', 'runtime'
      ];

      // Remove all form-managed properties first (to handle deletions)
      formManagedProperties.forEach(prop => {
        delete updatedExtraData[prop];
      });

      // Then add back only the properties with values from the form
      Object.assign(updatedExtraData, nodeProps);

      const updatedData = {
        ...currentData,
        name: nodeProps.name,
        extraData: updatedExtraData
      };

      this.currentNode.data(updatedData);

      // Save the topology
      await this.saveManager.viewportButtonsSaveTopo(this.cy, false);

      log.info(`Node ${this.currentNode.id()} updated with enhanced properties`);

      // Don't close the panel after saving - let user continue editing or close manually
    } catch (error) {
      log.error(`Failed to save node properties: ${error instanceof Error ? error.message : String(error)}`);
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
