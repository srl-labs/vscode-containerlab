// file: managerUnifiedFloatingPanel.ts

import tippy from 'tippy.js';
import { log } from '../logging/webviewLogger';
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
    // Initialize tooltips for all buttons
    this.initializeTooltips();

    // Listen for custom events from the UI
    document.addEventListener('unified-deploy-destroy-click', (e: Event) => {
      const customEvent = e as CustomEvent;
      this.handleDeployDestroy(customEvent.detail.isViewerMode);
    });

    document.addEventListener('unified-redeploy-click', (e: Event) => {
      const customEvent = e as CustomEvent;
      this.handleRedeploy(customEvent.detail.isViewerMode);
    });

    document.addEventListener('unified-cleanup-click', (e: Event) => {
      const customEvent = e as CustomEvent;
      this.handleCleanupAction(customEvent.detail.isViewerMode);
    });

    document.addEventListener('unified-add-node-click', () => {
      this.handleAddNode();
    });

    document.addEventListener('unified-add-group-click', () => {
      this.handleAddGroup();
    });

    document.addEventListener('unified-add-text-click', () => {
      this.handleAddText();
    });

    log.debug('Unified floating panel initialized');
  }

  /**
   * Initializes tooltips for all buttons
   */
  private initializeTooltips(): void {
    const tooltipOptions = { delay: [100, 0] as [number, number] };

    const deployBtn = document.getElementById('deploy-destroy-btn');
    const redeployBtn = document.getElementById('redeploy-btn');
    const cleanupBtn = document.getElementById('cleanup-action-btn');
    const addNodeBtn = document.getElementById('add-node-btn');
    const addGroupBtn = document.getElementById('add-group-btn');
    const addTextBtn = document.getElementById('add-text-btn');
    const lockBtn = document.getElementById('lock-panel-btn');
    const collapseBtn = document.getElementById('collapse-panel-btn');

    if (deployBtn) tippy(deployBtn, tooltipOptions);
    if (redeployBtn) tippy(redeployBtn, tooltipOptions);
    if (cleanupBtn) tippy(cleanupBtn, tooltipOptions);
    if (addNodeBtn) tippy(addNodeBtn, tooltipOptions);
    if (addGroupBtn) tippy(addGroupBtn, tooltipOptions);
    if (addTextBtn) tippy(addTextBtn, tooltipOptions);
    if (lockBtn) tippy(lockBtn, tooltipOptions);
    if (collapseBtn) tippy(collapseBtn, tooltipOptions);
  }

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

  /**
   * Handles cleanup action (deploy/destroy with -c flag)
   */
  private async handleCleanupAction(isViewerMode: boolean): Promise<void> {
    if (this.isProcessing) {
      log.debug('Cleanup action ignored - already processing');
      return;
    }

    if (isViewerMode) {
      await this.destroyLabWithCleanup();
    } else {
      await this.deployLabWithCleanup();
    }
  }

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
   * Handles redeploy action (destroy and deploy)
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

      // First destroy the lab, then redeploy it
      log.debug('Step 1: Destroying lab for redeploy...');
      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLab', labPath);
      
      // Wait a brief moment to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      log.debug('Step 2: Deploying lab for redeploy...');
      await this.messageSender.sendMessageToVscodeEndpointPost('deployLab', labPath);
      
      log.info('Lab redeploy completed successfully');
      
    } catch (error) {
      log.error(`Error redeploying lab: ${error}`);
      this.showError('Failed to redeploy lab');
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

  /**
   * Handles adding a new group to the topology
   */
  private handleAddGroup(): void {
    log.debug('Adding new group via unified panel');

    const groupManager = getGroupManager(this.cy, 'edit');
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
    // Trigger the HTML script function to update the UI
    if (typeof (window as any).updateUnifiedPanelState === 'function') {
      (window as any).updateUnifiedPanelState();
    }

    const isViewerMode = (window as any).topoViewerMode === 'viewer';
    log.debug(`Unified panel state updated for ${isViewerMode ? 'viewer' : 'editor'} mode`);
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