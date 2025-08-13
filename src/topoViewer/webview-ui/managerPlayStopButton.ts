// file: managerPlayStopButton.ts

import tippy from 'tippy.js';
import { log } from '../logging/webviewLogger';
import { VscodeMessageSender } from './managerVscodeWebview';

/**
 * ManagerPlayStopButton handles the play/stop floating button for lab deployment/destruction
 */
export class ManagerPlayStopButton {
  private button: HTMLElement | null = null;
  private isProcessing: boolean = false;
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
    this.initializeButton();
  }

  /**
   * Initializes the play/stop button and sets up event listeners
   */
  private initializeButton(): void {
    this.button = document.getElementById('play-stop-btn');

    if (!this.button) {
      log.error('Play/stop button element not found');
      return;
    }

    // Add click handler
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleButtonClick();
    });

    // Initialize tooltip
    const tooltipOptions = { delay: [100, 0] as [number, number] };
    tippy(this.button, tooltipOptions);

    log.debug('Play/stop button initialized');
  }

  /**
   * Handles the button click event
   */
  private handleButtonClick(): void {
    if (this.isProcessing) {
      log.debug('Play/stop button click ignored - already processing');
      return;
    }

    const isViewerMode = (window as any).topoViewerMode === 'viewer';
    
    if (isViewerMode) {
      // In viewer mode, stop the lab
      this.stopLab();
    } else {
      // In editor mode, deploy the lab
      this.deployLab();
    }
  }

  /**
   * Deploys the current lab
   */
  private async deployLab(): Promise<void> {
    log.debug('Deploying lab via play/stop button');
    
    this.setProcessing(true);
    
    try {
      // Get the current lab path from the global window variable
      const labPath = (window as any).currentLabPath;
      
      if (!labPath) {
        log.error('No current lab path available for deployment');
        this.showError('No lab file available for deployment');
        return;
      }

      // Send deploy command to extension
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
   * Stops/destroys the current lab
   */
  private async stopLab(): Promise<void> {
    log.debug('Stopping lab via play/stop button');
    
    this.setProcessing(true);
    
    try {
      // Get the current lab path from the global window variable
      const labPath = (window as any).currentLabPath;
      
      if (!labPath) {
        log.error('No current lab path available for destruction');
        this.showError('No lab file available for destruction');
        return;
      }

      // Send destroy command to extension
      await this.messageSender.sendMessageToVscodeEndpointPost('destroyLab', labPath);

      log.info('Lab destruction completed successfully');
      
    } catch (error) {
      log.error(`Error stopping lab: ${error}`);
      this.showError('Failed to stop lab');
    } finally {
      this.setProcessing(false);
    }
  }

  /**
   * Sets the processing state of the button
   */
  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;
    
    if (!this.button) return;

    if (processing) {
      this.button.classList.add('loading');
      this.button.setAttribute('disabled', 'true');
    } else {
      this.button.classList.remove('loading');
      this.button.removeAttribute('disabled');
    }
  }

  /**
   * Shows an error message to the user
   */
  private async showError(message: string): Promise<void> {
    try {
      await this.messageSender.sendMessageToVscodeEndpointPost('showError', message);
    } catch (error) {
      // Fallback to console error
      log.error(`Failed to show error message: ${error}. Original message: ${message}`);
    }
  }

  /**
   * Updates the button state based on current mode
   */
  public updateState(): void {
    const isViewerMode = (window as any).topoViewerMode === 'viewer';
    
    if (!this.button) return;

    if (isViewerMode) {
      this.button.classList.add('show-stop');
      this.button.setAttribute('data-tippy-content', 'Destroy Lab');
    } else {
      this.button.classList.remove('show-stop');
      this.button.setAttribute('data-tippy-content', 'Deploy Lab');
    }
  }

  /**
   * Shows or hides the play/stop button
   */
  public setVisibility(visible: boolean): void {
    const panel = document.getElementById('play-stop-panel');
    if (panel) {
      panel.style.display = visible ? 'block' : 'none';
    }
  }
}