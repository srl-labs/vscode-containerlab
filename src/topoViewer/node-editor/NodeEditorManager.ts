// NodeEditorManager.ts

import cytoscape from "cytoscape";
import { log } from "../logging/logger";
import { createFilterableDropdown } from "../ui/FilterableDropdown";
import { ManagerSaveTopo } from "../core/SaveManager";
import { VscodeMessageSender } from "../core/VscodeMessaging";
import {
  applyIconColorToNode,
  extractNodeIcons
} from "../cytoscape/BaseStyles";
import { createNodeIconOptionElement } from "../ui/IconDropdownRenderer";
import { DEFAULT_INTERFACE_PATTERN } from "../ui/InterfacePatternUtils";
import { ComponentsManager, ComponentsManagerUtilities } from "./ComponentsManager";
import { IconEditorManager, IconEditorUtilities } from "./IconEditorManager";
import { ValidationManager, ValidationUtilities } from "./ValidationManager";
import { DynamicEntriesManager } from "./DynamicEntriesManager";
import { TabContentManager, NodeProperties, FormUtilities } from "./TabContentManager";
import { ImageManager, ImageFormUtilities } from "./ImageManager";
import { NodeDataUtilsManager } from "./NodeDataUtils";
import { TabNavigationManager } from "./TabNavigationManager";
import { InheritanceBadgeManager, NodeDataAccessor, FieldMapping } from "./InheritanceBadgeManager";
import { CustomNodeManager, CustomNodeFormUtilities, CustomNodeContext } from "./CustomNodeManager";

// Common CSS classes and element IDs
const CLASS_HIDDEN = "hidden" as const;
const CLASS_DYNAMIC_DELETE_BTN = "dynamic-delete-btn" as const;
const SELECTOR_FORM_GROUP = ".form-group" as const;
const DEFAULT_ICON_COLOR = "#005aff" as const;
const DEFAULT_ICON_CORNER_RADIUS = 0;

const ID_PANEL_NODE_EDITOR = "panel-node-editor" as const;
const ID_PANEL_EDITOR_CLOSE = "panel-node-editor-close" as const;
const ID_PANEL_EDITOR_APPLY = "panel-node-editor-apply" as const;
const ID_PANEL_EDITOR_SAVE = "panel-node-editor-save" as const;
const CLASS_HAS_CHANGES = "btn-has-changes" as const;
const ID_NODE_CERT_ISSUE = "node-cert-issue" as const;
const ID_CERT_OPTIONS = "cert-options" as const;
const ID_PANEL_NODE_EDITOR_ID = "panel-node-editor-id" as const;

// Frequently used Node Editor element IDs
const ID_NODE_KIND_DROPDOWN = "node-kind-dropdown-container" as const;
const ID_NODE_KIND_FILTER_INPUT = "node-kind-dropdown-container-filter-input" as const;
const ID_NODE_TYPE = "node-type" as const;
const ID_NODE_TYPE_DROPDOWN = "panel-node-type-dropdown-container" as const;
const ID_NODE_TYPE_FILTER_INPUT = "panel-node-type-dropdown-container-filter-input" as const;
const ID_NODE_TYPE_WARNING = "node-type-warning" as const;
const ID_NODE_ICON_COLOR = "node-icon-color" as const;
const ID_NODE_RP_DROPDOWN = "node-restart-policy-dropdown-container" as const;
const ID_NODE_NM_DROPDOWN = "node-network-mode-dropdown-container" as const;
const ID_NODE_INTERFACE_PATTERN = "node-interface-pattern" as const;

const ID_NODE_IPP_DROPDOWN = "node-image-pull-policy-dropdown-container" as const;
const ID_NODE_RUNTIME_DROPDOWN = "node-runtime-dropdown-container" as const;
const ID_NODE_IMAGE_DROPDOWN = "node-image-dropdown-container" as const;
const ID_PANEL_NODE_TOPOROLE_CONTAINER = "panel-node-topoviewerrole-dropdown-container" as const;
const ID_PANEL_NODE_TOPOROLE_FILTER_INPUT =
  "panel-node-topoviewerrole-dropdown-container-filter-input" as const;
const ID_NODE_CERT_KEYSIZE_DROPDOWN = "node-cert-key-size-dropdown-container" as const;
const ID_NODE_NAME = "node-name" as const;

// Common labels and placeholders
const LABEL_DEFAULT = "Default" as const;
const PH_SEARCH_KIND = "Search for kind..." as const;
const PH_SEARCH_TYPE = "Search for type..." as const;
const PH_SEARCH_RP = "Search restart policy..." as const;
const PH_SEARCH_NM = "Search network mode..." as const;
const PH_SEARCH_IPP = "Search pull policy..." as const;
const PH_SEARCH_RUNTIME = "Search runtime..." as const;
const TYPE_UNSUPPORTED_WARNING_TEXT =
  "Type is set in YAML, but the schema for this kind does not support it." as const;
// Healthcheck IDs and prop
const ID_HC_TEST = "node-healthcheck-test" as const;
const PROP_HEALTHCHECK = "healthcheck" as const;
const PH_SEARCH_KEY_SIZE = "Search key size..." as const;

// Options
const OPTIONS_RP = [LABEL_DEFAULT, "no", "on-failure", "always", "unless-stopped"] as const;
const OPTIONS_NM = [LABEL_DEFAULT, "host", "none"] as const;
const OPTIONS_IPP = [LABEL_DEFAULT, "IfNotPresent", "Never", "Always"] as const;
const OPTIONS_RUNTIME = [LABEL_DEFAULT, "docker", "podman", "ignite"] as const;

// Common property keys used in extraData/inheritance
const PROP_STARTUP_CONFIG = "startup-config" as const;
const PROP_ENFORCE_STARTUP_CONFIG = "enforce-startup-config" as const;
const PROP_SUPPRESS_STARTUP_CONFIG = "suppress-startup-config" as const;
const PROP_MGMT_IPV4 = "mgmt-ipv4" as const;
const PROP_MGMT_IPV6 = "mgmt-ipv6" as const;
const PROP_CPU_SET = "cpu-set" as const;
const PROP_SHM_SIZE = "shm-size" as const;
const PROP_RESTART_POLICY = "restart-policy" as const;
const PROP_AUTO_REMOVE = "auto-remove" as const;
const PROP_STARTUP_DELAY = "startup-delay" as const;
const PROP_NETWORK_MODE = "network-mode" as const;
const PROP_PORTS = "ports" as const;
const PROP_DNS = "dns" as const;
const PROP_ALIASES = "aliases" as const;
const PROP_MEMORY = "memory" as const;
const PROP_CPU = "cpu" as const;
const PROP_CAP_ADD = "cap-add" as const;
const PROP_SYSCTLS = "sysctls" as const;
const PROP_DEVICES = "devices" as const;
const PROP_CERTIFICATE = "certificate" as const;
const PROP_IMAGE_PULL_POLICY = "image-pull-policy" as const;
const PROP_RUNTIME = "runtime" as const;

// Data attributes used for dynamic entry buttons
const DATA_ATTR_CONTAINER = "data-container" as const;
const DATA_ATTR_ENTRY_ID = "data-entry-id" as const;

// Reused DOM IDs
const ID_NODE_STARTUP_CONFIG = "node-startup-config" as const;
const ID_NODE_ENFORCE_STARTUP_CONFIG = "node-enforce-startup-config" as const;
const ID_NODE_SUPPRESS_STARTUP_CONFIG = "node-suppress-startup-config" as const;
const ID_NODE_LICENSE = "node-license" as const;
const ID_NODE_BINDS_CONTAINER = "node-binds-container" as const;
const ID_NODE_ENV_CONTAINER = "node-env-container" as const;
const ID_NODE_ENV_FILES_CONTAINER = "node-env-files-container" as const;
const ID_NODE_LABELS_CONTAINER = "node-labels-container" as const;
const ID_NODE_USER = "node-user" as const;
const ID_NODE_ENTRYPOINT = "node-entrypoint" as const;
const ID_NODE_CMD = "node-cmd" as const;
const ID_NODE_EXEC_CONTAINER = "node-exec-container" as const;
const ID_NODE_AUTO_REMOVE = "node-auto-remove" as const;
const ID_NODE_STARTUP_DELAY = "node-startup-delay" as const;
const ID_NODE_PORTS_CONTAINER = "node-ports-container" as const;
const ID_NODE_DNS_SERVERS_CONTAINER = "node-dns-servers-container" as const;
const ID_NODE_ALIASES_CONTAINER = "node-aliases-container" as const;
const ID_NODE_MEMORY = "node-memory" as const;
const ID_NODE_CPU = "node-cpu" as const;
const ID_NODE_CAP_ADD_CONTAINER = "node-cap-add-container" as const;
const ID_NODE_SYSCTLS_CONTAINER = "node-sysctls-container" as const;
const ID_NODE_DEVICES_CONTAINER = "node-devices-container" as const;
const ID_NODE_MGMT_IPV4 = "node-mgmt-ipv4" as const;
const ID_NODE_MGMT_IPV6 = "node-mgmt-ipv6" as const;
const ID_NODE_CPU_SET = "node-cpu-set" as const;
const ID_NODE_SHM_SIZE = "node-shm-size" as const;

// Dynamic container names
const CN_BINDS = "binds" as const;
const CN_ENV = "env" as const;
const CN_ENV_FILES = "env-files" as const;
const CN_LABELS = "labels" as const;
const CN_EXEC = "exec" as const;

// Special node IDs
const ID_TEMP_CUSTOM_NODE = "temp-custom-node" as const;
const ID_EDIT_CUSTOM_NODE = "edit-custom-node" as const;

// Shared field→prop mappings for inheritance badges and change listeners
const FIELD_MAPPINGS_BASE: FieldMapping[] = [
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


/**
 * ManagerNodeEditor handles the node editor with tabs for all Containerlab properties
 */
export class ManagerNodeEditor {
  private cy: cytoscape.Core;
  private saveManager: ManagerSaveTopo;
  private currentNode: cytoscape.NodeSingular | null = null;
  private panel: HTMLElement | null = null;
  private schemaKinds: string[] = [];
  private kindsLoaded = false;
  private messageSender: VscodeMessageSender;
  private nodeTypeOptions: Map<string, string[]> = new Map();
  private typeSchemaLoaded = false;
  private kindsWithTypeSupport: Set<string> = new Set();
  private cachedNodeIcons: string[] = [];
  private cachedCustomIconSignature: string = "";
  private currentIconColor: string | null = null;
  private currentIconCornerRadius: number = DEFAULT_ICON_CORNER_RADIUS;
  // Initial values for change tracking
  private nodeEditorInitialValues: string | null = null;
  private readonly renderIconOption = (role: string): HTMLElement =>
    createNodeIconOptionElement(role, {
      onDelete: (iconName) => {
        void this.handleIconDelete(iconName);
      }
    });

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
      getNodeIconOptions: () => this.getNodeIconOptions(),
      getCurrentIconValue: () => this.getCurrentIconValue(),
      handleIconUpload: () => this.handleIconUpload(),
      normalizeIconColor: (raw: string, fallback: string | null) =>
        this.normalizeIconColor(raw, fallback)
    };
    const manager = new IconEditorManager(utilities);
    manager.setCallbacks(
      (color) => this.setIconColor(color),
      (radius) => this.setIconCornerRadius(radius)
    );
    return manager;
  }

  private createValidationManager(): ValidationManager {
    const utilities: ValidationUtilities = {
      getInputValue: (id: string) => this.getInputValue(id),
      collectDynamicEntries: (containerName: string) => this.dynamicEntriesManager.collectDynamicEntries(containerName),
      getPanel: () => this.panel
    };
    return new ValidationManager(utilities);
  }

  private createDynamicEntriesManager(): DynamicEntriesManager {
    const manager = new DynamicEntriesManager();
    manager.setComponentHandlers({
      addComponentEntry: (prefill, options) => this.componentsManager.addComponentEntry(prefill, options),
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
      getCurrentIconColor: () => this.currentIconColor,
      getCurrentIconCornerRadius: () => this.currentIconCornerRadius,
      getMessageSender: () => this.messageSender,
      closeEditor: () => this.close()
    };
    return new CustomNodeManager(formUtils, context);
  }

  public handleDockerImagesUpdated(images: string[]): void {
    const extraData = this.currentNode?.data("extraData") || null;
    this.imageManager.handleDockerImagesUpdated(images, this.panel, extraData);
  }

  /**
   * Handle kind change and update type field visibility
   */
  private handleKindChange(selectedKind: string): void {
    // Ensure ComponentsManager has the current node before updating
    this.componentsManager.setCurrentNode(this.currentNode);

    const typeFormGroup = document
      .getElementById(ID_NODE_TYPE)
      ?.closest(SELECTOR_FORM_GROUP) as HTMLElement;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement;

    if (!typeFormGroup) return;

    const typeOptions = this.getTypeOptionsForKind(selectedKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(
        typeFormGroup,
        typeDropdownContainer,
        typeInput,
        typeOptions,
        selectedKind
      );
    } else {
      this.toggleTypeInputForKind(selectedKind, typeFormGroup, typeDropdownContainer, typeInput);
    }

    // show/hide components based on kind
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

    log.debug(
      `Kind changed to ${selectedKind}, type field visibility: ${typeFormGroup?.style.display}`
    );
  }

  private showTypeDropdown(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    typeOptions: string[],
    selectedKind: string
  ) {
    typeFormGroup.style.display = "block";
    if (!typeDropdownContainer || !typeInput) return;
    typeDropdownContainer.style.display = "block";
    typeInput.style.display = "none";

    const typeOptionsWithEmpty = ["", ...typeOptions];
    const currentType = typeInput.value || "";
    const typeToSelect = typeOptionsWithEmpty.includes(currentType) ? currentType : "";
    this.setTypeWarningVisibility(false);

    createFilterableDropdown(
      ID_NODE_TYPE_DROPDOWN,
      typeOptionsWithEmpty,
      typeToSelect,
      (selectedType: string) => {
        if (typeInput) typeInput.value = selectedType;
        log.debug(`Type ${selectedType || "(empty)"} selected for kind ${selectedKind}`);
        this.onTypeFieldChanged();
      },
      PH_SEARCH_TYPE,
      true
    );

    const filterInput = document.getElementById(
      ID_NODE_TYPE_FILTER_INPUT
    ) as HTMLInputElement | null;
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
    typeInput: HTMLInputElement | null
  ) {
    const schemaReady = this.typeSchemaLoaded;
    const hasTypeSupport = schemaReady ? this.kindSupportsType(selectedKind) : false;
    const existingTypeValue = this.getExistingNodeTypeValue();
    const hasExistingTypeValue =
      typeof existingTypeValue === "string" && existingTypeValue.trim().length > 0;
    if (!hasExistingTypeValue) {
      this.setInputValue(ID_NODE_TYPE, "");
      const filterInput = document.getElementById(
        ID_NODE_TYPE_FILTER_INPUT
      ) as HTMLInputElement | null;
      if (filterInput) filterInput.value = "";
    }

    const hasTypeValue = this.hasTypeFieldValue();
    const shouldShowFreeformType =
      !schemaReady || hasTypeSupport || hasTypeValue || hasExistingTypeValue;

    if (shouldShowFreeformType) {
      this.displayFreeformTypeField(typeFormGroup, typeDropdownContainer, typeInput);
      const shouldWarn = schemaReady && (hasTypeValue || hasExistingTypeValue) && !hasTypeSupport;
      this.setTypeWarningVisibility(shouldWarn);
      return;
    }

    this.hideTypeField(
      typeFormGroup,
      typeDropdownContainer,
      typeInput,
      hasTypeValue || hasExistingTypeValue
    );
  }

  private displayFreeformTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null
  ): void {
    typeFormGroup.style.display = "block";
    if (typeDropdownContainer && typeInput) {
      typeDropdownContainer.style.display = "none";
      typeInput.style.display = "block";
    }
    if (typeInput) {
      typeInput.oninput = () => this.onTypeFieldChanged();
    }
  }

  private hideTypeField(
    typeFormGroup: HTMLElement,
    typeDropdownContainer: HTMLElement | null,
    typeInput: HTMLInputElement | null,
    hasTypeValue: boolean
  ): void {
    typeFormGroup.style.display = "none";
    this.setTypeWarningVisibility(false);
    if (typeInput) {
      typeInput.style.display = "none";
      if (!hasTypeValue) typeInput.value = "";
    }
    if (typeDropdownContainer) typeDropdownContainer.style.display = "none";
  }

  private onTypeFieldChanged(): void {
    this.updateComponentMode();
  }

  private getCurrentKindValue(): string {
    const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
    return input?.value?.trim() ?? "";
  }

  private setTypeWarningVisibility(visible: boolean): void {
    const warning = document.getElementById(ID_NODE_TYPE_WARNING);
    if (!warning) return;
    warning.style.display = visible ? "block" : "none";
    if (visible) {
      warning.textContent = TYPE_UNSUPPORTED_WARNING_TEXT;
    }
  }

  private updateComponentMode(reload = true): void {
    // Sync currentNode with componentsManager
    this.componentsManager.setCurrentNode(this.currentNode);
    this.componentsManager.updateComponentMode(reload);
  }

  /**
   * Initialize the enhanced node editor panel
   */
  private initializePanel(): void {
    this.panel = document.getElementById(ID_PANEL_NODE_EDITOR);
    if (!this.panel) {
      log.error("Enhanced node editor panel not found in DOM");
      return;
    }

    // Populate the Kind dropdown from the JSON schema so all kinds are available
    this.populateKindsFromSchema().catch((err) => {
      log.error(
        `Failed to populate kinds from schema: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    // Mark panel interaction to prevent closing, but don't stop propagation
    // as that breaks tabs and other interactive elements
    this.panel.addEventListener("mousedown", () => {
      // Mark that we clicked on the panel
      if ((window as any).viewportPanels) {
        (window as any).viewportPanels.setNodeClicked(true);
      }
    });

    // Set up event delegation for delete buttons
    this.panel.addEventListener(
      "click",
      (e) => {
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
        this.dynamicEntriesManager.removeEntry(containerName, parseInt(entryId));
      },
      true
    ); // Use capture phase to ensure we get the event first

    // Initialize tab navigation
    this.tabNavigationManager.setPanel(this.panel);
    this.tabNavigationManager.setupTabSwitching();
    this.tabNavigationManager.setupTabScrollArrows();

    // Initialize event handlers
    this.setupEventHandlers();
    this.iconEditorManager.setupIconEditorControls();

    // Setup dynamic entry handlers
    this.dynamicEntriesManager.setupDynamicEntryHandlers();

    // Initialize static filterable dropdowns with default values
    this.initializeStaticDropdowns();

    // Setup listeners to clear inherited flags when fields are edited
    this.inheritanceBadgeManager.setupInheritanceChangeListeners(FIELD_MAPPINGS_BASE);

    log.debug("Enhanced node editor panel initialized");
  }

  private initializeStaticDropdowns(): void {
    // Restart Policy
    const rpOptions = [...OPTIONS_RP];
    createFilterableDropdown(ID_NODE_RP_DROPDOWN, rpOptions, LABEL_DEFAULT, () => {}, PH_SEARCH_RP);

    // Network Mode
    const nmOptions = [...OPTIONS_NM];
    createFilterableDropdown(ID_NODE_NM_DROPDOWN, nmOptions, LABEL_DEFAULT, () => {}, PH_SEARCH_NM);

    // Cert key size
    const keySizeOptions = ["2048", "4096"];
    createFilterableDropdown(
      ID_NODE_CERT_KEYSIZE_DROPDOWN,
      keySizeOptions,
      "2048",
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
      log.warn("Schema URL is undefined; keeping existing Kind options");
    }
    return url;
  }

  private async fetchSchema(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private getSortedKinds(schema: any): string[] {
    const kinds: string[] = schema?.definitions?.["node-config"]?.properties?.kind?.enum || [];
    const nokiaKinds = kinds
      .filter((k) => k.startsWith("nokia_"))
      .sort((a, b) => a.localeCompare(b));
    const otherKinds = kinds
      .filter((k) => !k.startsWith("nokia_"))
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
    return this.schemaKinds[0] || "";
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
      this.componentsManager.extractComponentEnumsFromSchema(json);
      this.componentsManager.refreshComponentsDropdowns();

      const kinds = this.getSortedKinds(json);
      if (kinds.length === 0) {
        log.warn("No kind enum found in schema; keeping existing Kind options");
        return;
      }
      this.schemaKinds = kinds;

      const desired =
        (this.currentNode?.data()?.extraData?.kind as string) ||
        ((window as any).defaultKind as string) ||
        "";
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
    this.typeSchemaLoaded = false;
    this.nodeTypeOptions.clear();
    this.kindsWithTypeSupport.clear();
    const allOf = schema?.definitions?.["node-config"]?.allOf;
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
    const typeFormGroup = document
      .getElementById(ID_NODE_TYPE)
      ?.closest(SELECTOR_FORM_GROUP) as HTMLElement | null;
    if (!typeFormGroup) return;
    const typeDropdownContainer = document.getElementById(ID_NODE_TYPE_DROPDOWN);
    const typeInput = document.getElementById(ID_NODE_TYPE) as HTMLInputElement | null;
    if (!typeDropdownContainer || !typeInput) return;
    const currentKind = this.getCurrentKindValue();
    if (!currentKind) return;

    const typeOptions = this.getTypeOptionsForKind(currentKind);
    if (typeOptions.length > 0) {
      this.showTypeDropdown(
        typeFormGroup,
        typeDropdownContainer,
        typeInput,
        typeOptions,
        currentKind
      );
    } else {
      this.toggleTypeInputForKind(currentKind, typeFormGroup, typeDropdownContainer, typeInput);
    }
  }

  private getKindFromCondition(condition: any): string | null {
    const pattern = condition?.if?.properties?.kind?.pattern as string | undefined;
    if (!pattern) return null;
    const start = pattern.indexOf("(");
    const end = start >= 0 ? pattern.indexOf(")", start + 1) : -1;
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
   * Setup event handlers for save/apply/close buttons
   */
  private setupEventHandlers(): void {
    // Close button (title bar X)
    const closeBtn = document.getElementById(ID_PANEL_EDITOR_CLOSE);
    closeBtn?.addEventListener("click", () => this.close());

    // Apply button (save without closing)
    const applyBtn = document.getElementById(ID_PANEL_EDITOR_APPLY);
    applyBtn?.addEventListener("click", async () => {
      await this.save();
      this.resetNodeEditorInitialValues();
    });

    // OK button (save and close)
    const saveBtn = document.getElementById(ID_PANEL_EDITOR_SAVE);
    saveBtn?.addEventListener("click", async () => {
      await this.save();
      this.close();
    });

    // Certificate checkbox toggle
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

  /**
   * Captures a serialized snapshot of all form inputs in the node editor panel.
   */
  private captureNodeEditorValues(): string {
    if (!this.panel) return "";
    const inputs = this.panel.querySelectorAll("input, select, textarea");
    const values: Record<string, string> = {};
    inputs.forEach((el, idx) => {
      const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const key = input.id || input.name || `input-${idx}`;
      if (input.type === "checkbox") {
        values[key] = String((input as HTMLInputElement).checked);
      } else {
        values[key] = input.value || "";
      }
    });
    return JSON.stringify(values);
  }

  /**
   * Checks if there are unsaved changes in the node editor.
   */
  private hasNodeEditorChanges(): boolean {
    if (!this.nodeEditorInitialValues) return false;
    const current = this.captureNodeEditorValues();
    return this.nodeEditorInitialValues !== current;
  }

  /**
   * Updates the node editor Apply button visual state.
   */
  private updateNodeEditorApplyButtonState(): void {
    const applyBtn = document.getElementById(ID_PANEL_EDITOR_APPLY);
    if (!applyBtn) return;
    const hasChanges = this.hasNodeEditorChanges();
    applyBtn.classList.toggle(CLASS_HAS_CHANGES, hasChanges);
  }

  /**
   * Resets node editor initial values after applying changes.
   */
  private resetNodeEditorInitialValues(): void {
    this.nodeEditorInitialValues = this.captureNodeEditorValues();
    this.updateNodeEditorApplyButtonState();
  }

  /**
   * Sets up change tracking on all form inputs in the node editor.
   */
  private setupNodeEditorChangeTracking(): void {
    if (!this.panel) return;
    const inputs = this.panel.querySelectorAll("input, select, textarea");
    inputs.forEach((el) => {
      el.addEventListener("input", () => this.updateNodeEditorApplyButtonState());
      el.addEventListener("change", () => this.updateNodeEditorApplyButtonState());
    });
  }

  private resolveIconSelectionAfterChange(
    preferredIcon: string | undefined,
    previousSelection: string,
    availableIcons: string[]
  ): string {
    const candidates = [preferredIcon, previousSelection, "pe"];
    for (const candidate of candidates) {
      if (candidate && availableIcons.includes(candidate)) {
        return candidate;
      }
    }
    if (availableIcons.length > 0) {
      return availableIcons[0];
    }
    return "pe";
  }

  /**
   * Refreshes docker images from the backend with a timeout
   */
  private async refreshDockerImages(): Promise<void> {
    try {
      // Create a timeout promise that rejects after 2 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Docker image refresh timeout")), 2000);
      });

      // Race between the refresh and timeout
      const response: any = await Promise.race([
        this.messageSender.sendMessageToVscodeEndpointPost("refresh-docker-images", {}),
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
      log.error("Panel not initialized");
      return;
    }

    // Refresh docker images before loading node data
    await this.refreshDockerImages();

    await this.refreshNodeExtraData(node);
    this.dynamicEntriesManager.clearAllDynamicEntries();
    this.tabNavigationManager.switchToTab("basic");
    this.loadNodeData(node);
    this.alignKindSelection(node);
    this.panel.style.display = "block";
    // After the panel becomes visible, update tab scroll UI once layout is ready
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
      // Also schedule a secondary tick to be safe after dynamic content inflates
      setTimeout(afterVisible, 50);
    } else {
      setTimeout(afterVisible, 0);
    }

    // Capture initial values for change tracking after a delay to ensure all fields are populated
    setTimeout(() => {
      this.nodeEditorInitialValues = this.captureNodeEditorValues();
      this.updateNodeEditorApplyButtonState();
      this.setupNodeEditorChangeTracking();
    }, 100);

    log.debug(`Opened enhanced node editor for node: ${node.id()}`);
  }

  private async refreshNodeExtraData(node: cytoscape.NodeSingular): Promise<void> {
    try {
      // Skip fetching YAML-backed data when editing/creating a custom node template
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

  private alignKindSelection(node: cytoscape.NodeSingular): void {
    try {
      const input = document.getElementById(ID_NODE_KIND_FILTER_INPUT) as HTMLInputElement | null;
      const desired = (node.data()?.extraData?.kind as string) || (window as any).defaultKind || "";
      if (!input || !desired || !this.kindsLoaded || this.schemaKinds.length === 0) {
        return;
      }
      input.value = this.determineInitialKind(desired);
    } catch (e) {
      log.warn(`Kind selection alignment warning: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Load node data into the form
   */
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
    this.setupKindAndTypeFields(extraData, actualInherited);
    this.setupIconField(nodeData);
    this.imageManager.setupImageFields(extraData, actualInherited);
    this.customNodeManager.setupCustomNodeFields(node.id());
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
    if (!customIcons || typeof customIcons !== "object") {
      return "";
    }
    return Object.keys(customIcons)
      .sort()
      .map((key) => `${key}-${(customIcons[key] as string)?.length ?? 0}`)
      .join("|");
  }

  private setupKindAndTypeFields(extraData: Record<string, any>, actualInherited: string[]): void {
    const desiredKind = extraData.kind || (window as any).defaultKind || "nokia_srlinux";
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
    this.inheritanceBadgeManager.markFieldInheritance(ID_NODE_KIND_DROPDOWN, actualInherited.includes("kind"));

    const typeValue = extraData.type || "";
    this.setInputValue(ID_NODE_TYPE, typeValue);
    this.inheritanceBadgeManager.markFieldInheritance(ID_NODE_TYPE, actualInherited.includes("type"));
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
    let iconInitial = "pe";
    if (nodeData.topoViewerRole && typeof nodeData.topoViewerRole === "string") {
      iconInitial = nodeData.topoViewerRole;
    } else if (nodeData.extraData?.icon && typeof nodeData.extraData.icon === "string") {
      iconInitial = nodeData.extraData.icon;
    }
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      nodeIcons,
      iconInitial,
      () => {},
      "Search for icon...",
      false,
      {
        menuClassName: "max-h-96",
        dropdownWidth: 320,
        renderOption: this.renderIconOption
      }
    );
    this.initializeIconColorState(nodeData);
  }

  private initializeIconColorState(nodeData: Record<string, any>): void {
    const fromNode = typeof nodeData.iconColor === "string" ? nodeData.iconColor : "";
    const fromExtra =
      typeof nodeData.extraData?.iconColor === "string"
        ? (nodeData.extraData.iconColor as string)
        : "";
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
      hidden.value = color ?? "";
    }
  }

  private setIconCornerRadius(radius: number | null): void {
    if (typeof radius === "number" && Number.isFinite(radius)) {
      this.currentIconCornerRadius = Math.max(0, Math.min(40, radius));
      return;
    }
    this.currentIconCornerRadius = DEFAULT_ICON_CORNER_RADIUS;
  }

  private resolveNumericIconValue(primary: unknown, fallback: unknown): number | null {
    if (typeof primary === "number" && Number.isFinite(primary)) {
      return primary;
    }
    if (typeof fallback === "number" && Number.isFinite(fallback)) {
      return fallback;
    }
    return null;
  }

  private normalizeIconColor(
    color: string | undefined,
    fallback: string | null = DEFAULT_ICON_COLOR
  ): string | null {
    if (!color) {
      return fallback;
    }
    let candidate = color.trim();
    if (!candidate) {
      return fallback;
    }
    if (!candidate.startsWith("#")) {
      candidate = `#${candidate}`;
    }
    const hexRegex = /^#([0-9a-fA-F]{6})$/;
    if (!hexRegex.test(candidate)) {
      return fallback;
    }
    return `#${candidate.slice(1).toLowerCase()}`;
  }

  private getCurrentIconValue(): string {
    const input = document.getElementById(
      ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
    ) as HTMLInputElement | null;
    return input?.value?.trim() || "pe";
  }

  private async handleIconUpload(): Promise<void> {
    if (!this.messageSender) {
      return;
    }
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        "topo-editor-upload-icon",
        {}
      );
      if (!response || response.cancelled || response.success !== true) {
        return;
      }
      if (response.customIcons && typeof response.customIcons === "object") {
        (window as any).customIcons = response.customIcons;
        this.cachedNodeIcons = [];
        this.cachedCustomIconSignature = "";
        this.refreshIconDropdownAfterIconChange(response.lastAddedIcon);
      }
    } catch (error) {
      log.error(
        `Failed to upload custom icon: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private shouldUseBrowserConfirm(): boolean {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return false;
    }
    // VS Code webviews expose acquireVsCodeApi/vscode but do not support blocking dialogs
    const hasVscodeApi =
      typeof (window as any).acquireVsCodeApi === "function" || Boolean((window as any).vscode);
    return !hasVscodeApi;
  }

  private async handleIconDelete(iconName: string): Promise<void> {
    if (!this.messageSender || !iconName) {
      return;
    }
    const confirmationMessage = `Delete custom icon "${iconName}"? This action cannot be undone.`;
    if (this.shouldUseBrowserConfirm() && window.confirm(confirmationMessage) === false) {
      return;
    }
    this.teardownIconDropdownMenu();
    try {
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        "topo-editor-delete-icon",
        { iconName }
      );
      if (!response || response.success !== true) {
        return;
      }
      if (response.customIcons && typeof response.customIcons === "object") {
        (window as any).customIcons = response.customIcons;
      }
      this.cachedNodeIcons = [];
      this.cachedCustomIconSignature = "";
      this.refreshIconDropdownAfterIconChange();
    } catch (error) {
      log.error(
        `Failed to delete custom icon "${iconName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private teardownIconDropdownMenu(): void {
    const dropdownMenu = document.getElementById(
      `${ID_PANEL_NODE_TOPOROLE_CONTAINER}-dropdown-menu`
    ) as HTMLElement | null;
    if (dropdownMenu) {
      dropdownMenu.remove();
    }
  }

  private refreshIconDropdownAfterIconChange(preferredIcon?: string): void {
    const previousSelection = this.getCurrentIconValue();
    const availableIcons = this.getNodeIconOptions();
    const selectedIcon = this.resolveIconSelectionAfterChange(
      preferredIcon,
      previousSelection,
      availableIcons
    );
    this.teardownIconDropdownMenu();
    createFilterableDropdown(
      ID_PANEL_NODE_TOPOROLE_CONTAINER,
      availableIcons,
      selectedIcon,
      () => {},
      "Search for icon...",
      false,
      {
        menuClassName: "max-h-96",
        dropdownWidth: 320,
        renderOption: this.renderIconOption
      }
    );
    const filterInput = document.getElementById(
      ID_PANEL_NODE_TOPOROLE_FILTER_INPUT
    ) as HTMLInputElement | null;
    if (filterInput) {
      filterInput.value = selectedIcon;
    }
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
    return element?.value || "";
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
    const currentType = this.currentNode?.data("extraData")?.type;
    if (typeof currentType === "string") {
      const trimmed = currentType.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  /**
   * Save the node data
   */
  private async save(): Promise<void> {
    if (!this.currentNode) return;

    if (!this.validationManager.validateForm()) {
      log.warn("Form validation failed, cannot save");
      return;
    }

    try {
      // Remember which component slots are currently expanded
      const expanded = this.componentsManager.collectExpandedComponentSlots();
      // Ensure all filterable dropdowns (esp. components) commit their values
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
    const rawTypeValue = this.getTypeFieldValue();
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
    const { updatedExtraData, inheritedProps } = this.nodeDataUtils.mergeNodeData(nodeProps, currentData);
    const iconValue =
      (document.getElementById(ID_PANEL_NODE_TOPOROLE_FILTER_INPUT) as HTMLInputElement | null)
        ?.value || "pe";
    const updatedData = {
      ...currentData,
      name: nodeProps.name,
      topoViewerRole: iconValue,
      extraData: updatedExtraData
    };
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
    const hadColorBefore =
      typeof currentData.iconColor === "string" && currentData.iconColor.trim() !== "";
    const preserveBackground = !hadColorBefore && !this.currentIconColor;
    applyIconColorToNode(
      this.currentNode!,
      this.currentIconColor || undefined,
      { cornerRadius: this.currentIconCornerRadius },
      preserveBackground
    );
    await this.saveManager.saveTopo(this.cy, false);
    await this.refreshNodeData(expandedSlots);
    this.inheritanceBadgeManager.updateInheritedBadges(inheritedProps, FIELD_MAPPINGS_BASE);
    log.info(`Node ${this.currentNode!.id()} updated with enhanced properties`);
  }

  private async refreshNodeData(expandedSlots?: Set<string>): Promise<void> {
    if (!this.currentNode) {
      return;
    }
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
        // Defer restoration to the next components render that happens in handleKindChange
        this.componentsManager.setPendingExpandedSlots(expandedSlots);
        this.loadNodeData(this.currentNode!);
      }
    } catch (err) {
      log.warn(
        `Failed to refresh node data from YAML after save: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Close the enhanced node editor
   */
  private close(): void {
    if (this.panel) {
      this.panel.style.display = "none";
    }
    this.currentNode = null;
    this.dynamicEntriesManager.clearAllDynamicEntries();
  }
}
