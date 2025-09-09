import tippy from 'tippy.js';
import { log } from '../logging/logger';
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

  private buildAddNodeMenu(instance: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'flex flex-col';

    // Add filter input
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-container';
    filterContainer.style.padding = '8px';
    filterContainer.style.borderBottom = '1px solid var(--vscode-widget-border, var(--vscode-dropdown-border))';

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

    // Menu items container
    const menu = document.createElement('div');
    menu.className = 'flex flex-col';
    menu.style.maxHeight = '300px';
    menu.style.overflowY = 'auto';
    container.appendChild(menu);

    const customNodes = (window as any).customNodes || [];
    const allItems: { element: HTMLElement, label: string, isDefault?: boolean }[] = [];

    const addItem = (label: string, handler: () => void, isDefault = false) => {
      const item = document.createElement('button');
      item.className = 'add-node-menu-item text-left filterable-item';
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
    };

    const addCustomItem = (node: any) => {
      const item = document.createElement('div');
      item.className = 'add-node-menu-item filterable-item';

      const btn = document.createElement('button');
      btn.textContent = node.name;
      btn.className = 'flex-1 text-left bg-transparent border-none cursor-pointer';
      btn.style.color = 'inherit';
      btn.style.fontFamily = 'inherit';
      btn.style.fontSize = 'inherit';
      btn.addEventListener('click', () => {
        this.handleAddNodeTemplate(node);
        instance.hide();
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
        // Refresh the menu content after deletion
        instance.setContent(this.buildAddNodeMenu(instance));
      });

      item.appendChild(btn);
      item.appendChild(editBtn);
      item.appendChild(deleteBtn);
      menu.appendChild(item);
      allItems.push({ element: item, label: node.name.toLowerCase() });
    };

    const defaultName = (window as any).defaultNode;
    addItem(defaultName ? `Default (${defaultName})` : 'Default', () => this.handleAddNode(), true);

    let separator: HTMLElement | null = null;
    if (customNodes.length > 0) {
      separator = document.createElement('div');
      separator.className = 'add-node-menu-separator';
      menu.appendChild(separator);

      customNodes.forEach((n: any) => {
        addCustomItem(n);
      });
    }

    const separator2 = document.createElement('div');
    separator2.className = 'add-node-menu-separator';
    menu.appendChild(separator2);

    addItem('New custom node…', () => this.handleCreateCustomNode());

    // Add filter functionality
    let currentFocusIndex = -1;
    const visibleItems: HTMLElement[] = [];

    const updateFilter = (searchText: string) => {
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

      // Hide separators if no custom nodes are visible
      if (separator && separator2) {
        const hasVisibleCustomNodes = customNodes.some((n: any) =>
          search === '' || n.name.toLowerCase().includes(search)
        );
        separator.style.display = hasVisibleCustomNodes ? '' : 'none';
        separator2.style.display = hasVisibleCustomNodes ? '' : 'none';
      }

      currentFocusIndex = -1;
    };

    const setFocus = (index: number) => {
      // Remove previous focus
      visibleItems.forEach(item => {
        item.style.backgroundColor = '';
      });

      // Set new focus
      if (index >= 0 && index < visibleItems.length) {
        visibleItems[index].style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
        visibleItems[index].scrollIntoView({ block: 'nearest' });
        currentFocusIndex = index;
      }
    };

    // Handle input events
    filterInput.addEventListener('input', (e) => {
      updateFilter((e.target as HTMLInputElement).value);
    });

    // Handle keyboard navigation
    filterInput.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocus(Math.min(currentFocusIndex + 1, visibleItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocus(Math.max(currentFocusIndex - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (currentFocusIndex >= 0 && currentFocusIndex < visibleItems.length) {
            const item = visibleItems[currentFocusIndex];
            // Trigger click on the item or its first button child
            const button = item.querySelector('button') || item;
            button.click();
          }
          break;
        case 'Escape':
          instance.hide();
          break;
      }
    });

    // Focus filter input when menu opens
    setTimeout(() => filterInput.focus(), 50);

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

  private addNodeAtCenter(template?: any): void {
    const extent = this.cy.extent();
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;

    const syntheticEvent: cytoscape.EventObject = {
      type: 'click',
      target: this.cy,
      cy: this.cy,
      namespace: '',
      timeStamp: Date.now(),
      position: { x: viewportCenterX, y: viewportCenterY },
      renderedPosition: { x: viewportCenterX, y: viewportCenterY },
      originalEvent: new MouseEvent('click')
    } as cytoscape.EventObject;

    this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, syntheticEvent, template);
  }

  private handleCreateCustomNode(): void {
    // Open the node editor panel without adding a node to the canvas
    if (this.nodeEditor) {
      // Create a temporary node data for the form
      const tempNodeData = {
        id: 'temp-custom-node',
        name: 'temp-custom-node',
        topoViewerRole: window.defaultKind === 'nokia_srlinux' ? 'router' : 'pe',  // Set router for SR Linux, pe for others
        extraData: {
          kind: window.defaultKind || 'nokia_srlinux',
          type: window.defaultType || '',
          image: ''
        }
      };

      // Create a mock node object for the editor
      const mockNode = {
        id: () => 'temp-custom-node',
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
        id: 'edit-custom-node',
        name: 'edit-custom-node',
        topoViewerRole: customNode.icon || 'pe',  // Add icon to the node data
        extraData: {
          kind: customNode.kind,
          type: customNode.type,
          image: customNode.image,
          icon: customNode.icon || 'pe',  // Also include icon in extraData for the editor
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
      // TODO: Implement confirmation through VS Code backend

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

    const extent = this.cy.extent();
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;

    const syntheticEvent: cytoscape.EventObject = {
      type: 'click',
      target: this.cy,
      cy: this.cy,
      namespace: '',
      timeStamp: Date.now(),
      position: {
        x: viewportCenterX,
        y: viewportCenterY
      },
      renderedPosition: {
        x: viewportCenterX,
        y: viewportCenterY
      },
      originalEvent: new MouseEvent('click')
    } as cytoscape.EventObject;

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
