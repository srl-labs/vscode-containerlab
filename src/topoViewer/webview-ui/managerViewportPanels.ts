// file: managerViewportPanels.ts

import cytoscape from 'cytoscape';
import { ManagerSaveTopo } from './managerSaveTopo';
import { extractNodeIcons } from './managerCytoscapeBaseStyles';
import { log } from '../logging/logger';
import { isSpecialNodeOrBridge } from '../utilities/specialNodes';


/**
 * ManagerViewportPanels handles the UI panels associated with the Cytoscape viewport.
 * It manages the node editor panel and toggles panels based on user interactions.
 */
export class ManagerViewportPanels {
  private saveManager: ManagerSaveTopo;
  private cy: cytoscape.Core;
  private isPanel01Cy = false;
  public nodeClicked: boolean = false;
  public edgeClicked: boolean = false;
  // Variables to store the current selection for dropdowns.
  private panelNodeEditorKind: string = "nokia_srlinux";
  private panelNodeEditorType: string = "";
  private panelNodeEditorUseDropdownForType: boolean = false;
  private panelNodeEditorTopoViewerRole: string = "pe";
  private nodeSchemaData: any = null;
  private panelNodeEditorNode: cytoscape.NodeSingular | null = null;

  // Dynamic entry counters for network and link editors
  private networkDynamicEntryCounters = new Map<string, number>();
  private linkDynamicEntryCounters = new Map<string, number>();

  /**
   * Generate a unique ID for dummy network nodes (dummy1, dummy2, ...).
   */
  private generateUniqueDummyId(): string {
    let counter = 1;
    while (this.cy.getElementById(`dummy${counter}`).length > 0) {
      counter++;
    }
    return `dummy${counter}`;
  }

  /**
   * Initialize global functions for dynamic entry management
   */
  private initializeDynamicEntryHandlers(): void {
    // Network Editor handlers
    (window as any).addNetworkVarEntry = () => this.addNetworkKeyValueEntry('vars', 'key', 'value');
    (window as any).addNetworkLabelEntry = () => this.addNetworkKeyValueEntry('labels', 'label-key', 'label-value');
    (window as any).removeNetworkEntry = (containerName: string, entryId: number) => {
      this.removeNetworkEntry(containerName, entryId);
      return false;
    };

    // Link Editor handlers
    (window as any).addLinkVarEntry = () => this.addLinkKeyValueEntry('vars', 'key', 'value');
    (window as any).addLinkLabelEntry = () => this.addLinkKeyValueEntry('labels', 'label-key', 'label-value');
    (window as any).removeLinkEntry = (containerName: string, entryId: number) => {
      this.removeLinkEntry(containerName, entryId);
      return false;
    };
  }

  /**
   * Add a key-value entry for Network Editor
   */
  private addNetworkKeyValueEntry(containerName: string, keyPlaceholder: string, valuePlaceholder: string): void {
    const container = document.getElementById(`panel-network-${containerName}-container`);
    if (!container) return;

    const count = (this.networkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.networkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute('data-field', `network-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute('data-field', `network-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dynamic-delete-btn';
    button.innerHTML = '<i class="fas fa-trash"></i>';
    button.onclick = () => this.removeNetworkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a key-value entry with value for Network Editor
   */
  private addNetworkKeyValueEntryWithValue(containerName: string, key: string, value: string): void {
    const container = document.getElementById(`panel-network-${containerName}-container`);
    if (!container) return;

    const count = (this.networkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.networkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.value = key;
    keyInput.setAttribute('data-field', `network-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.value = value;
    valueInput.setAttribute('data-field', `network-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dynamic-delete-btn';
    button.innerHTML = '<i class="fas fa-trash"></i>';
    button.onclick = () => this.removeNetworkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Remove a Network Editor entry
   */
  private removeNetworkEntry(containerName: string, entryId: number): void {
    const entry = document.getElementById(`network-${containerName}-entry-${entryId}`);
    if (entry) {
      entry.remove();
    }
  }

  /**
   * Add a key-value entry for Link Editor
   */
  private addLinkKeyValueEntry(containerName: string, keyPlaceholder: string, valuePlaceholder: string): void {
    const container = document.getElementById(`panel-link-ext-${containerName}-container`);
    if (!container) return;

    const count = (this.linkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.linkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `link-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute('data-field', `link-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute('data-field', `link-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dynamic-delete-btn';
    button.innerHTML = '<i class="fas fa-trash"></i>';
    button.onclick = () => this.removeLinkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Add a key-value entry with value for Link Editor
   */
  private addLinkKeyValueEntryWithValue(containerName: string, key: string, value: string): void {
    const container = document.getElementById(`panel-link-ext-${containerName}-container`);
    if (!container) return;

    const count = (this.linkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.linkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement('div');
    entryDiv.className = 'dynamic-entry';
    entryDiv.id = `link-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'input-field';
    keyInput.value = key;
    keyInput.setAttribute('data-field', `link-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'input-field';
    valueInput.value = value;
    valueInput.setAttribute('data-field', `link-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dynamic-delete-btn';
    button.innerHTML = '<i class="fas fa-trash"></i>';
    button.onclick = () => this.removeLinkEntry(containerName, count);

    entryDiv.appendChild(keyInput);
    entryDiv.appendChild(valueInput);
    entryDiv.appendChild(button);
    container.appendChild(entryDiv);
  }

  /**
   * Remove a Link Editor entry
   */
  private removeLinkEntry(containerName: string, entryId: number): void {
    const entry = document.getElementById(`link-${containerName}-entry-${entryId}`);
    if (entry) {
      entry.remove();
    }
  }

  /**
   * Creates an instance of ManagerViewportPanels.
   * @param saveManager - The ManagerSaveTopo instance.
   * @param cy - The Cytoscape instance.
   */
    constructor(
      saveManager: ManagerSaveTopo,
      cy: cytoscape.Core
    ) {
      this.saveManager = saveManager;
      this.cy = cy;
      this.initializeDynamicEntryHandlers(); // Initialize dynamic entry handlers
      this.toggleHidePanels("cy"); // Initialize the toggle for hiding panels.
    }

  /**
   * Toggle to hide UI panels.
   * If no node or edge was clicked, it hides overlay panels and viewport drawers.
   *
   * @param containerId - The ID of the Cytoscape container (e.g., "cy").
   */
  public toggleHidePanels(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      log.warn(`Cytoscape container not found: ${containerId}`);
      return;
    }

    container.addEventListener('click', async () => {
      log.debug('cy container clicked');

      // Execute toggle logic only when no node or edge was clicked.
      if (!this.nodeClicked && !this.edgeClicked) {
        if (!this.isPanel01Cy) {
          // Remove all overlay panels.
          const panelOverlays = document.getElementsByClassName('panel-overlay');
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = 'none';
          }

          // Hide viewport drawers.
          const viewportDrawers = document.getElementsByClassName('viewport-drawer');
          for (let i = 0; i < viewportDrawers.length; i++) {
            (viewportDrawers[i] as HTMLElement).style.display = 'none';
          }

          // Hide any elements with the class "ViewPortDrawer".
          const viewPortDrawerElements = document.getElementsByClassName('ViewPortDrawer');
          Array.from(viewPortDrawerElements).forEach((element) => {
            (element as HTMLElement).style.display = 'none';
          });
        } else {
          this.removeElementById('Panel-01');
          this.appendMessage('try to remove panel01-Cy');
        }
      }
      // Reset the click flags.
      this.nodeClicked = false;
      this.edgeClicked = false;
    });
  }

  /**
   * Displays the node editor panel for the provided node.
   * Removes any overlay panels, updates editor fields with the node's data,
   * and fetches additional configuration from a JSON schema.
   *
   * @param node - The Cytoscape node for which to show the editor.
   * @returns A promise that resolves when the panel is configured.
   */
  public async panelNodeEditor(node: cytoscape.NodeSingular): Promise<void> {
    // mark that a node interaction occurred so global click handler doesn't immediately hide the panel
    this.nodeClicked = true;
    this.panelNodeEditorNode = node;
    // Remove all overlay panels.
    const panelOverlays = document.getElementsByClassName("panel-overlay");
    Array.from(panelOverlays).forEach((panel) => {
      (panel as HTMLElement).style.display = "none";
    });

    log.debug(`panelNodeEditor - node ID: ${node.data('id')}`);

    // Set the node ID in the editor.
    const panelNodeEditorIdLabel = document.getElementById("panel-node-editor-id");
    if (panelNodeEditorIdLabel) {
      panelNodeEditorIdLabel.textContent = node.data("id");
    }

    // Set the node name in the editor.
    const panelNodeEditorNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    if (panelNodeEditorNameInput) {
      panelNodeEditorNameInput.value = node.data("name");
    }

    // Grab extraData from the node for populating fields.
    const extraData = node.data('extraData') || {};

    // Set the node image in the editor based on YAML data or fallback.
    const panelNodeEditorImageLabel = document.getElementById('panel-node-editor-image') as HTMLInputElement;
    if (panelNodeEditorImageLabel) {
      panelNodeEditorImageLabel.value = extraData.image ?? '';
    }

    // Set the node type in the editor.
    this.panelNodeEditorKind = extraData.kind || this.panelNodeEditorKind;
    this.panelNodeEditorType = extraData.type || '';
    this.panelNodeEditorUseDropdownForType = false;

    // Set the node group in the editor.
    const panelNodeEditorGroupLabel = document.getElementById("panel-node-editor-group") as HTMLInputElement;
    if (panelNodeEditorGroupLabel) {
      const parentNode = node.parent();
      const parentLabel = parentNode.nonempty() ? (parentNode.data('name') as string) : '';
      log.debug(`Parent Node Label: ${parentLabel}`);
      panelNodeEditorGroupLabel.value = parentLabel;
    }

    // Display the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "block";
    }

    // Fetch JSON schema.
    const url = window.schemaUrl;
    if (!url) throw new Error('Schema URL is undefined.');
    try {
        const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const jsonData = await response.json();

      this.nodeSchemaData = jsonData;

      // Get kind enums from the JSON schema.
      const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
      log.debug(`Kind Enum: ${JSON.stringify(kindOptions)}`);
      // Populate the kind dropdown.
      this.panelNodeEditorPopulateKindDropdown(kindOptions);

      const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(jsonData, `(${this.panelNodeEditorKind})`);
      this.panelNodeEditorSetupTypeField(typeOptions);

      // Then call the function:
      const nodeIcons = extractNodeIcons();
      log.debug(`Extracted node icons: ${JSON.stringify(nodeIcons)}`);

      this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);



      // Register the close button event.
      const panelNodeEditorCloseButton = document.getElementById("panel-node-editor-close-button");
      if (panelNodeEditorCloseButton && panelNodeEditor) {
        panelNodeEditorCloseButton.addEventListener("click", () => {
          panelNodeEditor.style.display = "none";
        });
      }

      // Register the save button event.
      const panelNodeEditorSaveButton = document.getElementById("panel-node-editor-save-button");
      if (panelNodeEditorSaveButton) {
        // Clone to remove any existing event listeners
        const newSaveButton = panelNodeEditorSaveButton.cloneNode(true) as HTMLElement;
        panelNodeEditorSaveButton.parentNode?.replaceChild(newSaveButton, panelNodeEditorSaveButton);
        newSaveButton.addEventListener("click", async () => {
          await this.updateNodeFromEditor(node);
          const suppressNotification = false;
          await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
        });
      }

      // Add global click handler to close dropdowns when clicking outside
      this.setupDropdownCloseHandler();
    } catch (error: any) {
      log.error(`Error fetching or processing JSON data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Updates the network editor fields based on the selected network type.
   * @param networkType - The selected network type.
   */
  private updateNetworkEditorFields(networkType: string): void {
    const interfaceInput = document.getElementById('panel-network-interface') as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll('.vscode-label')).find(el =>
      el.textContent?.includes('Interface') || el.textContent === 'Bridge Name'
    );
    const interfaceSection = interfaceInput?.closest('.form-group') as HTMLElement | null;

    // Update label and placeholder based on network type
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      if (interfaceSection) interfaceSection.style.display = 'block';
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Bridge Name';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'Enter bridge name';
      }
    } else if (networkType === 'dummy') {
      // Dummy nodes don't have interfaces
      if (interfaceSection) interfaceSection.style.display = 'none';
    } else if (networkType === 'host' || networkType === 'mgmt-net') {
      if (interfaceSection) interfaceSection.style.display = 'block';
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Host Interface';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'e.g., eth0, eth1';
      }
    } else if (networkType === 'macvlan') {
      if (interfaceSection) interfaceSection.style.display = 'block';
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Host Interface';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'Parent interface (e.g., eth0)';
      }
    } else if (networkType === 'vxlan' || networkType === 'vxlan-stitch') {
      if (interfaceSection) interfaceSection.style.display = 'block';
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Interface';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'VXLAN interface name';
      }
    } else {
      if (interfaceSection) interfaceSection.style.display = 'block';
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Interface';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'Enter interface name';
      }
    }

    // Show/hide extended property sections based on type
    const modeSection = document.getElementById('panel-network-mode-section') as HTMLElement | null;
    const vxlanSection = document.getElementById('panel-network-vxlan-section') as HTMLElement | null;

    if (modeSection) {
      modeSection.style.display = networkType === 'macvlan' ? 'block' : 'none';
    }
    if (vxlanSection) {
      vxlanSection.style.display = (networkType === 'vxlan' || networkType === 'vxlan-stitch') ? 'block' : 'none';
    }
  }

  /**
   * Displays the network editor panel for a cloud network node.
   * @param node - The Cytoscape node representing the network.
   */
  public async panelNetworkEditor(node: cytoscape.NodeSingular): Promise<void> {
    this.nodeClicked = true;

    const panelOverlays = document.getElementsByClassName('panel-overlay');
    Array.from(panelOverlays).forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });

    // Parse the node ID to extract network type and interface
    const nodeId = node.data('id') as string;
    const nodeData = node.data();
    const parts = nodeId.split(':');
    const networkType = nodeData.extraData?.kind || parts[0] || 'host';
    const interfaceName =
      networkType === 'bridge' || networkType === 'ovs-bridge'
        ? nodeId
        : networkType === 'dummy'
        ? '' // Dummy nodes don't have interfaces
        : parts[1] || 'eth1';

    // Set fields
    const idLabel = document.getElementById('panel-network-editor-id');
    if (idLabel) {
      idLabel.textContent = nodeId;
    }

    // Initialize network type filterable dropdown
    const networkTypeOptions = ['host', 'mgmt-net', 'macvlan', 'vxlan', 'vxlan-stitch', 'dummy', 'bridge', 'ovs-bridge'];
    this.createFilterableDropdown(
      'panel-network-type-dropdown-container',
      networkTypeOptions,
      networkType,
      (selectedValue: string) => {
        log.debug(`Network type ${selectedValue} selected`);
        this.updateNetworkEditorFields(selectedValue);

        // Re-validate when network type changes
        setTimeout(() => {
          const { isValid } = validateNetworkFields();
          const saveButton = document.getElementById('panel-network-editor-save-button') as HTMLButtonElement;
          if (saveButton) {
            saveButton.disabled = !isValid;
            saveButton.classList.toggle('opacity-50', !isValid);
            saveButton.classList.toggle('cursor-not-allowed', !isValid);
          }
        }, 100);
      },
      'Search for network type...'
    );

    const interfaceInput = document.getElementById('panel-network-interface') as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll('.vscode-label')).find(el =>
      el.textContent === 'Interface' || el.textContent === 'Bridge Name'
    );

    // Update field based on network type
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Bridge Name';
      }
      if (interfaceInput) {
        interfaceInput.value = nodeId; // For bridges, the ID is the bridge name
      }
    } else if (networkType === 'host' || networkType === 'mgmt-net') {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Host Interface';
      }
      if (interfaceInput) {
        interfaceInput.value = interfaceName;
      }
    } else if (networkType === 'macvlan') {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Host Interface';
      }
      if (interfaceInput) {
        interfaceInput.value = interfaceName;
      }
    } else if (networkType === 'dummy') {
      // Hide interface field for dummy nodes - handled by updateNetworkEditorFields
      this.updateNetworkEditorFields(networkType);
    } else {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Interface';
      }
      if (interfaceInput) {
        interfaceInput.value = interfaceName;
      }
    }

    // Initialize extended properties from node's extraData
    const extraData = nodeData.extraData || {};
    // Fallback: if adaptor didn’t seed node extraData for single-endpoint links,
    // derive from a connected edge’s extraData to prefill the panel
    const fallbackFromEdge = () => {
      const edges = node.connectedEdges();
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const ed = e.data('extraData') || {};
        // Prefer values that exist on the edge
        const fb: any = {};
        if (ed.extMac) fb.extMac = ed.extMac;
        if (ed.extMtu !== undefined && ed.extMtu !== '') fb.extMtu = ed.extMtu;
        if (ed.extVars) fb.extVars = ed.extVars;
        if (ed.extLabels) fb.extLabels = ed.extLabels;
        if (Object.keys(fb).length) return fb;
      }
      return {} as any;
    };
    const extraFallback = (!extraData.extMac && !extraData.extMtu && !extraData.extVars && !extraData.extLabels)
      ? fallbackFromEdge() : {};
    const macInput = document.getElementById('panel-network-mac') as HTMLInputElement | null;
    const mtuInput = document.getElementById('panel-network-mtu') as HTMLInputElement | null;
    const modeSelect = document.getElementById('panel-network-mode') as HTMLSelectElement | null;
    const remoteInput = document.getElementById('panel-network-remote') as HTMLInputElement | null;
    const vniInput = document.getElementById('panel-network-vni') as HTMLInputElement | null;
    const udpPortInput = document.getElementById('panel-network-udp-port') as HTMLInputElement | null;
    // Clear and reset dynamic entry containers
    const varsContainer = document.getElementById('panel-network-vars-container');
    const labelsContainer = document.getElementById('panel-network-labels-container');
    if (varsContainer) varsContainer.innerHTML = '';
    if (labelsContainer) labelsContainer.innerHTML = '';
    this.networkDynamicEntryCounters.clear();

    // Set initial values
    if (macInput) {
      // For network nodes, we might store MAC for the network side of the connection
      macInput.value = (extraData.extMac || extraFallback.extMac || '') as string;
    }
    if (mtuInput) {
      const mtuVal = (extraData.extMtu ?? extraFallback.extMtu);
      mtuInput.value = (mtuVal != null && mtuVal !== '') ? String(mtuVal) : '';
    }
    if (modeSelect) modeSelect.value = extraData.extMode || 'bridge';
    if (remoteInput) remoteInput.value = extraData.extRemote || '';
    if (vniInput) vniInput.value = extraData.extVni != null ? String(extraData.extVni) : '';
    if (udpPortInput) udpPortInput.value = extraData.extUdpPort != null ? String(extraData.extUdpPort) : '';

    // Load vars as dynamic entries
    const varsToLoad = (extraData.extVars && typeof extraData.extVars === 'object')
      ? extraData.extVars
      : (extraFallback.extVars && typeof extraFallback.extVars === 'object') ? extraFallback.extVars : undefined;
    if (varsToLoad) {
      Object.entries(varsToLoad).forEach(([key, value]) => {
        this.addNetworkKeyValueEntryWithValue('vars', key, String(value));
      });
    }

    // Load labels as dynamic entries
    const labelsToLoad = (extraData.extLabels && typeof extraData.extLabels === 'object')
      ? extraData.extLabels
      : (extraFallback.extLabels && typeof extraFallback.extLabels === 'object') ? extraFallback.extLabels : undefined;
    if (labelsToLoad) {
      Object.entries(labelsToLoad).forEach(([key, value]) => {
        this.addNetworkKeyValueEntryWithValue('labels', key, String(value));
      });
    }

    // Show/hide sections based on network type
    this.updateNetworkEditorFields(networkType);

    const panel = document.getElementById('panel-network-editor');
    if (panel) {
      panel.style.display = 'block';
    }

    const closeBtn = document.getElementById('panel-network-editor-close-button');
    if (closeBtn && panel) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    // Validation function for mandatory fields (showErrors controls visual feedback)
    const validateNetworkFields = (showErrors = false): { isValid: boolean; errors: string[] } => {
      const errors: string[] = [];
      const currentNetworkType = (document.getElementById('panel-network-type-dropdown-container-filter-input') as HTMLInputElement)?.value || networkType;

      // Clear all validation styling first
      ['panel-network-remote', 'panel-network-vni', 'panel-network-udp-port'].forEach(id => {
        document.getElementById(id)?.classList.remove('border-red-500', 'border-2');
      });

      // Hide error container by default
      const errorContainer = document.getElementById('panel-network-validation-errors');
      if (errorContainer && !showErrors) {
        errorContainer.style.display = 'none';
      }

      // Validate VXLAN mandatory fields
      if (currentNetworkType === 'vxlan' || currentNetworkType === 'vxlan-stitch') {
        const remoteInput = document.getElementById('panel-network-remote') as HTMLInputElement;
        const vniInput = document.getElementById('panel-network-vni') as HTMLInputElement;
        const udpPortInput = document.getElementById('panel-network-udp-port') as HTMLInputElement;

        if (!remoteInput?.value?.trim()) {
          errors.push('Remote IP is required');
          if (showErrors) remoteInput?.classList.add('border-red-500', 'border-2');
        }

        if (!vniInput?.value?.trim()) {
          errors.push('VNI is required');
          if (showErrors) vniInput?.classList.add('border-red-500', 'border-2');
        }

        if (!udpPortInput?.value?.trim()) {
          errors.push('UDP Port is required');
          if (showErrors) udpPortInput?.classList.add('border-red-500', 'border-2');
        }
      }

      // Update error display only if showErrors is true
      if (showErrors) {
        const errorList = document.getElementById('panel-network-validation-errors-list');
        if (errorContainer && errorList) {
          if (errors.length > 0) {
            errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
            errorContainer.style.display = 'block';
          } else {
            errorContainer.style.display = 'none';
          }
        }
      }

      return { isValid: errors.length === 0, errors };
    };

    // Add input listeners for real-time validation
    const vxlanInputs = ['panel-network-remote', 'panel-network-vni', 'panel-network-udp-port'];
    vxlanInputs.forEach(inputId => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.addEventListener('input', () => {
          const { isValid } = validateNetworkFields();
          const saveButton = document.getElementById('panel-network-editor-save-button') as HTMLButtonElement;
          if (saveButton) {
            saveButton.disabled = !isValid;
            saveButton.classList.toggle('opacity-50', !isValid);
            saveButton.classList.toggle('cursor-not-allowed', !isValid);
          }
        });
      }
    });

    const saveBtn = document.getElementById('panel-network-editor-save-button');
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);

      // Initial validation
      const { isValid: initialValid } = validateNetworkFields();
      (newSaveBtn as HTMLButtonElement).disabled = !initialValid;
      newSaveBtn.classList.toggle('opacity-50', !initialValid);
      newSaveBtn.classList.toggle('cursor-not-allowed', !initialValid);

      newSaveBtn.addEventListener('click', async () => {
        const { isValid, errors } = validateNetworkFields(true); // Show errors on save attempt
        if (!isValid) {
          console.error('Cannot save network node:', errors);
          return;
        }

        await this.updateNetworkFromEditor(node);
        const suppressNotification = false;
        await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);

        // Panel stays open after save for continued editing
      });
    }
  }


  /**
   * Displays the edge editor panel for the provided edge.
   * Removes any overlay panels, updates form fields with the edge's current source/target endpoints,
   * and wires up the Close/Save buttons.
   *
   * @param edge - The Cytoscape edge to edit.
   * @returns A promise that resolves when the panel is fully configured and shown.
   */
  public async panelEdgeEditor(edge: cytoscape.EdgeSingular): Promise<void> {
    try {
      // Unified editor with tabs (Basic | Extended)
      this.edgeClicked = true;
      const overlays = document.getElementsByClassName('panel-overlay');
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = 'none');

      const panel = document.getElementById('panel-link-editor');
      const basicTab = document.getElementById('panel-link-tab-basic');
      const extTab = document.getElementById('panel-link-tab-extended');
      const btnBasic = document.getElementById('panel-link-tab-btn-basic');
      const btnExt = document.getElementById('panel-link-tab-btn-extended');
      if (!panel || !basicTab || !extTab || !btnBasic || !btnExt) {
        log.error('panelEdgeEditor: missing unified tabbed panel elements');
        this.edgeClicked = false;
        return;
      }

      const source = edge.data('source') as string;
      const target = edge.data('target') as string;
      const sourceEP = (edge.data('sourceEndpoint') as string) || '';
      const targetEP = (edge.data('targetEndpoint') as string) || '';

      // Determine if this is a veth link (both endpoints are regular nodes, not network nodes)
      const sourceIsNetwork = isSpecialNodeOrBridge(source, this.cy);
      const targetIsNetwork = isSpecialNodeOrBridge(target, this.cy);
      const isVethLink = !sourceIsNetwork && !targetIsNetwork;

      // Check if network nodes are bridges (which allow endpoint configuration)
      const sourceNode = this.cy.getElementById(source);
      const targetNode = this.cy.getElementById(target);
      const sourceIsBridge = sourceNode.length > 0 &&
        (sourceNode.data('extraData')?.kind === 'bridge' || sourceNode.data('extraData')?.kind === 'ovs-bridge');
      const targetIsBridge = targetNode.length > 0 &&
        (targetNode.data('extraData')?.kind === 'bridge' || targetNode.data('extraData')?.kind === 'ovs-bridge');

      // Show panel
      (panel as HTMLElement).style.display = 'block';

      // Hide Extended tab for non-veth links
      if (!isVethLink) {
        btnExt.style.display = 'none';
      } else {
        btnExt.style.display = '';
      }

      // Tab selection: default to Basic tab
      const setTab = (which: 'basic' | 'extended') => {
        // Only allow extended tab for veth links
        if (which === 'extended' && !isVethLink) {
          which = 'basic';
        }
        (basicTab as HTMLElement).style.display = which === 'basic' ? 'block' : 'none';
        (extTab as HTMLElement).style.display = which === 'extended' ? 'block' : 'none';
        btnBasic.classList.toggle('tab-active', which === 'basic');
        btnExt.classList.toggle('tab-active', which === 'extended');
      };
      setTab('basic');
      btnBasic.addEventListener('click', () => setTab('basic'));
      if (isVethLink) {
        btnExt.addEventListener('click', () => setTab('extended'));
      }

      // Populate previews
      const updatePreview = (el: HTMLElement | null) => { if (el) el.innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`; };
      updatePreview(document.getElementById('panel-link-editor-id'));
      updatePreview(document.getElementById('panel-link-extended-editor-id'));

      // Basic tab wiring
      const srcInputBasic = document.getElementById('panel-link-editor-source-endpoint') as HTMLInputElement | null;
      const tgtInputBasic = document.getElementById('panel-link-editor-target-endpoint') as HTMLInputElement | null;

      // Handle network nodes - show network name and make readonly (except for bridges)
      if (srcInputBasic) {
        if (sourceIsNetwork && !sourceIsBridge) {
          // Non-bridge network nodes: show network name, make readonly
          srcInputBasic.value = source; // Show network name instead of empty endpoint
          srcInputBasic.readOnly = true;
          srcInputBasic.style.backgroundColor = 'var(--vscode-input-background)';
          srcInputBasic.style.opacity = '0.7';
        } else {
          // Regular nodes or bridge nodes: allow editing
          srcInputBasic.value = sourceEP;
          srcInputBasic.readOnly = false;
          srcInputBasic.style.backgroundColor = '';
          srcInputBasic.style.opacity = '';
        }
      }

      if (tgtInputBasic) {
        if (targetIsNetwork && !targetIsBridge) {
          // Non-bridge network nodes: show network name, make readonly
          tgtInputBasic.value = target; // Show network name instead of empty endpoint
          tgtInputBasic.readOnly = true;
          tgtInputBasic.style.backgroundColor = 'var(--vscode-input-background)';
          tgtInputBasic.style.opacity = '0.7';
        } else {
          // Regular nodes or bridge nodes: allow editing
          tgtInputBasic.value = targetEP;
          tgtInputBasic.readOnly = false;
          tgtInputBasic.style.backgroundColor = '';
          tgtInputBasic.style.opacity = '';
        }
      }
      const basicClose = document.getElementById('panel-link-editor-close-button');
      if (basicClose) {
        const freshClose = basicClose.cloneNode(true) as HTMLElement;
        basicClose.parentNode?.replaceChild(freshClose, basicClose);
        freshClose.addEventListener('click', () => { (panel as HTMLElement).style.display = 'none'; this.edgeClicked = false; }, { once: true });
      }
      const basicSave = document.getElementById('panel-link-editor-save-button');
      if (basicSave) {
        const freshSave = basicSave.cloneNode(true) as HTMLElement;
        basicSave.parentNode?.replaceChild(freshSave, basicSave);
        freshSave.addEventListener('click', async () => {
          try {
            // Update endpoints - allow for bridges, disallow for other network types
            const newSourceEP = (sourceIsNetwork && !sourceIsBridge) ? '' : ((document.getElementById('panel-link-editor-source-endpoint') as HTMLInputElement | null)?.value?.trim() || '');
            const newTargetEP = (targetIsNetwork && !targetIsBridge) ? '' : ((document.getElementById('panel-link-editor-target-endpoint') as HTMLInputElement | null)?.value?.trim() || '');
            edge.data({ sourceEndpoint: newSourceEP, targetEndpoint: newTargetEP });
            await this.saveManager.viewportButtonsSaveTopo(this.cy, /* suppressNotification */ false);
            // Keep panel open after save
          } catch (err) {
            log.error(`panelEdgeEditor basic save error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }); // Removed { once: true } to allow multiple saves
      }

      // Extended tab: reuse existing setup to wire fields and save
      await this.panelEdgeEditorExtended(edge);

      // Reset flag slight delay
      setTimeout(() => { this.edgeClicked = false; }, 100);
    } catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      this.edgeClicked = false;
    }
  }

  /**
   * Extended link editor panel that supports per-type extra fields and stores them under edge.data().extraData
   */
  private async panelEdgeEditorExtended(edge: cytoscape.EdgeSingular): Promise<void> {
    // Mark that an edge interaction occurred so global click handler doesn't immediately hide the panel
    this.edgeClicked = true;

    // Hide other overlays
    const overlays = document.getElementsByClassName('panel-overlay');
    Array.from(overlays).forEach(el => (el as HTMLElement).style.display = 'none');

    const panel = document.getElementById('panel-link-editor');
    const idLabel = document.getElementById('panel-link-extended-editor-id');
    // Use unified footer buttons from the link editor panel
    const closeBtn = document.getElementById('panel-link-editor-close-button');
    const saveBtn = document.getElementById('panel-link-editor-save-button');

    if (!panel || !idLabel || !closeBtn || !saveBtn) {
      log.error('panelEdgeEditorExtended: missing required DOM elements');
      this.edgeClicked = false;
      return;
    }

    // Populate link preview
    const source = edge.data('source') as string;
    const target = edge.data('target') as string;
    const sourceEP = (edge.data('sourceEndpoint') as string) || '';
    const targetEP = (edge.data('targetEndpoint') as string) || '';
    const updateLabel = () => {
      (idLabel as HTMLElement).innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`;
    };
    updateLabel();

    // Show panel
    panel.style.display = 'block';

    // Close button
    const freshClose = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(freshClose, closeBtn);
    freshClose.addEventListener('click', () => {
      panel.style.display = 'none';
      this.edgeClicked = false;
    }, { once: true });

    // Determine link type based on endpoints
    const extraData = edge.data('extraData') || {};

    // Helper to check if a node is special and get its type
    const getSpecialType = (nodeId: string): string | null => {
      if (nodeId === 'host' || nodeId.startsWith('host:')) return 'host';
      if (nodeId === 'mgmt-net' || nodeId.startsWith('mgmt-net:')) return 'mgmt-net';
      if (nodeId.startsWith('macvlan:')) return 'macvlan';
      if (nodeId.startsWith('vxlan:')) return 'vxlan';
      if (nodeId.startsWith('vxlan-stitch:')) return 'vxlan-stitch';
      if (nodeId.startsWith('dummy')) return 'dummy';
      return null;
    };

    // Determine type from endpoints
    const sourceType = getSpecialType(source);
    const targetType = getSpecialType(target);
    const inferredType = sourceType || targetType || 'veth';

    // Host interface is now specified in the network endpoint directly (e.g., host:eth1)
    // Extended properties for non-veth links are configured on the network node

    // Display the inferred type (read-only)
    const typeDisplayEl = document.getElementById('panel-link-ext-type-display') as HTMLElement | null;
    if (typeDisplayEl) {
      typeDisplayEl.textContent = inferredType;
    }

    // Field elements
    const srcMacEl = document.getElementById('panel-link-ext-src-mac') as HTMLInputElement | null;
    const tgtMacEl = document.getElementById('panel-link-ext-tgt-mac') as HTMLInputElement | null;
    const mtuEl = document.getElementById('panel-link-ext-mtu') as HTMLInputElement | null;

    // Clear and reset dynamic entry containers for link editor
    const varsContainer = document.getElementById('panel-link-ext-vars-container');
    const labelsContainer = document.getElementById('panel-link-ext-labels-container');
    if (varsContainer) varsContainer.innerHTML = '';
    if (labelsContainer) labelsContainer.innerHTML = '';
    this.linkDynamicEntryCounters.clear();

    // Show info message for non-veth links
    const nonVethInfo = document.getElementById('panel-link-ext-non-veth-info') as HTMLElement | null;
    const isVeth = inferredType === 'veth';
    if (nonVethInfo) {
      nonVethInfo.style.display = isVeth ? 'none' : 'block';
    }
    const banner = document.getElementById('panel-link-ext-errors') as HTMLElement | null;
    const bannerList = document.getElementById('panel-link-ext-errors-list') as HTMLElement | null;
    const setSaveDisabled = (disabled: boolean) => {
      const btn = document.getElementById('panel-link-editor-save-button') as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = disabled;
      btn.classList.toggle('opacity-50', disabled);
      btn.classList.toggle('cursor-not-allowed', disabled);
    };

    // Prefill from extraData (use consistent keys)
    if (srcMacEl) srcMacEl.value = extraData.extSourceMac || '';
    if (tgtMacEl) tgtMacEl.value = extraData.extTargetMac || '';
    // Only populate extra entry lists for veth links
    if (isVeth) {
      if (mtuEl) mtuEl.value = extraData.extMtu != null ? String(extraData.extMtu) : '';

      // Load vars as dynamic entries
      if (extraData.extVars && typeof extraData.extVars === 'object') {
        Object.entries(extraData.extVars).forEach(([key, value]) => {
          this.addLinkKeyValueEntryWithValue('vars', key, String(value));
        });
      }

      // Load labels as dynamic entries
      if (extraData.extLabels && typeof extraData.extLabels === 'object') {
        Object.entries(extraData.extLabels).forEach(([key, value]) => {
          this.addLinkKeyValueEntryWithValue('labels', key, String(value));
        });
      }
    }

    // Initial validation banner if adaptor provided errors
    const initialErrors: string[] = Array.isArray(extraData.extValidationErrors) ? extraData.extValidationErrors : [];
    const renderErrors = (errors: string[]) => {
      if (!banner || !bannerList) return;
      if (!errors.length) {
        banner.style.display = 'none';
        bannerList.innerHTML = '';
        setSaveDisabled(false);
        return;
      }
      banner.style.display = 'block';
      const labels: Record<string, string> = {
        'missing-host-interface': 'Host Interface is required for this type',
        'missing-remote': 'Remote (VTEP IP) is required',
        'missing-vni': 'VNI is required',
        'missing-udp-port': 'UDP Port is required',
        'invalid-veth-endpoints': 'veth requires two endpoints with node and interface',
        'invalid-endpoint': 'Endpoint with node and interface is required',
      };
      bannerList.innerHTML = errors.map(e => `<div>• ${labels[e] || e}</div>`).join('');
      setSaveDisabled(true);
    };
    renderErrors(initialErrors);

    // Live validation on inputs - only validate for veth links
    const validate = (): string[] => {
      const errs: string[] = [];
      // For non-veth links, no validation needed in link editor
      if (!isVeth) {
        return errs;
      }
      // For veth links, validate JSON fields if needed
      return errs;
    };

    const attachRevalidate = (el: HTMLElement | null) => { if (!el) return; el.addEventListener('input', () => { renderErrors(validate()); }); };
    [mtuEl].forEach(el => attachRevalidate(el as any));

    // Initial validation
    renderErrors(validate());

    // Save button - remove previous listeners and add new one
    const freshSave = saveBtn.cloneNode(true) as HTMLElement;
    saveBtn.parentNode?.replaceChild(freshSave, saveBtn);
    freshSave.addEventListener('click', async () => {
      try {
        // Also update basic endpoints using unified Save button
        const sourceIsNetwork = isSpecialNodeOrBridge(source, this.cy);
        const targetIsNetwork = isSpecialNodeOrBridge(target, this.cy);
        const sourceNode = this.cy.getElementById(source);
        const targetNode = this.cy.getElementById(target);
        const sourceIsBridge = sourceNode.length > 0 &&
          (sourceNode.data('extraData')?.kind === 'bridge' || sourceNode.data('extraData')?.kind === 'ovs-bridge');
        const targetIsBridge = targetNode.length > 0 &&
          (targetNode.data('extraData')?.kind === 'bridge' || targetNode.data('extraData')?.kind === 'ovs-bridge');
        const newSourceEP = (sourceIsNetwork && !sourceIsBridge) ? '' : ((document.getElementById('panel-link-editor-source-endpoint') as HTMLInputElement | null)?.value?.trim() || '');
        const newTargetEP = (targetIsNetwork && !targetIsBridge) ? '' : ((document.getElementById('panel-link-editor-target-endpoint') as HTMLInputElement | null)?.value?.trim() || '');
        edge.data({ sourceEndpoint: newSourceEP, targetEndpoint: newTargetEP });

        const errsNow = validate();
        if (errsNow.length) { renderErrors(errsNow); return; }
        // Use the inferred type for validation (only veth links editable here)

        // Collect vars from dynamic entries
        const varsEntries = document.querySelectorAll('[id^="link-vars-entry-"]');
        const parsedVars: Record<string, string> = {};
        varsEntries.forEach(entry => {
          const keyInput = entry.querySelector('[data-field="link-vars-key"]') as HTMLInputElement;
          const valueInput = entry.querySelector('[data-field="link-vars-value"]') as HTMLInputElement;
          if (keyInput && valueInput && keyInput.value.trim()) {
            parsedVars[keyInput.value.trim()] = valueInput.value;
          }
        });

        // Collect labels from dynamic entries
        const labelsEntries = document.querySelectorAll('[id^="link-labels-entry-"]');
        const parsedLabels: Record<string, string> = {};
        labelsEntries.forEach(entry => {
          const keyInput = entry.querySelector('[data-field="link-labels-key"]') as HTMLInputElement;
          const valueInput = entry.querySelector('[data-field="link-labels-value"]') as HTMLInputElement;
          if (keyInput && valueInput && keyInput.value.trim()) {
            parsedLabels[keyInput.value.trim()] = valueInput.value;
          }
        });

        const current = edge.data();
        const updatedExtra = { ...(current.extraData || {}) } as any;

        // For non-veth links, don't modify extended properties from link editor
        if (!isVeth) {
          // Just save without changes for non-veth links
          await this.saveManager.viewportButtonsSaveTopo(this.cy, /* suppressNotification */ false);
          // Keep panel open after save
          return;
        }

        // For veth links, update the properties
        if (srcMacEl) updatedExtra.extSourceMac = srcMacEl.value.trim() || undefined;
        if (tgtMacEl) updatedExtra.extTargetMac = tgtMacEl.value.trim() || undefined;
        if (mtuEl) updatedExtra.extMtu = mtuEl.value ? Number(mtuEl.value) : undefined;

        // Set vars and labels only if they have entries
        if (Object.keys(parsedVars).length > 0) {
          updatedExtra.extVars = parsedVars;
        } else {
          updatedExtra.extVars = undefined;
        }

        if (Object.keys(parsedLabels).length > 0) {
          updatedExtra.extLabels = parsedLabels;
        } else {
          updatedExtra.extLabels = undefined;
        }

        // No per-type fields in link editor anymore - they're in network editor

        // Apply to edge
        edge.data({ ...current, extraData: updatedExtra });

        // Persist
        await this.saveManager.viewportButtonsSaveTopo(this.cy, /* suppressNotification */ false);

        // Keep panel open after save
      } catch (err) {
        log.error(`panelEdgeEditorExtended: error during save: ${err instanceof Error ? err.message : String(err)}`);
      }
    }); // Removed { once: true } to allow multiple saves

    // Slight delay before allowing global click to close
    setTimeout(() => { this.edgeClicked = false; }, 100);
  }

  /**
   * Updates the provided Cytoscape node with data from the editor panel.
   * This method retrieves updated values from the editor and applies them to the node.
   *
   * @param node - The Cytoscape node to update.
   * @returns A promise that resolves when the node data has been updated.
   */
  public async updateNodeFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    // Ensure we target a single node even if a collection is passed.
    const targetNode: cytoscape.NodeSingular = (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;

    // Get the input values.
    const nodeNameInput = document.getElementById("panel-node-editor-name") as HTMLInputElement;
    const nodeImageInput = document.getElementById("panel-node-editor-image") as HTMLInputElement;
    const typeDropdownInput = document.getElementById("panel-node-type-dropdown-container-filter-input") as HTMLInputElement;
    const typeInput = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    // Retrieve dropdown selections.
    const kindDropdownInput = document.getElementById("panel-node-kind-dropdown-container-filter-input") as HTMLInputElement;
    const topoViewerRoleDropdownInput = document.getElementById("panel-node-topoviewerrole-dropdown-container-filter-input") as HTMLInputElement;

    // Retrieve current node data.
    const currentData = targetNode.data();
    const oldName = currentData.name as string;              // remember old name
    const newName = nodeNameInput.value;                    // the new name

    // Build updated extraData, preserving other fields.
    const typeValue = this.panelNodeEditorUseDropdownForType
      ? (typeDropdownInput ? typeDropdownInput.value || '' : '')
      : (typeInput ? typeInput.value : '');

    const updatedExtraData = {
      ...currentData.extraData,
      name: nodeNameInput.value,
      image: nodeImageInput.value,
      kind: kindDropdownInput ? kindDropdownInput.value : 'nokia_srlinux',
    };

    if (this.panelNodeEditorUseDropdownForType || typeValue.trim() !== '') {
      updatedExtraData.type = typeValue;
    } else if ('type' in updatedExtraData) {
      delete updatedExtraData.type;
    }

    // Build the updated data object.
    const updatedData = {
      ...currentData,
      name: nodeNameInput.value,
      topoViewerRole: topoViewerRoleDropdownInput ? topoViewerRoleDropdownInput.value : 'pe',
      extraData: updatedExtraData,
    };

    // Update the Cytoscape node data.
    targetNode.data(updatedData);
    log.debug(`Cytoscape node updated with new data: ${JSON.stringify(updatedData)}`);

    // If the node's name actually changed, update connected edges.
    if (oldName !== newName) {
      const edges = targetNode.connectedEdges();
      edges.forEach(edge => {
        const edgeData = edge.data();
        let modified = false;
        const updatedEdgeData: any = { ...edgeData };

        // Update sourceName if it pointed to our old name
        if (edgeData.sourceName === oldName) {
          updatedEdgeData.sourceName = newName;
          modified = true;
        }
        // Update targetName if it pointed to our old name
        if (edgeData.targetName === oldName) {
          updatedEdgeData.targetName = newName;
          modified = true;
        }
        if (modified) {
          edge.data(updatedEdgeData);
          log.debug(`Edge ${edge.id()} updated to reflect node rename: ${JSON.stringify(updatedEdgeData)}`);
        }
      });
    }

    // Optionally, hide the node editor panel.
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "none";
    }
  }

  /**
   * Updates a network node based on the network editor inputs.
   * @param node - The Cytoscape node representing the network.
   */
  public async updateNetworkFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    const targetNode: cytoscape.NodeSingular = (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;

    const networkTypeInput = document.getElementById('panel-network-type-dropdown-container-filter-input') as HTMLInputElement | null;
    const interfaceInput = document.getElementById('panel-network-interface') as HTMLInputElement | null;
    const macInput = document.getElementById('panel-network-mac') as HTMLInputElement | null;
    const mtuInput = document.getElementById('panel-network-mtu') as HTMLInputElement | null;
    const modeSelect = document.getElementById('panel-network-mode') as HTMLSelectElement | null;
    const remoteInput = document.getElementById('panel-network-remote') as HTMLInputElement | null;
    const vniInput = document.getElementById('panel-network-vni') as HTMLInputElement | null;
    const udpPortInput = document.getElementById('panel-network-udp-port') as HTMLInputElement | null;

    const currentData = targetNode.data();
    const oldId = currentData.id as string;
    const oldName = currentData.name as string;

    // Build new ID from network type and interface
    const networkType = networkTypeInput ? networkTypeInput.value : 'host';
    const interfaceName = interfaceInput ? interfaceInput.value : 'eth1';
    const isBridgeType = networkType === 'bridge' || networkType === 'ovs-bridge';
    const isDummyType = networkType === 'dummy';
    const newId = isBridgeType
      ? interfaceName
      : (isDummyType
        ? (oldId.startsWith('dummy') ? oldId : this.generateUniqueDummyId())
        : `${networkType}:${interfaceName}`);
    const newName = isDummyType ? 'dummy' : newId;

    // Collect extended properties
    const extendedData: any = { ...currentData.extraData };
    extendedData.kind = networkType;

    // Set new extended properties
    if (macInput && macInput.value) extendedData.extMac = macInput.value;
    if (mtuInput && mtuInput.value) extendedData.extMtu = Number(mtuInput.value);

    // Collect vars from dynamic entries
    const varsEntries = document.querySelectorAll('[id^="network-vars-entry-"]');
    const vars: Record<string, string> = {};
    varsEntries.forEach(entry => {
      const keyInput = entry.querySelector('[data-field="network-vars-key"]') as HTMLInputElement;
      const valueInput = entry.querySelector('[data-field="network-vars-value"]') as HTMLInputElement;
      if (keyInput && valueInput && keyInput.value.trim()) {
        vars[keyInput.value.trim()] = valueInput.value;
      }
    });
    if (Object.keys(vars).length > 0) {
      extendedData.extVars = vars;
    }

    // Collect labels from dynamic entries
    const labelsEntries = document.querySelectorAll('[id^="network-labels-entry-"]');
    const labels: Record<string, string> = {};
    labelsEntries.forEach(entry => {
      const keyInput = entry.querySelector('[data-field="network-labels-key"]') as HTMLInputElement;
      const valueInput = entry.querySelector('[data-field="network-labels-value"]') as HTMLInputElement;
      if (keyInput && valueInput && keyInput.value.trim()) {
        labels[keyInput.value.trim()] = valueInput.value;
      }
    });
    if (Object.keys(labels).length > 0) {
      extendedData.extLabels = labels;
    }

    // Type-specific properties
    if (modeSelect && modeSelect.value && networkType === 'macvlan') extendedData.extMode = modeSelect.value;
    if (remoteInput && remoteInput.value && (networkType === 'vxlan' || networkType === 'vxlan-stitch')) extendedData.extRemote = remoteInput.value;
    if (vniInput && vniInput.value && (networkType === 'vxlan' || networkType === 'vxlan-stitch')) extendedData.extVni = Number(vniInput.value);
    if (udpPortInput && udpPortInput.value && (networkType === 'vxlan' || networkType === 'vxlan-stitch')) extendedData.extUdpPort = Number(udpPortInput.value);

    // For host/mgmt-net/macvlan, store the host interface
    if ((networkType === 'host' || networkType === 'mgmt-net' || networkType === 'macvlan') && interfaceName) {
      extendedData.extHostInterface = interfaceName;
    }

    // If ID hasn't changed, just update the data
    if (oldId === newId) {
      const updatedData = {
        ...currentData,
        name: newName,
        topoViewerRole: (networkType === 'bridge' || networkType === 'ovs-bridge') ? 'bridge' : 'cloud',
        extraData: {
          ...extendedData,
          kind: networkType
        }
      };
      targetNode.data(updatedData);

      // Update connected edges with extended properties from the network node
      targetNode.connectedEdges().forEach(edge => {
        const edgeData = edge.data();
        const updatedEdgeData = {
          ...edgeData,
          extraData: {
            ...(edgeData.extraData || {}),
            ...this.getNetworkExtendedPropertiesForEdge(networkType, extendedData)
          }
        };
        edge.data(updatedEdgeData);
      });
    } else {
      // ID has changed - we need to recreate the node since Cytoscape IDs are immutable
      const position = targetNode.position();
      const connectedEdges = targetNode.connectedEdges().map(edge => {
        const edgeData = edge.data();
        return {
          id: edge.id(),
          source: edgeData.source,
          target: edgeData.target,
          sourceEndpoint: edgeData.sourceEndpoint,
          targetEndpoint: edgeData.targetEndpoint,
          data: edgeData,
          classes: edge.classes()
        };
      });

      // Remove the old node (this also removes connected edges)
      this.cy.remove(targetNode);

      // Create new node with new ID
      const newNodeData = {
        ...currentData,
        id: newId,
        name: newName,
        topoViewerRole: (networkType === 'bridge' || networkType === 'ovs-bridge') ? 'bridge' : 'cloud',
        extraData: {
          ...extendedData,
          kind: networkType
        }
      };

      this.cy.add({
        group: 'nodes',
        data: newNodeData,
        position: position
      });

      // Recreate edges with updated references
      connectedEdges.forEach(edgeInfo => {
        const newEdgeData = { ...edgeInfo.data };

        // Update source/target references
        if (newEdgeData.source === oldId) {
          newEdgeData.source = newId;
        }
        if (newEdgeData.target === oldId) {
          newEdgeData.target = newId;
        }

        // sourceName and targetName should also be updated
        if (newEdgeData.sourceName === oldName) {
          newEdgeData.sourceName = newName;
        }
        if (newEdgeData.targetName === oldName) {
          newEdgeData.targetName = newName;
        }

        // Add extended properties from the network node to the edge
        newEdgeData.extraData = {
          ...(newEdgeData.extraData || {}),
          ...this.getNetworkExtendedPropertiesForEdge(networkType, extendedData)
        };

        // Determine if edge should have stub-link class based on special endpoints
        let edgeClasses = edgeInfo.classes || [];
        const isStubLink = isSpecialNodeOrBridge(newEdgeData.source, this.cy) || isSpecialNodeOrBridge(newEdgeData.target, this.cy);

        // Ensure stub-link class is present for special endpoints
        if (isStubLink && !edgeClasses.includes('stub-link')) {
          edgeClasses = [...edgeClasses, 'stub-link'];
        }

        // Add the edge back
        this.cy.add({
          group: 'edges',
          data: newEdgeData,
          classes: edgeClasses.join(' ')
        });
      });
    }
  }

  /**
   * Gets the extended properties from a network node that should be applied to connected edges.
   * @param networkType - The type of network node
   * @param nodeExtraData - The extraData from the network node
   * @returns Extended properties to apply to the edge
   */
  private getNetworkExtendedPropertiesForEdge(networkType: string, nodeExtraData: any): any {
    const edgeExtData: any = {};

    // Transfer all relevant extended properties
    if (nodeExtraData.extMac !== undefined) edgeExtData.extMac = nodeExtraData.extMac;
    if (nodeExtraData.extMtu !== undefined) edgeExtData.extMtu = nodeExtraData.extMtu;
    if (nodeExtraData.extVars !== undefined) edgeExtData.extVars = nodeExtraData.extVars;
    if (nodeExtraData.extLabels !== undefined) edgeExtData.extLabels = nodeExtraData.extLabels;

    if (networkType === 'host' || networkType === 'mgmt-net' || networkType === 'macvlan') {
      if (nodeExtraData.extHostInterface !== undefined) edgeExtData.extHostInterface = nodeExtraData.extHostInterface;
    }

    if (networkType === 'macvlan') {
      if (nodeExtraData.extMode !== undefined) edgeExtData.extMode = nodeExtraData.extMode;
    }

    if (networkType === 'vxlan' || networkType === 'vxlan-stitch') {
      if (nodeExtraData.extRemote !== undefined) edgeExtData.extRemote = nodeExtraData.extRemote;
      if (nodeExtraData.extVni !== undefined) edgeExtData.extVni = nodeExtraData.extVni;
      if (nodeExtraData.extUdpPort !== undefined) edgeExtData.extUdpPort = nodeExtraData.extUdpPort;
    }

    // Set the link type based on the network type
    if (networkType !== 'bridge' && networkType !== 'ovs-bridge') {
      edgeExtData.extType = networkType;
    }

    return edgeExtData;
  }


  /**
   * Updates connected edge endpoints when a node's kind changes.
   * Only endpoints matching the old kind's pattern are updated.
   *
   * @param node - The node whose connected edges should be updated.
   * @param oldKind - The previous kind of the node.
   * @param newKind - The new kind of the node.
   */
  public updateNodeEndpointsForKindChange(
    node: cytoscape.NodeSingular,
    oldKind: string,
    newKind: string
  ): void {
    const ifaceMap = window.ifacePatternMapping || {};
    const oldPattern = ifaceMap[oldKind] || 'eth{n}';
    const newPattern = ifaceMap[newKind] || 'eth{n}';
    const nodeId = node.id();

    const placeholder = '__N__';
    const escaped = oldPattern
      .replace('{n}', placeholder)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(placeholder, '(\\d+)') + '$';
    const patternRegex = new RegExp(regexStr);

    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    edges.forEach(edge => {
      ['sourceEndpoint', 'targetEndpoint'].forEach(key => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
          (edge.data('target') === nodeId && key === 'targetEndpoint');
        if (!endpoint || !isNodeEndpoint) return;
        const match = endpoint.match(patternRegex);
        if (match) {
          const newEndpoint = newPattern.replace('{n}', match[1]);
          edge.data(key, newEndpoint);
        }
      });
    });
  }

  // --- Private helper methods ---

  /**
   * Extracts the kind enumeration options from the JSON schema.
   *
   * @param jsonData - The JSON schema data.
   * @returns An object containing the kindOptions array and the original schema data.
   * @throws Will throw an error if the JSON structure is invalid or 'kind' enum is not found.
   */
  private panelNodeEditorGetKindEnums(jsonData: any): { kindOptions: string[]; schemaData: any } {
    let kindOptions: string[] = [];
    if (jsonData && jsonData.definitions && jsonData.definitions['node-config']) {
      kindOptions = jsonData.definitions['node-config'].properties.kind.enum || [];
    } else {
      throw new Error("Invalid JSON structure or 'kind' enum not found");
    }
    return { kindOptions, schemaData: jsonData };
  }

  /**
   * Populates the kind dropdown with the provided options.
   *
   * @param options - An array of kind option strings.
   */
  private panelNodeEditorPopulateKindDropdown(options: string[]): void {
    this.createFilterableDropdown(
      'panel-node-kind-dropdown-container',
      options,
      this.panelNodeEditorKind,
      (selectedValue: string) => {
        const previousKind = this.panelNodeEditorKind;
        this.panelNodeEditorKind = selectedValue;
        log.debug(`${this.panelNodeEditorKind} selected`);

        const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(this.nodeSchemaData, `(${selectedValue})`);
        // Reset the stored type when kind changes
        this.panelNodeEditorType = "";
        this.panelNodeEditorSetupTypeField(typeOptions);

        if (this.panelNodeEditorNode && window.updateLinkEndpointsOnKindChange) {
          this.updateNodeEndpointsForKindChange(this.panelNodeEditorNode, previousKind, selectedValue);
        }

        const imageMap = window.imageMapping || {};
        const imageInput = document.getElementById('panel-node-editor-image') as HTMLInputElement;
        if (imageInput) {
          const mappedImage = imageMap[selectedValue];
          if (mappedImage !== undefined) {
            imageInput.value = mappedImage;
            imageInput.dispatchEvent(new Event('input'));
          } else if (mappedImage === undefined) {
            imageInput.value = '';
            imageInput.dispatchEvent(new Event('input'));
          }
        }
      },
      'Search for kind...'
    );
  }

  private panelNodeEditorSetupTypeField(options: string[]): void {
    const dropdownContainer = document.getElementById("panel-node-type-dropdown-container");
    const input = document.getElementById("panel-node-editor-type-input") as HTMLInputElement;

    if (!dropdownContainer || !input) {
      log.error('Type input elements not found in the DOM.');
      return;
    }

    if (options.length > 0) {
      dropdownContainer.style.display = "";
      input.style.display = "none";
      this.panelNodeEditorUseDropdownForType = true;
      // Ensure type matches available options
      if (!options.includes(this.panelNodeEditorType)) {
        this.panelNodeEditorType = options[0];
      }
      this.panelNodeEditorPopulateTypeDropdown(options);
    } else {
      dropdownContainer.style.display = "none";
      input.style.display = "";
      this.panelNodeEditorUseDropdownForType = false;
      input.value = this.panelNodeEditorType || "";
      input.oninput = () => {
        this.panelNodeEditorType = input.value;
      };
    }
  }

  private panelNodeEditorPopulateTypeDropdown(options: string[]): void {
    if (!options.includes(this.panelNodeEditorType)) {
      this.panelNodeEditorType = options.length > 0 ? options[0] : "";
    }

    this.createFilterableDropdown(
      'panel-node-type-dropdown-container',
      options,
      this.panelNodeEditorType,
      (selectedValue: string) => {
        this.panelNodeEditorType = selectedValue;
        log.debug(`Type ${this.panelNodeEditorType} selected`);
      },
      'Search for type...'
    );
  }

  /**
   * Populates the topoViewerRole dropdown with the provided options.
   *
   * @param options - An array of topoViewerRole option strings.
   */
  private panelNodeEditorPopulateTopoViewerRoleDropdown(options: string[]): void {
    this.createFilterableDropdown(
      'panel-node-topoviewerrole-dropdown-container',
      options,
      this.panelNodeEditorTopoViewerRole,
      (selectedValue: string) => {
        this.panelNodeEditorTopoViewerRole = selectedValue;
        log.debug(`${this.panelNodeEditorTopoViewerRole} selected`);
      },
      'Search for role...'
    );
  }

  /**
    * Displays the TopoViewer panel
    * Removes any overlay panels, updates form fields with the edge’s current source/target endpoints,
    *
    * @returns A promise that resolves when the panel is fully configured and shown.
    */
  public async panelAbout(): Promise<void> {
    try {
      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelTopoviewerAbout = document.getElementById("panel-topoviewer-about");

      if (!panelTopoviewerAbout) {
        log.error('panelTopoviewerAbout: missing required DOM elements');
        return;
      }

      // 3) Show the panel
      panelTopoviewerAbout.style.display = "block";

    }
    catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      // TODO: surface user-facing notification
    }
  }


  /**
   * Extracts type enumeration options from the JSON schema based on a kind pattern.
   *
   * @param jsonData - The JSON schema data.
   * @param pattern - A regex pattern (as a string) to match the kind property.
   * @returns An array of type enum strings.
   */
  private panelNodeEditorGetTypeEnumsByKindPattern(jsonData: any, pattern: string): string[] {
    // Extract the kind from the pattern (e.g., "(nokia_srlinux)" -> "nokia_srlinux")
    const kindMatch = pattern.match(/\(([^)]+)\)/);
    const kind = kindMatch ? kindMatch[1] : '';

    // Only return type options for Nokia kinds
    const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
    if (!nokiaKinds.includes(kind)) {
      return [];
    }

    if (
      jsonData &&
      jsonData.definitions &&
      jsonData.definitions['node-config'] &&
      jsonData.definitions['node-config'].allOf
    ) {
      for (const condition of jsonData.definitions['node-config'].allOf) {
        if (
          condition.if &&
          condition.if.properties &&
          condition.if.properties.kind &&
          condition.if.properties.kind.pattern === pattern
        ) {
          if (condition.then && condition.then.properties && condition.then.properties.type) {
            const typeProp = condition.then.properties.type;
            if (typeProp.enum) {
              return typeProp.enum;
            }
            if (Array.isArray(typeProp.anyOf)) {
              for (const sub of typeProp.anyOf) {
                if (sub.enum) {
                  return sub.enum;
                }
              }
            }
          }
        }
      }
    }
    return [];
  }

  /**
   * Displays and populates the node's parent group editor panel.
   *
   * @param newParentId - The new parent ID in the format "group:level".
   *
   * panelNodeEditorGroupEditor is not implemented here due to the complexity
   * of managing groups and the need for a more comprehensive UI handling.
   *
   */


  /**
   * Removes a DOM element by its ID.
   *
   * @param id - The ID of the element to remove.
   */
  private removeElementById(id: string): void {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
    }
  }

  /**
   * Appends or logs a message.
   *
   * @param message - The message to display.
   */
  private appendMessage(message: string): void {
    log.debug(message);
    // Optionally, integrate with a VS Code message sender here if needed.
  }

  /**
   * Sets the flag indicating whether a node was clicked.
   *
   * @param flag - True if a node was clicked; otherwise, false.
   */
  public setNodeClicked(flag: boolean): void {
    this.nodeClicked = flag;
  }

  /**
   * Sets the flag indicating whether an edge was clicked.
   *
   * @param flag - True if an edge was clicked; otherwise, false.
   */
  public setEdgeClicked(flag: boolean): void {
    this.edgeClicked = flag;
  }

  /**
   * Sets the flag for panel 01 state in the Cytoscape container.
   *
   * @param flag - True to enable panel 01; otherwise, false.
   */
  public setPanel01Cy(flag: boolean): void {
    this.isPanel01Cy = flag;
  }

  /**
   * Sets up a global click handler to close dropdowns when clicking outside.
   */
  private setupDropdownCloseHandler(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Check if click is outside all dropdowns
      const dropdowns = ['panel-node-kind-dropdown', 'panel-node-topoviewerrole-dropdown', 'panel-node-type-dropdown'];

      dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown && !dropdown.contains(target)) {
          dropdown.classList.remove('is-active');
          const content = dropdown.querySelector('.dropdown-menu');
          if (content) {
            content.classList.add('hidden');
          }
        }
      });
    });
  }

  /**
   * Creates a filterable dropdown with search functionality.
   * @param containerId - The ID of the container element
   * @param options - Array of options to display
   * @param currentValue - Currently selected value
   * @param onSelect - Callback function when an option is selected
   * @param placeholder - Placeholder text for the filter input
   */
  private createFilterableDropdown(
    containerId: string,
    options: string[],
    currentValue: string,
    onSelect: (value: string) => void, // eslint-disable-line no-unused-vars
    placeholder: string = 'Type to filter...'
  ): void {
    const container = document.getElementById(containerId);
    if (!container) {
      log.error(`Container ${containerId} not found`);
      return;
    }

    // Clear existing content
    container.innerHTML = '';

    // Create the filterable dropdown structure
    const dropdownHtml = `
      <div class="filterable-dropdown relative w-full">
        <div class="filterable-dropdown-input-container relative">
          <input 
            type="text" 
            class="input-field w-full pr-8" 
            placeholder="${placeholder}"
            value="${currentValue}"
            id="${containerId}-filter-input"
          />
          <i class="fas fa-angle-down absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer" 
             id="${containerId}-dropdown-arrow"></i>
        </div>
        <div class="filterable-dropdown-menu hidden absolute top-full left-0 mt-1 w-full max-h-40 overflow-y-auto z-[60] bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded shadow-lg" 
             id="${containerId}-dropdown-menu">
        </div>
      </div>
    `;

    container.innerHTML = dropdownHtml;

    const filterInput = document.getElementById(`${containerId}-filter-input`) as HTMLInputElement;
    const dropdownMenu = document.getElementById(`${containerId}-dropdown-menu`);
    const dropdownArrow = document.getElementById(`${containerId}-dropdown-arrow`);

    if (!filterInput || !dropdownMenu) {
      log.error(`Failed to create filterable dropdown elements for ${containerId}`);
      return;
    }

    // Function to populate dropdown options
    const populateOptions = (filteredOptions: string[]) => {
      dropdownMenu.innerHTML = '';

      filteredOptions.forEach(option => {
        const optionElement = document.createElement('a');
        optionElement.classList.add('dropdown-item', 'block', 'px-3', 'py-2', 'cursor-pointer');
        optionElement.style.color = 'var(--vscode-dropdown-foreground)';
        optionElement.style.backgroundColor = 'transparent';
        optionElement.style.fontSize = 'var(--vscode-font-size)';
        optionElement.style.fontFamily = 'var(--vscode-font-family)';
        optionElement.textContent = option;
        optionElement.href = '#';

        // Add hover effect
        optionElement.addEventListener('mouseenter', () => {
          optionElement.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        });
        optionElement.addEventListener('mouseleave', () => {
          if (!optionElement.classList.contains('bg-highlight')) {
            optionElement.style.backgroundColor = 'transparent';
          }
        });

        optionElement.addEventListener('click', (e) => {
          e.preventDefault();
          filterInput.value = option;
          dropdownMenu.classList.add('hidden');
          onSelect(option);
        });

        dropdownMenu.appendChild(optionElement);
      });
    };

    // Initial population
    populateOptions(options);

    // Filter functionality
    filterInput.addEventListener('input', () => {
      const filterValue = filterInput.value.toLowerCase();
      const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(filterValue)
      );
      populateOptions(filteredOptions);

      if (!dropdownMenu.classList.contains('hidden')) {
        // Keep dropdown open if it was already open
        dropdownMenu.classList.remove('hidden');
      }
    });

    // Show/hide dropdown on focus
    filterInput.addEventListener('focus', () => {
      dropdownMenu.classList.remove('hidden');
    });

    // Handle arrow click to toggle dropdown
    if (dropdownArrow) {
      dropdownArrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdownMenu.classList.contains('hidden')) {
          dropdownMenu.classList.remove('hidden');
          filterInput.focus();
        } else {
          dropdownMenu.classList.add('hidden');
        }
      });
    }

    // Close dropdown when clicking outside
    // Use setTimeout to prevent immediate closing when clicking the arrow
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the entire dropdown container
      if (!container.contains(target)) {
        setTimeout(() => {
          dropdownMenu.classList.add('hidden');
        }, 0);
      }
    });

    // Prevent closing when clicking inside the dropdown menu
    dropdownMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Handle keyboard navigation
    filterInput.addEventListener('keydown', (e) => {
      const items = dropdownMenu.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>;
      let currentIndex = -1;

      // Find currently highlighted item
      items.forEach((item, index) => {
        if (item.classList.contains('bg-highlight')) {
          currentIndex = index;
        }
      });

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          // Remove current highlight
          if (currentIndex >= 0) {
            items[currentIndex].classList.remove('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
          }
          // Add highlight to next item
          currentIndex = Math.min(currentIndex + 1, items.length - 1);
          if (items[currentIndex]) {
            items[currentIndex].classList.add('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
            // Scroll into view if needed
            items[currentIndex].scrollIntoView({ block: 'nearest' });
          }
          dropdownMenu.classList.remove('hidden');
          break;

        case 'ArrowUp':
          e.preventDefault();
          // Remove current highlight
          if (currentIndex >= 0) {
            items[currentIndex].classList.remove('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'transparent';
          }
          // Add highlight to previous item
          currentIndex = Math.max(currentIndex - 1, 0);
          if (items[currentIndex]) {
            items[currentIndex].classList.add('bg-highlight');
            (items[currentIndex] as HTMLElement).style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
            // Scroll into view if needed
            items[currentIndex].scrollIntoView({ block: 'nearest' });
          }
          dropdownMenu.classList.remove('hidden');
          break;

        case 'Enter':
          e.preventDefault();
          if (currentIndex >= 0 && items[currentIndex]) {
            const selectedValue = items[currentIndex].textContent || '';
            filterInput.value = selectedValue;
            dropdownMenu.classList.add('hidden');
            onSelect(selectedValue);
          }
          break;

        case 'Escape':
          dropdownMenu.classList.add('hidden');
          break;
      }
    });
  }
}
