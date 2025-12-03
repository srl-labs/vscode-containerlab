import tippy from 'tippy.js';
import { log } from '../../platform/logging/logger';

// Expose tippy globally for HTML scripts that rely on window.tippy
if (typeof window !== 'undefined') {
  (window as any).tippy = (window as any).tippy || tippy;
}

// Menu styling constants
const FLEX_COLUMN_CLASS = 'flex flex-col' as const;
const TIPPY_PLACEMENT = 'right-start' as const;
const TIPPY_BOX_SELECTOR = '.tippy-box' as const;
const TIPPY_DROPDOWN_THEME = 'dropdown-menu' as const;
const MENU_ITEM_CLASS = 'add-node-menu-item text-left filterable-item' as const;

type ShapeType = 'rectangle' | 'circle' | 'line';

interface NetworkTypeDefinition {
  readonly type: string;
  readonly label: string;
  readonly isDefault?: boolean;
  readonly addDivider?: boolean;
}

const NETWORK_TYPE_DEFINITIONS: readonly NetworkTypeDefinition[] = [
  { type: 'host', label: 'Host network', isDefault: true },
  { type: 'mgmt-net', label: 'Management network' },
  { type: 'macvlan', label: 'Macvlan network' },
  { type: 'vxlan', label: 'VXLAN network', addDivider: true },
  { type: 'vxlan-stitch', label: 'VXLAN Stitch network' },
  { type: 'dummy', label: 'Dummy network', addDivider: true },
  { type: 'bridge', label: 'Bridge', addDivider: true },
  { type: 'ovs-bridge', label: 'OVS bridge' }
];

import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';
import cytoscape from 'cytoscape';
import { AddNodeManager } from '../nodes/AddNodeManager';
import { NodeEditorManager } from '../node-editor/NodeEditorManager';
import { getGroupManager } from '../../core/managerRegistry';
import { LabLifecycleManager } from './LabLifecycleManager';
import { CustomNodeMenuManager } from './CustomNodeMenuManager';

/**
 * UnifiedFloatingPanelManager handles the unified floating action panel
 * that combines lab deployment/destruction with editor actions
 */
export class UnifiedFloatingPanelManager {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private addNodeManager: AddNodeManager;
  private lifecycleManager: LabLifecycleManager;
  private customNodeMenuManager: CustomNodeMenuManager;
  private addNodeMenuTippy: any = null;
  private addNetworkMenuTippy: any = null;
  private addShapesMenuTippy: any = null;
  // Refs (actions/tooltips only; UI styles live in HTML)
  private deployBtn: HTMLButtonElement | null = null;
  private redeployBtn: HTMLButtonElement | null = null;
  private deployCleanupBtn: HTMLButtonElement | null = null;
  private destroyCleanupBtn: HTMLButtonElement | null = null;
  private redeployCleanupBtn: HTMLButtonElement | null = null;
  private addNodeBtn: HTMLButtonElement | null = null;
  private addNetworkBtn: HTMLButtonElement | null = null;
  private addGroupBtn: HTMLButtonElement | null = null;
  private addTextBtn: HTMLButtonElement | null = null;
  private addShapesBtn: HTMLButtonElement | null = null;
  private addBulkLinkBtn: HTMLButtonElement | null = null;
  private lockBtn: HTMLButtonElement | null = null;
  private collapseBtn: HTMLButtonElement | null = null;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, addNodeManager: AddNodeManager, nodeEditor?: NodeEditorManager) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.addNodeManager = addNodeManager;

    // Initialize lifecycle manager
    this.lifecycleManager = new LabLifecycleManager(messageSender, {
      showError: (message: string) => this.showError(message)
    });

    // Initialize custom node menu manager
    this.customNodeMenuManager = new CustomNodeMenuManager(
      messageSender,
      {
        showError: (message: string) => this.showError(message),
        refreshAddNodeMenu: () => this.setupAddNodeMenu()
      },
      nodeEditor
    );

    this.initializePanel();
  }

  /**
   * Initializes the unified floating panel and sets up event listeners
   */
  private initializePanel(): void {
    // Cache DOM refs
    this.deployBtn = document.getElementById('deploy-destroy-btn') as HTMLButtonElement | null;
    this.redeployBtn = document.getElementById('redeploy-btn') as HTMLButtonElement | null;
    this.deployCleanupBtn = document.getElementById('deploy-cleanup-btn') as HTMLButtonElement | null;
    this.destroyCleanupBtn = document.getElementById('destroy-cleanup-btn') as HTMLButtonElement | null;
    this.redeployCleanupBtn = document.getElementById('redeploy-cleanup-btn') as HTMLButtonElement | null;
    this.addNodeBtn = document.getElementById('add-node-btn') as HTMLButtonElement | null;
    this.addNetworkBtn = document.getElementById('add-network-btn') as HTMLButtonElement | null;
    this.addGroupBtn = document.getElementById('add-group-btn') as HTMLButtonElement | null;
    this.addTextBtn = document.getElementById('add-text-btn') as HTMLButtonElement | null;
    this.addShapesBtn = document.getElementById('add-shapes-btn') as HTMLButtonElement | null;
    this.addBulkLinkBtn = document.getElementById('add-bulk-link-btn') as HTMLButtonElement | null;
    this.lockBtn = document.getElementById('lock-panel-btn') as HTMLButtonElement | null;
    this.collapseBtn = document.getElementById('collapse-panel-btn') as HTMLButtonElement | null;

    // Initialize tooltips
    this.initializeTooltips();

    // Set up interactions (drawer expansion via CSS)
    this.setupActionButtons();
    this.setupAddNodeMenu();
    this.setupAddNetworkMenu();
    this.setupAddShapesMenu();
    // Delegate mode-driven UI (viewer/editor) to HTML script
    (window as any).updateUnifiedPanelState?.();
    document.addEventListener('topo-mode-changed', () => this.updateState());

    // Re-initialize tooltips after HTML script potentially modifies attributes
    setTimeout(() => {
      this.initializeTooltips();
      this.setupAddNodeMenu();
      this.setupAddNetworkMenu();
      this.setupAddShapesMenu();
    }, 200);

    log.debug('Unified floating panel initialized');
  }

  /**
   * Initializes tooltips for all buttons
   */
  private initializeTooltips(): void {
    const tooltipOptions = { delay: [100, 0] as [number, number] };

    // Destroy existing tooltips to avoid conflicts
    const buttons = [
      this.deployBtn,
      this.redeployBtn,
      this.deployCleanupBtn,
      this.destroyCleanupBtn,
      this.redeployCleanupBtn,
      this.addGroupBtn,
      this.addTextBtn,
      this.addBulkLinkBtn,
      this.lockBtn,
      this.collapseBtn
    ];

    buttons.forEach(btn => {
      if (btn && (btn as any)._tippy) {
        (btn as any)._tippy.destroy();
      }
    });

    // Re-initialize tooltips
    if (this.deployBtn) tippy(this.deployBtn, tooltipOptions);
    if (this.redeployBtn) tippy(this.redeployBtn, tooltipOptions);
    if (this.deployCleanupBtn) tippy(this.deployCleanupBtn, tooltipOptions);
    if (this.destroyCleanupBtn) tippy(this.destroyCleanupBtn, tooltipOptions);
    if (this.redeployCleanupBtn) tippy(this.redeployCleanupBtn, tooltipOptions);
    if (this.addNetworkBtn) tippy(this.addNetworkBtn, tooltipOptions);
    if (this.addGroupBtn) tippy(this.addGroupBtn, tooltipOptions);
    if (this.addTextBtn) tippy(this.addTextBtn, tooltipOptions);
    if (this.addBulkLinkBtn) tippy(this.addBulkLinkBtn, tooltipOptions);
    if (this.lockBtn) tippy(this.lockBtn, tooltipOptions);
    if (this.collapseBtn) tippy(this.collapseBtn, tooltipOptions);
  }

  private setupActionButtons(): void {
    // Listen for custom events dispatched by the HTML script
    document.addEventListener('unified-deploy-destroy-click', (e: any) => {
      void this.lifecycleManager.handleDeployDestroy(e.detail.isViewerMode);
    });

    document.addEventListener('unified-redeploy-click', (e: any) => {
      void this.lifecycleManager.handleRedeploy(e.detail.isViewerMode);
    });

    // Direct event handlers for cleanup buttons (not handled by HTML script)
    this.deployCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.lifecycleManager.deployLabWithCleanup();
    });
    this.destroyCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.lifecycleManager.destroyLabWithCleanup();
    });
    this.redeployCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.lifecycleManager.handleRedeployCleanup();
    });

    // Listen for custom events for other buttons
    document.addEventListener('unified-add-node-click', () => {
      this.handleAddNode();
    });

    document.addEventListener('unified-add-network-click', () => {
      this.handleAddNetwork();
    });

    document.addEventListener('unified-add-group-click', () => {
      this.handleAddGroup();
    });

    document.addEventListener('unified-add-text-click', () => {
      this.handleAddText();
    });

    document.addEventListener('unified-add-shapes-click', () => {
      this.handleAddShapes();
    });

    document.addEventListener('unified-add-bulk-link-click', () => {
      this.handleAddBulkLink();
    });
  }

  private setupAddNodeMenu(): void {
    if (!this.addNodeBtn) return;

    // Destroy existing tippy instance if it exists
    if (this.addNodeMenuTippy) {
      this.addNodeMenuTippy.destroy();
      this.addNodeMenuTippy = null;
    }

    const self = this;
    this.addNodeMenuTippy = tippy(this.addNodeBtn, {
      trigger: 'mouseenter',
      interactive: true,
      appendTo: document.body,
      placement: TIPPY_PLACEMENT,
      delay: [100, 300],
      interactiveBorder: 10,
      onShow(instance) {
        (instance as any)._buildMenuContent = self.buildAddNodeMenu.bind(self);
        instance.setContent(self.buildAddNodeMenu(instance));
        const box = instance.popper.querySelector(TIPPY_BOX_SELECTOR) as HTMLElement | null;
        self.applyDropdownTheme(box);
      },
      theme: TIPPY_DROPDOWN_THEME,
      content: ''
    });
  }

  private setupAddNetworkMenu(): void {
    if (!this.addNetworkBtn) return;

    if (this.addNetworkMenuTippy) {
      this.addNetworkMenuTippy.destroy();
      this.addNetworkMenuTippy = null;
    }

    const self = this;
    this.addNetworkMenuTippy = tippy(this.addNetworkBtn, {
      trigger: 'mouseenter',
      interactive: true,
      appendTo: document.body,
      placement: TIPPY_PLACEMENT,
      delay: [100, 300],
      interactiveBorder: 10,
      onShow(instance) {
        instance.setContent(self.buildAddNetworkMenu(instance));
        const box = instance.popper.querySelector(TIPPY_BOX_SELECTOR) as HTMLElement | null;
        self.applyDropdownTheme(box);
      },
      theme: TIPPY_DROPDOWN_THEME,
      content: ''
    });
  }

  private setupAddShapesMenu(): void {
    if (!this.addShapesBtn) return;

    if (this.addShapesMenuTippy) {
      this.addShapesMenuTippy.destroy();
      this.addShapesMenuTippy = null;
    }

    const self = this;
    this.addShapesMenuTippy = tippy(this.addShapesBtn, {
      trigger: 'mouseenter',
      interactive: true,
      appendTo: document.body,
      placement: TIPPY_PLACEMENT,
      delay: [100, 300],
      interactiveBorder: 10,
      onShow(instance) {
        instance.setContent(self.buildAddShapesMenu(instance));
        const box = instance.popper.querySelector(TIPPY_BOX_SELECTOR) as HTMLElement | null;
        self.applyDropdownTheme(box);
      },
      theme: TIPPY_DROPDOWN_THEME,
      content: ''
    });
  }

  private applyDropdownTheme(box: HTMLElement | null): void {
    if (!box) {
      return;
    }
    const computedStyle = window.getComputedStyle(document.documentElement);
    const background = computedStyle.getPropertyValue('--vscode-dropdown-background').trim() ||
                      computedStyle.getPropertyValue('--vscode-editor-background').trim();
    const foreground = computedStyle.getPropertyValue('--vscode-dropdown-foreground').trim() ||
                      computedStyle.getPropertyValue('--vscode-editor-foreground').trim();
    const border = computedStyle.getPropertyValue('--vscode-dropdown-border').trim() ||
                  computedStyle.getPropertyValue('--vscode-widget-border').trim();

    if (background) {
      box.style.backgroundColor = background;
    }
    if (foreground) {
      box.style.color = foreground;
    }
    if (border) {
      box.style.borderColor = border;
    }
  }

  private createFilterInput(
    container: HTMLElement,
    placeholder: string = 'Filter nodes...'
  ): HTMLInputElement {
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-container';
    filterContainer.style.padding = '8px';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = placeholder;
    filterInput.className = 'filter-input';
    filterInput.style.width = '100%';
    filterInput.style.padding = '4px 8px';
    filterInput.style.backgroundColor = 'var(--vscode-input-background)';
    filterInput.style.color = 'var(--vscode-input-foreground)';
    filterInput.style.border = '1px solid var(--vscode-input-border)';
    filterInput.style.borderRadius = '4px';
    filterInput.style.fontSize = 'var(--vscode-font-size, 13px)';
    filterInput.style.fontFamily = 'var(--vscode-font-family)';
    filterInput.style.outline = 'none';

    filterContainer.appendChild(filterInput);
    container.appendChild(filterContainer);
    return filterInput;
  }

  private createMenuContainer(container: HTMLElement): HTMLElement {
    const menu = document.createElement('div');
    menu.className = FLEX_COLUMN_CLASS;
    menu.style.maxHeight = '300px';
    menu.style.overflowY = 'auto';
    container.appendChild(menu);
    return menu;
  }

  private createAddNodeMenuItem(
    menu: HTMLElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    label: string,
    handler: () => void,
    instance: any,
    isDefault = false,
    addTopDivider = false
  ): void {
    const item = document.createElement('button');
    item.className = MENU_ITEM_CLASS;
    if (addTopDivider) {
      item.classList.add('add-node-menu-item--top-divider');
    }
    item.textContent = label;
    if (isDefault) {
      item.style.fontWeight = '600';
    }
    item.addEventListener('click', () => {
      handler();
      instance.hide();
    });
    menu.appendChild(item);
    allItems.push({ element: item, label: label.toLowerCase(), isDefault });
  }

  private attachFilterHandlers(
    filterInput: HTMLInputElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    instance: any
  ): void {
    let currentFocusIndex = -1;
    const visibleItems: HTMLElement[] = [];

    filterInput.addEventListener('input', (e) => {
      this.filterMenuItems(
        (e.target as HTMLInputElement).value,
        allItems,
        visibleItems
      );
      currentFocusIndex = -1;
    });

    filterInput.addEventListener('keydown', (e) => {
      currentFocusIndex = this.handleFilterKeyNavigation(
        e,
        visibleItems,
        currentFocusIndex,
        instance
      );
    });

    setTimeout(() => filterInput.focus(), 50);
  }

  private refocusFilterInput(instance: any): void {
    const filterInput = instance?.popper?.querySelector?.('.filter-input') as HTMLInputElement | null;
    if (filterInput) {
      setTimeout(() => filterInput.focus(), 0);
    }
  }

  private filterMenuItems(
    searchText: string,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    visibleItems: HTMLElement[]
  ): void {
    const search = searchText.toLowerCase();
    visibleItems.length = 0;

    allItems.forEach(({ element, label }) => {
      if (search === '' || label.includes(search)) {
        element.style.display = '';
        visibleItems.push(element);
      } else {
        element.style.display = 'none';
      }
    });
  }

  private applyFocus(
    visibleItems: HTMLElement[],
    index: number
  ): number {
    visibleItems.forEach(item => {
      item.style.backgroundColor = '';
    });

    if (index >= 0 && index < visibleItems.length) {
      visibleItems[index].style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
      visibleItems[index].scrollIntoView({ block: 'nearest' });
      return index;
    }

    return -1;
  }

  private handleFilterKeyNavigation(
    e: KeyboardEvent,
    visibleItems: HTMLElement[],
    currentFocusIndex: number,
    instance: any
  ): number {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        return this.applyFocus(
          visibleItems,
          Math.min(currentFocusIndex + 1, visibleItems.length - 1)
        );
      case 'ArrowUp':
        e.preventDefault();
        return this.applyFocus(
          visibleItems,
          Math.max(currentFocusIndex - 1, -1)
        );
      case 'Enter':
        e.preventDefault();
        if (currentFocusIndex >= 0 && currentFocusIndex < visibleItems.length) {
          const item = visibleItems[currentFocusIndex];
          const button = item.querySelector('button') || item;
          (button as HTMLElement).click();
        }
        return currentFocusIndex;
      case 'Escape':
        instance.hide();
        return currentFocusIndex;
      default:
        return currentFocusIndex;
    }
  }

  private buildAddNodeMenu(instance: any): HTMLElement {
    const container = document.createElement('div');
    container.className = FLEX_COLUMN_CLASS;

    const filterInput = this.createFilterInput(container);
    const menu = this.createMenuContainer(container);

    const customNodes = (window as any).customNodes || [];
    const allItems: { element: HTMLElement; label: string; isDefault?: boolean }[] = [];

    if (customNodes.length > 0) {
      customNodes.forEach((n: any) => {
        this.customNodeMenuManager.createCustomNodeMenuItem(
          menu,
          allItems,
          n,
          instance,
          (node) => {
            this.customNodeMenuManager.handleAddNodeTemplate(node, (tpl) => this.addNodeAtCenter(tpl));
            this.refocusFilterInput(instance);
          },
          (inst) => this.refocusFilterInput(inst)
        );
      });
    }

    this.createAddNodeMenuItem(
      menu,
      allItems,
      'New custom node…',
      () => this.customNodeMenuManager.handleCreateCustomNode(),
      instance,
      false,
      customNodes.length > 0
    );

    this.attachFilterHandlers(filterInput, allItems, instance);

    return container;
  }

  private buildAddNetworkMenu(instance: any): HTMLElement {
    const container = document.createElement('div');
    container.className = FLEX_COLUMN_CLASS;

    const filterInput = this.createFilterInput(container, 'Filter networks...');
    const menu = this.createMenuContainer(container);

    const allItems: { element: HTMLElement; label: string; isDefault?: boolean }[] = [];

    NETWORK_TYPE_DEFINITIONS.forEach((definition, index) => {
      const label = `${definition.label} (${definition.type})`;
      const addTopDivider = definition.addDivider === true && index !== 0;
      this.createNetworkMenuItem(
        menu,
        allItems,
        label,
        definition.type,
        instance,
        Boolean(definition.isDefault),
        addTopDivider
      );
    });

    this.attachFilterHandlers(filterInput, allItems, instance);

    return container;
  }

  private buildAddShapesMenu(instance: any): HTMLElement {
    const container = document.createElement('div');
    container.className = FLEX_COLUMN_CLASS;

    const menu = this.createMenuContainer(container);
    const allItems: { element: HTMLElement; label: string; isDefault?: boolean }[] = [];

    const shapes = [
      { type: 'rectangle', label: 'Rectangle', icon: 'fa-square' },
      { type: 'circle', label: 'Circle', icon: 'fa-circle' },
      { type: 'line', label: 'Line', icon: 'fa-minus' }
    ];

    shapes.forEach((shape) => {
      this.createShapeMenuItem(menu, allItems, shape.label, shape.type as ShapeType, shape.icon, instance);
    });

    return container;
  }

  private createShapeMenuItem(
    menu: HTMLElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    label: string,
    shapeType: ShapeType,
    icon: string,
    instance: any
  ): void {
    const item = document.createElement('button');
    item.className = MENU_ITEM_CLASS;
    item.innerHTML = `<i class="fas ${icon} mr-2"></i>${label}`;
    item.type = 'button';
    item.addEventListener('click', () => {
      this.handleAddShapes(shapeType);
      instance.hide();
    });
    menu.appendChild(item);
    allItems.push({ element: item, label: label.toLowerCase() });
  }

  private createNetworkMenuItem(
    menu: HTMLElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    label: string,
    networkType: string,
    instance: any,
    isDefault = false,
    addTopDivider = false
  ): void {
    const item = document.createElement('button');
    item.className = MENU_ITEM_CLASS;
    if (addTopDivider) {
      item.classList.add('add-node-menu-item--top-divider');
    }
    item.textContent = label;
    item.type = 'button';
    item.addEventListener('click', () => {
      this.handleAddNetwork(networkType);
      this.refocusFilterInput(instance);
    });
    menu.appendChild(item);
    allItems.push({ element: item, label: label.toLowerCase(), isDefault });
  }

  /**
   * Handles adding a new node to the topology
   */
  private handleAddNode(): void {
    log.debug('Adding new node via unified panel');

    const defaultName = (window as any).defaultNode;
    if (defaultName) {
      const customNodes = (window as any).customNodes || [];
      const tpl = customNodes.find((n: any) => n.name === defaultName);
      if (tpl) {
        this.customNodeMenuManager.handleAddNodeTemplate(tpl, (template) => this.addNodeAtCenter(template));
        return;
      }
    }

    this.addNodeAtCenter();
    log.info('Added new node via unified panel');
  }

  private createCenterEvent(): cytoscape.EventObject {
    const extent = this.cy.extent();
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;

    return {
      type: 'click',
      target: this.cy,
      cy: this.cy,
      namespace: '',
      timeStamp: Date.now(),
      position: { x: viewportCenterX, y: viewportCenterY },
      renderedPosition: { x: viewportCenterX, y: viewportCenterY },
      originalEvent: new MouseEvent('click')
    } as cytoscape.EventObject;
  }

  private addNodeAtCenter(template?: any): void {
    const syntheticEvent = this.createCenterEvent();
    this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, syntheticEvent, template);
  }

  private handleAddNetwork(networkType: string = 'host'): void {
    log.debug(`Adding new network via unified panel (${networkType})`);

    const syntheticEvent = this.createCenterEvent();
    this.addNodeManager.viewportButtonsAddNetworkNode(this.cy, syntheticEvent, networkType);

    const newNode = this.cy.nodes().last();
    const state = (window as any).topoViewerState;
    if (newNode && state?.editorEngine?.viewportPanels) {
      setTimeout(() => {
        state.editorEngine.viewportPanels.panelNetworkEditor(newNode);
      }, 100);
    }

    log.info(`Added new network via unified panel (${networkType})`);
  }

  /**
   * Handles adding a new group to the topology
   */
  private handleAddGroup(): void {
    log.debug('Adding new group via unified panel');

    const topoController = (window as any).topologyWebviewController;
    const groupManager = topoController
      ? getGroupManager(this.cy, topoController.groupStyleManager, 'edit')
      : null;
    if (!groupManager) {
      log.error('Group manager not available');
      return;
    }

    groupManager.viewportButtonsAddGroup();
    log.info('Added new group via unified panel');
  }

  /**
   * Handles adding free text to the topology
   */
  private handleAddText(): void {
    log.debug('Adding free text via unified panel');

    const topoController = (window as any).topologyWebviewController;
    if (topoController && topoController.freeTextManager) {
      topoController.freeTextManager.enableAddTextMode();
      log.info('Free text mode enabled via unified panel');
    } else {
      log.error('Free text manager not available');
    }
  }

  /**
   * Handles adding shapes to the topology
   */
  private handleAddShapes(shapeType: ShapeType = 'rectangle'): void {
    log.debug(`Adding free shape (${shapeType}) via unified panel`);

    const topoController = (window as any).topologyWebviewController;
    if (topoController && topoController.freeShapesManager) {
      topoController.freeShapesManager.enableAddShapeMode(shapeType);
      log.info(`Free shape mode enabled (${shapeType}) via unified panel`);
    } else {
      log.error('Free shapes manager not available');
    }
  }

  /**
   * Handles adding a bulk link to the topology
   */
  private handleAddBulkLink(): void {
    log.debug('Bulk linking via unified panel');
    const controller = (window as any).topologyWebviewController;
    if (controller && controller.showBulkLinkPanel) {
      controller.showBulkLinkPanel();
      log.info('Bulk link panel opened via unified panel');
    } else {
      log.error('Topology controller or showBulkLinkPanel method not available');
    }
  }

  /**
   * Shows an error message to the user
   */
  private async showError(message: string): Promise<void> {
    try {
      await this.messageSender.sendMessageToVscodeEndpointPost('showError', message);
    } catch (error) {
      log.error(`Failed to show error message: ${error}. Original message: ${message}`);
    }
  }

  /**
   * Updates the panel state based on current mode
   */
  public updateState(): void {
    (window as any).updateUnifiedPanelState?.();
    const isViewerMode = (window as any).topoViewerMode === 'viewer';
    log.debug(`Unified panel state updated for ${isViewerMode ? 'viewer' : 'editor'} mode`);

    // Re-initialize tooltips after state update to handle dynamic content changes
    setTimeout(() => {
      this.initializeTooltips();
    }, 100);
  }

  public setNodeEditor(nodeEditor: NodeEditorManager | null): void {
    this.customNodeMenuManager.setNodeEditor(nodeEditor);
  }

  /**
   * Shows or hides the unified panel
   */
  public setVisibility(visible: boolean): void {
    const panel = document.getElementById('unified-floating-panel');
    if (panel) {
      panel.style.display = visible ? 'block' : 'none';
    }
  }
}
