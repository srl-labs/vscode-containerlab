import tippy from 'tippy.js';
import { log } from '../logging/logger';
import { VscodeMessageSender } from './managerVscodeWebview';
import cytoscape from 'cytoscape';
import { ManagerAddContainerlabNode } from './managerAddContainerlabNode';
import { getGroupManager } from '../core/managerRegistry';

/**
 * ManagerUnifiedFloatingPanel handles the unified floating action panel
 * that combines lab deployment/destruction with editor actions
 */
export class ManagerUnifiedFloatingPanel {
  private cy: cytoscape.Core;
  private messageSender: VscodeMessageSender;
  private addNodeManager: ManagerAddContainerlabNode;
  private isProcessing: boolean = false;
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

  constructor(cy: cytoscape.Core, messageSender: VscodeMessageSender, addNodeManager: ManagerAddContainerlabNode) {
    this.cy = cy;
    this.messageSender = messageSender;
    this.addNodeManager = addNodeManager;
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
      this.addNodeBtn,
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
    if (this.addNodeBtn) tippy(this.addNodeBtn, tooltipOptions);
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

    // Get viewport center for positioning
    const extent = this.cy.extent();
    const viewportCenterX = (extent.x1 + extent.x2) / 2;
    const viewportCenterY = (extent.y1 + extent.y2) / 2;

    // Create a synthetic event object for the add node manager
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

    // Add the node
    this.addNodeManager.viewportButtonsAddContainerlabNode(this.cy, syntheticEvent);

    // Optionally, open the node editor for the newly added node
    const newNode = this.cy.nodes().last();
    const state = (window as any).topoViewerState;
    if (newNode && state?.editorEngine?.viewportPanels) {
      setTimeout(() => {
        state.editorEngine.viewportPanels.panelNodeEditor(newNode);
      }, 100);
    }

    log.info('Added new node via unified panel');
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
