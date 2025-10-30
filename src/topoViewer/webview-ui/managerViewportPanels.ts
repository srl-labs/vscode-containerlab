// file: managerViewportPanels.ts

import cytoscape from 'cytoscape';
import { ManagerSaveTopo } from './managerSaveTopo';
import { createFilterableDropdown } from './utilities/filterableDropdown';
import { extractNodeIcons } from './managerCytoscapeBaseStyles';
import { log } from '../logging/logger';
import { isSpecialNodeOrBridge } from '../utilities/specialNodes';
import {
  DEFAULT_INTERFACE_PATTERN,
  generateInterfaceName,
  getInterfaceIndex,
  parseInterfacePattern,
} from './utilities/interfacePatternUtils';


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

  // Common classes and IDs reused throughout this file
  private static readonly CLASS_DYNAMIC_ENTRY = 'dynamic-entry' as const;
  private static readonly CLASS_INPUT_FIELD = 'input-field' as const;
  private static readonly CLASS_DYNAMIC_DELETE_BTN = 'dynamic-delete-btn' as const;
  private static readonly CLASS_PANEL_OVERLAY = 'panel-overlay' as const;
  private static readonly CLASS_VIEWPORT_DRAWER = 'viewport-drawer' as const;
  private static readonly CLASS_VIEWPORT_DRAWER_ALT = 'ViewPortDrawer' as const;
  private static readonly CLASS_OPACITY_50 = 'opacity-50' as const;
  private static readonly CLASS_CURSOR_NOT_ALLOWED = 'cursor-not-allowed' as const;

  private static readonly DISPLAY_BLOCK = 'block' as const;
  private static readonly DISPLAY_NONE = 'none' as const;

  private static readonly ID_NETWORK_INTERFACE = 'panel-network-interface' as const;

  private static readonly ID_NETWORK_REMOTE = 'panel-network-remote' as const;
  private static readonly ID_NETWORK_VNI = 'panel-network-vni' as const;
  private static readonly ID_NETWORK_UDP_PORT = 'panel-network-udp-port' as const;
  private static readonly VXLAN_INPUT_IDS = [
    ManagerViewportPanels.ID_NETWORK_REMOTE,
    ManagerViewportPanels.ID_NETWORK_VNI,
    ManagerViewportPanels.ID_NETWORK_UDP_PORT,
  ] as const;

  private static readonly ID_LINK_EDITOR_SAVE_BUTTON = 'panel-link-editor-save-button' as const;
  private static readonly ID_LINK_EXT_MTU = 'panel-link-ext-mtu' as const;

  private static readonly ID_NETWORK_TYPE_DROPDOWN = 'panel-network-type-dropdown-container' as const;
  private static readonly ID_NETWORK_TYPE_FILTER_INPUT = 'panel-network-type-dropdown-container-filter-input' as const;
  private static readonly ID_NETWORK_SAVE_BUTTON = 'panel-network-editor-save-button' as const;
  private static readonly HTML_ICON_TRASH = '<i class="fas fa-trash"></i>' as const;
  private static readonly ATTR_DATA_FIELD = 'data-field' as const;

  private static readonly PH_SEARCH_NETWORK_TYPE = 'Search for network type...' as const;

  // Network type constants
  private static readonly TYPE_HOST = 'host' as const;
  private static readonly TYPE_MGMT = 'mgmt-net' as const;
  private static readonly TYPE_MACVLAN = 'macvlan' as const;
  private static readonly TYPE_VXLAN = 'vxlan' as const;
  private static readonly TYPE_VXLAN_STITCH = 'vxlan-stitch' as const;
  private static readonly TYPE_DUMMY = 'dummy' as const;
  private static readonly TYPE_BRIDGE = 'bridge' as const;
  private static readonly TYPE_OVS_BRIDGE = 'ovs-bridge' as const;

  private static readonly NETWORK_TYPE_OPTIONS = [
    ManagerViewportPanels.TYPE_HOST,
    ManagerViewportPanels.TYPE_MGMT,
    ManagerViewportPanels.TYPE_MACVLAN,
    ManagerViewportPanels.TYPE_VXLAN,
    ManagerViewportPanels.TYPE_VXLAN_STITCH,
    ManagerViewportPanels.TYPE_DUMMY,
    ManagerViewportPanels.TYPE_BRIDGE,
    ManagerViewportPanels.TYPE_OVS_BRIDGE,
  ] as const;

  private static readonly VX_TYPES = [
    ManagerViewportPanels.TYPE_VXLAN,
    ManagerViewportPanels.TYPE_VXLAN_STITCH,
  ] as const;
  private static readonly HOSTY_TYPES = [
    ManagerViewportPanels.TYPE_HOST,
    ManagerViewportPanels.TYPE_MGMT,
    ManagerViewportPanels.TYPE_MACVLAN,
  ] as const;
  private static readonly BRIDGE_TYPES = [
    ManagerViewportPanels.TYPE_BRIDGE,
    ManagerViewportPanels.TYPE_OVS_BRIDGE,
  ] as const;

  private static readonly LABEL_INTERFACE = 'Interface' as const;
  private static readonly LABEL_BRIDGE_NAME = 'Bridge Name' as const;
  private static readonly LABEL_HOST_INTERFACE = 'Host Interface' as const;

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
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = ManagerViewportPanels.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = ManagerViewportPanels.HTML_ICON_TRASH;
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
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = ManagerViewportPanels.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = ManagerViewportPanels.HTML_ICON_TRASH;
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
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `link-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `link-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `link-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = ManagerViewportPanels.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = ManagerViewportPanels.HTML_ICON_TRASH;
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
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `link-${containerName}-entry-${count}`;

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `link-${containerName}-key`);

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `link-${containerName}-value`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = ManagerViewportPanels.CLASS_DYNAMIC_DELETE_BTN;
    button.innerHTML = ManagerViewportPanels.HTML_ICON_TRASH;
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
   * Refreshes docker images from the backend with a timeout
   */
  private async refreshDockerImages(): Promise<void> {
    try {
      const messageSender = this.saveManager.getMessageSender();

      // Create a timeout promise that rejects after 2 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Docker image refresh timeout')), 2000);
      });

      // Race between the refresh and timeout
      const response: any = await Promise.race([
        messageSender.sendMessageToVscodeEndpointPost('refresh-docker-images', {}),
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
          const panelOverlays = document.getElementsByClassName(ManagerViewportPanels.CLASS_PANEL_OVERLAY);
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = 'none';
          }

          // Hide viewport drawers.
          const viewportDrawers = document.getElementsByClassName(ManagerViewportPanels.CLASS_VIEWPORT_DRAWER);
          for (let i = 0; i < viewportDrawers.length; i++) {
            (viewportDrawers[i] as HTMLElement).style.display = 'none';
          }

          // Hide any elements with the class "ViewPortDrawer".
          const viewPortDrawerElements = document.getElementsByClassName(ManagerViewportPanels.CLASS_VIEWPORT_DRAWER_ALT);
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
    this.nodeClicked = true;
    this.panelNodeEditorNode = node;
    this.hidePanelOverlays();
    this.populateNodeEditorBasics(node);
    const panel = this.showNodeEditorPanel();

    // Refresh docker images when opening node editor panel
    await this.refreshDockerImages();

    const url = window.schemaUrl;
    if (!url) throw new Error('Schema URL is undefined.');
    try {
      const jsonData = await this.fetchNodeSchema(url);
      this.nodeSchemaData = jsonData;
      this.populateKindAndType(jsonData);
      this.populateIconDropdown(extractNodeIcons());
      this.registerNodeEditorButtons(panel, node);
      this.setupDropdownCloseHandler();
    } catch (error: any) {
      log.error(`Error fetching or processing JSON data: ${error.message}`);
      throw error;
    }
  }

  private hidePanelOverlays(): void {
    const panelOverlays = document.getElementsByClassName(ManagerViewportPanels.CLASS_PANEL_OVERLAY);
    Array.from(panelOverlays).forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });
  }

  private populateNodeEditorBasics(node: cytoscape.NodeSingular): void {
    log.debug(`panelNodeEditor - node ID: ${node.data('id')}`);
    const idLabel = document.getElementById('panel-node-editor-id');
    if (idLabel) idLabel.textContent = node.data('id');
    const nameInput = document.getElementById('node-name') as HTMLInputElement;
    if (nameInput) nameInput.value = node.data('name');
    const extra = node.data('extraData') || {};
    this.panelNodeEditorKind = extra.kind || this.panelNodeEditorKind;
    this.panelNodeEditorType = extra.type || '';
    this.panelNodeEditorUseDropdownForType = false;
    this.panelNodeEditorTopoViewerRole = node.data('topoViewerRole') || 'pe';
  }

  private showNodeEditorPanel(): HTMLElement | null {
    const panel = document.getElementById('panel-node-editor');
    if (panel) panel.style.display = 'block';
    return panel;
  }

  private async fetchNodeSchema(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  }

  private populateKindAndType(jsonData: any): void {
    const { kindOptions } = this.panelNodeEditorGetKindEnums(jsonData);
    this.panelNodeEditorPopulateKindDropdown(kindOptions);
    const typeOptions = this.panelNodeEditorGetTypeEnumsByKindPattern(jsonData, `(${this.panelNodeEditorKind})`);
    this.panelNodeEditorSetupTypeField(typeOptions);
  }

  private populateIconDropdown(nodeIcons: string[]): void {
    const iconContainer = document.getElementById('panel-node-topoviewerrole-dropdown-container');
    if (!iconContainer) {
      log.error('Icon dropdown container not found in DOM!');
      return;
    }
    this.panelNodeEditorPopulateTopoViewerRoleDropdown(nodeIcons);
  }

  private registerNodeEditorButtons(panel: HTMLElement | null, node: cytoscape.NodeSingular): void {
    const closeBtn = document.getElementById('panel-node-editor-cancel');
    if (closeBtn && panel) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
      });
    }

    const saveBtn = document.getElementById('panel-node-editor-save');
    if (saveBtn) {
      const newSave = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSave, saveBtn);
      newSave.addEventListener('click', async () => {
        await this.updateNodeFromEditor(node);
        await this.saveManager.saveTopo(this.cy, false);
      });
    }
  }

  /**
  * Updates the network editor fields based on the selected network type.
  * @param networkType - The selected network type.
  */
  private updateNetworkEditorFields(networkType: string): void {
    const interfaceInput = document.getElementById(ManagerViewportPanels.ID_NETWORK_INTERFACE) as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll('.vscode-label')).find(el =>
      el.textContent?.includes(ManagerViewportPanels.LABEL_INTERFACE) || el.textContent === ManagerViewportPanels.LABEL_BRIDGE_NAME
    );
    const interfaceSection = interfaceInput?.closest('.form-group') as HTMLElement | null;

    const cfg = this.getInterfaceFieldConfig(networkType);
    if (interfaceSection) interfaceSection.style.display = cfg.showInterface ? ManagerViewportPanels.DISPLAY_BLOCK : ManagerViewportPanels.DISPLAY_NONE;
    if (interfaceLabel) interfaceLabel.textContent = cfg.label;
    if (interfaceInput) interfaceInput.placeholder = cfg.placeholder;

    this.toggleExtendedSections(networkType);
  }

  private getInterfaceFieldConfig(networkType: string): { label: string; placeholder: string; showInterface: boolean } {
    const base: { label: string; placeholder: string; showInterface: boolean } = {
      label: ManagerViewportPanels.LABEL_INTERFACE,
      placeholder: 'Enter interface name',
      showInterface: true,
    };
    const map: Record<string, Partial<typeof base>> = {
      [ManagerViewportPanels.TYPE_BRIDGE]: { label: ManagerViewportPanels.LABEL_BRIDGE_NAME, placeholder: 'Enter bridge name' },
      [ManagerViewportPanels.TYPE_OVS_BRIDGE]: { label: ManagerViewportPanels.LABEL_BRIDGE_NAME, placeholder: 'Enter bridge name' },
      [ManagerViewportPanels.TYPE_DUMMY]: { showInterface: false },
      [ManagerViewportPanels.TYPE_HOST]: { label: ManagerViewportPanels.LABEL_HOST_INTERFACE, placeholder: 'e.g., eth0, eth1' },
      [ManagerViewportPanels.TYPE_MGMT]: { label: ManagerViewportPanels.LABEL_HOST_INTERFACE, placeholder: 'e.g., eth0, eth1' },
      [ManagerViewportPanels.TYPE_MACVLAN]: { label: ManagerViewportPanels.LABEL_HOST_INTERFACE, placeholder: 'Parent interface (e.g., eth0)' },
      [ManagerViewportPanels.TYPE_VXLAN]: { label: ManagerViewportPanels.LABEL_INTERFACE, placeholder: 'VXLAN interface name' },
      [ManagerViewportPanels.TYPE_VXLAN_STITCH]: { label: ManagerViewportPanels.LABEL_INTERFACE, placeholder: 'VXLAN interface name' }
    };
    return { ...base, ...(map[networkType] || {}) };
  }

  private toggleExtendedSections(networkType: string): void {
    const modeSection = document.getElementById('panel-network-mode-section') as HTMLElement | null;
    const vxlanSection = document.getElementById('panel-network-vxlan-section') as HTMLElement | null;
    if (modeSection)
      modeSection.style.display = (networkType === ManagerViewportPanels.TYPE_MACVLAN)
        ? ManagerViewportPanels.DISPLAY_BLOCK
        : ManagerViewportPanels.DISPLAY_NONE;
    if (vxlanSection)
      vxlanSection.style.display = ManagerViewportPanels.VX_TYPES.includes(networkType as any)
        ? ManagerViewportPanels.DISPLAY_BLOCK
        : ManagerViewportPanels.DISPLAY_NONE;
  }

  /**
   * Initialize the network type dropdown and handle re-validation when the selection changes.
   */
  private initializeNetworkTypeDropdown(networkType: string): void {
    const networkTypeOptions = [...ManagerViewportPanels.NETWORK_TYPE_OPTIONS];
    createFilterableDropdown(
      ManagerViewportPanels.ID_NETWORK_TYPE_DROPDOWN,
      networkTypeOptions,
      networkType,
      (selectedValue: string) => {
        log.debug(`Network type ${selectedValue} selected`);
        this.updateNetworkEditorFields(selectedValue);

        // Re-validate when network type changes
        setTimeout(() => {
          const { isValid } = this.validateNetworkFields(selectedValue);
          const saveButton = document.getElementById(ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON) as HTMLButtonElement;
          if (saveButton) {
            saveButton.disabled = !isValid;
            saveButton.classList.toggle(ManagerViewportPanels.CLASS_OPACITY_50, !isValid);
            saveButton.classList.toggle(ManagerViewportPanels.CLASS_CURSOR_NOT_ALLOWED, !isValid);
          }
        }, 100);
      },
      ManagerViewportPanels.PH_SEARCH_NETWORK_TYPE
    );
  }

  /**
   * Configure the interface field based on the selected network type.
   */
  private configureInterfaceField(networkType: string, nodeId: string, interfaceName: string): void {
    if (networkType === ManagerViewportPanels.TYPE_DUMMY) return; // Dummy nodes don't have interfaces

    const interfaceInput = document.getElementById(ManagerViewportPanels.ID_NETWORK_INTERFACE) as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll('.vscode-label')).find(el =>
      el.textContent === ManagerViewportPanels.LABEL_INTERFACE || el.textContent === ManagerViewportPanels.LABEL_BRIDGE_NAME
    );

    const isBridge = ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any);
    const isHostLike = ManagerViewportPanels.HOSTY_TYPES.includes(networkType as any);

    let labelText: string = ManagerViewportPanels.LABEL_INTERFACE;
    if (isBridge) labelText = ManagerViewportPanels.LABEL_BRIDGE_NAME;
    else if (isHostLike) labelText = ManagerViewportPanels.LABEL_HOST_INTERFACE;
    const inputValue = isBridge ? nodeId : interfaceName;

    if (interfaceLabel) interfaceLabel.textContent = labelText;
    if (interfaceInput) interfaceInput.value = inputValue;
  }

  /**
   * Populate extended properties for the network node editor.
   */
  private populateNetworkExtendedProperties(node: cytoscape.NodeSingular): void {
    const extraData = node.data().extraData || {};
    const extraFallback = this.getNetworkExtraFallback(node, extraData);

    this.resetNetworkDynamicEntries();

    this.setInputValue('panel-network-mac', extraData.extMac ?? extraFallback.extMac);
    this.setInputValue('panel-network-mtu', extraData.extMtu ?? extraFallback.extMtu);
    const modeSelect = document.getElementById('panel-network-mode') as HTMLSelectElement | null;
    if (modeSelect) modeSelect.value = extraData.extMode || ManagerViewportPanels.TYPE_BRIDGE;
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_REMOTE, extraData.extRemote);
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_VNI, extraData.extVni);
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_UDP_PORT, extraData.extUdpPort);

    this.loadNetworkDynamicEntries('vars', extraData.extVars || extraFallback.extVars);
    this.loadNetworkDynamicEntries('labels', extraData.extLabels || extraFallback.extLabels);
  }

  private getNetworkExtraFallback(node: cytoscape.NodeSingular, extraData: any): any {
    if (extraData.extMac || extraData.extMtu || extraData.extVars || extraData.extLabels) return {};
    const edges = node.connectedEdges();
    for (const e of edges) {
      const ed = e.data('extraData') || {};
      const fb: any = {};
      if (ed.extMac) fb.extMac = ed.extMac;
      if (ed.extMtu !== undefined && ed.extMtu !== '') fb.extMtu = ed.extMtu;
      if (ed.extVars) fb.extVars = ed.extVars;
      if (ed.extLabels) fb.extLabels = ed.extLabels;
      if (Object.keys(fb).length) return fb;
    }
    return {};
  }

  private setInputValue(id: string, value: any): void {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.value = value != null ? String(value) : '';
  }

  private resetNetworkDynamicEntries(): void {
    const varsContainer = document.getElementById('panel-network-vars-container');
    const labelsContainer = document.getElementById('panel-network-labels-container');
    if (varsContainer) varsContainer.innerHTML = '';
    if (labelsContainer) labelsContainer.innerHTML = '';
    this.networkDynamicEntryCounters.clear();
  }

  private loadNetworkDynamicEntries(type: 'vars' | 'labels', data?: Record<string, any>): void {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([key, value]) => {
      this.addNetworkKeyValueEntryWithValue(type, key, String(value));
    });
  }

  /**
   * Set up validation listeners and save button behavior for the network editor.
   */
  private setupNetworkValidation(networkType: string, node: cytoscape.NodeSingular): void {
    const vxlanInputs = ManagerViewportPanels.VXLAN_INPUT_IDS;
    vxlanInputs.forEach(inputId => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.addEventListener('input', () => {
          const { isValid } = this.validateNetworkFields(networkType);
          const saveButton = document.getElementById(ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON) as HTMLButtonElement;
          if (saveButton) {
            saveButton.disabled = !isValid;
            saveButton.classList.toggle(ManagerViewportPanels.CLASS_OPACITY_50, !isValid);
            saveButton.classList.toggle(ManagerViewportPanels.CLASS_CURSOR_NOT_ALLOWED, !isValid);
          }
        });
      }
    });

    const saveBtn = document.getElementById(ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON);
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);

      const { isValid: initialValid } = this.validateNetworkFields(networkType);
      (newSaveBtn as HTMLButtonElement).disabled = !initialValid;
      newSaveBtn.classList.toggle(ManagerViewportPanels.CLASS_OPACITY_50, !initialValid);
      newSaveBtn.classList.toggle(ManagerViewportPanels.CLASS_CURSOR_NOT_ALLOWED, !initialValid);

      newSaveBtn.addEventListener('click', async () => {
        const { isValid, errors } = this.validateNetworkFields(networkType, true);
        if (!isValid) {
          console.error('Cannot save network node:', errors);
          return;
        }

        await this.updateNetworkFromEditor(node);
        const suppressNotification = false;
        await this.saveManager.saveTopo(this.cy, suppressNotification);
      });
    }
  }

  /**
   * Validate network editor fields. When showErrors is true, highlight missing values.
   */
  private validateNetworkFields(networkType: string, showErrors = false): { isValid: boolean; errors: string[] } {
    const currentType = (document.getElementById(ManagerViewportPanels.ID_NETWORK_TYPE_FILTER_INPUT) as HTMLInputElement)?.value || networkType;
    this.clearNetworkValidationStyles();
    const errors = this.collectNetworkErrors(currentType, showErrors);
    if (showErrors) this.displayNetworkValidationErrors(errors); else this.hideNetworkValidationErrors();
    return { isValid: errors.length === 0, errors };
  }

  private clearNetworkValidationStyles(): void {
    ManagerViewportPanels.VXLAN_INPUT_IDS.forEach(id => {
      document.getElementById(id)?.classList.remove('border-red-500', 'border-2');
    });
  }

  private collectNetworkErrors(currentType: string, showErrors: boolean): string[] {
    if (!(ManagerViewportPanels.VX_TYPES as readonly string[]).includes(currentType)) return [];
    const fields = [
      { id: ManagerViewportPanels.ID_NETWORK_REMOTE, msg: 'Remote IP is required' },
      { id: ManagerViewportPanels.ID_NETWORK_VNI, msg: 'VNI is required' },
      { id: ManagerViewportPanels.ID_NETWORK_UDP_PORT, msg: 'UDP Port is required' }
    ];
    const errors: string[] = [];
    fields.forEach(({ id, msg }) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (!el?.value?.trim()) {
        errors.push(msg);
        if (showErrors) el?.classList.add('border-red-500', 'border-2');
      }
    });
    return errors;
  }

  private displayNetworkValidationErrors(errors: string[]): void {
    const errorContainer = document.getElementById('panel-network-validation-errors');
    const errorList = document.getElementById('panel-network-validation-errors-list');
    if (!errorContainer || !errorList) return;
    if (errors.length > 0) {
      errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
      errorContainer.style.display = 'block';
    } else {
      errorContainer.style.display = 'none';
    }
  }

  private hideNetworkValidationErrors(): void {
    const errorContainer = document.getElementById('panel-network-validation-errors');
    if (errorContainer) errorContainer.style.display = 'none';
  }

  /**
   * Displays the network editor panel for a cloud network node.
   * @param node - The Cytoscape node representing the network.
   */
  public async panelNetworkEditor(node: cytoscape.NodeSingular): Promise<void> {
    this.nodeClicked = true;

    const panelOverlays = document.getElementsByClassName(ManagerViewportPanels.CLASS_PANEL_OVERLAY);
    Array.from(panelOverlays).forEach(panel => {
      (panel as HTMLElement).style.display = 'none';
    });

    const nodeId = node.data('id') as string;
    const nodeData = node.data();
    const parts = nodeId.split(':');
    const networkType = nodeData.extraData?.kind || parts[0] || ManagerViewportPanels.TYPE_HOST;
    let interfaceName: string;
    if (ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) {
      interfaceName = nodeId;
    } else if (networkType === ManagerViewportPanels.TYPE_DUMMY) {
      interfaceName = '';
    } else {
      interfaceName = parts[1] || 'eth1';
    }

    const idLabel = document.getElementById('panel-network-editor-id');
    if (idLabel) {
      idLabel.textContent = nodeId;
    }

    this.initializeNetworkTypeDropdown(networkType);
    this.configureInterfaceField(networkType, nodeId, interfaceName);
    this.populateNetworkExtendedProperties(node);
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

    this.setupNetworkValidation(networkType, node);
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
      this.edgeClicked = true;
      this.hideAllPanels();
      const elems = this.getEdgeEditorElements();
      if (!elems) { this.edgeClicked = false; return; }

      const ctx = this.getEdgeContext(edge);
      this.showEdgePanel(elems.panel, ctx.isVethLink, elems.btnExt);
      this.setupEdgeTabs(elems, ctx.isVethLink);
      this.populateEdgePreviews(edge);
      this.setupBasicTab(edge, ctx, elems.panel);

      await this.panelEdgeEditorExtended(edge);
      setTimeout(() => { this.edgeClicked = false; }, 100);
    } catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      this.edgeClicked = false;
    }
  }

  private hideAllPanels(): void {
    const overlays = document.getElementsByClassName(ManagerViewportPanels.CLASS_PANEL_OVERLAY);
    Array.from(overlays).forEach(el => (el as HTMLElement).style.display = 'none');
  }

  private getEdgeEditorElements(): { panel: HTMLElement; basicTab: HTMLElement; extTab: HTMLElement; btnBasic: HTMLElement; btnExt: HTMLElement } | null {
    const panel = document.getElementById('panel-link-editor') as HTMLElement | null;
    const basicTab = document.getElementById('panel-link-tab-basic') as HTMLElement | null;
    const extTab = document.getElementById('panel-link-tab-extended') as HTMLElement | null;
    const btnBasic = document.getElementById('panel-link-tab-btn-basic') as HTMLElement | null;
    const btnExt = document.getElementById('panel-link-tab-btn-extended') as HTMLElement | null;
    if (!panel || !basicTab || !extTab || !btnBasic || !btnExt) {
      log.error('panelEdgeEditor: missing unified tabbed panel elements');
      return null;
    }
    return { panel, basicTab, extTab, btnBasic, btnExt };
  }

  private getEdgeContext(edge: cytoscape.EdgeSingular) {
    const source = edge.data('source') as string;
    const target = edge.data('target') as string;
    const sourceEP = (edge.data('sourceEndpoint') as string) || '';
    const targetEP = (edge.data('targetEndpoint') as string) || '';
    const sourceIsNetwork = isSpecialNodeOrBridge(source, this.cy);
    const targetIsNetwork = isSpecialNodeOrBridge(target, this.cy);
    const isVethLink = !sourceIsNetwork && !targetIsNetwork;
    const sourceNode = this.cy.getElementById(source);
    const targetNode = this.cy.getElementById(target);
    const sourceIsBridge = sourceNode.length > 0 && ManagerViewportPanels.BRIDGE_TYPES.includes(sourceNode.data('extraData')?.kind as any);
    const targetIsBridge = targetNode.length > 0 && ManagerViewportPanels.BRIDGE_TYPES.includes(targetNode.data('extraData')?.kind as any);
    return { source, target, sourceEP, targetEP, sourceIsNetwork, targetIsNetwork, isVethLink, sourceIsBridge, targetIsBridge };
  }

  private showEdgePanel(panel: HTMLElement, isVethLink: boolean, btnExt: HTMLElement): void {
    panel.style.display = 'block';
    btnExt.style.display = isVethLink ? '' : 'none';
  }

  private setupEdgeTabs(elems: { panel: HTMLElement; basicTab: HTMLElement; extTab: HTMLElement; btnBasic: HTMLElement; btnExt: HTMLElement }, isVethLink: boolean): void {
    const { basicTab, extTab, btnBasic, btnExt } = elems;
    const setTab = (which: 'basic' | 'extended') => {
      if (which === 'extended' && !isVethLink) which = 'basic';
      basicTab.style.display = which === 'basic' ? 'block' : 'none';
      extTab.style.display = which === 'extended' ? 'block' : 'none';
      btnBasic.classList.toggle('tab-active', which === 'basic');
      btnExt.classList.toggle('tab-active', which === 'extended');
    };
    setTab('basic');
    btnBasic.addEventListener('click', () => setTab('basic'));
    if (isVethLink) btnExt.addEventListener('click', () => setTab('extended'));
  }

  private populateEdgePreviews(edge: cytoscape.EdgeSingular): void {
    const source = edge.data('source') as string;
    const target = edge.data('target') as string;
    const sourceEP = (edge.data('sourceEndpoint') as string) || '';
    const targetEP = (edge.data('targetEndpoint') as string) || '';
    const updatePreview = (el: HTMLElement | null) => { if (el) el.innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`; };
    updatePreview(document.getElementById('panel-link-editor-id'));
    updatePreview(document.getElementById('panel-link-extended-editor-id'));
  }

  private setupBasicTab(edge: cytoscape.EdgeSingular, ctx: any, panel: HTMLElement): void {
    const srcInput = document.getElementById('panel-link-editor-source-endpoint') as HTMLInputElement | null;
    const tgtInput = document.getElementById('panel-link-editor-target-endpoint') as HTMLInputElement | null;
    this.configureEndpointInput(srcInput, ctx.sourceIsNetwork, ctx.sourceIsBridge, ctx.sourceEP, ctx.source);
    this.configureEndpointInput(tgtInput, ctx.targetIsNetwork, ctx.targetIsBridge, ctx.targetEP, ctx.target);
    this.setupBasicTabButtons(panel, edge, ctx, srcInput, tgtInput);
  }

  private configureEndpointInput(
    input: HTMLInputElement | null,
    isNetwork: boolean,
    isBridge: boolean,
    endpoint: string,
    networkName: string
  ): void {
    if (!input) return;
    if (isNetwork && !isBridge) {
      input.value = networkName;
      input.readOnly = true;
      input.style.backgroundColor = 'var(--vscode-input-background)';
      input.style.opacity = '0.7';
    } else {
      input.value = endpoint;
      input.readOnly = false;
      input.style.backgroundColor = '';
      input.style.opacity = '';
    }
  }

  private setupBasicTabButtons(panel: HTMLElement, edge: cytoscape.EdgeSingular, ctx: any, srcInput: HTMLInputElement | null, tgtInput: HTMLInputElement | null): void {
    const basicClose = document.getElementById('panel-link-editor-close-button');
    if (basicClose) {
      const freshClose = basicClose.cloneNode(true) as HTMLElement;
      basicClose.parentNode?.replaceChild(freshClose, basicClose);
      freshClose.addEventListener('click', () => { panel.style.display = 'none'; this.edgeClicked = false; }, { once: true });
    }
    const basicSave = document.getElementById(ManagerViewportPanels.ID_LINK_EDITOR_SAVE_BUTTON);
    if (basicSave) {
      const freshSave = basicSave.cloneNode(true) as HTMLElement;
      basicSave.parentNode?.replaceChild(freshSave, basicSave);
      freshSave.addEventListener('click', async () => {
        try {
          const newSourceEP = (ctx.sourceIsNetwork && !ctx.sourceIsBridge) ? '' : (srcInput?.value?.trim() || '');
          const newTargetEP = (ctx.targetIsNetwork && !ctx.targetIsBridge) ? '' : (tgtInput?.value?.trim() || '');
          edge.data({ sourceEndpoint: newSourceEP, targetEndpoint: newTargetEP });
          await this.saveManager.saveTopo(this.cy, false);
        } catch (err) {
          log.error(`panelEdgeEditor basic save error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }
  }

  /**
   * Extended link editor panel that supports per-type extra fields and stores them under edge.data().extraData
   */
  private async panelEdgeEditorExtended(edge: cytoscape.EdgeSingular): Promise<void> {
    this.edgeClicked = true;
    this.hideAllPanels();

    const elements = this.getExtendedEditorElements();
    if (!elements) { this.edgeClicked = false; return; }
    const { panel, idLabel, closeBtn, saveBtn } = elements;

    const source = edge.data('source') as string;
    const target = edge.data('target') as string;
    const sourceEP = (edge.data('sourceEndpoint') as string) || '';
    const targetEP = (edge.data('targetEndpoint') as string) || '';
    this.updateExtendedPreview(idLabel, source, target, sourceEP, targetEP);
    panel.style.display = 'block';
    this.setupExtendedClose(panel, closeBtn);

    const extraData = edge.data('extraData') || {};
    const ctx = this.inferLinkContext(source, target);
    this.prepareExtendedFields(extraData, ctx.isVeth);
    const renderErrors = (errors: string[]) => this.renderExtendedErrors(errors);
    const validate = (): string[] => this.validateExtendedInputs(ctx.isVeth);
    renderErrors(validate());
    this.attachExtendedValidators(validate, renderErrors);

    const freshSave = saveBtn.cloneNode(true) as HTMLElement;
    saveBtn.parentNode?.replaceChild(freshSave, saveBtn);
    freshSave.addEventListener('click', async () => {
      await this.handleExtendedSave(edge, ctx, validate, renderErrors);
    });

    setTimeout(() => { this.edgeClicked = false; }, 100);
  }

  private getExtendedEditorElements(): { panel: HTMLElement; idLabel: HTMLElement; closeBtn: HTMLElement; saveBtn: HTMLElement } | null {
    const panel = document.getElementById('panel-link-editor') as HTMLElement | null;
    const idLabel = document.getElementById('panel-link-extended-editor-id') as HTMLElement | null;
    const closeBtn = document.getElementById('panel-link-editor-close-button') as HTMLElement | null;
    const saveBtn = document.getElementById(ManagerViewportPanels.ID_LINK_EDITOR_SAVE_BUTTON) as HTMLElement | null;
    if (!panel || !idLabel || !closeBtn || !saveBtn) {
      log.error('panelEdgeEditorExtended: missing required DOM elements');
      return null;
    }
    return { panel, idLabel, closeBtn, saveBtn };
  }

  private updateExtendedPreview(labelEl: HTMLElement, source: string, target: string, sourceEP: string, targetEP: string): void {
    labelEl.innerHTML = `┌▪${source} : ${sourceEP}<br>└▪${target} : ${targetEP}`;
  }

  private setupExtendedClose(panel: HTMLElement, closeBtn: HTMLElement): void {
    const freshClose = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode?.replaceChild(freshClose, closeBtn);
    freshClose.addEventListener('click', () => { panel.style.display = 'none'; this.edgeClicked = false; }, { once: true });
  }

  private inferLinkContext(source: string, target: string): { inferredType: string; isVeth: boolean } {
    const special = (id: string): string | null => {
      if (id === ManagerViewportPanels.TYPE_HOST || id.startsWith(`${ManagerViewportPanels.TYPE_HOST}:`)) return ManagerViewportPanels.TYPE_HOST;
      if (id === ManagerViewportPanels.TYPE_MGMT || id.startsWith(`${ManagerViewportPanels.TYPE_MGMT}:`)) return ManagerViewportPanels.TYPE_MGMT;
      if (id.startsWith('macvlan:')) return 'macvlan';
      if (id.startsWith('vxlan:')) return ManagerViewportPanels.TYPE_VXLAN;
      if (id.startsWith('vxlan-stitch:')) return ManagerViewportPanels.TYPE_VXLAN_STITCH;
      if (id.startsWith('dummy')) return ManagerViewportPanels.TYPE_DUMMY;
      return null;
    };
    const sourceType = special(source);
    const targetType = special(target);
    const inferredType = sourceType || targetType || 'veth';
    const typeDisplayEl = document.getElementById('panel-link-ext-type-display') as HTMLElement | null;
    if (typeDisplayEl) typeDisplayEl.textContent = inferredType;
    return { inferredType, isVeth: inferredType === 'veth' };
  }

  private prepareExtendedFields(extraData: any, isVeth: boolean): void {
    this.resetExtendedDynamicContainers();
    this.setNonVethInfoVisibility(isVeth);
    this.setMacAndMtu(extraData, isVeth);
    if (isVeth) this.populateExtendedKeyValues(extraData);
  }

  private resetExtendedDynamicContainers(): void {
    const varsContainer = document.getElementById('panel-link-ext-vars-container');
    const labelsContainer = document.getElementById('panel-link-ext-labels-container');
    if (varsContainer) varsContainer.innerHTML = '';
    if (labelsContainer) labelsContainer.innerHTML = '';
    this.linkDynamicEntryCounters.clear();
  }

  private setNonVethInfoVisibility(isVeth: boolean): void {
    const nonVethInfo = document.getElementById('panel-link-ext-non-veth-info') as HTMLElement | null;
    if (nonVethInfo)
      nonVethInfo.style.display = isVeth
        ? ManagerViewportPanels.DISPLAY_NONE
        : ManagerViewportPanels.DISPLAY_BLOCK;
  }

  private setMacAndMtu(extraData: any, isVeth: boolean): void {
    const srcMacEl = document.getElementById('panel-link-ext-src-mac') as HTMLInputElement | null;
    const tgtMacEl = document.getElementById('panel-link-ext-tgt-mac') as HTMLInputElement | null;
    const mtuEl = document.getElementById(ManagerViewportPanels.ID_LINK_EXT_MTU) as HTMLInputElement | null;
    if (srcMacEl) srcMacEl.value = extraData.extSourceMac || '';
    if (tgtMacEl) tgtMacEl.value = extraData.extTargetMac || '';
    if (isVeth && mtuEl) mtuEl.value = extraData.extMtu != null ? String(extraData.extMtu) : '';
  }

  private populateExtendedKeyValues(extraData: any): void {
    if (extraData.extVars && typeof extraData.extVars === 'object') {
      Object.entries(extraData.extVars).forEach(([k, v]) =>
        this.addLinkKeyValueEntryWithValue('vars', k, String(v))
      );
    }
    if (extraData.extLabels && typeof extraData.extLabels === 'object') {
      Object.entries(extraData.extLabels).forEach(([k, v]) =>
        this.addLinkKeyValueEntryWithValue('labels', k, String(v))
      );
    }
  }

  private renderExtendedErrors(errors: string[]): void {
    const banner = document.getElementById('panel-link-ext-errors') as HTMLElement | null;
    const bannerList = document.getElementById('panel-link-ext-errors-list') as HTMLElement | null;
    const setSaveDisabled = (disabled: boolean) => {
        const btn = document.getElementById(ManagerViewportPanels.ID_LINK_EDITOR_SAVE_BUTTON) as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = disabled;
      btn.classList.toggle(ManagerViewportPanels.CLASS_OPACITY_50, disabled);
      btn.classList.toggle(ManagerViewportPanels.CLASS_CURSOR_NOT_ALLOWED, disabled);
    };
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
    bannerList.innerHTML = errors.map(e => `• ${labels[e] || e}`).join('<br>');
    setSaveDisabled(true);
  }

  private validateExtendedInputs(isVeth: boolean): string[] {
    if (!isVeth) return [];
    return [];
  }

  // eslint-disable-next-line no-unused-vars
  private attachExtendedValidators(validate: () => string[], renderErrors: (errors: string[]) => void): void {
    const mtuEl = document.getElementById(ManagerViewportPanels.ID_LINK_EXT_MTU);
    const attach = (el: HTMLElement | null) => { if (el) { el.addEventListener('input', () => renderErrors(validate())); } };
    attach(mtuEl as HTMLElement);
  }

  private collectDynamicEntries(prefix: string): Record<string, string> {
    const entries = document.querySelectorAll(`[id^="${prefix}-entry-"]`);
    const parsed: Record<string, string> = {};
    entries.forEach(entry => {
      const keyInput = entry.querySelector(`[data-field="${prefix}-key"]`) as HTMLInputElement;
      const valueInput = entry.querySelector(`[data-field="${prefix}-value"]`) as HTMLInputElement;
      if (keyInput && valueInput && keyInput.value.trim()) {
        parsed[keyInput.value.trim()] = valueInput.value;
      }
    });
    return parsed;
  }

  // eslint-disable-next-line no-unused-vars
  private async handleExtendedSave(edge: cytoscape.EdgeSingular, ctx: { inferredType: string; isVeth: boolean }, validate: () => string[], renderErrors: (errors: string[]) => void): Promise<void> {
    try {
      this.updateEdgeEndpoints(edge);
      const errsNow = validate();
      if (errsNow.length) { renderErrors(errsNow); return; }

      const current = edge.data();
      if (!ctx.isVeth) {
        await this.saveManager.saveTopo(this.cy, false);
        return;
      }

      const updatedExtra = this.buildLinkExtendedData(current.extraData || {});
      edge.data({ ...current, extraData: updatedExtra });
      await this.saveManager.saveTopo(this.cy, false);
    } catch (err) {
      log.error(`panelEdgeEditorExtended: error during save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private updateEdgeEndpoints(edge: cytoscape.EdgeSingular): void {
    const source = edge.data('source') as string;
    const target = edge.data('target') as string;
    const srcInput = document.getElementById('panel-link-editor-source-endpoint') as HTMLInputElement | null;
    const tgtInput = document.getElementById('panel-link-editor-target-endpoint') as HTMLInputElement | null;
    const newSourceEP = this.shouldClearEndpoint(source) ? '' : (srcInput?.value?.trim() || '');
    const newTargetEP = this.shouldClearEndpoint(target) ? '' : (tgtInput?.value?.trim() || '');
    edge.data({ sourceEndpoint: newSourceEP, targetEndpoint: newTargetEP });
  }

  private shouldClearEndpoint(nodeId: string): boolean {
    if (!isSpecialNodeOrBridge(nodeId, this.cy)) return false;
    const node = this.cy.getElementById(nodeId);
    const kind = node.data('extraData')?.kind;
    return !ManagerViewportPanels.BRIDGE_TYPES.includes(kind as any);
  }

  private buildLinkExtendedData(existing: any): any {
    const updated = { ...existing } as any;
    const srcMacEl = document.getElementById('panel-link-ext-src-mac') as HTMLInputElement | null;
    const tgtMacEl = document.getElementById('panel-link-ext-tgt-mac') as HTMLInputElement | null;
    const mtuEl = document.getElementById(ManagerViewportPanels.ID_LINK_EXT_MTU) as HTMLInputElement | null;
    if (srcMacEl) updated.extSourceMac = srcMacEl.value.trim() || undefined;
    if (tgtMacEl) updated.extTargetMac = tgtMacEl.value.trim() || undefined;
    if (mtuEl) updated.extMtu = mtuEl.value ? Number(mtuEl.value) : undefined;
    const vars = this.collectDynamicEntries('link-vars');
    const labels = this.collectDynamicEntries('link-labels');
    updated.extVars = Object.keys(vars).length ? vars : undefined;
    updated.extLabels = Object.keys(labels).length ? labels : undefined;
    return updated;
  }

  /**
   * Updates the provided Cytoscape node with data from the editor panel.
   * This method retrieves updated values from the editor and applies them to the node.
   *
   * @param node - The Cytoscape node to update.
   * @returns A promise that resolves when the node data has been updated.
   */
  public async updateNodeFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    const targetNode = this.ensureSingleNode(node);
    const nodeNameInput = document.getElementById("node-name") as HTMLInputElement;
    const nodeImageInput = document.getElementById("node-image-dropdown-container-filter-input") as HTMLInputElement;
    const typeDropdownInput = document.getElementById("panel-node-type-dropdown-container-filter-input") as HTMLInputElement;
    const typeInput = document.getElementById("node-type") as HTMLInputElement;
    const kindDropdownInput = document.getElementById("panel-node-kind-dropdown-container-filter-input") as HTMLInputElement;
    const topoViewerRoleDropdownInput = document.getElementById("panel-node-topoviewerrole-dropdown-container-filter-input") as HTMLInputElement;

    const currentData = targetNode.data();
    const oldName = currentData.name as string;
    const newName = nodeNameInput.value;

    const typeValue = this.getNodeTypeValue(typeDropdownInput, typeInput);
    const updatedExtraData = this.buildNodeExtraData(currentData.extraData, nodeNameInput.value, nodeImageInput.value, kindDropdownInput?.value, typeValue);

    const updatedData = {
      ...currentData,
      name: nodeNameInput.value,
      topoViewerRole: topoViewerRoleDropdownInput ? topoViewerRoleDropdownInput.value : 'pe',
      extraData: updatedExtraData,
    };

    targetNode.data(updatedData);
    log.debug(`Cytoscape node updated with new data: ${JSON.stringify(updatedData)}`);

    if (oldName !== newName) {
      this.updateEdgesForRenamedNode(targetNode, oldName, newName);
    }

    this.hideNodeEditor();
  }

  /**
   * Updates a network node based on the network editor inputs.
   * @param node - The Cytoscape node representing the network.
   */
  public async updateNetworkFromEditor(node: cytoscape.NodeSingular): Promise<void> {
    const targetNode = this.ensureSingleNode(node);
    const inputs = this.getNetworkEditorInputs();
    const currentData = targetNode.data();
    const idInfo = this.buildNetworkIdentifiers(
      currentData,
      inputs.networkType,
      inputs.interfaceName,
      inputs.remote,
      inputs.vni,
      inputs.udpPort
    );
    const extendedData = this.buildNetworkExtendedData(inputs, currentData.extraData || {});

    if (idInfo.oldId === idInfo.newId) {
      this.applyNetworkDataSameId(targetNode, currentData, idInfo.newName, inputs.networkType, extendedData);
    } else {
      this.recreateNetworkNode(targetNode, currentData, idInfo, inputs.networkType, extendedData);
    }
  }

  private getNodeTypeValue(typeDropdownInput: HTMLInputElement | null, typeInput: HTMLInputElement | null): string {
    if (this.panelNodeEditorUseDropdownForType) {
      return typeDropdownInput ? (typeDropdownInput.value || '') : '';
    }
    return typeInput ? typeInput.value : '';
  }

  private buildNodeExtraData(currentExtra: any, name: string, image: string, kindValue: string | undefined, typeValue: string): any {
    const updatedExtraData = {
      ...currentExtra,
      name,
      image,
      kind: kindValue || 'nokia_srlinux',
    };
    if (this.panelNodeEditorUseDropdownForType || typeValue.trim() !== '') {
      updatedExtraData.type = typeValue;
    } else if ('type' in updatedExtraData) {
      delete updatedExtraData.type;
    }
    return updatedExtraData;
  }

  private updateEdgesForRenamedNode(targetNode: cytoscape.NodeSingular, oldName: string, newName: string): void {
    const edges = targetNode.connectedEdges();
    edges.forEach(edge => {
      const edgeData = edge.data();
      const updatedEdgeData: any = { ...edgeData };
      let modified = false;
      if (edgeData.sourceName === oldName) {
        updatedEdgeData.sourceName = newName;
        modified = true;
      }
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

  private hideNodeEditor(): void {
    const panelNodeEditor = document.getElementById("panel-node-editor");
    if (panelNodeEditor) {
      panelNodeEditor.style.display = "none";
    }
  }

  private ensureSingleNode(node: cytoscape.NodeSingular): cytoscape.NodeSingular {
    return (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;
  }

  private getNetworkEditorInputs() {
    const networkType = (document.getElementById(ManagerViewportPanels.ID_NETWORK_TYPE_FILTER_INPUT) as HTMLInputElement | null)?.value || ManagerViewportPanels.TYPE_HOST;
    const interfaceName = (document.getElementById(ManagerViewportPanels.ID_NETWORK_INTERFACE) as HTMLInputElement | null)?.value || 'eth1';
    return {
      networkType,
      interfaceName,
      mac: (document.getElementById('panel-network-mac') as HTMLInputElement | null)?.value,
      mtu: (document.getElementById('panel-network-mtu') as HTMLInputElement | null)?.value,
      mode: (document.getElementById('panel-network-mode') as HTMLSelectElement | null)?.value,
      remote: (document.getElementById(ManagerViewportPanels.ID_NETWORK_REMOTE) as HTMLInputElement | null)?.value,
      vni: (document.getElementById(ManagerViewportPanels.ID_NETWORK_VNI) as HTMLInputElement | null)?.value,
      udpPort: (document.getElementById(ManagerViewportPanels.ID_NETWORK_UDP_PORT) as HTMLInputElement | null)?.value,
    };
  }

  private buildNetworkIdentifiers(
    currentData: any,
    networkType: string,
    interfaceName: string,
    remote?: string,
    vni?: string,
    udpPort?: string
  ) {
    const oldId = currentData.id as string;
    const oldName = currentData.name as string;
    const isBridgeType = ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any);
    const isDummyType = networkType === ManagerViewportPanels.TYPE_DUMMY;
    let newId = '';
    if (isBridgeType) {
      newId = interfaceName;
    } else if (isDummyType) {
      newId = oldId.startsWith(ManagerViewportPanels.TYPE_DUMMY) ? oldId : this.generateUniqueDummyId();
    } else if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(networkType)) {
      newId = `${networkType}:${remote ?? ''}/${vni ?? ''}/${udpPort ?? ''}`;
    } else {
      newId = `${networkType}:${interfaceName}`;
    }
    const newName = isDummyType ? ManagerViewportPanels.TYPE_DUMMY : newId;
    return { oldId, oldName, newId, newName };
  }

  private buildNetworkExtendedData(inputs: any, currentExtra: any): any {
    const extendedData: any = { ...currentExtra, kind: inputs.networkType };
    if (inputs.mac) extendedData.extMac = inputs.mac;
    if (inputs.mtu) extendedData.extMtu = Number(inputs.mtu);
    const vars = this.collectDynamicEntries('network-vars');
    if (Object.keys(vars).length) extendedData.extVars = vars;
    const labels = this.collectDynamicEntries('network-labels');
    if (Object.keys(labels).length) extendedData.extLabels = labels;
    if (inputs.networkType === 'macvlan' && inputs.mode) extendedData.extMode = inputs.mode;
    if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(inputs.networkType)) {
      if (inputs.remote) extendedData.extRemote = inputs.remote;
      if (inputs.vni) extendedData.extVni = Number(inputs.vni);
      if (inputs.udpPort) extendedData.extUdpPort = Number(inputs.udpPort);
    }
    if ((ManagerViewportPanels.HOSTY_TYPES as readonly string[]).includes(inputs.networkType) && inputs.interfaceName) {
      extendedData.extHostInterface = inputs.interfaceName;
    }
    return extendedData;
  }

  private applyNetworkDataSameId(targetNode: cytoscape.NodeSingular, currentData: any, newName: string, networkType: string, extendedData: any): void {
    const updatedData = {
      ...currentData,
      name: newName,
      topoViewerRole: (ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) ? 'bridge' : 'cloud',
      extraData: { ...extendedData, kind: networkType }
    };
    targetNode.data(updatedData);
    targetNode.connectedEdges().forEach(edge => {
      const edgeData = edge.data();
      const updatedEdgeData = {
        ...edgeData,
        extraData: { ...(edgeData.extraData || {}), ...this.getNetworkExtendedPropertiesForEdge(networkType, extendedData) }
      };
      edge.data(updatedEdgeData);
    });
  }

  private recreateNetworkNode(targetNode: cytoscape.NodeSingular, currentData: any, ids: any, networkType: string, extendedData: any): void {
    const position = targetNode.position();
    const connectedEdges = targetNode.connectedEdges().map(edge => ({
      data: edge.data(),
      classes: edge.classes()
    }));
    this.cy.remove(targetNode);
    const newNodeData = {
      ...currentData,
      id: ids.newId,
      name: ids.newName,
      topoViewerRole: (ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) ? 'bridge' : 'cloud',
      extraData: { ...extendedData, kind: networkType }
    };
    this.cy.add({ group: 'nodes', data: newNodeData, position });
    connectedEdges.forEach(edgeInfo => {
      const newEdgeData = { ...edgeInfo.data };
      if (newEdgeData.source === ids.oldId) newEdgeData.source = ids.newId;
      if (newEdgeData.target === ids.oldId) newEdgeData.target = ids.newId;
      if (newEdgeData.sourceName === ids.oldName) newEdgeData.sourceName = ids.newName;
      if (newEdgeData.targetName === ids.oldName) newEdgeData.targetName = ids.newName;
      newEdgeData.extraData = { ...(newEdgeData.extraData || {}), ...this.getNetworkExtendedPropertiesForEdge(networkType, extendedData) };
      let edgeClasses = edgeInfo.classes || [];
      const isStubLink = isSpecialNodeOrBridge(newEdgeData.source, this.cy) || isSpecialNodeOrBridge(newEdgeData.target, this.cy);
      if (isStubLink && !edgeClasses.includes('stub-link')) edgeClasses = [...edgeClasses, 'stub-link'];
      this.cy.add({ group: 'edges', data: newEdgeData, classes: edgeClasses.join(' ') });
    });
  }

  /**
   * Gets the extended properties from a network node that should be applied to connected edges.
   * @param networkType - The type of network node
   * @param nodeExtraData - The extraData from the network node
   * @returns Extended properties to apply to the edge
   */
  private getNetworkExtendedPropertiesForEdge(networkType: string, nodeExtraData: any): any {
    const edgeExtData: any = this.pickCommonExtProps(nodeExtraData);
    this.addNetworkSpecificProps(edgeExtData, networkType, nodeExtraData);
    if (!ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) {
      edgeExtData.extType = networkType;
    }
    return edgeExtData;
  }

  private pickCommonExtProps(nodeExtraData: any): any {
    const props = ['extMac', 'extMtu', 'extVars', 'extLabels'];
    const result: any = {};
    props.forEach(prop => {
      if (nodeExtraData[prop] !== undefined) result[prop] = nodeExtraData[prop];
    });
    return result;
  }

  private addNetworkSpecificProps(target: any, networkType: string, nodeExtraData: any): void {
    const copy = (prop: string) => {
      if (nodeExtraData[prop] !== undefined) target[prop] = nodeExtraData[prop];
    };
    if ((ManagerViewportPanels.HOSTY_TYPES as readonly string[]).includes(networkType)) copy('extHostInterface');
    if (networkType === 'macvlan') copy('extMode');
    if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(networkType)) {
      ['extRemote', 'extVni', 'extUdpPort'].forEach(copy);
    }
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
    const extraData = node.data('extraData') as { interfacePattern?: unknown } | undefined;
    const overridePattern = typeof extraData?.interfacePattern === 'string' ? extraData.interfacePattern.trim() : '';
    const oldPattern = overridePattern || ifaceMap[oldKind] || DEFAULT_INTERFACE_PATTERN;
    const newPattern = overridePattern || ifaceMap[newKind] || DEFAULT_INTERFACE_PATTERN;
    const oldParsed = parseInterfacePattern(oldPattern);
    const newParsed = parseInterfacePattern(newPattern);
    const nodeId = node.id();

    const edges = this.cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);
    edges.forEach(edge => {
      ['sourceEndpoint', 'targetEndpoint'].forEach(key => {
        const endpoint = edge.data(key);
        const isNodeEndpoint =
          (edge.data('source') === nodeId && key === 'sourceEndpoint') ||
          (edge.data('target') === nodeId && key === 'targetEndpoint');
        if (!endpoint || !isNodeEndpoint) return;
        const index = getInterfaceIndex(oldParsed, endpoint);
        if (index !== null) {
          const newEndpoint = generateInterfaceName(newParsed, index);
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
    // Sort kinds alphabetically (no explicit ordering)
    const sortedOptions = this.sortKindsWithNokiaTop(options);
    createFilterableDropdown(
      'panel-node-kind-dropdown-container',
      sortedOptions,
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
          if (Object.prototype.hasOwnProperty.call(imageMap, selectedValue)) {
            const mappedImage = imageMap[selectedValue] as string;
            imageInput.value = mappedImage;
            imageInput.dispatchEvent(new Event('input'));
          } else {
            imageInput.value = '';
            imageInput.dispatchEvent(new Event('input'));
          }
        }
      },
      'Search for kind...'
    );
  }

  // Group Nokia kinds on top (prefix 'nokia_'), each group sorted alphabetically
  private sortKindsWithNokiaTop(options: string[]): string[] {
    const nokiaKinds = options.filter(k => k.startsWith('nokia_')).sort((a, b) => a.localeCompare(b));
    const otherKinds = options.filter(k => !k.startsWith('nokia_')).sort((a, b) => a.localeCompare(b));
    return [...nokiaKinds, ...otherKinds];
  }

  private panelNodeEditorSetupTypeField(options: string[]): void {
    const dropdownContainer = document.getElementById("panel-node-type-dropdown-container");
    const input = document.getElementById("node-type") as HTMLInputElement;

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

    createFilterableDropdown(
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
    createFilterableDropdown(
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
    const overlays = document.getElementsByClassName(ManagerViewportPanels.CLASS_PANEL_OVERLAY);
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
      // NOTE: Consider surfacing a user-facing notification
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
    const kind = this.extractKindFromPattern(pattern);
    if (!this.hasTypeChild(kind)) return [];
    const nodeConfig = jsonData?.definitions?.['node-config'];
    if (!nodeConfig?.allOf) return [];

    for (const condition of nodeConfig.allOf) {
      if (!this.matchesKindPattern(condition, pattern)) continue;
      const typeProp = condition.then?.properties?.type;
      const enums = this.extractEnumFromTypeProp(typeProp);
      if (enums.length) return enums;
    }
    return [];
  }

  private extractKindFromPattern(pattern: string): string {
    const start = pattern.indexOf('(');
    if (start < 0) return '';
    const end = pattern.indexOf(')', start + 1);
    if (end <= start) return '';
    return pattern.slice(start + 1, end);
  }

  private hasTypeChild(kind: string): boolean {
    return ['nokia_srlinux', 'nokia_srsim', 'nokia_sros', 'cisco_iol'].includes(kind);
  }

  private matchesKindPattern(condition: any, pattern: string): boolean {
    return condition?.if?.properties?.kind?.pattern === pattern;
  }

  private extractEnumFromTypeProp(typeProp: any): string[] {
    if (!typeProp) return [];
    if (typeProp.enum) return typeProp.enum;
    if (Array.isArray(typeProp.anyOf)) {
      for (const sub of typeProp.anyOf) {
        if (sub.enum) return sub.enum;
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
  // Removed legacy dropdown builder in favor of shared utility (utilities/filterableDropdown)
}
