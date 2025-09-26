import tippy from 'tippy.js';
import { log } from '../logging/logger';

// Expose tippy globally for HTML scripts that rely on window.tippy
if (typeof window !== 'undefined') {
  (window as any).tippy = (window as any).tippy || tippy;
}

// Common literals for custom node editor
const TEMP_CUSTOM_ID = 'temp-custom-node' as const;
const EDIT_CUSTOM_ID = 'edit-custom-node' as const;
const DEFAULT_ROLE_PE = 'pe' as const;
const DEFAULT_KIND_SR = 'nokia_srlinux' as const;
import { VscodeMessageSender } from './managerVscodeWebview';
import cytoscape from 'cytoscape';
import { ManagerAddContainerlabNode } from './managerAddContainerlabNode';
import { ManagerNodeEditor } from './managerNodeEditor';
import { getGroupManager } from '../core/managerRegistry';

/**
 * ManagerUnifiedFloatingPanel handles the unified floating action panel
 * that combines lab deployment/destruction with editor actions
 */
export class ManagerUnifiedFloatingPanel {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private addNodeManager: ManagerAddContainerlabNode;
  private nodeEditor: ManagerNodeEditor | null = null;
  private isProcessing: boolean = false;
  private addNodeMenuTippy: any = null;
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
  private addBulkLinkBtn: HTMLButtonElement | null = null;

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, addNodeManager: ManagerAddContainerlabNode, nodeEditor?: ManagerNodeEditor) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.addNodeManager = addNodeManager;
    this.nodeEditor = nodeEditor || null;
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
    this.addBulkLinkBtn = document.getElementById('add-bulk-link-btn') as HTMLButtonElement | null;
    // No JS refs needed for drawer expansion

    // Initialize tooltips
    this.initializeTooltips();

    // Set up interactions (drawer expansion via CSS)
    this.setupActionButtons();
    this.setupAddNodeMenu();
    // Delegate mode-driven UI (viewer/editor) to HTML script
    (window as any).updateUnifiedPanelState?.();
    document.addEventListener('topo-mode-changed', () => this.updateState());

    // Re-initialize tooltips after HTML script potentially modifies attributes
    setTimeout(() => {
      this.initializeTooltips();
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
      this.addNetworkBtn,
      this.addGroupBtn,
      this.addTextBtn,
      this.addBulkLinkBtn
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
    // Lock/Collapse tooltips handled by HTML
  }

  private isViewerMode(): boolean {
    return (window as any).topoViewerMode === 'viewer' ||
      ((window as any).topoViewerState && (window as any).topoViewerState.currentMode === 'viewer');
  }

  private setupActionButtons(): void {
    // Listen for custom events dispatched by the HTML script
    document.addEventListener('unified-deploy-destroy-click', (e: any) => {
      this.handleDeployDestroy(e.detail.isViewerMode);
    });

    document.addEventListener('unified-redeploy-click', (e: any) => {
      this.handleRedeploy(e.detail.isViewerMode);
    });

    // Direct event handlers for cleanup buttons (not handled by HTML script)
    this.deployCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deployLabWithCleanup();
    });
    this.destroyCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.destroyLabWithCleanup();
    });
    this.redeployCleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleRedeployCleanup();
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
      placement: 'right-start',
      delay: [100, 300], // delay show/hide to prevent flickering
      interactiveBorder: 10, // allow mouse movement between trigger and menu
      onShow(instance) {
        instance.setContent(self.buildAddNodeMenu(instance));
        // Force update the background color to match current theme
        const box = instance.popper.querySelector('.tippy-box') as HTMLElement;
        if (box) {
          const computedStyle = window.getComputedStyle(document.documentElement);
          box.style.backgroundColor = computedStyle.getPropertyValue('--vscode-dropdown-background').trim() ||
                                      computedStyle.getPropertyValue('--vscode-editor-background').trim();
          box.style.color = computedStyle.getPropertyValue('--vscode-dropdown-foreground').trim() ||
                           computedStyle.getPropertyValue('--vscode-editor-foreground').trim();
          box.style.borderColor = computedStyle.getPropertyValue('--vscode-dropdown-border').trim() ||
                                 computedStyle.getPropertyValue('--vscode-widget-border').trim();
        }
      },
      theme: 'dropdown-menu',
      content: ''
    });
  }

  private createFilterInput(container: HTMLElement): HTMLInputElement {
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-container';
    filterContainer.style.padding = '8px';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter nodes...';
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
    menu.className = 'flex flex-col';
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
    item.className = 'add-node-menu-item text-left filterable-item';
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

  private createCustomNodeMenuItem(
    menu: HTMLElement,
    allItems: { element: HTMLElement; label: string; isDefault?: boolean }[],
    node: any,
    instance: any
  ): void {
    const item = document.createElement('div');
    item.className = 'add-node-menu-item filterable-item';

    const isDefault = node.setDefault === true;
    const labelText = isDefault ? `${node.name} (default)` : node.name;

    const btn = document.createElement('button');
    btn.textContent = labelText;
    btn.className = 'flex-1 text-left bg-transparent border-none cursor-pointer';
    btn.style.color = 'inherit';
    btn.style.fontFamily = 'inherit';
    btn.style.fontSize = 'inherit';
    if (isDefault) {
      btn.style.fontWeight = '600';
    }
    btn.addEventListener('click', () => {
      this.handleAddNodeTemplate(node);
      instance.hide();
    });

    const defaultBtn = document.createElement('button');
    defaultBtn.innerHTML = isDefault ? '★' : '☆';
    defaultBtn.className = 'add-node-default-btn';
    if (isDefault) {
      defaultBtn.classList.add('is-default');
      defaultBtn.title = 'Default node';
      defaultBtn.setAttribute('aria-pressed', 'true');
    } else {
      defaultBtn.title = 'Set as default node';
      defaultBtn.setAttribute('aria-pressed', 'false');
    }
    defaultBtn.type = 'button';
    defaultBtn.setAttribute('aria-label', isDefault ? 'Default node' : 'Set as default node');
    defaultBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isDefault) {
        return;
      }
      await this.handleSetDefaultCustomNode(node.name, instance);
    });

    const editBtn = document.createElement('button');
    editBtn.innerHTML = '✎';
    editBtn.className = 'add-node-edit-btn';
    editBtn.title = 'Edit custom node';
    editBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleEditCustomNode(node);
      instance.hide();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.className = 'add-node-delete-btn';
    deleteBtn.title = 'Delete custom node';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleDeleteCustomNode(node.name);
      instance.setContent(this.buildAddNodeMenu(instance));
    });

    item.appendChild(btn);
    item.appendChild(defaultBtn);
    item.appendChild(editBtn);
    item.appendChild(deleteBtn);
    menu.appendChild(item);
    allItems.push({ element: item, label: labelText.toLowerCase() });
  }

  private async handleSetDefaultCustomNode(nodeName: string, instance: any): Promise<void> {
    try {
      const resp = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-set-default-custom-node',
        { name: nodeName }
      );

      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }

      instance.setContent(this.buildAddNodeMenu(instance));
      log.info(`Set default custom node: ${nodeName}`);
    } catch (err) {
      log.error(`Failed to set default custom node: ${err instanceof Error ? err.message : String(err)}`);
      await this.showError('Failed to set default custom node');
    }
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
    container.className = 'flex flex-col';

    const filterInput = this.createFilterInput(container);
    const menu = this.createMenuContainer(container);

    const customNodes = (window as any).customNodes || [];
    const allItems: { element: HTMLElement; label: string; isDefault?: boolean }[] = [];

    if (customNodes.length > 0) {
      customNodes.forEach((n: any) => {
        this.createCustomNodeMenuItem(menu, allItems, n, instance);
      });
    }

    this.createAddNodeMenuItem(
      menu,
      allItems,
      'New custom node…',
      () => this.handleCreateCustomNode(),
      instance,
      false,
      customNodes.length > 0
    );

    this.attachFilterHandlers(filterInput, allItems, instance);

    return container;
  }

  // All UI class/style updates are handled in HTML

  /**
   * Handles deploy/destroy action
   */
  private async handleDeployDestroy(isViewerMode: boolean): Promise<void> {
    if (this.isProcessing) {
      log.debug('Deploy/destroy action ignored - already processing');
      return;
    }

    if (isViewerMode) {
      await this.destroyLab();
    } else {
      await this.deployLab();
    }
  }

  // Cleanup handled by specific buttons: deploy-cleanup, destroy-cleanup, redeploy-cleanup

  /**
   * Deploys the current lab
   */
  private async deployLab(): Promise<void> {
    log.debug('Deploying lab via unified panel');

    this.setProcessing(true);

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for deployment');
        this.showError('No lab file available for deployment');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('deployLab', labPath);
      log.info('Lab deployment completed successfully');

    } catch (error) {
      log.error(`Error deploying lab: ${error}`);
      this.showError('Failed to deploy lab');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Destroys the current lab
   */
  private async destroyLab(): Promise<void> {
    log.debug('Destroying lab via unified panel');

    this.setProcessing(true);

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for destruction');
        this.showError('No lab file available for destruction');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLab', labPath);
      log.info('Lab destruction completed successfully');

    } catch (error) {
      log.error(`Error destroying lab: ${error}`);
      this.showError('Failed to destroy lab');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Deploys the current lab with cleanup
   */
  private async deployLabWithCleanup(): Promise<void> {
    log.debug('Deploying lab with cleanup via unified panel');

    this.setProcessing(true);

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for deployment with cleanup');
        this.showError('No lab file available for deployment');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('deployLabCleanup', labPath);
      log.info('Lab deployment with cleanup completed successfully');

    } catch (error) {
      log.error(`Error deploying lab with cleanup: ${error}`);
      this.showError('Failed to deploy lab with cleanup');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Destroys the current lab with cleanup
   */
  private async destroyLabWithCleanup(): Promise<void> {
    log.debug('Destroying lab with cleanup via unified panel');

    this.setProcessing(true);

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for destruction with cleanup');
        this.showError('No lab file available for destruction');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLabCleanup', labPath);
      log.info('Lab destruction with cleanup completed successfully');

    } catch (error) {
      log.error(`Error destroying lab with cleanup: ${error}`);
      this.showError('Failed to destroy lab with cleanup');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Handles redeploy action using dedicated redeploy command
   */
  private async handleRedeploy(isViewerMode: boolean): Promise<void> {
    if (this.isProcessing) {
      log.debug('Redeploy action ignored - already processing');
      return;
    }

    if (!isViewerMode) {
      log.warn('Redeploy action called but not in viewer mode');
      return;
    }

    log.debug('Redeploying lab via unified panel');

    this.setProcessing(true);

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for redeploy');
        this.showError('No lab file available for redeploy');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('redeployLab', labPath);
      log.info('Lab redeploy completed successfully');

    } catch (error) {
      log.error(`Error redeploying lab: ${error}`);
      this.showError('Failed to redeploy lab');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Handles redeploy with cleanup using dedicated redeploy cleanup command
   */
  private async handleRedeployCleanup(): Promise<void> {
    if (this.isProcessing) {
      log.debug('Redeploy (cleanup) action ignored - already processing');
      return;
    }
    const isViewer = this.isViewerMode();
    if (!isViewer) {
      log.warn('Redeploy (cleanup) called but not in viewer mode');
      return;
    }
    this.setProcessing(true);
    try {
      const labPath = (window as any).currentLabPath;
      if (!labPath) {
        log.error('No current lab path available for redeploy (cleanup)');
        this.showError('No lab file available for redeploy');
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('redeployLabCleanup', labPath);
      log.info('Lab redeploy (cleanup) completed successfully');
    } catch (error) {
      log.error(`Error in redeploy (cleanup): ${error}`);
      this.showError('Failed to redeploy (cleanup)');
    } finally {
      this.setProcessing(false);
    }
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
        this.handleAddNodeTemplate(tpl);
        return;
      }
    }

    this.addNodeAtCenter();

    log.info('Added new node via unified panel');
  }

  private handleAddNodeTemplate(template: any): void {
    this.addNodeAtCenter(template);
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

  private handleCreateCustomNode(): void {
    // Open the node editor panel without adding a node to the canvas
    if (this.nodeEditor) {
      // Create a temporary node data for the form
      const tempNodeData = {
        id: TEMP_CUSTOM_ID,
        name: TEMP_CUSTOM_ID,
        topoViewerRole: window.defaultKind === DEFAULT_KIND_SR ? 'router' : DEFAULT_ROLE_PE,  // Set router for SR Linux, pe for others
        extraData: {
          kind: window.defaultKind || DEFAULT_KIND_SR,
          type: window.defaultType || '',
          image: ''
        }
      };

      // Create a mock node object for the editor
      const mockNode = {
        id: () => TEMP_CUSTOM_ID,
        data: () => tempNodeData,
        parent: () => ({ nonempty: () => false })
      };

      void this.nodeEditor.open(mockNode as any);

      // Focus on the custom node name field after a short delay
      setTimeout(() => {
        const input = document.getElementById('node-custom-name') as HTMLInputElement | null;
        input?.focus();
      }, 150);
    } else {
      log.error('NodeEditor not available for custom node creation');
    }
  }

  private handleEditCustomNode(customNode: any): void {
    // Open the node editor panel to edit an existing custom node template
    if (this.nodeEditor) {
      // Create a temporary node data with the custom node's properties
      const tempNodeData = {
        id: EDIT_CUSTOM_ID,
        name: EDIT_CUSTOM_ID,
        topoViewerRole: customNode.icon || DEFAULT_ROLE_PE,  // Add icon to the node data
        extraData: {
          kind: customNode.kind,
          type: customNode.type,
          image: customNode.image,
          icon: customNode.icon || DEFAULT_ROLE_PE,  // Also include icon in extraData for the editor
          // Include any other properties from the custom node
          ...Object.fromEntries(
            Object.entries(customNode).filter(([key]) =>
              !['name', 'kind', 'type', 'image', 'setDefault', 'icon'].includes(key)
            )
          ),
          // Mark this as editing an existing custom node
          editingCustomNodeName: customNode.name
        }
      };

      // Create a mock node object for the editor
      const mockNode = {
        id: () => 'edit-custom-node',
        data: () => tempNodeData,
        parent: () => ({ nonempty: () => false })
      };

      void this.nodeEditor.open(mockNode as any);

      // Pre-fill the custom node name field
      setTimeout(() => {
        const input = document.getElementById('node-custom-name') as HTMLInputElement | null;
        if (input) {
          input.value = customNode.name;
        }
        const baseNameInput = document.getElementById('node-base-name') as HTMLInputElement | null;
        if (baseNameInput && customNode.baseName) {
          baseNameInput.value = customNode.baseName;
        }
        const checkbox = document.getElementById('node-custom-default') as HTMLInputElement | null;
        if (checkbox && customNode.setDefault) {
          checkbox.checked = customNode.setDefault;
        }
      }, 150);
    } else {
      log.error('NodeEditor not available for custom node editing');
    }
  }

  private async handleDeleteCustomNode(nodeName: string): Promise<void> {
    try {
      // Note: window.confirm doesn't work in VS Code webviews
      // For now, we'll delete without confirmation
      // NOTE: Consider implementing confirmation through VS Code backend

      const payload = { name: nodeName };
      const resp = await this.messageSender.sendMessageToVscodeEndpointPost(
        'topo-editor-delete-custom-node',
        payload
      );

      if (resp?.customNodes) {
        (window as any).customNodes = resp.customNodes;
      }
      if (resp?.defaultNode !== undefined) {
        (window as any).defaultNode = resp.defaultNode;
      }

      // Recreate the add node menu to reflect the changes immediately
      this.setupAddNodeMenu();

      // If the tippy is currently visible, hide it to prevent stale content
      if (this.addNodeMenuTippy && this.addNodeMenuTippy.state.isVisible) {
        this.addNodeMenuTippy.hide();
      }

      log.info(`Deleted custom node: ${nodeName}`);
    } catch (err) {
      log.error(`Failed to delete custom node: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleAddNetwork(): void {
    log.debug('Adding new network via unified panel');

    const syntheticEvent = this.createCenterEvent();
    this.addNodeManager.viewportButtonsAddNetworkNode(this.cy, syntheticEvent);

    const newNode = this.cy.nodes().last();
    const state = (window as any).topoViewerState;
    if (newNode && state?.editorEngine?.viewportPanels) {
      setTimeout(() => {
        state.editorEngine.viewportPanels.panelNetworkEditor(newNode);
      }, 100);
    }

    log.info('Added new network via unified panel');
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
   * Sets the processing state
   */
  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;

    const deployBtn = document.getElementById('deploy-destroy-btn') as HTMLButtonElement;
    const redeployBtn = document.getElementById('redeploy-btn') as HTMLButtonElement;
    const cleanupBtn = document.getElementById('cleanup-action-btn') as HTMLButtonElement;

    if (deployBtn) {
      if (processing) {
        deployBtn.disabled = true;
        deployBtn.classList.add('processing');
      } else {
        deployBtn.disabled = false;
        deployBtn.classList.remove('processing');
      }
    }

    if (redeployBtn) {
      if (processing) {
        redeployBtn.disabled = true;
        redeployBtn.classList.add('processing');
      } else {
        redeployBtn.disabled = false;
        redeployBtn.classList.remove('processing');
      }
    }

    if (cleanupBtn) {
      if (processing) {
        cleanupBtn.disabled = true;
        cleanupBtn.classList.add('processing');
      } else {
        cleanupBtn.disabled = false;
        cleanupBtn.classList.remove('processing');
      }
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
