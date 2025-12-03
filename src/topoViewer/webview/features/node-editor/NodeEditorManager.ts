// NodeEditorManager.ts

import cytoscape from "cytoscape";
import { log } from "../../platform/logging/logger";
import { createFilterableDropdown } from "../../ui/FilterableDropdown";
import { ManagerSaveTopo } from "../../core/SaveManager";
import { VscodeMessageSender } from "../../platform/messaging/VscodeMessaging";
import { applyIconColorToNode } from "../canvas/BaseStyles";
import { DEFAULT_INTERFACE_PATTERN } from "../../ui/InterfacePatternUtils";
import { ComponentsManager, ComponentsManagerUtilities } from "./ComponentsManager";
import { IconEditorManager, IconEditorUtilities } from "./IconEditorManager";
import { ValidationManager, ValidationUtilities } from "./ValidationManager";
import { DynamicEntriesManager } from "./DynamicEntriesManager";
import { TabContentManager, NodeProperties, FormUtilities } from "./TabContentManager";
import { ImageManager, ImageFormUtilities } from "./ImageManager";
import { NodeDataUtilsManager } from "./NodeDataUtils";
import { TabNavigationManager } from "./TabNavigationManager";
import { InheritanceBadgeManager, NodeDataAccessor } from "./InheritanceBadgeManager";
import { CustomNodeManager, CustomNodeFormUtilities, CustomNodeContext } from "./CustomNodeManager";
import { KindTypeManager, KindTypeUtilities } from "./KindTypeManager";
import { IconSelectionManager, IconSelectionUtilities } from "./IconSelectionManager";
import { ChangeTrackingManager } from "./ChangeTrackingManager";
import {
  CLASS_HIDDEN,
  CLASS_DYNAMIC_DELETE_BTN,
  ID_PANEL_NODE_EDITOR,
  ID_PANEL_EDITOR_CLOSE,
  ID_PANEL_EDITOR_APPLY,
  ID_PANEL_EDITOR_SAVE,
  ID_NODE_CERT_ISSUE,
  ID_CERT_OPTIONS,
  ID_PANEL_NODE_EDITOR_ID,
  ID_NODE_RP_DROPDOWN,
  ID_NODE_NM_DROPDOWN,
  ID_NODE_IPP_DROPDOWN,
  ID_NODE_RUNTIME_DROPDOWN,
  ID_NODE_INTERFACE_PATTERN,
  ID_NODE_NAME,
  ID_PANEL_NODE_TOPOROLE_FILTER_INPUT,
  ID_NODE_KIND_FILTER_INPUT,
  ID_NODE_CERT_KEYSIZE_DROPDOWN,
  LABEL_DEFAULT,
  PH_SEARCH_RP,
  PH_SEARCH_NM,
  PH_SEARCH_IPP,
  PH_SEARCH_RUNTIME,
  PH_SEARCH_KEY_SIZE,
  OPTIONS_RP,
  OPTIONS_NM,
  OPTIONS_IPP,
  OPTIONS_RUNTIME,
  DATA_ATTR_CONTAINER,
  DATA_ATTR_ENTRY_ID,
  ID_TEMP_CUSTOM_NODE,
  ID_EDIT_CUSTOM_NODE,
  FIELD_MAPPINGS_BASE
} from "./NodeEditorConstants";

/**
 * ManagerNodeEditor handles the node editor with tabs for all Containerlab properties
 */
export class ManagerNodeEditor {
  private cy: cytoscape.Core;
  private saveManager: ManagerSaveTopo;
  private currentNode: cytoscape.NodeSingular | null = null;
  private panel: HTMLElement | null = null;
  private messageSender: VscodeMessageSender;

  // Delegate management to separate classes
  private componentsManager: ComponentsManager;
  private iconEditorManager: IconEditorManager;
  private validationManager: ValidationManager;
  private dynamicEntriesManager: DynamicEntriesManager;
  private tabContentManager: TabContentManager;
  private imageManager: ImageManager;
  private nodeDataUtils: NodeDataUtilsManager;
  private tabNavigationManager: TabNavigationManager;
  private inheritanceBadgeManager: InheritanceBadgeManager;
  private customNodeManager: CustomNodeManager;
  private kindTypeManager: KindTypeManager;
  private iconSelectionManager: IconSelectionManager;
  private changeTrackingManager: ChangeTrackingManager;

  constructor(cy: cytoscape.Core, saveManager: ManagerSaveTopo) {
    this.cy = cy;
    this.saveManager = saveManager;
    this.messageSender = saveManager.getMessageSender();

    this.componentsManager = this.createComponentsManager();
    this.iconEditorManager = this.createIconEditorManager();
    this.dynamicEntriesManager = this.createDynamicEntriesManager();
    this.validationManager = this.createValidationManager();
    this.tabContentManager = this.createTabContentManager();
    this.imageManager = this.createImageManager();
    this.nodeDataUtils = new NodeDataUtilsManager();
    this.tabNavigationManager = new TabNavigationManager();
    this.inheritanceBadgeManager = this.createInheritanceBadgeManager();
    this.customNodeManager = this.createCustomNodeManager();
    this.kindTypeManager = this.createKindTypeManager();
    this.iconSelectionManager = this.createIconSelectionManager();
    this.changeTrackingManager = new ChangeTrackingManager();

    this.initializePanel();
  }

  private createComponentsManager(): ComponentsManager {
    const utilities: ComponentsManagerUtilities = {
      getInputValue: (id: string) => this.getInputValue(id),
      setInputValue: (id: string, value: string | number) => this.setInputValue(id, value),
      extractIndex: (id: string, re: RegExp) => this.extractIndex(id, re),
      switchToTab: (tabName: string) => this.tabNavigationManager.switchToTab(tabName)
    };
    return new ComponentsManager(utilities);
  }

  private createIconEditorManager(): IconEditorManager {
    const utilities: IconEditorUtilities = {
      getNodeIconOptions: () => this.iconSelectionManager.getNodeIconOptions(),
      getCurrentIconValue: () => this.iconSelectionManager.getCurrentIconValue(),
      handleIconUpload: () => this.iconSelectionManager.handleIconUpload(),
      normalizeIconColor: (raw: string, fallback: string | null) =>
        this.iconSelectionManager.normalizeIconColor(raw, fallback)
    };
    const manager = new IconEditorManager(utilities);
    manager.setCallbacks(
      (color) => this.iconSelectionManager.setIconColor(color),
      (radius) => this.iconSelectionManager.setIconCornerRadius(radius)
    );
    return manager;
  }

  private createValidationManager(): ValidationManager {
    const utilities: ValidationUtilities = {
      getInputValue: (id: string) => this.getInputValue(id),
      collectDynamicEntries: (containerName: string) =>
        this.dynamicEntriesManager.collectDynamicEntries(containerName),
      getPanel: () => this.panel
    };
    return new ValidationManager(utilities);
  }

  private createDynamicEntriesManager(): DynamicEntriesManager {
    const manager = new DynamicEntriesManager();
    manager.setComponentHandlers({
      addComponentEntry: (prefill, options) =>
        this.componentsManager.addComponentEntry(prefill, options),
      addIntegratedMdaEntry: () => this.componentsManager.addIntegratedMdaEntry()
    });
    return manager;
  }

  private createTabContentManager(): TabContentManager {
    const formUtils: FormUtilities = {
      setInputValue: (id: string, value: string | number) => this.setInputValue(id, value),
      getInputValue: (id: string) => this.getInputValue(id),
      setCheckboxValue: (id: string, value: boolean) => this.setCheckboxValue(id, value),
      getCheckboxValue: (id: string) => this.getCheckboxValue(id),
      markFieldInheritance: (fieldId: string, inherited: boolean) =>
        this.inheritanceBadgeManager.markFieldInheritance(fieldId, inherited)
    };
    return new TabContentManager(formUtils, this.dynamicEntriesManager);
  }

  private createImageManager(): ImageManager {
    const formUtils: ImageFormUtilities = {
      markFieldInheritance: (fieldId: string, inherited: boolean) =>
        this.inheritanceBadgeManager.markFieldInheritance(fieldId, inherited),
      computeActualInheritedProps: (extraData: any) =>
        this.nodeDataUtils.computeActualInheritedProps(extraData)
    };
    return new ImageManager(formUtils);
  }

  private createInheritanceBadgeManager(): InheritanceBadgeManager {
    const manager = new InheritanceBadgeManager();
    const accessor: NodeDataAccessor = {
      getCurrentNodeData: () => this.currentNode?.data(),
      setCurrentNodeData: (extraData: any) => {
        if (this.currentNode) {
          this.currentNode.data("extraData", extraData);
        }
      }
    };
    manager.setNodeDataAccessor(accessor);
    return manager;
  }

  private createCustomNodeManager(): CustomNodeManager {
    const formUtils: CustomNodeFormUtilities = {
      getInputValue: (id: string) => this.getInputValue(id),
      setInputValue: (id: string, value: string | number) => this.setInputValue(id, value),
      getCheckboxValue: (id: string) => this.getCheckboxValue(id),
      setCheckboxValue: (id: string, value: boolean) => this.setCheckboxValue(id, value)
    };
    const context: CustomNodeContext = {
      getCurrentNode: () => this.currentNode,
      getCurrentIconColor: () => this.iconSelectionManager.getCurrentIconColor(),
      getCurrentIconCornerRadius: () => this.iconSelectionManager.getCurrentIconCornerRadius(),
      getMessageSender: () => this.messageSender,
      closeEditor: () => this.close()
    };
    return new CustomNodeManager(formUtils, context);
  }

  private createKindTypeManager(): KindTypeManager {
    const utilities: KindTypeUtilities = {
      getInputValue: (id: string) => this.getInputValue(id),
      setInputValue: (id: string, value: string | number) => this.setInputValue(id, value),
      onKindChanged: (kind: string) => this.onKindChanged(kind),
      updateComponentMode: (reload?: boolean) => this.updateComponentMode(reload),
      getExistingNodeTypeValue: () => this.getExistingNodeTypeValue()
    };
    return new KindTypeManager(utilities);
  }

  private createIconSelectionManager(): IconSelectionManager {
    const utilities: IconSelectionUtilities = {
      getMessageSender: () => this.messageSender
    };
    return new IconSelectionManager(utilities);
  }

  private onKindChanged(selectedKind: string): void {
    this.componentsManager.setCurrentNode(this.currentNode);
    this.componentsManager.updateComponentsTabVisibility(selectedKind);

    if (this.customNodeManager.isCustomTemplateNode()) {
      const ifaceMap = (window as any).ifacePatternMapping || {};
      const defaultPattern = ifaceMap[selectedKind] || DEFAULT_INTERFACE_PATTERN;
      const ifaceInput = document.getElementById(
        ID_NODE_INTERFACE_PATTERN
      ) as HTMLInputElement | null;
      if (ifaceInput && !ifaceInput.value) {
        ifaceInput.value = defaultPattern;
      }
    }
  }

  private updateComponentMode(reload = true): void {
    this.componentsManager.setCurrentNode(this.currentNode);
    this.componentsManager.updateComponentMode(reload);
  }

  public handleDockerImagesUpdated(images: string[]): void {
    const extraData = this.currentNode?.data("extraData") || null;
    this.imageManager.handleDockerImagesUpdated(images, this.panel, extraData);
  }

  private initializePanel(): void {
    this.panel = document.getElementById(ID_PANEL_NODE_EDITOR);
    if (!this.panel) {
      log.error("Enhanced node editor panel not found in DOM");
      return;
    }

    this.changeTrackingManager.setPanel(this.panel);

    this.kindTypeManager.populateKindsFromSchema((schema) => {
      this.componentsManager.extractComponentEnumsFromSchema(schema);
      this.componentsManager.refreshComponentsDropdowns();
    }).catch((err) => {
      log.error(
        `Failed to populate kinds from schema: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    this.panel.addEventListener("mousedown", () => {
      if ((window as any).viewportPanels) {
        (window as any).viewportPanels.setNodeClicked(true);
      }
    });

    this.panel.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement;
        const deleteBtn = target.closest(`.${CLASS_DYNAMIC_DELETE_BTN}`);
        if (!deleteBtn) return;

        const containerName = deleteBtn.getAttribute(DATA_ATTR_CONTAINER);
        const entryId = deleteBtn.getAttribute(DATA_ATTR_ENTRY_ID);

        if (!containerName || !entryId) return;

        e.preventDefault();
        e.stopPropagation();

        log.debug(`Delete button clicked via delegation: ${containerName}-${entryId}`);

        if ((window as any).viewportPanels) {
          (window as any).viewportPanels.setNodeClicked(true);
        }

        this.dynamicEntriesManager.removeEntry(containerName, parseInt(entryId));
      },
      true
    );

    this.tabNavigationManager.setPanel(this.panel);
    this.tabNavigationManager.setupTabSwitching();
    this.tabNavigationManager.setupTabScrollArrows();

    this.setupEventHandlers();
    this.iconEditorManager.setupIconEditorControls();
    this.dynamicEntriesManager.setupDynamicEntryHandlers();
    this.initializeStaticDropdowns();
    this.inheritanceBadgeManager.setupInheritanceChangeListeners(FIELD_MAPPINGS_BASE);

    log.debug("Enhanced node editor panel initialized");
  }

  private initializeStaticDropdowns(): void {
    createFilterableDropdown(ID_NODE_RP_DROPDOWN, [...OPTIONS_RP], LABEL_DEFAULT, () => {}, PH_SEARCH_RP);
    createFilterableDropdown(ID_NODE_NM_DROPDOWN, [...OPTIONS_NM], LABEL_DEFAULT, () => {}, PH_SEARCH_NM);
    createFilterableDropdown(ID_NODE_CERT_KEYSIZE_DROPDOWN, ["2048", "4096"], "2048", () => {}, PH_SEARCH_KEY_SIZE);
    createFilterableDropdown(ID_NODE_IPP_DROPDOWN, [...OPTIONS_IPP], LABEL_DEFAULT, () => {}, PH_SEARCH_IPP);
    createFilterableDropdown(ID_NODE_RUNTIME_DROPDOWN, [...OPTIONS_RUNTIME], LABEL_DEFAULT, () => {}, PH_SEARCH_RUNTIME);
  }

  private setupEventHandlers(): void {
    const closeBtn = document.getElementById(ID_PANEL_EDITOR_CLOSE);
    closeBtn?.addEventListener("click", () => this.close());

    const applyBtn = document.getElementById(ID_PANEL_EDITOR_APPLY);
    applyBtn?.addEventListener("click", async () => {
      await this.save();
      this.changeTrackingManager.resetInitialValues();
    });

    const saveBtn = document.getElementById(ID_PANEL_EDITOR_SAVE);
    saveBtn?.addEventListener("click", async () => {
      await this.save();
      this.close();
    });

    const certCheckbox = document.getElementById(ID_NODE_CERT_ISSUE) as HTMLInputElement;
    const certOptions = document.getElementById(ID_CERT_OPTIONS);
    certCheckbox?.addEventListener("change", () => {
      if (certCheckbox.checked) {
        certOptions?.classList.remove(CLASS_HIDDEN);
      } else {
        certOptions?.classList.add(CLASS_HIDDEN);
      }
    });
  }

  private async refreshDockerImages(): Promise<void> {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Docker image refresh timeout")), 2000);
      });

      const response: any = await Promise.race([
        this.messageSender.sendMessageToVscodeEndpointPost("refresh-docker-images", {}),
        timeoutPromise
      ]);

      if (response && response.dockerImages) {
        (window as any).dockerImages = response.dockerImages;
        log.debug(`Docker images refreshed, found ${response.dockerImages.length} images`);
      }
    } catch (error: any) {
      log.debug(`Failed to refresh docker images (continuing): ${error.message}`);
    }
  }

  public async open(node: cytoscape.NodeSingular): Promise<void> {
    this.currentNode = node;
    if (!this.panel) {
      log.error("Panel not initialized");
      return;
    }

    await this.refreshDockerImages();
    await this.refreshNodeExtraData(node);
    this.dynamicEntriesManager.clearAllDynamicEntries();
    this.tabNavigationManager.switchToTab("basic");
    this.loadNodeData(node);
    this.kindTypeManager.alignKindSelection(node.data()?.extraData);
    this.panel.style.display = "block";

    const afterVisible = () => {
      try {
        this.tabNavigationManager.ensureActiveTabVisible();
        this.tabNavigationManager.updateTabScrollButtons();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.debug(`Post-open tab scroll update skipped: ${msg}`);
      }
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => afterVisible());
      setTimeout(afterVisible, 50);
    } else {
      setTimeout(afterVisible, 0);
    }

    setTimeout(() => {
      this.changeTrackingManager.initializeTracking();
    }, 100);

    log.debug(`Opened enhanced node editor for node: ${node.id()}`);
  }

  private async refreshNodeExtraData(node: cytoscape.NodeSingular): Promise<void> {
    try {
      if (node.id() === ID_TEMP_CUSTOM_NODE || node.id() === ID_EDIT_CUSTOM_NODE) {
        log.debug(`Skipping YAML refresh for custom node template node: ${node.id()}`);
        return;
      }

      const sender = this.saveManager.getMessageSender();
      const nodeName = node.data("name") || node.id();
      const freshData = await sender.sendMessageToVscodeEndpointPost(
        "topo-editor-get-node-config",
        { node: nodeName }
      );
      if (freshData && typeof freshData === "object") {
        node.data("extraData", freshData);
      }
    } catch (err) {
      log.warn(
        `Failed to refresh node data from YAML: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private loadNodeData(node: cytoscape.NodeSingular): void {
    const nodeData = node.data();
    const extraData = nodeData.extraData || {};
    const actualInherited = this.nodeDataUtils.computeActualInheritedProps(extraData);

    this.displayNodeId(node);
    this.loadBasicTab(node, extraData, actualInherited);
    this.tabContentManager.loadConfigurationTab(extraData, actualInherited);
    this.tabContentManager.loadRuntimeTab(extraData, actualInherited);
    this.tabContentManager.loadNetworkTab(extraData, actualInherited);
    this.tabContentManager.loadAdvancedTab(extraData, actualInherited);
  }

  private displayNodeId(node: cytoscape.NodeSingular): void {
    const idElement = document.getElementById(ID_PANEL_NODE_EDITOR_ID);
    if (idElement) {
      idElement.textContent = node.id();
    }
  }

  private loadBasicTab(
    node: cytoscape.NodeSingular,
    extraData: Record<string, any>,
    actualInherited: string[]
  ): void {
    const nodeData = node.data();
    this.setInputValue(ID_NODE_NAME, nodeData.name || node.id());
    this.kindTypeManager.setupKindAndTypeFields(
      extraData,
      actualInherited,
      (fieldId, inherited) => this.inheritanceBadgeManager.markFieldInheritance(fieldId, inherited)
    );
    this.iconSelectionManager.setupIconField(nodeData);
    this.imageManager.setupImageFields(extraData, actualInherited);
    this.customNodeManager.setupCustomNodeFields(node.id());
  }

  private setInputValue(id: string, value: string | number): void {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (element) {
      element.value = String(value);
    }
  }

  private setCheckboxValue(id: string, value: boolean): void {
    const element = document.getElementById(id) as HTMLInputElement;
    if (element) {
      element.checked = value;
    }
  }

  private getInputValue(id: string): string {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    return element?.value || "";
  }

  private getCheckboxValue(id: string): boolean {
    const element = document.getElementById(id) as HTMLInputElement;
    return element?.checked || false;
  }

  private getExistingNodeTypeValue(): string | undefined {
    const currentType = this.currentNode?.data("extraData")?.type;
    if (typeof currentType === "string") {
      const trimmed = currentType.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  private async save(): Promise<void> {
    if (!this.currentNode) return;

    if (!this.validationManager.validateForm()) {
      log.warn("Form validation failed, cannot save");
      return;
    }

    try {
      const expanded = this.componentsManager.collectExpandedComponentSlots();
      this.componentsManager.commitComponentDropdowns();
      const nodeProps = this.collectNodeProperties();
      const handled = await this.customNodeManager.handleCustomNode(nodeProps);
      if (handled || this.customNodeManager.isCustomTemplateNode()) {
        return;
      }
      await this.updateNode(nodeProps, expanded);
    } catch (error) {
      log.error(
        `Failed to save node properties: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private collectNodeProperties(): NodeProperties {
    const nodeProps: NodeProperties = {
      name: this.getInputValue(ID_NODE_NAME),
      kind:
        (document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null)?.value ||
        undefined
    };
    this.applyTypeFieldValue(nodeProps);

    const interfacePatternValue = this.getInputValue(ID_NODE_INTERFACE_PATTERN).trim();
    if (interfacePatternValue) {
      nodeProps.interfacePattern = interfacePatternValue;
    }

    this.imageManager.collectImage(nodeProps);
    this.tabContentManager.collectConfigurationProps(nodeProps);
    this.tabContentManager.collectRuntimeProps(nodeProps);
    this.tabContentManager.collectNetworkProps(nodeProps);
    this.tabContentManager.collectAdvancedProps(nodeProps);
    this.tabContentManager.collectCertificateProps(nodeProps);
    this.tabContentManager.collectHealthcheckProps(nodeProps);
    this.collectComponentsProps(nodeProps);

    return nodeProps;
  }

  private applyTypeFieldValue(nodeProps: NodeProperties): void {
    const rawTypeValue = this.kindTypeManager.getTypeFieldValue();
    const trimmedTypeValue = rawTypeValue.trim();
    if (trimmedTypeValue.length > 0) {
      nodeProps.type = trimmedTypeValue;
      return;
    }
    const existingType = this.getExistingNodeTypeValue();
    if (existingType) {
      nodeProps.type = "";
    }
  }

  private collectComponentsProps(nodeProps: NodeProperties): void {
    const kind =
      nodeProps.kind || (this.currentNode?.data("extraData")?.kind as string | undefined);
    if (!kind || !this.componentsManager.isComponentKind(kind)) return;
    if (this.componentsManager.isIntegratedMode()) {
      this.componentsManager.commitIntegratedMdaDropdowns();
      const mdas = this.componentsManager.collectIntegratedMdas();
      nodeProps.components = mdas.length > 0 ? [{ mda: mdas }] : [];
      return;
    }
    const entries = this.componentsManager.getAllComponentEntries();
    const components = entries
      .map((entry) => this.componentsManager.buildComponentFromEntry(entry))
      .filter((c): c is any => !!c);
    const sfmVal = this.componentsManager.getSfmValue();
    this.componentsManager.applySfmToComponents(components, sfmVal);
    if (components.length > 0) nodeProps.components = components;
  }

  private extractIndex(id: string, re: RegExp): number | null {
    const m = re.exec(id);
    return m ? parseInt(m[1], 10) : null;
  }

  private async updateNode(nodeProps: NodeProperties, expandedSlots?: Set<string>): Promise<void> {
    const currentData = this.currentNode!.data();
    const { updatedExtraData, inheritedProps } = this.nodeDataUtils.mergeNodeData(
      nodeProps,
      currentData
    );
    const iconValue =
      (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)
        ?.value || "pe";
    const currentIconColor = this.iconSelectionManager.getCurrentIconColor();
    const currentIconCornerRadius = this.iconSelectionManager.getCurrentIconCornerRadius();

    const updatedData = {
      ...currentData,
      name: nodeProps.name,
      topoViewerRole: iconValue,
      extraData: updatedExtraData
    };
    if (currentIconColor) {
      updatedData.iconColor = currentIconColor;
    } else {
      delete updatedData.iconColor;
    }
    if (currentIconCornerRadius > 0) {
      updatedData.iconCornerRadius = currentIconCornerRadius;
    } else {
      delete updatedData.iconCornerRadius;
    }
    this.currentNode!.data(updatedData);
    const hadColorBefore =
      typeof currentData.iconColor === "string" && currentData.iconColor.trim() !== "";
    const preserveBackground = !hadColorBefore && !currentIconColor;
    applyIconColorToNode(
      this.currentNode!,
      currentIconColor || undefined,
      { cornerRadius: currentIconCornerRadius },
      preserveBackground
    );
    await this.saveManager.saveTopo(this.cy, false);
    await this.refreshNodeData(expandedSlots);
    this.inheritanceBadgeManager.updateInheritedBadges(inheritedProps, FIELD_MAPPINGS_BASE);
    log.info(`Node ${this.currentNode!.id()} updated with enhanced properties`);
  }

  private async refreshNodeData(expandedSlots?: Set<string>): Promise<void> {
    if (!this.currentNode) return;
    if (this.customNodeManager.isCustomTemplateNode()) {
      log.debug("Skipping YAML refresh after save for custom node template");
      return;
    }
    try {
      const sender = this.saveManager.getMessageSender();
      const nodeName = this.currentNode!.data("name") || this.currentNode!.id();
      const freshData = await sender.sendMessageToVscodeEndpointPost(
        "topo-editor-get-node-config",
        { node: nodeName }
      );
      if (freshData && typeof freshData === "object") {
        this.currentNode!.data("extraData", freshData);
        this.dynamicEntriesManager.clearAllDynamicEntries();
        this.componentsManager.setPendingExpandedSlots(expandedSlots);
        this.loadNodeData(this.currentNode!);
      }
    } catch (err) {
      log.warn(
        `Failed to refresh node data from YAML after save: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private close(): void {
    if (this.panel) {
      this.panel.style.display = "none";
    }
    this.currentNode = null;
    this.dynamicEntriesManager.clearAllDynamicEntries();
  }
}
