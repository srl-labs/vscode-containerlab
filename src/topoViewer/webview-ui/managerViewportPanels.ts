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
    const interfaceLabel = Array.from(document.querySelectorAll('.label')).find(el =>
      el.textContent === 'Interface' || el.textContent === 'Bridge Name'
    );

    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Bridge Name';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'Enter bridge name';
      }
    } else {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Interface';
      }
      if (interfaceInput) {
        interfaceInput.placeholder = 'Enter interface name';
      }
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
        : parts[1] || 'eth1';

    // Set fields
    const idLabel = document.getElementById('panel-network-editor-id');
    if (idLabel) {
      idLabel.textContent = nodeId;
    }

    // Initialize network type filterable dropdown
    const networkTypeOptions = ['host', 'mgmt-net', 'macvlan', 'vxlan', 'vxlan-stitch', 'bridge', 'ovs-bridge'];
    this.createFilterableDropdown(
      'panel-network-type-dropdown-container',
      networkTypeOptions,
      networkType,
      (selectedValue: string) => {
        log.debug(`Network type ${selectedValue} selected`);
        this.updateNetworkEditorFields(selectedValue);
      },
      'Search for network type...'
    );

    const interfaceInput = document.getElementById('panel-network-interface') as HTMLInputElement | null;
    const interfaceLabel = document.querySelector('[for="panel-network-interface"]') ||
                          document.querySelector('.label[class*="Interface"]') ||
                          Array.from(document.querySelectorAll('.label')).find(el => el.textContent === 'Interface');

    // Update field based on network type
    if (networkType === 'bridge' || networkType === 'ovs-bridge') {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Bridge Name';
      }
      if (interfaceInput) {
        interfaceInput.value = nodeId; // For bridges, the ID is the bridge name
      }
    } else {
      if (interfaceLabel) {
        interfaceLabel.textContent = 'Interface';
      }
      if (interfaceInput) {
        interfaceInput.value = interfaceName;
      }
    }

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

    const saveBtn = document.getElementById('panel-network-editor-save-button');
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true) as HTMLElement;
      saveBtn.parentNode?.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', async () => {
        await this.updateNetworkFromEditor(node);
        const suppressNotification = false;
        await this.saveManager.viewportButtonsSaveTopo(this.cy, suppressNotification);
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
      // If running in Editor mode and global setting indicates extended format, use extended editor
      const linkFormat = (window as any).linkFormat || '';
      const isEditor = (window as any).topoViewerMode === 'editor';
      if (isEditor && linkFormat === 'extended') {
        await this.panelEdgeEditorExtended(edge);
        return;
      }
      // Mark that an edge interaction occurred so global click handler doesn't immediately hide the panel
      this.edgeClicked = true;

      // 1) Hide other overlays
      const overlays = document.getElementsByClassName("panel-overlay");
      Array.from(overlays).forEach(el => (el as HTMLElement).style.display = "none");

      // 2) Grab the static parts and initial data
      const panelLinkEditor = document.getElementById("panel-link-editor");
      const panelLinkEditorIdLabel = document.getElementById("panel-link-editor-id");
      const panelLinkEditorIdLabelSrcInput = document.getElementById("panel-link-editor-source-endpoint") as HTMLInputElement | null;
      const panelLinkEditorIdLabelTgtInput = document.getElementById("panel-link-editor-target-endpoint") as HTMLInputElement | null;
      const panelLinkEditorIdLabelCloseBtn = document.getElementById("panel-link-editor-close-button");
      const panelLinkEditorIdLabelSaveBtn = document.getElementById("panel-link-editor-save-button");

      if (!panelLinkEditorIdLabel || !panelLinkEditor || !panelLinkEditorIdLabelSrcInput || !panelLinkEditorIdLabelTgtInput || !panelLinkEditorIdLabelCloseBtn || !panelLinkEditorIdLabelSaveBtn) {
        log.error('panelEdgeEditor: missing required DOM elements');
        this.edgeClicked = false;
        return;
      }
      const source = edge.data("source") as string;
      const target = edge.data("target") as string;
      const sourceEP = (edge.data("sourceEndpoint") as string) || "";
      const targetEP = (edge.data("targetEndpoint") as string) || "";

      // Populate inputs with current endpoint values
      panelLinkEditorIdLabelSrcInput.value = sourceEP;
      panelLinkEditorIdLabelTgtInput.value = targetEP;

      // Helper to sync the ID label from whatever is in the inputs right now
      const updateLabel = () => {
        const s = panelLinkEditorIdLabelSrcInput.value.trim();
        const t = panelLinkEditorIdLabelTgtInput.value.trim();
        panelLinkEditorIdLabel.innerHTML =
          `┌ ${source} :: ${s}<br>` +
          `└ ${target} :: ${t}`;
      };

      // Initial label fill
      updateLabel();

      // 3) Show the panel
      panelLinkEditor.style.display = "block";

      // 4) Re-wire Close button (one-shot)
      const freshClose = panelLinkEditorIdLabelCloseBtn.cloneNode(true) as HTMLElement;
      panelLinkEditorIdLabelCloseBtn.parentNode!.replaceChild(freshClose, panelLinkEditorIdLabelCloseBtn);
      freshClose.addEventListener("click", () => {
        panelLinkEditor.style.display = "none";
        this.edgeClicked = false;
      }, { once: true });

      // 5) Wire real-time preview (optional but helpful)
      panelLinkEditorIdLabelSrcInput.addEventListener("input", updateLabel);
      panelLinkEditorIdLabelTgtInput.addEventListener("input", updateLabel);

      // 6) Wire up Save button
      if (panelLinkEditorIdLabelSaveBtn) {
        const freshSave = panelLinkEditorIdLabelSaveBtn.cloneNode(true) as HTMLElement;
        panelLinkEditorIdLabelSaveBtn.parentNode?.replaceChild(freshSave, panelLinkEditorIdLabelSaveBtn);

        freshSave.addEventListener(
          "click",
          async () => {
            try {
              // 6a) Update edge data from inputs
              const newSourceEP = panelLinkEditorIdLabelSrcInput.value.trim();
              const newTargetEP = panelLinkEditorIdLabelTgtInput.value.trim();
              edge.data({
                sourceEndpoint: newSourceEP,
                targetEndpoint: newTargetEP
              });

              // 6b) Persist changes (with notification)
              await this.saveManager.viewportButtonsSaveTopo(
                this.cy,
                /* suppressNotification */ false
              );

              // 6c) Refresh the ID label so it shows saved values
              if (panelLinkEditorIdLabel) {
                panelLinkEditorIdLabel.innerHTML =
                  `┌ ${source} :: ${newSourceEP}<br>` +
                  `└ ${target} :: ${newTargetEP}`;
              }

              // 6d) Hide the panel
              panelLinkEditor.style.display = "none";
              // Reset the edgeClicked flag
              this.edgeClicked = false;
            } catch (saveErr) {
              log.error(`panelEdgeEditor: error during save: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
              // TODO: show user-facing notification if needed
            }
          },
          { once: true }
        );
      }

      // Reset the edgeClicked flag after a small delay to ensure the panel stays open
      setTimeout(() => {
        this.edgeClicked = false;
      }, 100);

    } catch (err) {
      log.error(`panelEdgeEditor: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      this.edgeClicked = false;
      // TODO: show user-facing notification if needed
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

    const panel = document.getElementById('panel-link-extended-editor');
    const idLabel = document.getElementById('panel-link-extended-editor-id');
    const closeBtn = document.getElementById('panel-link-extended-editor-close-button');
    const saveBtn = document.getElementById('panel-link-extended-editor-save-button');
    const typeDropdownContainerId = 'panel-link-ext-type-dropdown-container';

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
      (idLabel as HTMLElement).innerHTML = `┌ ${source} :: ${sourceEP}<br>└ ${target} :: ${targetEP}`;
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

    // Build the type dropdown (handled below after wiring validation)
    const typeOptions = ['veth', 'mgmt-net', 'host', 'macvlan', 'vxlan', 'vxlan-stitch', 'dummy'];
    const extraData = edge.data('extraData') || {};
    const currentType = extraData.extType || '';

    // Field elements
    const srcMacEl = document.getElementById('panel-link-ext-src-mac') as HTMLInputElement | null;
    const tgtMacEl = document.getElementById('panel-link-ext-tgt-mac') as HTMLInputElement | null;
    const mtuEl = document.getElementById('panel-link-ext-mtu') as HTMLInputElement | null;
    const varsEl = document.getElementById('panel-link-ext-vars') as HTMLTextAreaElement | null;
    const labelsEl = document.getElementById('panel-link-ext-labels') as HTMLTextAreaElement | null;
    const varsErrEl = document.getElementById('panel-link-ext-vars-error') as HTMLElement | null;
    const labelsErrEl = document.getElementById('panel-link-ext-labels-error') as HTMLElement | null;
    const hostIfEl = document.getElementById('panel-link-ext-host-interface') as HTMLInputElement | null;
    const modeEl = document.getElementById('panel-link-ext-mode') as HTMLSelectElement | null;
    const remoteEl = document.getElementById('panel-link-ext-remote') as HTMLInputElement | null;
    const vniEl = document.getElementById('panel-link-ext-vni') as HTMLInputElement | null;
    const udpPortEl = document.getElementById('panel-link-ext-udp-port') as HTMLInputElement | null;
    const banner = document.getElementById('panel-link-ext-errors') as HTMLElement | null;
    const bannerList = document.getElementById('panel-link-ext-errors-list') as HTMLElement | null;
    const setSaveDisabled = (disabled: boolean) => {
      const btn = document.getElementById('panel-link-extended-editor-save-button') as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = disabled;
      btn.classList.toggle('opacity-50', disabled);
      btn.classList.toggle('cursor-not-allowed', disabled);
    };

    // Prefill from extraData
    if (srcMacEl) srcMacEl.value = extraData.extSourceMac || '';
    if (tgtMacEl) tgtMacEl.value = extraData.extTargetMac || '';
    if (mtuEl) mtuEl.value = extraData.extMtu != null ? String(extraData.extMtu) : '';
    if (varsEl) varsEl.value = extraData.extVars ? JSON.stringify(extraData.extVars, null, 2) : '';
    if (labelsEl) labelsEl.value = extraData.extLabels ? JSON.stringify(extraData.extLabels, null, 2) : '';
    if (hostIfEl) hostIfEl.value = extraData.extHostInterface || '';
    if (modeEl) modeEl.value = extraData.extMode || '';
    if (remoteEl) remoteEl.value = extraData.extRemote || '';
    if (vniEl) vniEl.value = extraData.extVni != null ? String(extraData.extVni) : '';
    if (udpPortEl) udpPortEl.value = extraData.extUdpPort != null ? String(extraData.extUdpPort) : '';

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

    // Live validation on inputs
    const validate = (): string[] => {
      // Read selected type
      const typeInput = document.getElementById(`${typeDropdownContainerId}-filter-input`) as HTMLInputElement | null;
      const selectedType = (typeInput?.value || 'veth').trim();
      const errs: string[] = [];
      // Clear previous highlighting
      [hostIfEl, remoteEl, vniEl, udpPortEl].forEach(el => { if (el) el.style.borderColor = ''; });
      if (['mgmt-net','host','macvlan'].includes(selectedType)) {
        const val = (hostIfEl?.value || '').trim();
        if (!val) { errs.push('missing-host-interface'); if (hostIfEl) hostIfEl.style.borderColor = 'var(--vscode-editorError-foreground)'; }
      }
      if (selectedType === 'vxlan' || selectedType === 'vxlan-stitch') {
        const r = (remoteEl?.value || '').trim();
        const v = (vniEl?.value || '').trim();
        const u = (udpPortEl?.value || '').trim();
        if (!r) { errs.push('missing-remote'); if (remoteEl) remoteEl.style.borderColor = 'var(--vscode-editorError-foreground)'; }
        if (!v) { errs.push('missing-vni'); if (vniEl) vniEl.style.borderColor = 'var(--vscode-editorError-foreground)'; }
        if (!u) { errs.push('missing-udp-port'); if (udpPortEl) udpPortEl.style.borderColor = 'var(--vscode-editorError-foreground)'; }
      }
      return errs;
    };

    const attachRevalidate = (el: HTMLElement | null) => { if (!el) return; el.addEventListener('input', () => { renderErrors(validate()); }); };
    [hostIfEl, modeEl, remoteEl, vniEl, udpPortEl, mtuEl, varsEl, labelsEl].forEach(el => attachRevalidate(el as any));
    // Also revalidate on type change via dropdown callback
    this.createFilterableDropdown(
      typeDropdownContainerId,
      typeOptions,
      currentType || 'veth',
      (selectedValue: string) => {
        this.panelLinkExtendedToggleSections(selectedValue);
        renderErrors(validate());
      },
      'Select link type...'
    );
    // Ensure section visibility matches current type
    this.panelLinkExtendedToggleSections(currentType || 'veth');

    // Save button
    const freshSave = saveBtn.cloneNode(true) as HTMLElement;
    saveBtn.parentNode?.replaceChild(freshSave, saveBtn);
    freshSave.addEventListener('click', async () => {
      try {
        const errsNow = validate();
        if (errsNow.length) { renderErrors(errsNow); return; }
        // Read current type from dropdown input value
        const typeInput = document.getElementById(`${typeDropdownContainerId}-filter-input`) as HTMLInputElement | null;
        const selectedType = (typeInput?.value || 'veth').trim();

        // JSON validation
        let parsedVars: any = undefined;
        let parsedLabels: any = undefined;
        if (varsErrEl) varsErrEl.style.display = 'none';
        if (labelsErrEl) labelsErrEl.style.display = 'none';
        if (varsEl && varsEl.value.trim() !== '') {
          try { parsedVars = JSON.parse(varsEl.value); }
          catch { if (varsErrEl) varsErrEl.style.display = 'block'; return; }
        }
        if (labelsEl && labelsEl.value.trim() !== '') {
          try { parsedLabels = JSON.parse(labelsEl.value); }
          catch { if (labelsErrEl) labelsErrEl.style.display = 'block'; return; }
        }

        const current = edge.data();
        const updatedExtra = { ...(current.extraData || {}) } as any;

        // Common
        if (srcMacEl) updatedExtra.extSourceMac = srcMacEl.value.trim() || undefined;
        if (tgtMacEl) updatedExtra.extTargetMac = tgtMacEl.value.trim() || undefined;
        if (mtuEl) updatedExtra.extMtu = mtuEl.value ? Number(mtuEl.value) : undefined;
        if (varsEl) updatedExtra.extVars = parsedVars;
        if (labelsEl) updatedExtra.extLabels = parsedLabels;
        updatedExtra.extType = selectedType;

        // Clear all per-type keys first to avoid stale data
        delete updatedExtra.extHostInterface;
        delete updatedExtra.extMode;
        delete updatedExtra.extRemote;
        delete updatedExtra.extVni;
        delete updatedExtra.extUdpPort;

        // Per-type
        if (['mgmt-net', 'host', 'macvlan'].includes(selectedType)) {
          if (hostIfEl) updatedExtra.extHostInterface = hostIfEl.value.trim() || undefined;
          if (selectedType === 'macvlan' && modeEl) {
            updatedExtra.extMode = modeEl.value || undefined;
          }
        }
        if (['vxlan', 'vxlan-stitch'].includes(selectedType)) {
          if (remoteEl) updatedExtra.extRemote = remoteEl.value.trim() || undefined;
          if (vniEl) updatedExtra.extVni = vniEl.value ? Number(vniEl.value) : undefined;
          if (udpPortEl) updatedExtra.extUdpPort = udpPortEl.value ? Number(udpPortEl.value) : undefined;
        }

        // Apply to edge
        edge.data({ ...current, extraData: updatedExtra });

        // Persist
        await this.saveManager.viewportButtonsSaveTopo(this.cy, /* suppressNotification */ false);

        // Hide panel after save
        panel.style.display = 'none';
        this.edgeClicked = false;
      } catch (err) {
        log.error(`panelEdgeEditorExtended: error during save: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, { once: true });

    // Slight delay before allowing global click to close
    setTimeout(() => { this.edgeClicked = false; }, 100);
  }

  // Toggle visibility of per-type sections in the extended editor
  private panelLinkExtendedToggleSections(selectedType: string): void {
    const isHostIface = ['mgmt-net', 'host', 'macvlan'].includes(selectedType);
    const isMacvlan = selectedType === 'macvlan';
    const isVxlan = selectedType === 'vxlan' || selectedType === 'vxlan-stitch';

    const hostIfaceSection = document.querySelector('[data-section="host-iface"]') as HTMLElement | null;
    const macvlanModeSection = document.querySelector('[data-section="macvlan-mode"]') as HTMLElement | null;
    const vxlanSections = document.querySelectorAll('[data-section="vxlan"]');

    if (hostIfaceSection) hostIfaceSection.style.display = isHostIface ? 'block' : 'none';
    if (macvlanModeSection) macvlanModeSection.style.display = isMacvlan ? 'block' : 'none';
    vxlanSections.forEach(el => ((el as HTMLElement).style.display = isVxlan ? 'block' : 'none'));
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

    // If the node’s name actually changed, update connected edges.
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

    const currentData = targetNode.data();
    const oldId = currentData.id as string;
    const oldName = currentData.name as string;

    // Build new ID from network type and interface
    const networkType = networkTypeInput ? networkTypeInput.value : 'host';
    const interfaceName = interfaceInput ? interfaceInput.value : 'eth1';
    const isBridgeType = networkType === 'bridge' || networkType === 'ovs-bridge';
    const newId = isBridgeType ? interfaceName : `${networkType}:${interfaceName}`;
    const newName = newId;

    // If ID hasn't changed, just update the data
    if (oldId === newId) {
      const updatedData = {
        ...currentData,
        name: newName,
        topoViewerRole: (networkType === 'bridge' || networkType === 'ovs-bridge') ? 'bridge' : 'cloud',
        extraData: {
          ...currentData.extraData,
          kind: networkType
        }
      };
      targetNode.data(updatedData);
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
          ...currentData.extraData,
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

    const panel = document.getElementById('panel-network-editor');
    if (panel) {
      panel.style.display = 'none';
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
