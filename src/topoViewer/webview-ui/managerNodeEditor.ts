// managerNodeEditor.ts

import cytoscape from 'cytoscape';
import { log } from '../logging/logger';
import { createFilterableDropdown } from './utilities/filterableDropdown';
import { ManagerSaveTopo } from './managerSaveTopo';
import { VscodeMessageSender } from './managerVscodeWebview';
import { extractNodeIcons } from './managerCytoscapeBaseStyles';
import { resolveNodeConfig } from '../core/nodeConfig';
import type { ClabTopology } from '../types/topoViewerType';

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
        'node-version-dropdown-container',
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
        'node-version-dropdown-container',
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
    const typeFormGroup = document.querySelector('#node-type')?.closest('.form-group') as HTMLElement;
    const typeDropdownContainer = document.getElementById('panel-node-type-dropdown-container');
    const typeInput = document.getElementById('node-type') as HTMLInputElement;

    if (typeFormGroup) {
      // Get type options for the selected kind
      const typeOptions = this.getTypeOptionsForKind(selectedKind);

      if (typeOptions.length > 0) {
        // Show type field with dropdown for kinds with predefined types
        typeFormGroup.style.display = 'block';
        if (typeDropdownContainer && typeInput) {
          typeDropdownContainer.style.display = 'block';
          typeInput.style.display = 'none';

          // Add empty option at the beginning for default/no selection
          const typeOptionsWithEmpty = ['', ...typeOptions];

          // Get current type value to preserve if possible
          const currentType = typeInput.value || '';
          const typeToSelect = typeOptionsWithEmpty.includes(currentType) ? currentType : '';

          // Create searchable dropdown for type
          createFilterableDropdown(
            'panel-node-type-dropdown-container',
            typeOptionsWithEmpty,
            typeToSelect,
            (selectedType: string) => {
              // Type will be saved when save button is clicked
              log.debug(`Type ${selectedType || '(empty)'} selected for kind ${selectedKind}`);
            },
            'Search for type...',
            true // Allow free text for custom types
          );
        }
      } else {
        // For kinds without predefined types, show regular input field
        const isNokiaKind = ['nokia_srlinux', 'nokia_sros', 'nokia_srsim'].includes(selectedKind);
        if (isNokiaKind) {
          // Still show the field for Nokia kinds even without predefined types
          typeFormGroup.style.display = 'block';
          if (typeDropdownContainer && typeInput) {
            typeDropdownContainer.style.display = 'none';
            typeInput.style.display = 'block';
          }
        } else {
          // Hide for non-Nokia kinds without types
          typeFormGroup.style.display = 'none';
          if (typeInput) {
            typeInput.value = '';
          }
        }
      }
    }

    log.debug(`Kind changed to ${selectedKind}, type field visibility: ${typeFormGroup?.style.display}`);
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

    // Setup listeners to clear inherited flags when fields are edited
    this.setupInheritanceChangeListeners();

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

      // Extract type options for each kind from the schema
      this.extractTypeOptionsFromSchema(json);

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
   * Extract type options from schema for each kind
   */
  private extractTypeOptionsFromSchema(schema: any): void {
    this.nodeTypeOptions.clear();

    if (!schema?.definitions?.['node-config']?.allOf) {
      return;
    }

    // Iterate through all conditional type definitions in the schema
    for (const condition of schema.definitions['node-config'].allOf) {
      if (condition.if?.properties?.kind?.pattern && condition.then?.properties?.type) {
        // Extract the kind from the pattern (e.g., "(nokia_srlinux)" -> "nokia_srlinux")
        const pattern = condition.if.properties.kind.pattern;
        const kindMatch = pattern.match(/\(([^)]+)\)/);
        if (kindMatch) {
          const kind = kindMatch[1];
          const typeProp = condition.then.properties.type;

          // Extract type options from enum or anyOf
          let typeOptions: string[] = [];
          if (typeProp.enum) {
            typeOptions = typeProp.enum;
          } else if (Array.isArray(typeProp.anyOf)) {
            for (const sub of typeProp.anyOf) {
              if (sub.enum) {
                typeOptions = [...typeOptions, ...sub.enum];
              }
            }
          }

          if (typeOptions.length > 0) {
            this.nodeTypeOptions.set(kind, typeOptions);
            log.debug(`Extracted ${typeOptions.length} type options for kind ${kind}`);
          }
        }
      }
    }
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
   * Determine which properties should actually be shown as inherited
   */
  private computeActualInheritedProps(nodeProps: any, topology?: any): string[] {
    // Properties that should never be marked as inherited
    const neverInherited = ['kind', 'name', 'group'];

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

    const shouldPersist = (val: any) => {
      if (val === undefined) return false;
      if (Array.isArray(val)) return val.length > 0;
      if (val && typeof val === 'object') return Object.keys(val).length > 0;
      return true;
    };

    const normalize = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(normalize);
      if (obj && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((acc, k) => {
          acc[k] = normalize(obj[k]);
          return acc;
        }, {} as any);
      }
      return obj;
    };

    const deepEqual = (a: any, b: any) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

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

      if (hasValue && hasInheritedValue && deepEqual(val, inheritedVal)) {
        // User set a value that matches the inherited value
        actualInherited.push(prop);
      } else if (!hasValue && hasInheritedValue) {
        // User didn't set a value but there's an inherited value
        actualInherited.push(prop);
      }
      // Don't mark as inherited if both are empty/undefined
    });

    return actualInherited;
  }

  /**
   * Load node data into the form
   */
  private loadNodeData(node: cytoscape.NodeSingular): void {
    const nodeData = node.data();
    const extraData = nodeData.extraData || {};

    // Compute which properties should actually show as inherited
    const actualInherited = this.computeActualInheritedProps(extraData);

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
    this.markFieldInheritance('node-kind-dropdown-container', actualInherited.includes('kind'));
    // Store the type value temporarily
    const typeValue = extraData.type || '';
    this.setInputValue('node-type', typeValue);
    this.markFieldInheritance('node-type', actualInherited.includes('type'));
    // Set initial type field visibility and dropdown based on the kind
    // This will properly set up the dropdown if needed
    this.handleKindChange(kindInitial);
    // After handleKindChange sets up the field, ensure the type value is selected
    if (typeValue) {
      const typeInput = document.getElementById('node-type') as HTMLInputElement;
      if (typeInput) {
        typeInput.value = typeValue;
      }
    }

    // Icon/Role dropdown - use the actual icons from the styles
    const nodeIcons = extractNodeIcons();

    // Get the initial icon value - check if we're editing a custom template
    let iconInitial = 'pe';
    const currentNodeData = node.data();
    if (currentNodeData.topoViewerRole && typeof currentNodeData.topoViewerRole === 'string') {
      iconInitial = currentNodeData.topoViewerRole;
    } else if (currentNodeData.extraData?.icon && typeof currentNodeData.extraData.icon === 'string') {
      iconInitial = currentNodeData.extraData.icon;
    }

    // Log for debugging
    log.debug(`Creating icon dropdown with options: ${JSON.stringify(nodeIcons)}`);
    log.debug(`Initial icon value: ${iconInitial}`);

    createFilterableDropdown('panel-node-topoviewerrole-dropdown-container', nodeIcons, iconInitial, () => {
      // Icon will be saved when save button is clicked
    }, 'Search for icon...');

    // Image dropdown: prefer docker images if provided by the extension
    const dockerImages = (window as any).dockerImages as string[] | undefined;
    const imageInitial = extraData.image || '';
    this.markFieldInheritance('node-image-dropdown-container', actualInherited.includes('image'));

    // Check if we have valid Docker images (non-empty array)
    const hasDockerImages = Array.isArray(dockerImages) && dockerImages.length > 0 &&
                           dockerImages.some(img => img && img.trim() !== '');

    if (hasDockerImages) {
      // Parse docker images to extract base images and versions
      this.parseDockerImages(dockerImages);

      // Get sorted list of base images
      const baseImages = Array.from(this.imageVersionMap.keys()).sort((a, b) => {
        // Group images by common prefixes (e.g., ghcr.io/nokia/srlinux)
        const aIsNokia = a.includes('nokia');
        const bIsNokia = b.includes('nokia');
        if (aIsNokia && !bIsNokia) return -1;
        if (!aIsNokia && bIsNokia) return 1;
        return a.localeCompare(b);
      });

      // Determine initial base image and version from the current image value
      let initialBaseImage = '';
      let initialVersion = 'latest';

      if (imageInitial) {
        const lastColonIndex = imageInitial.lastIndexOf(':');
        if (lastColonIndex > 0) {
          const baseImg = imageInitial.substring(0, lastColonIndex);
          const ver = imageInitial.substring(lastColonIndex + 1);
          if (this.imageVersionMap.has(baseImg)) {
            initialBaseImage = baseImg;
            initialVersion = ver;
          }
        }
      }

      // If no match found but we have an imageInitial value, use it as a custom image
      if (!initialBaseImage && imageInitial) {
        // User has a custom image not in our Docker list
        const lastColonIndex = imageInitial.lastIndexOf(':');
        if (lastColonIndex > 0) {
          initialBaseImage = imageInitial.substring(0, lastColonIndex);
          initialVersion = imageInitial.substring(lastColonIndex + 1);
        } else {
          initialBaseImage = imageInitial;
          initialVersion = 'latest';
        }
      } else if (!initialBaseImage && baseImages.length > 0) {
        // No initial image, use first available
        initialBaseImage = baseImages[0];
      }

      // Create base image dropdown
      createFilterableDropdown(
        'node-image-dropdown-container',
        baseImages,
        initialBaseImage,
        (selectedBaseImage: string) => this.handleBaseImageChange(selectedBaseImage),
        'Search for image...',
        true // Allow free text
      );

      // Initialize version dropdown
      if (initialBaseImage) {
        const versions = this.imageVersionMap.get(initialBaseImage) || ['latest'];
        // Always preserve the actual version from YAML, even if it's not in our list
        const versionToSelect = initialVersion || versions[0] || 'latest';

        createFilterableDropdown(
          'node-version-dropdown-container',
          versions,
          versionToSelect,
          () => {},
          'Select version...',
          true // Allow free text for custom versions
        );
      } else {
        // Create version dropdown allowing free text for custom image
        createFilterableDropdown(
          'node-version-dropdown-container',
          ['latest'],
          initialVersion || 'latest',
          () => {},
          'Enter version...',
          true // Allow free text
        );
      }
    } else {
      // Fallback to plain input if docker images not available
      const container = document.getElementById('node-image-dropdown-container');
      if (container) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-field w-full';
        input.placeholder = 'e.g., ghcr.io/nokia/srlinux';
        input.id = 'node-image-fallback-input';

        // Extract base image from initial value
        let baseImageValue = imageInitial;
        if (imageInitial) {
          const lastColonIndex = imageInitial.lastIndexOf(':');
          if (lastColonIndex > 0) {
            baseImageValue = imageInitial.substring(0, lastColonIndex);
          }
        }
        input.value = baseImageValue;
        container.appendChild(input);
      }

      // Add version input field
      const versionContainer = document.getElementById('node-version-dropdown-container');
      if (versionContainer) {
        const versionInput = document.createElement('input');
        versionInput.type = 'text';
        versionInput.className = 'input-field w-full';
        versionInput.placeholder = 'e.g., latest';
        versionInput.id = 'node-version-fallback-input';

        // Extract version from initial value
        let versionValue = 'latest';
        if (imageInitial) {
          const lastColonIndex = imageInitial.lastIndexOf(':');
          if (lastColonIndex > 0) {
            versionValue = imageInitial.substring(lastColonIndex + 1);
          }
        }
        versionInput.value = versionValue;
        versionContainer.appendChild(versionInput);
      }
    }
    // Add custom node name fields
    this.setInputValue('node-custom-name', '');
    this.setCheckboxValue('node-custom-default', false);

    // Hide/show fields based on whether this is a newly created node or temp node for custom creation
    const customNameGroup = document.getElementById('node-custom-name-group');
    const nodeNameGroup = document.getElementById('node-name-group');
    const isTempNode = node.id() === 'temp-custom-node';
    const isEditNode = node.id() === 'edit-custom-node';

    // Only show custom name field when creating or editing custom node templates
    if (customNameGroup) {
      customNameGroup.style.display = (isTempNode || isEditNode) ? 'block' : 'none';
    }

    // Hide node name field when creating or editing custom node templates
    if (nodeNameGroup) {
      nodeNameGroup.style.display = (isTempNode || isEditNode) ? 'none' : 'block';
    }

    // Update panel heading based on mode
    const heading = document.getElementById('panel-node-editor-heading');
    if (heading) {
      if (isTempNode) {
        heading.textContent = 'Create Custom Node Template';
      } else if (isEditNode) {
        heading.textContent = 'Edit Custom Node Template';
      } else {
        heading.textContent = 'Node Editor';
      }
    }

    // Configuration tab
    this.setInputValue('node-startup-config', extraData['startup-config'] || '');
    this.markFieldInheritance('node-startup-config', actualInherited.includes('startup-config'));
    this.setCheckboxValue('node-enforce-startup-config', extraData['enforce-startup-config'] || false);
    this.markFieldInheritance('node-enforce-startup-config', actualInherited.includes('enforce-startup-config'));
    this.setCheckboxValue('node-suppress-startup-config', extraData['suppress-startup-config'] || false);
    this.markFieldInheritance('node-suppress-startup-config', actualInherited.includes('suppress-startup-config'));
    this.setInputValue('node-license', extraData.license || '');
    this.markFieldInheritance('node-license', actualInherited.includes('license'));

    // Load binds
    if (extraData.binds && Array.isArray(extraData.binds)) {
      extraData.binds.forEach((bind: string) => {
        this.addDynamicEntryWithValue('binds', bind, 'Bind mount (host:container)');
      });
    }
    this.markFieldInheritance('node-binds-container', actualInherited.includes('binds'));

    // Load environment variables
    if (extraData.env && typeof extraData.env === 'object') {
      Object.entries(extraData.env).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('env', key, value as string);
      });
    }
    this.markFieldInheritance('node-env-container', actualInherited.includes('env'));

    // Load labels
    if (extraData.labels && typeof extraData.labels === 'object') {
      Object.entries(extraData.labels).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('labels', key, value as string);
      });
    }
    this.markFieldInheritance('node-labels-container', actualInherited.includes('labels'));

    // Runtime tab
    this.setInputValue('node-user', extraData.user || '');
    this.markFieldInheritance('node-user', actualInherited.includes('user'));
    this.setInputValue('node-entrypoint', extraData.entrypoint || '');
    this.markFieldInheritance('node-entrypoint', actualInherited.includes('entrypoint'));
    this.setInputValue('node-cmd', extraData.cmd || '');
    this.markFieldInheritance('node-cmd', actualInherited.includes('cmd'));
    const rpOptions = ['Default', 'no', 'on-failure', 'always', 'unless-stopped'];
    const rpInitial = extraData['restart-policy'] || 'Default';
    createFilterableDropdown('node-restart-policy-dropdown-container', rpOptions, rpInitial, () => {}, 'Search restart policy...');
    this.markFieldInheritance('node-restart-policy-dropdown-container', actualInherited.includes('restart-policy'));
    this.setCheckboxValue('node-auto-remove', extraData['auto-remove'] || false);
    this.markFieldInheritance('node-auto-remove', actualInherited.includes('auto-remove'));
    this.setInputValue('node-startup-delay', extraData['startup-delay'] || '');
    this.markFieldInheritance('node-startup-delay', actualInherited.includes('startup-delay'));

    // Load exec commands
    if (extraData.exec && Array.isArray(extraData.exec)) {
      extraData.exec.forEach((cmd: string) => {
        this.addDynamicEntryWithValue('exec', cmd, 'Command to execute');
      });
    }
    this.markFieldInheritance('node-exec-container', actualInherited.includes('exec'));

    // Network tab
    this.setInputValue('node-mgmt-ipv4', extraData['mgmt-ipv4'] || '');
    this.markFieldInheritance('node-mgmt-ipv4', actualInherited.includes('mgmt-ipv4'));
    this.setInputValue('node-mgmt-ipv6', extraData['mgmt-ipv6'] || '');
    this.markFieldInheritance('node-mgmt-ipv6', actualInherited.includes('mgmt-ipv6'));
    const nmOptions = ['Default', 'host', 'none'];
    const nmInitial = extraData['network-mode'] || 'Default';
    createFilterableDropdown('node-network-mode-dropdown-container', nmOptions, nmInitial, () => {}, 'Search network mode...');
    this.markFieldInheritance('node-network-mode-dropdown-container', actualInherited.includes('network-mode'));

    // Load ports
    if (extraData.ports && Array.isArray(extraData.ports)) {
      extraData.ports.forEach((port: string) => {
        this.addDynamicEntryWithValue('ports', port, 'Host:Container');
      });
    }
    this.markFieldInheritance('node-ports-container', actualInherited.includes('ports'));

    // Load DNS configuration
    if (extraData.dns) {
      if (extraData.dns.servers && Array.isArray(extraData.dns.servers)) {
        extraData.dns.servers.forEach((server: string) => {
          this.addDynamicEntryWithValue('dns-servers', server, 'DNS server IP');
        });
      }
    }
    this.markFieldInheritance('node-dns-servers-container', actualInherited.includes('dns'));

    // Load aliases
    if (extraData.aliases && Array.isArray(extraData.aliases)) {
      extraData.aliases.forEach((alias: string) => {
        this.addDynamicEntryWithValue('aliases', alias, 'Network alias');
      });
    }
    this.markFieldInheritance('node-aliases-container', actualInherited.includes('aliases'));

    // Advanced tab
    this.setInputValue('node-memory', extraData.memory || '');
    this.markFieldInheritance('node-memory', actualInherited.includes('memory'));
    this.setInputValue('node-cpu', extraData.cpu || '');
    this.markFieldInheritance('node-cpu', actualInherited.includes('cpu'));
    this.setInputValue('node-cpu-set', extraData['cpu-set'] || '');
    this.markFieldInheritance('node-cpu-set', actualInherited.includes('cpu-set'));
    this.setInputValue('node-shm-size', extraData['shm-size'] || '');
    this.markFieldInheritance('node-shm-size', actualInherited.includes('shm-size'));

    // Load capabilities
    if (extraData['cap-add'] && Array.isArray(extraData['cap-add'])) {
      extraData['cap-add'].forEach((cap: string) => {
        this.addDynamicEntryWithValue('cap-add', cap, 'Capability');
      });
    }
    this.markFieldInheritance('node-cap-add-container', actualInherited.includes('cap-add'));

    // Load sysctls
    if (extraData.sysctls && typeof extraData.sysctls === 'object') {
      Object.entries(extraData.sysctls).forEach(([key, value]) => {
        this.addDynamicKeyValueEntryWithValue('sysctls', key, String(value));
      });
    }
    this.markFieldInheritance('node-sysctls-container', actualInherited.includes('sysctls'));

    // Load devices
    if (extraData.devices && Array.isArray(extraData.devices)) {
      extraData.devices.forEach((device: string) => {
        this.addDynamicEntryWithValue('devices', device, 'Device path');
      });
    }
    this.markFieldInheritance('node-devices-container', actualInherited.includes('devices'));

    // Load certificate configuration
    if (extraData.certificate) {
    this.setCheckboxValue('node-cert-issue', extraData.certificate.issue || false);
      this.markFieldInheritance('node-cert-issue', actualInherited.includes('certificate'));
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
    this.markFieldInheritance('node-healthcheck-test', actualInherited.includes('healthcheck'));

    const ippOptions = ['Default', 'IfNotPresent', 'Never', 'Always'];
    const ippInitial = extraData['image-pull-policy'] || 'Default';
    createFilterableDropdown('node-image-pull-policy-dropdown-container', ippOptions, ippInitial, () => {}, 'Search pull policy...');
    this.markFieldInheritance('node-image-pull-policy-dropdown-container', actualInherited.includes('image-pull-policy'));

    const runtimeOptions = ['Default', 'docker', 'podman', 'ignite'];
    const runtimeInitial = extraData.runtime || 'Default';
    createFilterableDropdown('node-runtime-dropdown-container', runtimeOptions, runtimeInitial, () => {}, 'Search runtime...');
    this.markFieldInheritance('node-runtime-dropdown-container', actualInherited.includes('runtime'));
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
   * Get type field value from dropdown or input
   */
  private getTypeFieldValue(): string {
    // First check if dropdown is visible
    const dropdownContainer = document.getElementById('panel-node-type-dropdown-container');
    if (dropdownContainer && dropdownContainer.style.display !== 'none') {
      // Get value from dropdown filter input
      const dropdownInput = document.getElementById('panel-node-type-dropdown-container-filter-input') as HTMLInputElement;
      if (dropdownInput) {
        return dropdownInput.value;
      }
    }
    // Otherwise get from regular input
    return this.getInputValue('node-type');
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

    // Define field mappings - same as in setupInheritanceChangeListeners
    const mappings: Array<{ fieldId: string; prop: string }> = [
      { fieldId: 'node-kind-dropdown-container', prop: 'kind' },
      { fieldId: 'node-type', prop: 'type' },
      { fieldId: 'node-image-dropdown-container', prop: 'image' },
      { fieldId: 'node-startup-config', prop: 'startup-config' },
      { fieldId: 'node-enforce-startup-config', prop: 'enforce-startup-config' },
      { fieldId: 'node-suppress-startup-config', prop: 'suppress-startup-config' },
      { fieldId: 'node-license', prop: 'license' },
      { fieldId: 'node-binds-container', prop: 'binds' },
      { fieldId: 'node-env-container', prop: 'env' },
      { fieldId: 'node-labels-container', prop: 'labels' },
      { fieldId: 'node-user', prop: 'user' },
      { fieldId: 'node-entrypoint', prop: 'entrypoint' },
      { fieldId: 'node-cmd', prop: 'cmd' },
      { fieldId: 'node-exec-container', prop: 'exec' },
      { fieldId: 'node-restart-policy-dropdown-container', prop: 'restart-policy' },
      { fieldId: 'node-auto-remove', prop: 'auto-remove' },
      { fieldId: 'node-startup-delay', prop: 'startup-delay' },
      { fieldId: 'node-mgmt-ipv4', prop: 'mgmt-ipv4' },
      { fieldId: 'node-mgmt-ipv6', prop: 'mgmt-ipv6' },
      { fieldId: 'node-network-mode-dropdown-container', prop: 'network-mode' },
      { fieldId: 'node-ports-container', prop: 'ports' },
      { fieldId: 'node-dns-servers-container', prop: 'dns' },
      { fieldId: 'node-aliases-container', prop: 'aliases' },
      { fieldId: 'node-memory', prop: 'memory' },
      { fieldId: 'node-cpu', prop: 'cpu' },
      { fieldId: 'node-cpu-set', prop: 'cpu-set' },
      { fieldId: 'node-shm-size', prop: 'shm-size' },
      { fieldId: 'node-cap-add-container', prop: 'cap-add' },
      { fieldId: 'node-sysctls-container', prop: 'sysctls' },
      { fieldId: 'node-devices-container', prop: 'devices' },
      { fieldId: 'node-cert-issue', prop: 'certificate' },
      { fieldId: 'node-healthcheck-test', prop: 'healthcheck' },
      { fieldId: 'node-image-pull-policy-dropdown-container', prop: 'image-pull-policy' },
      { fieldId: 'node-runtime-dropdown-container', prop: 'runtime' }
    ];

    // Update each field's inherited badge based on whether its property is in the inherited list
    mappings.forEach(({ fieldId, prop }) => {
      // Never show inherited badge for certain properties
      const isInherited = !neverInherited.includes(prop) && inheritedProps.includes(prop);
      this.markFieldInheritance(fieldId, isInherited);
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
    const mappings: Array<{ id: string; prop: string; badgeId?: string }> = [
      { id: 'node-kind-dropdown-container', prop: 'kind' },
      { id: 'node-type', prop: 'type' },
      { id: 'node-image-dropdown-container', prop: 'image' },
      { id: 'node-startup-config', prop: 'startup-config' },
      { id: 'node-enforce-startup-config', prop: 'enforce-startup-config' },
      { id: 'node-suppress-startup-config', prop: 'suppress-startup-config' },
      { id: 'node-license', prop: 'license' },
      { id: 'node-binds-container', prop: 'binds' },
      { id: 'node-env-container', prop: 'env' },
      { id: 'node-labels-container', prop: 'labels' },
      { id: 'node-user', prop: 'user' },
      { id: 'node-entrypoint', prop: 'entrypoint' },
      { id: 'node-cmd', prop: 'cmd' },
      { id: 'node-exec-container', prop: 'exec' },
      { id: 'node-restart-policy-dropdown-container', prop: 'restart-policy' },
      { id: 'node-auto-remove', prop: 'auto-remove' },
      { id: 'node-startup-delay', prop: 'startup-delay' },
      { id: 'node-mgmt-ipv4', prop: 'mgmt-ipv4' },
      { id: 'node-mgmt-ipv6', prop: 'mgmt-ipv6' },
      { id: 'node-network-mode-dropdown-container', prop: 'network-mode' },
      { id: 'node-ports-container', prop: 'ports' },
      { id: 'node-dns-servers-container', prop: 'dns' },
      { id: 'node-aliases-container', prop: 'aliases' },
      { id: 'node-memory', prop: 'memory' },
      { id: 'node-cpu', prop: 'cpu' },
      { id: 'node-cpu-set', prop: 'cpu-set' },
      { id: 'node-shm-size', prop: 'shm-size' },
      { id: 'node-cap-add-container', prop: 'cap-add' },
      { id: 'node-sysctls-container', prop: 'sysctls' },
      { id: 'node-devices-container', prop: 'devices' },
      { id: 'node-cert-issue', prop: 'certificate' },
      { id: 'node-cert-key-size-dropdown-container', prop: 'certificate', badgeId: 'node-cert-issue' },
      { id: 'node-cert-validity', prop: 'certificate', badgeId: 'node-cert-issue' },
      { id: 'node-sans-container', prop: 'certificate', badgeId: 'node-cert-issue' },
      { id: 'node-healthcheck-test', prop: 'healthcheck' },
      { id: 'node-healthcheck-start-period', prop: 'healthcheck', badgeId: 'node-healthcheck-test' },
      { id: 'node-healthcheck-interval', prop: 'healthcheck', badgeId: 'node-healthcheck-test' },
      { id: 'node-healthcheck-timeout', prop: 'healthcheck', badgeId: 'node-healthcheck-test' },
      { id: 'node-healthcheck-retries', prop: 'healthcheck', badgeId: 'node-healthcheck-test' },
      { id: 'node-image-pull-policy-dropdown-container', prop: 'image-pull-policy' },
      { id: 'node-runtime-dropdown-container', prop: 'runtime' }
    ];

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

  private async saveCustomNodeTemplate(name: string, nodeProps: NodeProperties, setDefault: boolean, oldName?: string): Promise<void> {
    try {
      // Get the icon/role value
      const iconValue = (document.getElementById('panel-node-topoviewerrole-dropdown-container-filter-input') as HTMLInputElement | null)?.value || 'pe';

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

    // Validate form before saving
    if (!this.validateForm()) {
      log.warn('Form validation failed, cannot save');
      return;
    }

    try {
      // Collect all the data first
      const nodeProps: NodeProperties = {
        name: this.getInputValue('node-name'),
        kind: (document.getElementById('node-kind-dropdown-container-filter-input') as HTMLInputElement | null)?.value || undefined,
        type: this.getTypeFieldValue() || undefined,
      };

      // Combine base image and version to form the complete image
      const dockerImages = (window as any).dockerImages as string[] | undefined;
      const hasDockerImages = Array.isArray(dockerImages) && dockerImages.length > 0 &&
                             dockerImages.some(img => img && img.trim() !== '');

      if (hasDockerImages) {
        // Using dropdown inputs (with free text support)
        const baseImg = (document.getElementById('node-image-dropdown-container-filter-input') as HTMLInputElement | null)?.value || '';
        const version = (document.getElementById('node-version-dropdown-container-filter-input') as HTMLInputElement | null)?.value || 'latest';
        if (baseImg) {
          nodeProps.image = `${baseImg}:${version}`;
        }
      } else {
        // Fallback plain text inputs
        const baseImg = (document.getElementById('node-image-fallback-input') as HTMLInputElement | null)?.value || '';
        const version = (document.getElementById('node-version-fallback-input') as HTMLInputElement | null)?.value || 'latest';
        if (baseImg) {
          nodeProps.image = `${baseImg}:${version}`;
        }
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

      // Handle custom node saving after collecting all properties
      const customName = this.getInputValue('node-custom-name');
      const setDefault = this.getCheckboxValue('node-custom-default');
      if (customName) {
        // Check if we're editing an existing custom node
        const currentNodeData = this.currentNode.data();
        const editingNodeName = currentNodeData.extraData?.editingCustomNodeName;

        // For temp nodes or edit nodes, save the custom template
        const isTempNode = this.currentNode.id() === 'temp-custom-node';
        const isEditNode = this.currentNode.id() === 'edit-custom-node';

        if (isTempNode || isEditNode) {
          await this.saveCustomNodeTemplate(customName, nodeProps, setDefault, editingNodeName);
          // Close the panel and return early for temp/edit nodes
          this.close();
          return;
        } else {
          await this.saveCustomNodeTemplate(customName, nodeProps, setDefault);
        }
      }

      // Skip node update for temp nodes and edit nodes (custom node creation/editing without canvas node)
      const isTempNode = this.currentNode.id() === 'temp-custom-node';
      const isEditNode = this.currentNode.id() === 'edit-custom-node';
      if (isTempNode || isEditNode) {
        log.info('Skipped canvas update for custom node template operation');
        return;
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
        'certificate', 'healthcheck', 'image-pull-policy', 'runtime', 'inherited'
      ];

      // Remove all form-managed properties first (to handle deletions)
      formManagedProperties.forEach(prop => {
        delete updatedExtraData[prop];
      });

      // Then add back only the properties with values from the form
      Object.assign(updatedExtraData, nodeProps);

      // Recompute inherited properties against topology defaults/kinds/groups
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
      const normalize = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
          return Object.keys(obj).sort().reduce((acc, k) => {
            acc[k] = normalize(obj[k]);
            return acc;
          }, {} as any);
        }
        return obj;
      };
      const deepEqual = (a: any, b: any) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
      const shouldPersist = (val: any) => {
        if (val === undefined) return false;
        if (Array.isArray(val)) return val.length > 0;
        if (val && typeof val === 'object') return Object.keys(val).length > 0;
        return true;
      };
      const inheritedProps: string[] = [];
      // Properties that should never be marked as inherited
      const neverInherited = ['kind', 'name', 'group'];
      Object.keys(mergedNode).forEach(prop => {
        // Skip properties that should never be inherited
        if (neverInherited.includes(prop)) {
          return;
        }
        const val = (nodeProps as any)[prop];
        const inheritedVal = (inheritBase as any)[prop];

        // Only mark as inherited if:
        // 1. The value exists and matches the inherited value, OR
        // 2. The value doesn't exist but there IS an inherited value to inherit
        const hasValue = shouldPersist(val);
        const hasInheritedValue = shouldPersist(inheritedVal);

        if (hasValue && deepEqual(val, inheritedVal)) {
          // User set a value that matches the inherited value
          inheritedProps.push(prop);
        } else if (!hasValue && hasInheritedValue) {
          // User didn't set a value but there's an inherited value
          inheritedProps.push(prop);
        }
        // Don't mark as inherited if both are empty/undefined
      });
      Object.assign(updatedExtraData, mergedNode);
      updatedExtraData.inherited = inheritedProps;
      updatedExtraData.kind = kindName;
      if (groupName !== undefined) {
        updatedExtraData.group = groupName;
      }

      // Update the UI to reflect the new inherited status
      this.updateInheritedBadges(inheritedProps);

      // Get the icon/role value
      const iconValue = (document.getElementById('panel-node-topoviewerrole-dropdown-container-filter-input') as HTMLInputElement | null)?.value || 'pe';

      const updatedData = {
        ...currentData,
        name: nodeProps.name,
        topoViewerRole: iconValue,
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
