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
  // UI state
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private initialLeft = 0;
  private initialTop = 0;
  private isLocked = false;
  private isCollapsed = false;
  // Refs
  private panel: HTMLElement | null = null;
  private panelContent: HTMLElement | null = null;
  private deployBtn: HTMLButtonElement | null = null;
  private redeployBtn: HTMLButtonElement | null = null;
  private cleanupBtn: HTMLButtonElement | null = null;
  private addNodeBtn: HTMLButtonElement | null = null;
  private addGroupBtn: HTMLButtonElement | null = null;
  private addTextBtn: HTMLButtonElement | null = null;
  private lockBtn: HTMLButtonElement | null = null;
  private collapseBtn: HTMLButtonElement | null = null;
  private dividerTop: HTMLElement | null = null;
  private dividerBottom: HTMLElement | null = null;
  private secondaryButtons: HTMLElement | null = null;
  private deployButtonGroup: HTMLElement | null = null;

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
    this.panel = document.getElementById('unified-floating-panel');
    this.panelContent = document.getElementById('panel-content');
    this.deployBtn = document.getElementById('deploy-destroy-btn') as HTMLButtonElement | null;
    this.redeployBtn = document.getElementById('redeploy-btn') as HTMLButtonElement | null;
    this.cleanupBtn = document.getElementById('cleanup-action-btn') as HTMLButtonElement | null;
    this.addNodeBtn = document.getElementById('add-node-btn') as HTMLButtonElement | null;
    this.addGroupBtn = document.getElementById('add-group-btn') as HTMLButtonElement | null;
    this.addTextBtn = document.getElementById('add-text-btn') as HTMLButtonElement | null;
    this.lockBtn = document.getElementById('lock-panel-btn') as HTMLButtonElement | null;
    this.collapseBtn = document.getElementById('collapse-panel-btn') as HTMLButtonElement | null;
    this.dividerTop = document.getElementById('panel-divider-editor');
    this.dividerBottom = document.getElementById('panel-divider-collapse');
    this.secondaryButtons = document.getElementById('deploy-secondary-buttons');
    this.deployButtonGroup = document.getElementById('deploy-button-group');

    // Initialize tooltips
    this.initializeTooltips();

    // Set up interactions
    this.setupDrag();
    this.setupControlButtons();
    this.setupDeployButtonExpansion();
    this.setupActionButtons();
    this.loadPanelState();

    // Ensure panel starts expanded
    if (this.isCollapsed) {
      this.isCollapsed = false;
      this.updateCollapseState();
      this.savePanelState();
    } else {
      // Apply collapse state explicitly (expanded)
      this.updateCollapseState();
    }

    // Apply mode-driven UI (viewer/editor)
    this.updateUiForMode();

    // Keep panel in bounds on resize
    window.addEventListener('resize', () => this.keepPanelInViewport());

    // React to external mode changes
    document.addEventListener('topo-mode-changed', () => this.updateUiForMode());

    log.debug('Unified floating panel initialized');
  }

  /**
   * Initializes tooltips for all buttons
   */
  private initializeTooltips(): void {
    const tooltipOptions = { delay: [100, 0] as [number, number] };
    if (this.deployBtn) tippy(this.deployBtn, tooltipOptions);
    if (this.redeployBtn) tippy(this.redeployBtn, tooltipOptions);
    if (this.cleanupBtn) tippy(this.cleanupBtn, tooltipOptions);
    if (this.addNodeBtn) tippy(this.addNodeBtn, tooltipOptions);
    if (this.addGroupBtn) tippy(this.addGroupBtn, tooltipOptions);
    if (this.addTextBtn) tippy(this.addTextBtn, tooltipOptions);
    if (this.lockBtn) tippy(this.lockBtn, tooltipOptions);
    if (this.collapseBtn) tippy(this.collapseBtn, tooltipOptions);
  }

  private isViewerMode(): boolean {
    return (window as any).topoViewerMode === 'viewer' ||
      ((window as any).topoViewerState && (window as any).topoViewerState.currentMode === 'viewer');
  }

  private setupActionButtons(): void {
    this.deployBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleDeployDestroy(this.isViewerMode());
    });
    this.redeployBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleRedeploy(this.isViewerMode());
    });
    this.cleanupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleCleanupAction(this.isViewerMode());
    });
    this.addNodeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAddNode();
    });
    this.addGroupBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAddGroup();
    });
    this.addTextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAddText();
    });
  }

  private setupControlButtons(): void {
    this.lockBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isLocked = !this.isLocked;
      this.updateLockState();
      this.savePanelState();
    });

    this.collapseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isCollapsed = !this.isCollapsed;
      this.updateCollapseState();
      this.savePanelState();
    });
  }

  private setupDrag(): void {
    if (!this.panel) return;
    this.panel.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isLocked) return;
      if ((e.target as HTMLElement).closest('button')) return;

      this.isDragging = true;
      this.panel!.classList.remove('cursor-grab');
      this.panel!.classList.add('cursor-grabbing');
      const rect = this.panel!.getBoundingClientRect();
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.initialLeft = rect.left;
      this.initialTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging || this.isLocked || !this.panel) return;
      const deltaX = e.clientX - this.startX;
      const deltaY = e.clientY - this.startY;
      let newLeft = this.initialLeft + deltaX;
      let newTop = this.initialTop + deltaY;
      const panelRect = this.panel.getBoundingClientRect();
      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;
      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));
      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
      this.panel.style.bottom = 'auto';
      this.panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.panel?.classList.remove('cursor-grabbing');
      this.panel?.classList.add('cursor-grab');
      this.savePanelState();
    });
  }

  private setupDeployButtonExpansion(): void {
    if (!this.deployButtonGroup || !this.secondaryButtons) return;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      this.secondaryButtons!.classList.remove('opacity-0', 'invisible', 'pointer-events-none');
      this.secondaryButtons!.classList.add('opacity-100', 'visible', 'pointer-events-auto');
      // animate children
      this.redeployBtn?.classList.remove('-translate-x-[10px]');
      this.redeployBtn?.classList.add('translate-x-0');
      this.cleanupBtn?.classList.remove('-translate-x-[10px]');
      this.cleanupBtn?.classList.add('translate-x-0');
    };
    const hide = () => {
      hoverTimeout = setTimeout(() => {
        this.secondaryButtons!.classList.remove('opacity-100', 'visible', 'pointer-events-auto');
        this.secondaryButtons!.classList.add('opacity-0', 'invisible', 'pointer-events-none');
        this.redeployBtn?.classList.add('-translate-x-[10px]');
        this.redeployBtn?.classList.remove('translate-x-0');
        this.cleanupBtn?.classList.add('-translate-x-[10px]');
        this.cleanupBtn?.classList.remove('translate-x-0');
      }, 150);
    };
    this.deployButtonGroup.addEventListener('mouseenter', show);
    this.deployButtonGroup.addEventListener('mouseleave', hide);
  }

  private loadPanelState(): void {
    try {
      const saved = localStorage.getItem('unifiedPanelState');
      if (!saved || !this.panel) return;
      const state = JSON.parse(saved);
      this.isLocked = !!state.locked;
      this.isCollapsed = !!state.collapsed;
      this.updateLockState();
      this.updateCollapseState();
    } catch (e) {
      // ignore
    }
  }

  private savePanelState(): void {
    if (!this.panel) return;
    const state = {
      locked: this.isLocked,
      collapsed: this.isCollapsed,
    };
    localStorage.setItem('unifiedPanelState', JSON.stringify(state));
  }

  private keepPanelInViewport(): void {
    if (!this.panel) return;
    const rect = this.panel.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    const newLeft = Math.max(0, Math.min(rect.left, maxLeft));
    const newTop = Math.max(0, Math.min(rect.top, maxTop));
    if (newLeft !== rect.left || newTop !== rect.top) {
      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
      this.savePanelState();
    }
  }

  private updateLockState(): void {
    if (!this.lockBtn || !this.panel) return;
    if (this.isLocked) {
      this.lockBtn.innerHTML = '<i class="fas fa-lock text-[10px]"></i>';
      this.lockBtn.classList.remove('bg-[var(--vscode-button-secondaryBackground)]', 'text-[var(--vscode-button-secondaryForeground)]');
      this.lockBtn.classList.add('bg-[var(--vscode-errorForeground)]', 'text-[var(--vscode-button-foreground)]');
      this.panel.classList.remove('cursor-grab');
      this.panel.classList.add('cursor-default');
    } else {
      this.lockBtn.innerHTML = '<i class="fas fa-unlock text-[10px]"></i>';
      this.lockBtn.classList.remove('bg-[var(--vscode-errorForeground)]', 'text-[var(--vscode-button-foreground)]');
      this.lockBtn.classList.add('bg-[var(--vscode-button-secondaryBackground)]', 'text-[var(--vscode-button-secondaryForeground)]');
      this.panel.classList.remove('cursor-default');
      this.panel.classList.add('cursor-grab');
    }
  }

  private updateCollapseState(): void {
    if (!this.collapseBtn || !this.panelContent) return;
    if (this.isCollapsed) {
      this.collapseBtn.innerHTML = '<i class="fas fa-chevron-down text-[10px]"></i>';
      this.collapseBtn.setAttribute('data-tippy-content', 'Expand Panel');
      this.panelContent.style.display = 'none';
      if (this.dividerBottom) this.dividerBottom.style.display = 'none';
    } else {
      this.collapseBtn.innerHTML = '<i class="fas fa-chevron-up text-[10px]"></i>';
      this.collapseBtn.setAttribute('data-tippy-content', 'Collapse Panel');
      this.panelContent.style.display = 'flex';
      if (this.dividerBottom) this.dividerBottom.style.display = 'block';
    }
  }

  private updateUiForMode(): void {
    const viewer = this.isViewerMode();
    if (this.deployBtn) {
      if (viewer) {
        this.deployBtn.innerHTML = '<i class="fas fa-stop text-[10px]"></i>';
        this.deployBtn.setAttribute('data-tippy-content', 'Destroy Lab');
        this.deployBtn.classList.remove('bg-[var(--vscode-button-background)]');
        this.deployBtn.classList.add('bg-[var(--vscode-errorForeground)]');
      } else {
        this.deployBtn.innerHTML = '<i class="fas fa-play text-[10px]"></i>';
        this.deployBtn.setAttribute('data-tippy-content', 'Deploy Lab');
        this.deployBtn.classList.remove('bg-[var(--vscode-errorForeground)]');
        this.deployBtn.classList.add('bg-[var(--vscode-button-background)]');
      }
    }

    // Redeploy visibility only in viewer mode
    if (this.redeployBtn) {
      if (viewer) {
        this.redeployBtn.classList.remove('hidden');
        this.redeployBtn.classList.add('flex');
      } else {
        this.redeployBtn.classList.add('hidden');
        this.redeployBtn.classList.remove('flex');
      }
    }

    // Editor tools visibility only in editor mode
    const editorButtons = [this.addNodeBtn, this.addGroupBtn, this.addTextBtn];
    editorButtons.forEach((btn) => {
      if (!btn) return;
      if (viewer) {
        btn.classList.add('hidden');
        btn.classList.remove('flex');
      } else {
        btn.classList.remove('hidden');
        btn.classList.add('flex');
      }
    });

    // Divider top visible only in editor mode
    if (this.dividerTop) {
      this.dividerTop.style.display = viewer ? 'none' : 'block';
    }
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
    this.updateUiForMode();
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
