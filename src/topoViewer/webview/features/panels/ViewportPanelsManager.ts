// file: ViewportPanelsManager.ts

import cytoscape from "cytoscape";
import { ManagerSaveTopo } from "../../core/SaveManager";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";
import { log } from "../../platform/logging/logger";
import { isSpecialNodeOrBridge } from "../../../shared/utilities/SpecialNodes";
import { LinkEditorManager } from "./LinkEditorManager";
import { NodeEditorManager } from "./NodeEditorManager";

/**
 * ManagerViewportPanels handles the UI panels associated with the Cytoscape viewport.
 * It manages the node editor panel and toggles panels based on user interactions.
 */
export class ManagerViewportPanels {
  private saveManager: ManagerSaveTopo;
  private cy: cytoscape.Core;
  private nodeEditorManager: NodeEditorManager;
  private linkEditorManager: LinkEditorManager;
  private isPanel01Cy = false;
  public nodeClicked: boolean = false;
  public edgeClicked: boolean = false;

  // Dynamic entry counters for the network editor
  private networkDynamicEntryCounters = new Map<string, number>();

  // Common classes and IDs reused throughout this file
  private static readonly CLASS_DYNAMIC_ENTRY = "dynamic-entry" as const;
  private static readonly CLASS_INPUT_FIELD = "input-field" as const;
  private static readonly CLASS_DYNAMIC_DELETE_BTN = "dynamic-delete-btn" as const;
  private static readonly CLASS_OPACITY_50 = "opacity-50" as const;
  private static readonly CLASS_CURSOR_NOT_ALLOWED = "cursor-not-allowed" as const;

  private static readonly DISPLAY_BLOCK = "block" as const;
  private static readonly DISPLAY_NONE = "none" as const;

  private static readonly ID_NETWORK_INTERFACE = "panel-network-interface" as const;

  private static readonly ID_NETWORK_REMOTE = "panel-network-remote" as const;
  private static readonly ID_NETWORK_VNI = "panel-network-vni" as const;
  private static readonly ID_NETWORK_UDP_PORT = "panel-network-udp-port" as const;
  private static readonly VXLAN_INPUT_IDS = [
    ManagerViewportPanels.ID_NETWORK_REMOTE,
    ManagerViewportPanels.ID_NETWORK_VNI,
    ManagerViewportPanels.ID_NETWORK_UDP_PORT
  ] as const;

  private static readonly ID_NETWORK_TYPE_DROPDOWN =
    "panel-network-type-dropdown-container" as const;
  private static readonly ID_NETWORK_TYPE_FILTER_INPUT =
    "panel-network-type-dropdown-container-filter-input" as const;
  private static readonly ID_NETWORK_SAVE_BUTTON = "panel-network-editor-save-button" as const;
  private static readonly HTML_ICON_TRASH = '<i class="fas fa-trash"></i>' as const;
  private static readonly ATTR_DATA_FIELD = "data-field" as const;
  private static readonly ID_NETWORK_LABEL = "panel-network-label" as const;

  private static readonly PH_SEARCH_NETWORK_TYPE = "Search for network type..." as const;

  // CSS class for Apply button with pending changes
  private static readonly CLASS_HAS_CHANGES = "btn-has-changes" as const;

  // Initial values for change tracking
  private networkEditorInitialValues: Record<string, string> | null = null;

  // Network type constants
  private static readonly TYPE_HOST = "host" as const;
  private static readonly TYPE_MGMT = "mgmt-net" as const;
  private static readonly TYPE_MACVLAN = "macvlan" as const;
  private static readonly TYPE_VXLAN = "vxlan" as const;
  private static readonly TYPE_VXLAN_STITCH = "vxlan-stitch" as const;
  private static readonly TYPE_DUMMY = "dummy" as const;
  private static readonly TYPE_BRIDGE = "bridge" as const;
  private static readonly TYPE_OVS_BRIDGE = "ovs-bridge" as const;

  private static readonly NETWORK_TYPE_OPTIONS = [
    ManagerViewportPanels.TYPE_HOST,
    ManagerViewportPanels.TYPE_MGMT,
    ManagerViewportPanels.TYPE_MACVLAN,
    ManagerViewportPanels.TYPE_VXLAN,
    ManagerViewportPanels.TYPE_VXLAN_STITCH,
    ManagerViewportPanels.TYPE_DUMMY,
    ManagerViewportPanels.TYPE_BRIDGE,
    ManagerViewportPanels.TYPE_OVS_BRIDGE
  ] as const;

  private static readonly VX_TYPES = [
    ManagerViewportPanels.TYPE_VXLAN,
    ManagerViewportPanels.TYPE_VXLAN_STITCH
  ] as const;
  private static readonly HOSTY_TYPES = [
    ManagerViewportPanels.TYPE_HOST,
    ManagerViewportPanels.TYPE_MGMT,
    ManagerViewportPanels.TYPE_MACVLAN
  ] as const;
  private static readonly BRIDGE_TYPES = [
    ManagerViewportPanels.TYPE_BRIDGE,
    ManagerViewportPanels.TYPE_OVS_BRIDGE
  ] as const;

  private static readonly LABEL_INTERFACE = "Interface" as const;
  private static readonly LABEL_BRIDGE_NAME = "Bridge Name" as const;
  private static readonly LABEL_HOST_INTERFACE = "Host Interface" as const;

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
    (window as any).addNetworkVarEntry = () => this.addNetworkKeyValueEntry("vars", "key", "value");
    (window as any).addNetworkLabelEntry = () =>
      this.addNetworkKeyValueEntry("labels", "label-key", "label-value");
    (window as any).removeNetworkEntry = (containerName: string, entryId: number) => {
      this.removeNetworkEntry(containerName, entryId);
      return false;
    };
  }

  /**
   * Add a key-value entry for Network Editor
   */
  private addNetworkKeyValueEntry(
    containerName: string,
    keyPlaceholder: string,
    valuePlaceholder: string
  ): void {
    const container = document.getElementById(`panel-network-${containerName}-container`);
    if (!container) return;

    const count = (this.networkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.networkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.placeholder = keyPlaceholder;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-key`);

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.placeholder = valuePlaceholder;
    valueInput.setAttribute(
      ManagerViewportPanels.ATTR_DATA_FIELD,
      `network-${containerName}-value`
    );

    const button = document.createElement("button");
    button.type = "button";
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
  private addNetworkKeyValueEntryWithValue(
    containerName: string,
    key: string,
    value: string
  ): void {
    const container = document.getElementById(`panel-network-${containerName}-container`);
    if (!container) return;

    const count = (this.networkDynamicEntryCounters.get(containerName) || 0) + 1;
    this.networkDynamicEntryCounters.set(containerName, count);

    const entryDiv = document.createElement("div");
    entryDiv.className = ManagerViewportPanels.CLASS_DYNAMIC_ENTRY;
    entryDiv.id = `network-${containerName}-entry-${count}`;

    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    keyInput.value = key;
    keyInput.setAttribute(ManagerViewportPanels.ATTR_DATA_FIELD, `network-${containerName}-key`);

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = ManagerViewportPanels.CLASS_INPUT_FIELD;
    valueInput.value = value;
    valueInput.setAttribute(
      ManagerViewportPanels.ATTR_DATA_FIELD,
      `network-${containerName}-value`
    );

    const button = document.createElement("button");
    button.type = "button";
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
   * Creates an instance of ManagerViewportPanels.
   * @param saveManager - The ManagerSaveTopo instance.
   * @param cy - The Cytoscape instance.
   */
  constructor(saveManager: ManagerSaveTopo, cy: cytoscape.Core) {
    this.saveManager = saveManager;
    this.cy = cy;
    this.nodeEditorManager = new NodeEditorManager(saveManager, cy, (flag) =>
      this.setNodeClicked(flag)
    );
    this.linkEditorManager = new LinkEditorManager(saveManager, cy, (flag) =>
      this.setEdgeClicked(flag)
    );
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

    container.addEventListener("click", async () => {
      log.debug("cy container clicked");

      // Execute toggle logic only when no node or edge was clicked.
      if (!this.nodeClicked && !this.edgeClicked) {
        if (!this.isPanel01Cy) {
          // Don't close panels when clicking on canvas - allow multiple panels to stay open
          // Remove all overlay panels.
          // const panelOverlays = document.getElementsByClassName(
          //   ManagerViewportPanels.CLASS_PANEL_OVERLAY
          // );
          // for (let i = 0; i < panelOverlays.length; i++) {
          //   (panelOverlays[i] as HTMLElement).style.display = "none";
          // }

          // Hide viewport drawers.
          // const viewportDrawers = document.getElementsByClassName(
          //   ManagerViewportPanels.CLASS_VIEWPORT_DRAWER
          // );
          // for (let i = 0; i < viewportDrawers.length; i++) {
          //   (viewportDrawers[i] as HTMLElement).style.display = "none";
          // }

          // Hide any elements with the class "ViewPortDrawer".
          // const viewPortDrawerElements = document.getElementsByClassName(
          //   ManagerViewportPanels.CLASS_VIEWPORT_DRAWER_ALT
          // );
          // Array.from(viewPortDrawerElements).forEach((element) => {
          //   (element as HTMLElement).style.display = "none";
          // });
        } else {
          this.removeElementById("Panel-01");
          this.appendMessage("try to remove panel01-Cy");
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
    return this.nodeEditorManager.panelNodeEditor(node);
  }

  /**
   * Updates the network editor fields based on the selected network type.
   * @param networkType - The selected network type.
   */
  private updateNetworkEditorFields(networkType: string): void {
    const interfaceInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_INTERFACE
    ) as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll(".vscode-label")).find(
      (el) =>
        el.textContent?.includes(ManagerViewportPanels.LABEL_INTERFACE) ||
        el.textContent === ManagerViewportPanels.LABEL_BRIDGE_NAME
    );
    const interfaceSection = interfaceInput?.closest(".form-group") as HTMLElement | null;

    const cfg = this.getInterfaceFieldConfig(networkType);
    if (interfaceSection)
      interfaceSection.style.display = cfg.showInterface
        ? ManagerViewportPanels.DISPLAY_BLOCK
        : ManagerViewportPanels.DISPLAY_NONE;
    if (interfaceLabel) interfaceLabel.textContent = cfg.label;
    if (interfaceInput) interfaceInput.placeholder = cfg.placeholder;

    this.toggleExtendedSections(networkType);
    this.toggleBridgeAliasLabelSection(networkType);
  }

  private getInterfaceFieldConfig(networkType: string): {
    label: string;
    placeholder: string;
    showInterface: boolean;
  } {
    const base: { label: string; placeholder: string; showInterface: boolean } = {
      label: ManagerViewportPanels.LABEL_INTERFACE,
      placeholder: "Enter interface name",
      showInterface: true
    };
    const map: Record<string, Partial<typeof base>> = {
      [ManagerViewportPanels.TYPE_BRIDGE]: {
        label: ManagerViewportPanels.LABEL_BRIDGE_NAME,
        placeholder: "Enter bridge name"
      },
      [ManagerViewportPanels.TYPE_OVS_BRIDGE]: {
        label: ManagerViewportPanels.LABEL_BRIDGE_NAME,
        placeholder: "Enter bridge name"
      },
      [ManagerViewportPanels.TYPE_DUMMY]: { showInterface: false },
      [ManagerViewportPanels.TYPE_HOST]: {
        label: ManagerViewportPanels.LABEL_HOST_INTERFACE,
        placeholder: "e.g., eth0, eth1"
      },
      [ManagerViewportPanels.TYPE_MGMT]: {
        label: ManagerViewportPanels.LABEL_HOST_INTERFACE,
        placeholder: "e.g., eth0, eth1"
      },
      [ManagerViewportPanels.TYPE_MACVLAN]: {
        label: ManagerViewportPanels.LABEL_HOST_INTERFACE,
        placeholder: "Parent interface (e.g., eth0)"
      },
      [ManagerViewportPanels.TYPE_VXLAN]: {
        label: ManagerViewportPanels.LABEL_INTERFACE,
        placeholder: "VXLAN interface name"
      },
      [ManagerViewportPanels.TYPE_VXLAN_STITCH]: {
        label: ManagerViewportPanels.LABEL_INTERFACE,
        placeholder: "VXLAN interface name"
      }
    };
    return { ...base, ...(map[networkType] || {}) };
  }

  private toggleExtendedSections(networkType: string): void {
    const modeSection = document.getElementById("panel-network-mode-section") as HTMLElement | null;
    const vxlanSection = document.getElementById(
      "panel-network-vxlan-section"
    ) as HTMLElement | null;
    if (modeSection)
      modeSection.style.display =
        networkType === ManagerViewportPanels.TYPE_MACVLAN
          ? ManagerViewportPanels.DISPLAY_BLOCK
          : ManagerViewportPanels.DISPLAY_NONE;
    if (vxlanSection)
      vxlanSection.style.display = ManagerViewportPanels.VX_TYPES.includes(networkType as any)
        ? ManagerViewportPanels.DISPLAY_BLOCK
        : ManagerViewportPanels.DISPLAY_NONE;
  }

  private toggleBridgeAliasLabelSection(networkType: string): void {
    const labelInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_LABEL
    ) as HTMLInputElement | null;
    const labelGroup = labelInput?.closest(".form-group") as HTMLElement | null;
    if (labelGroup) {
      const show = ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any);
      labelGroup.style.display = show
        ? ManagerViewportPanels.DISPLAY_BLOCK
        : ManagerViewportPanels.DISPLAY_NONE;
    }
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
          const saveButton = document.getElementById(
            ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON
          ) as HTMLButtonElement;
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
  private configureInterfaceField(networkType: string, interfaceName: string): void {
    if (networkType === ManagerViewportPanels.TYPE_DUMMY) return; // Dummy nodes don't have interfaces

    const interfaceInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_INTERFACE
    ) as HTMLInputElement | null;
    const interfaceLabel = Array.from(document.querySelectorAll(".vscode-label")).find(
      (el) =>
        el.textContent === ManagerViewportPanels.LABEL_INTERFACE ||
        el.textContent === ManagerViewportPanels.LABEL_BRIDGE_NAME
    );

    const isBridge = ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any);
    const isHostLike = ManagerViewportPanels.HOSTY_TYPES.includes(networkType as any);

    let labelText: string = ManagerViewportPanels.LABEL_INTERFACE;
    if (isBridge) labelText = ManagerViewportPanels.LABEL_BRIDGE_NAME;
    else if (isHostLike) labelText = ManagerViewportPanels.LABEL_HOST_INTERFACE;
    const inputValue = interfaceName;

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

    this.setInputValue("panel-network-mac", extraData.extMac ?? extraFallback.extMac);
    this.setInputValue("panel-network-mtu", extraData.extMtu ?? extraFallback.extMtu);
    const modeSelect = document.getElementById("panel-network-mode") as HTMLSelectElement | null;
    if (modeSelect) modeSelect.value = extraData.extMode || ManagerViewportPanels.TYPE_BRIDGE;
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_REMOTE, extraData.extRemote);
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_VNI, extraData.extVni);
    this.setInputValue(ManagerViewportPanels.ID_NETWORK_UDP_PORT, extraData.extUdpPort);

    this.loadNetworkDynamicEntries("vars", extraData.extVars || extraFallback.extVars);
    this.loadNetworkDynamicEntries("labels", extraData.extLabels || extraFallback.extLabels);
  }

  private getNetworkExtraFallback(node: cytoscape.NodeSingular, extraData: any): any {
    if (extraData.extMac || extraData.extMtu || extraData.extVars || extraData.extLabels) return {};
    const edges = node.connectedEdges();
    for (const e of edges) {
      const ed = e.data("extraData") || {};
      const fb: any = {};
      if (ed.extMac) fb.extMac = ed.extMac;
      if (ed.extMtu !== undefined && ed.extMtu !== "") fb.extMtu = ed.extMtu;
      if (ed.extVars) fb.extVars = ed.extVars;
      if (ed.extLabels) fb.extLabels = ed.extLabels;
      if (Object.keys(fb).length) return fb;
    }
    return {};
  }

  private setInputValue(id: string, value: any): void {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.value = value != null ? String(value) : "";
  }

  private resetNetworkDynamicEntries(): void {
    const varsContainer = document.getElementById("panel-network-vars-container");
    const labelsContainer = document.getElementById("panel-network-labels-container");
    if (varsContainer) varsContainer.innerHTML = "";
    if (labelsContainer) labelsContainer.innerHTML = "";
    this.networkDynamicEntryCounters.clear();
  }

  private loadNetworkDynamicEntries(type: "vars" | "labels", data?: Record<string, any>): void {
    if (!data || typeof data !== "object") return;
    Object.entries(data).forEach(([key, value]) => {
      this.addNetworkKeyValueEntryWithValue(type, key, String(value));
    });
  }

  /**
   * Updates button state based on validation result.
   */
  private setButtonValidationState(btn: HTMLElement, isValid: boolean): void {
    (btn as HTMLButtonElement).disabled = !isValid;
    btn.classList.toggle(ManagerViewportPanels.CLASS_OPACITY_50, !isValid);
    btn.classList.toggle(ManagerViewportPanels.CLASS_CURSOR_NOT_ALLOWED, !isValid);
  }

  /**
   * Sets up the network editor OK (save) button.
   */
  private setupNetworkOkButton(
    networkType: string,
    node: cytoscape.NodeSingular,
    panel: HTMLElement | null
  ): void {
    const saveBtn = document.getElementById(ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON);
    if (!saveBtn) return;

    const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
    saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);

    const { isValid: initialValid } = this.validateNetworkFields(networkType);
    this.setButtonValidationState(newSaveBtn, initialValid);

    newSaveBtn.addEventListener("click", async () => {
      const { isValid, errors } = this.validateNetworkFields(networkType, true);
      if (!isValid) {
        console.error("Cannot save network node:", errors);
        return;
      }
      await this.updateNetworkFromEditor(node);
      await this.saveManager.saveTopo(this.cy, false);
      if (panel) panel.style.display = "none";
    });
  }

  /**
   * Sets up the network editor Apply button with change tracking.
   */
  private setupNetworkApplyButton(networkType: string, node: cytoscape.NodeSingular): void {
    const applyBtn = document.getElementById("panel-network-editor-apply-button");
    if (!applyBtn) return;

    const newApplyBtn = applyBtn.cloneNode(true) as HTMLElement;
    applyBtn.parentNode?.replaceChild(newApplyBtn, applyBtn);

    newApplyBtn.addEventListener("click", async () => {
      const { isValid, errors } = this.validateNetworkFields(networkType, true);
      if (!isValid) {
        console.error("Cannot apply network node changes:", errors);
        return;
      }
      await this.updateNetworkFromEditor(node);
      await this.saveManager.saveTopo(this.cy, false);
      this.resetNetworkEditorInitialValues();
    });

    const updateApplyState = () => {
      const { isValid } = this.validateNetworkFields(networkType);
      this.setButtonValidationState(newApplyBtn, isValid);
      this.updateNetworkApplyButtonState();
    };
    updateApplyState();

    // Update apply button state when VXLAN inputs change
    ManagerViewportPanels.VXLAN_INPUT_IDS.forEach((inputId) => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) input.addEventListener("input", updateApplyState);
    });

    // Also track changes on interface and label inputs
    [ManagerViewportPanels.ID_NETWORK_INTERFACE, ManagerViewportPanels.ID_NETWORK_LABEL].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("input", () => this.updateNetworkApplyButtonState());
    });
  }

  /**
   * Set up validation listeners and save button behavior for the network editor.
   */
  private setupNetworkValidation(
    networkType: string,
    node: cytoscape.NodeSingular,
    panel: HTMLElement | null
  ): void {
    // Set up save button validation listeners
    ManagerViewportPanels.VXLAN_INPUT_IDS.forEach((inputId) => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.addEventListener("input", () => {
          const { isValid } = this.validateNetworkFields(networkType);
          const saveButton = document.getElementById(
            ManagerViewportPanels.ID_NETWORK_SAVE_BUTTON
          ) as HTMLButtonElement;
          if (saveButton) this.setButtonValidationState(saveButton, isValid);
        });
      }
    });

    this.setupNetworkOkButton(networkType, node, panel);
    this.setupNetworkApplyButton(networkType, node);
  }

  /**
   * Validate network editor fields. When showErrors is true, highlight missing values.
   */
  private validateNetworkFields(
    networkType: string,
    showErrors = false
  ): { isValid: boolean; errors: string[] } {
    const currentType =
      (
        document.getElementById(
          ManagerViewportPanels.ID_NETWORK_TYPE_FILTER_INPUT
        ) as HTMLInputElement
      )?.value || networkType;
    this.clearNetworkValidationStyles();
    const errors = this.collectNetworkErrors(currentType, showErrors);
    if (showErrors) this.displayNetworkValidationErrors(errors);
    else this.hideNetworkValidationErrors();
    return { isValid: errors.length === 0, errors };
  }

  private clearNetworkValidationStyles(): void {
    ManagerViewportPanels.VXLAN_INPUT_IDS.forEach((id) => {
      document.getElementById(id)?.classList.remove("border-red-500", "border-2");
    });
  }

  private collectNetworkErrors(currentType: string, showErrors: boolean): string[] {
    if (!(ManagerViewportPanels.VX_TYPES as readonly string[]).includes(currentType)) return [];
    const fields = [
      { id: ManagerViewportPanels.ID_NETWORK_REMOTE, msg: "Remote IP is required" },
      { id: ManagerViewportPanels.ID_NETWORK_VNI, msg: "VNI is required" },
      { id: ManagerViewportPanels.ID_NETWORK_UDP_PORT, msg: "UDP Port is required" }
    ];
    const errors: string[] = [];
    fields.forEach(({ id, msg }) => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (!el?.value?.trim()) {
        errors.push(msg);
        if (showErrors) el?.classList.add("border-red-500", "border-2");
      }
    });
    return errors;
  }

  private displayNetworkValidationErrors(errors: string[]): void {
    const errorContainer = document.getElementById("panel-network-validation-errors");
    const errorList = document.getElementById("panel-network-validation-errors-list");
    if (!errorContainer || !errorList) return;
    if (errors.length > 0) {
      errorList.innerHTML = errors.map((err) => `<li>${err}</li>`).join("");
      errorContainer.style.display = "block";
    } else {
      errorContainer.style.display = "none";
    }
  }

  private hideNetworkValidationErrors(): void {
    const errorContainer = document.getElementById("panel-network-validation-errors");
    if (errorContainer) errorContainer.style.display = "none";
  }

  /**
   * Captures current values from network editor inputs for change tracking.
   */
  private captureNetworkEditorValues(): Record<string, string> {
    const typeInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_TYPE_FILTER_INPUT
    ) as HTMLInputElement | null;
    const interfaceInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_INTERFACE
    ) as HTMLInputElement | null;
    const labelInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_LABEL
    ) as HTMLInputElement | null;
    const remoteInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_REMOTE
    ) as HTMLInputElement | null;
    const vniInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_VNI
    ) as HTMLInputElement | null;
    const udpPortInput = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_UDP_PORT
    ) as HTMLInputElement | null;

    return {
      type: typeInput?.value || "",
      interface: interfaceInput?.value || "",
      label: labelInput?.value || "",
      remote: remoteInput?.value || "",
      vni: vniInput?.value || "",
      udpPort: udpPortInput?.value || ""
    };
  }

  /**
   * Checks if there are unsaved changes in the network editor.
   */
  private hasNetworkEditorChanges(): boolean {
    if (!this.networkEditorInitialValues) return false;
    const current = this.captureNetworkEditorValues();
    return Object.keys(this.networkEditorInitialValues).some(
      (key) => this.networkEditorInitialValues![key] !== current[key]
    );
  }

  /**
   * Updates the network editor Apply button visual state.
   */
  private updateNetworkApplyButtonState(): void {
    const applyBtn = document.getElementById("panel-network-editor-apply-button");
    if (!applyBtn) return;
    const hasChanges = this.hasNetworkEditorChanges();
    applyBtn.classList.toggle(ManagerViewportPanels.CLASS_HAS_CHANGES, hasChanges);
  }

  /**
   * Resets network editor initial values after applying changes.
   */
  private resetNetworkEditorInitialValues(): void {
    this.networkEditorInitialValues = this.captureNetworkEditorValues();
    this.updateNetworkApplyButtonState();
  }

  /**
   * Displays the network editor panel for a cloud network node.
   * @param node - The Cytoscape node representing the network.
   */
  public async panelNetworkEditor(node: cytoscape.NodeSingular): Promise<void> {
    this.nodeClicked = true;
    // Allow multiple panels to be open at once
    // this.hidePanelOverlays();

    const nodeId = node.data("id") as string;
    const nodeData = node.data();
    const parts = nodeId.split(":");
    const networkType = nodeData.extraData?.kind || parts[0] || ManagerViewportPanels.TYPE_HOST;
    const interfaceName = this.getInterfaceNameForEditor(networkType, nodeId, nodeData);

    const idLabel = document.getElementById("panel-network-editor-id");
    if (idLabel) idLabel.textContent = nodeId;

    this.initializeNetworkTypeDropdown(networkType);
    this.configureInterfaceField(networkType, interfaceName);
    this.populateNetworkExtendedProperties(node);
    this.updateNetworkEditorFields(networkType);
    this.setBridgeAliasLabelInput(nodeData, networkType);

    const panel = document.getElementById("panel-network-editor");
    if (panel) panel.style.display = "block";

    // Title bar close button
    const closeBtn = document.getElementById("panel-network-editor-close");
    if (closeBtn && panel) {
      const freshClose = closeBtn.cloneNode(true) as HTMLElement;
      closeBtn.parentNode?.replaceChild(freshClose, closeBtn);
      freshClose.addEventListener("click", () => {
        panel.style.display = "none";
      });
    }

    // Capture initial values for change tracking after a small delay to ensure DOM is updated
    setTimeout(() => {
      this.networkEditorInitialValues = this.captureNetworkEditorValues();
      this.updateNetworkApplyButtonState();
    }, 0);

    this.setupNetworkValidation(networkType, node, panel);
  }

  private getInterfaceNameForEditor(networkType: string, nodeId: string, nodeData: any): string {
    if (ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) {
      const yamlId =
        nodeData?.extraData && typeof nodeData.extraData.extYamlNodeId === "string"
          ? nodeData.extraData.extYamlNodeId
          : "";
      return yamlId || nodeId;
    }
    if (networkType === ManagerViewportPanels.TYPE_DUMMY) {
      return "";
    }
    const parts = nodeId.split(":");
    return parts[1] || "eth1";
  }
  private setBridgeAliasLabelInput(nodeData: any, networkType: string): void {
    const input = document.getElementById(
      ManagerViewportPanels.ID_NETWORK_LABEL
    ) as HTMLInputElement | null;
    if (!input) return;
    if (ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)) {
      const currentName = (nodeData && typeof nodeData.name === "string" && nodeData.name) || "";
      input.value = currentName;
    } else {
      input.value = "";
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
    return this.linkEditorManager.panelEdgeEditor(edge);
  }


  private collectDynamicEntries(prefix: string): Record<string, string> {
    const entries = document.querySelectorAll(`[id^="${prefix}-entry-"]`);
    const parsed: Record<string, string> = {};
    entries.forEach((entry) => {
      const keyInput = entry.querySelector(`[data-field="${prefix}-key"]`) as HTMLInputElement;
      const valueInput = entry.querySelector(`[data-field="${prefix}-value"]`) as HTMLInputElement;
      if (keyInput && valueInput && keyInput.value.trim()) {
        parsed[keyInput.value.trim()] = valueInput.value;
      }
    });
    return parsed;
  }

  private ensureSingleNode(node: cytoscape.NodeSingular): cytoscape.NodeSingular {
    return (node as any).length && (node as any).length > 1 ? (node as any)[0] : node;
  }

  private getNetworkEditorInputs() {
    const networkType =
      (
        document.getElementById(
          ManagerViewportPanels.ID_NETWORK_TYPE_FILTER_INPUT
        ) as HTMLInputElement | null
      )?.value || ManagerViewportPanels.TYPE_HOST;
    const interfaceName =
      (
        document.getElementById(
          ManagerViewportPanels.ID_NETWORK_INTERFACE
        ) as HTMLInputElement | null
      )?.value || "eth1";
    return {
      networkType,
      interfaceName,
      label: (
        document.getElementById(ManagerViewportPanels.ID_NETWORK_LABEL) as HTMLInputElement | null
      )?.value,
      mac: (document.getElementById("panel-network-mac") as HTMLInputElement | null)?.value,
      mtu: (document.getElementById("panel-network-mtu") as HTMLInputElement | null)?.value,
      mode: (document.getElementById("panel-network-mode") as HTMLSelectElement | null)?.value,
      remote: (
        document.getElementById(ManagerViewportPanels.ID_NETWORK_REMOTE) as HTMLInputElement | null
      )?.value,
      vni: (
        document.getElementById(ManagerViewportPanels.ID_NETWORK_VNI) as HTMLInputElement | null
      )?.value,
      udpPort: (
        document.getElementById(
          ManagerViewportPanels.ID_NETWORK_UDP_PORT
        ) as HTMLInputElement | null
      )?.value
    };
  }

  private buildNetworkIdentifiers(
    currentData: any,
    networkType: string,
    interfaceName: string,
    label?: string,
    remote?: string,
    vni?: string,
    udpPort?: string
  ) {
    const oldId = currentData.id as string;
    const oldName = currentData.name as string;
    const isBridgeType = ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any);
    const isDummyType = networkType === ManagerViewportPanels.TYPE_DUMMY;
    let newId = "";
    if (isBridgeType) {
      // Preserve existing ID for bridge nodes to support alias visuals;
      // Interface field maps to YAML id via extYamlNodeId and becomes display name.
      newId = oldId;
    } else if (isDummyType) {
      newId = oldId.startsWith(ManagerViewportPanels.TYPE_DUMMY)
        ? oldId
        : this.generateUniqueDummyId();
    } else if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(networkType)) {
      newId = `${networkType}:${remote ?? ""}/${vni ?? ""}/${udpPort ?? ""}`;
    } else {
      newId = `${networkType}:${interfaceName}`;
    }
    let displayName: string;
    if (isBridgeType) {
      const trimmedLabel = (label && label.trim()) || "";
      displayName = trimmedLabel || interfaceName || oldName || newId;
    } else if (isDummyType) {
      displayName = ManagerViewportPanels.TYPE_DUMMY;
    } else {
      displayName = newId;
    }
    return { oldId, oldName, newId, displayName };
  }

  private buildNetworkExtendedData(inputs: any, currentExtra: any): any {
    const extendedData: any = { ...currentExtra, kind: inputs.networkType };
    this.assignCommonNetworkExt(extendedData, inputs);
    this.assignMacvlanPropsNetwork(extendedData, inputs);
    this.assignVxlanPropsNetwork(extendedData, inputs);
    this.assignHostInterfaceProp(extendedData, inputs);
    this.assignYamlNodeMappingIfBridge(extendedData, inputs);
    return extendedData;
  }

  private assignCommonNetworkExt(target: any, inputs: any): void {
    if (inputs.mac) target.extMac = inputs.mac;
    if (inputs.mtu) target.extMtu = Number(inputs.mtu);
    const vars = this.collectDynamicEntries("network-vars");
    if (Object.keys(vars).length) target.extVars = vars;
    const labels = this.collectDynamicEntries("network-labels");
    if (Object.keys(labels).length) target.extLabels = labels;
  }

  private assignMacvlanPropsNetwork(target: any, inputs: any): void {
    if (inputs.networkType === "macvlan" && inputs.mode) target.extMode = inputs.mode;
  }

  private assignVxlanPropsNetwork(target: any, inputs: any): void {
    if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(inputs.networkType)) {
      if (inputs.remote) target.extRemote = inputs.remote;
      if (inputs.vni) target.extVni = Number(inputs.vni);
      if (inputs.udpPort) target.extUdpPort = Number(inputs.udpPort);
    }
  }

  private assignHostInterfaceProp(target: any, inputs: any): void {
    if (
      (ManagerViewportPanels.HOSTY_TYPES as readonly string[]).includes(inputs.networkType) &&
      inputs.interfaceName
    ) {
      target.extHostInterface = inputs.interfaceName;
    }
  }

  private assignYamlNodeMappingIfBridge(target: any, inputs: any): void {
    if (
      ManagerViewportPanels.BRIDGE_TYPES.includes(inputs.networkType as any) &&
      inputs.interfaceName
    ) {
      target.extYamlNodeId = String(inputs.interfaceName).trim();
    }
  }

  private applyNetworkDataSameId(
    targetNode: cytoscape.NodeSingular,
    currentData: any,
    newName: string,
    networkType: string,
    extendedData: any
  ): void {
    const updatedData = {
      ...currentData,
      name: newName,
      topoViewerRole: ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)
        ? "bridge"
        : "cloud",
      extraData: { ...extendedData, kind: networkType }
    };
    targetNode.data(updatedData);
    targetNode.connectedEdges().forEach((edge) => {
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
  }

  private recreateNetworkNode(
    targetNode: cytoscape.NodeSingular,
    currentData: any,
    ids: any,
    networkType: string,
    extendedData: any
  ): void {
    const position = targetNode.position();
    const connectedEdges = targetNode.connectedEdges().map((edge) => ({
      data: edge.data(),
      classes: edge.classes()
    }));
    this.cy.remove(targetNode);
    const newNodeData = {
      ...currentData,
      id: ids.newId,
      name: ids.displayName,
      topoViewerRole: ManagerViewportPanels.BRIDGE_TYPES.includes(networkType as any)
        ? "bridge"
        : "cloud",
      extraData: { ...extendedData, kind: networkType }
    };
    this.cy.add({ group: "nodes", data: newNodeData, position });
    connectedEdges.forEach((edgeInfo) => {
      const newEdgeData = { ...edgeInfo.data };
      if (newEdgeData.source === ids.oldId) newEdgeData.source = ids.newId;
      if (newEdgeData.target === ids.oldId) newEdgeData.target = ids.newId;
      if (newEdgeData.sourceName === ids.oldName) newEdgeData.sourceName = ids.displayName;
      if (newEdgeData.targetName === ids.oldName) newEdgeData.targetName = ids.displayName;
      newEdgeData.extraData = {
        ...(newEdgeData.extraData || {}),
        ...this.getNetworkExtendedPropertiesForEdge(networkType, extendedData)
      };
      let edgeClasses = edgeInfo.classes || [];
      const isStubLink =
        isSpecialNodeOrBridge(newEdgeData.source, this.cy) ||
        isSpecialNodeOrBridge(newEdgeData.target, this.cy);
      if (isStubLink && !edgeClasses.includes("stub-link"))
        edgeClasses = [...edgeClasses, "stub-link"];
      this.cy.add({ group: "edges", data: newEdgeData, classes: edgeClasses.join(" ") });
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
    const props = ["extMac", "extMtu", "extVars", "extLabels"];
    const result: any = {};
    props.forEach((prop) => {
      if (nodeExtraData[prop] !== undefined) result[prop] = nodeExtraData[prop];
    });
    return result;
  }

  private addNetworkSpecificProps(target: any, networkType: string, nodeExtraData: any): void {
    const copy = (prop: string) => {
      if (nodeExtraData[prop] !== undefined) target[prop] = nodeExtraData[prop];
    };
    if ((ManagerViewportPanels.HOSTY_TYPES as readonly string[]).includes(networkType))
      copy("extHostInterface");
    if (networkType === "macvlan") copy("extMode");
    if ((ManagerViewportPanels.VX_TYPES as readonly string[]).includes(networkType)) {
      ["extRemote", "extVni", "extUdpPort"].forEach(copy);
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
   * Creates a filterable dropdown with search functionality.
   * @param containerId - The ID of the container element
   * @param options - Array of options to display
   * @param currentValue - Currently selected value
   * @param onSelect - Callback function when an option is selected
   * @param placeholder - Placeholder text for the filter input
   */
  // Removed legacy dropdown builder in favor of shared utility (utilities/filterableDropdown)
}
