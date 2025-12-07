import { log } from '../../platform/logging/logger';
import { VscodeMessageSender } from '../../platform/messaging/VscodeMessaging';

// Button IDs
const ID_DEPLOY_BTN = 'deploy-destroy-btn' as const;
const ID_REDEPLOY_BTN = 'redeploy-btn' as const;
const ID_DEPLOY_CLEANUP_BTN = 'deploy-cleanup-btn' as const;
const ID_DESTROY_CLEANUP_BTN = 'destroy-cleanup-btn' as const;
const ID_REDEPLOY_CLEANUP_BTN = 'redeploy-cleanup-btn' as const;
const ID_CLEANUP_ACTION_BTN = 'cleanup-action-btn' as const;

export type LifecycleMode = 'deploy' | 'destroy' | 'redeploy';

/**
 * Callbacks for UI updates that the parent component can provide
 */
export interface LabLifecycleCallbacks {
  showError: (message: string) => Promise<void>;
}

/**
 * LabLifecycleManager handles all lab deployment, destruction, and redeployment operations
 * including processing state management and UI updates for lifecycle buttons.
 */
export class LabLifecycleManager {
  private messageSender: VscodeMessageSender;
  private callbacks: LabLifecycleCallbacks;
  private isProcessing: boolean = false;
  private activeProcessingMode: LifecycleMode | null = null;
  private pendingLifecycleCommand: LifecycleMode | null = null;
  private navLoadingBar: HTMLElement | null = null;
  private hideNavLoadingTimeoutId: number | null = null;

  private readonly handleWebviewMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) {
      return;
    }
    const message = event.data as { type?: string; data?: any } | undefined;
    if (!message || message.type !== 'lab-lifecycle-status') {
      return;
    }
    this.handleLabLifecycleStatus(message.data ?? {});
  };

  constructor(messageSender: VscodeMessageSender, callbacks: LabLifecycleCallbacks) {
    this.messageSender = messageSender;
    this.callbacks = callbacks;
    this.navLoadingBar = document.getElementById('navbar-loading-indicator');
    window.addEventListener('message', this.handleWebviewMessage);
  }

  /**
   * Clean up event listeners
   */
  public destroy(): void {
    window.removeEventListener('message', this.handleWebviewMessage);
    if (this.hideNavLoadingTimeoutId !== null) {
      window.clearTimeout(this.hideNavLoadingTimeoutId);
    }
  }

  /**
   * Check if currently processing a lifecycle command
   */
  public getIsProcessing(): boolean {
    return this.isProcessing;
  }

  private isViewerMode(): boolean {
    return (window as any).topoViewerMode === 'viewer' ||
      ((window as any).topoViewerState && (window as any).topoViewerState.currentMode === 'viewer');
  }

  /**
   * Handles deploy/destroy action
   */
  public async handleDeployDestroy(isViewerMode: boolean): Promise<void> {
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
   * Deploys the current lab
   */
  public async deployLab(): Promise<void> {
    log.debug('Deploying lab via unified panel');

    this.pendingLifecycleCommand = 'deploy';
    this.setProcessing(true, 'deploy');

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for deployment');
        await this.callbacks.showError('No lab file available for deployment');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('deployLab', labPath);
      log.info('Lab deployment request dispatched');
    } catch (error) {
      log.error(`Error deploying lab: ${error}`);
      await this.callbacks.showError('Failed to deploy lab');
      this.setProcessing(false);
    }
  }

  /**
   * Destroys the current lab
   */
  public async destroyLab(): Promise<void> {
    log.debug('Destroying lab via unified panel');

    this.pendingLifecycleCommand = 'destroy';
    this.setProcessing(true, 'destroy');

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for destruction');
        await this.callbacks.showError('No lab file available for destruction');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLab', labPath);
      log.info('Lab destruction request dispatched');
    } catch (error) {
      log.error(`Error destroying lab: ${error}`);
      await this.callbacks.showError('Failed to destroy lab');
      this.setProcessing(false);
    }
  }

  /**
   * Deploys the current lab with cleanup
   */
  public async deployLabWithCleanup(): Promise<void> {
    log.debug('Deploying lab with cleanup via unified panel');

    this.pendingLifecycleCommand = 'deploy';
    this.setProcessing(true, 'deploy');

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for deployment with cleanup');
        await this.callbacks.showError('No lab file available for deployment');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('deployLabCleanup', labPath);
      log.info('Lab deployment (cleanup) request dispatched');
    } catch (error) {
      log.error(`Error deploying lab with cleanup: ${error}`);
      await this.callbacks.showError('Failed to deploy lab with cleanup');
      this.setProcessing(false);
    }
  }

  /**
   * Destroys the current lab with cleanup
   */
  public async destroyLabWithCleanup(): Promise<void> {
    log.debug('Destroying lab with cleanup via unified panel');

    this.pendingLifecycleCommand = 'destroy';
    this.setProcessing(true, 'destroy');

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for destruction with cleanup');
        await this.callbacks.showError('No lab file available for destruction');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLabCleanup', labPath);
      log.info('Lab destruction (cleanup) request dispatched');
    } catch (error) {
      log.error(`Error destroying lab with cleanup: ${error}`);
      await this.callbacks.showError('Failed to destroy lab with cleanup');
      this.setProcessing(false);
    }
  }

  /**
   * Handles redeploy action using dedicated redeploy command
   */
  public async handleRedeploy(isViewerMode: boolean): Promise<void> {
    if (this.isProcessing) {
      log.debug('Redeploy action ignored - already processing');
      return;
    }

    if (!isViewerMode) {
      log.warn('Redeploy action called but not in viewer mode');
      return;
    }

    log.debug('Redeploying lab via unified panel');

    this.pendingLifecycleCommand = 'redeploy';
    this.setProcessing(true, 'redeploy');

    try {
      const labPath = (window as any).currentLabPath;

      if (!labPath) {
        log.error('No current lab path available for redeploy');
        await this.callbacks.showError('No lab file available for redeploy');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('redeployLab', labPath);
      log.info('Lab redeploy request dispatched');
    } catch (error) {
      log.error(`Error redeploying lab: ${error}`);
      await this.callbacks.showError('Failed to redeploy lab');
      this.setProcessing(false);
    }
  }

  /**
   * Handles redeploy with cleanup using dedicated redeploy cleanup command
   */
  public async handleRedeployCleanup(): Promise<void> {
    if (this.isProcessing) {
      log.debug('Redeploy (cleanup) action ignored - already processing');
      return;
    }
    const isViewer = this.isViewerMode();
    if (!isViewer) {
      log.warn('Redeploy (cleanup) called but not in viewer mode');
      return;
    }
    this.pendingLifecycleCommand = 'redeploy';
    this.setProcessing(true, 'redeploy');
    try {
      const labPath = (window as any).currentLabPath;
      if (!labPath) {
        log.error('No current lab path available for redeploy (cleanup)');
        await this.callbacks.showError('No lab file available for redeploy');
        this.setProcessing(false);
        return;
      }

      await this.messageSender.sendMessageToVscodeEndpointPost('redeployLabCleanup', labPath);
      log.info('Lab redeploy (cleanup) request dispatched');
    } catch (error) {
      log.error(`Error in redeploy (cleanup): ${error}`);
      await this.callbacks.showError('Failed to redeploy (cleanup)');
      this.setProcessing(false);
    }
  }

  /**
   * Sets the processing state
   */
  private setProcessing(processing: boolean, mode: LifecycleMode | null = null): void {
    const effectiveMode = mode ?? this.activeProcessingMode ?? this.pendingLifecycleCommand ?? null;

    this.isProcessing = processing;

    const deployBtn = document.getElementById(ID_DEPLOY_BTN) as HTMLButtonElement | null;
    const redeployBtn = document.getElementById(ID_REDEPLOY_BTN) as HTMLButtonElement | null;
    const deployCleanupBtn = document.getElementById(ID_DEPLOY_CLEANUP_BTN) as HTMLButtonElement | null;
    const destroyCleanupBtn = document.getElementById(ID_DESTROY_CLEANUP_BTN) as HTMLButtonElement | null;
    const redeployCleanupBtn = document.getElementById(ID_REDEPLOY_CLEANUP_BTN) as HTMLButtonElement | null;
    const cleanupBtn = document.getElementById(ID_CLEANUP_ACTION_BTN) as HTMLButtonElement | null;

    this.updateButtonProcessingState(deployBtn, processing, effectiveMode);
    this.updateButtonProcessingState(redeployBtn, processing, effectiveMode);
    this.updateButtonProcessingState(deployCleanupBtn, processing, effectiveMode);
    this.updateButtonProcessingState(destroyCleanupBtn, processing, effectiveMode);
    this.updateButtonProcessingState(redeployCleanupBtn, processing, effectiveMode);
    this.updateButtonProcessingState(cleanupBtn, processing, effectiveMode);
    this.updateNavbarProcessingState(processing, effectiveMode);

    if (processing) {
      if (effectiveMode) {
        this.activeProcessingMode = effectiveMode;
        this.pendingLifecycleCommand = effectiveMode;
      }
    } else {
      this.pendingLifecycleCommand = null;
      this.activeProcessingMode = null;
    }
  }

  private updateButtonProcessingState(
    button: HTMLButtonElement | null,
    processing: boolean,
    mode: LifecycleMode | null = null
  ): void {
    if (!button) {
      return;
    }

    const buttonId = button.id;
    button.disabled = processing;
    button.classList.remove('processing');
    button.classList.remove('processing--deploy');
    button.classList.remove('processing--destroy');

    if (!processing || !mode) {
      return;
    }

    const isDestroyAction = mode === 'destroy';
    const isRedeployAction = mode === 'redeploy';
    const isMainDeployButton = buttonId === ID_DEPLOY_BTN;
    const isRedeployButton = buttonId === ID_REDEPLOY_BTN || buttonId === ID_REDEPLOY_CLEANUP_BTN;
    const isCleanupButton =
      buttonId === ID_DEPLOY_CLEANUP_BTN || buttonId === ID_DESTROY_CLEANUP_BTN || buttonId === ID_CLEANUP_ACTION_BTN;

    let shouldAnimate = false;

    if (isMainDeployButton) {
      shouldAnimate = !isRedeployAction; // main button handles deploy/destroy
    } else if (isRedeployButton) {
      shouldAnimate = isRedeployAction;
    } else if (isCleanupButton) {
      shouldAnimate = mode === 'deploy' || isDestroyAction;
    }

    if (!shouldAnimate) {
      return;
    }

    button.classList.add('processing');
    button.classList.toggle('processing--destroy', isDestroyAction);
    button.classList.toggle('processing--deploy', !isDestroyAction);
  }

  private updateNavbarProcessingState(
    processing: boolean,
    mode: LifecycleMode | null = null
  ): void {
    const navBarIndicator = this.navLoadingBar;

    if (!navBarIndicator) {
      return;
    }

    if (processing) {
      if (this.hideNavLoadingTimeoutId !== null) {
        window.clearTimeout(this.hideNavLoadingTimeoutId);
        this.hideNavLoadingTimeoutId = null;
      }
      navBarIndicator.classList.remove('hidden');
      navBarIndicator.classList.add('is-active');
      navBarIndicator.classList.toggle('is-destroy', mode === 'destroy');
      navBarIndicator.classList.toggle('is-deploy', mode === 'deploy' || mode === 'redeploy');
    } else {
      navBarIndicator.classList.remove('is-active');
      navBarIndicator.classList.remove('is-destroy');
      navBarIndicator.classList.remove('is-deploy');
      this.hideNavLoadingTimeoutId = window.setTimeout(() => {
        navBarIndicator.classList.add('hidden');
        this.hideNavLoadingTimeoutId = null;
      }, 200);
    }
  }

  private handleLabLifecycleStatus(payload: {
    commandType?: string;
    status?: string;
    errorMessage?: string;
  }): void {
    const status = payload?.status;
    if (status !== 'success' && status !== 'error') {
      return;
    }

    const commandType = payload?.commandType;
    if (
      commandType !== 'deploy' &&
      commandType !== 'destroy' &&
      commandType !== 'redeploy'
    ) {
      return;
    }

    if (
      this.pendingLifecycleCommand &&
      this.pendingLifecycleCommand !== commandType
    ) {
      log.debug(
        `Ignoring lifecycle status "${status}" for ${commandType} while waiting for ${this.pendingLifecycleCommand}`
      );
      return;
    }

    if (status === 'error' && payload?.errorMessage) {
      log.error(
        `Lifecycle command ${commandType} reported error: ${payload.errorMessage}`
      );
    }

    this.setProcessing(false);
    if (status === 'success') {
      log.info(`Lifecycle command ${commandType} completed`);
    }
  }
}
