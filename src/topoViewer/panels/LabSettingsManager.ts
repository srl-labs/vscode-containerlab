import { log } from '../logging/logger';
import * as YAML from 'yaml';
import { VscodeMessageSender } from '../core/VscodeMessaging';

interface LabSettings {
  name?: string;
  prefix?: string;
  mgmt?: {
    network?: string;
    'ipv4-subnet'?: string;
    'ipv6-subnet'?: string | null;
    'ipv4-gw'?: string;
    'ipv6-gw'?: string;
    'ipv4-range'?: string;
    mtu?: number;
    bridge?: string;
    'external-access'?: boolean;
    'driver-opts'?: Record<string, string>;
  };
}

/**
 * Manager responsible for handling lab settings panel operations
 */
export class ManagerLabSettings {
  private currentSettings: LabSettings = {};
  private messageSender: VscodeMessageSender;

  constructor(messageSender: VscodeMessageSender) {
    this.messageSender = messageSender;
  }

  /**
   * Initialize the lab settings manager
   */
  public init(): void {
    this.setupEventListeners();
    this.loadCurrentSettings();
    log.info('[ManagerLabSettings] Initialized');
  }

  /**
   * Setup event listeners for lab settings operations
   */
  private setupEventListeners(): void {
    // Listen for button click to show panel
    (window as any).viewportButtonsLabSettings = (event: Event) => {
      event.stopPropagation();
      this.showLabSettingsPanel();
    };

    // Listen for apply button
    document.addEventListener('lab-settings-apply', ((event: CustomEvent) => {
      this.handleApplySettings(event.detail);
    }) as EventListener);

    // Listen for VS Code messages
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const message = event.data;
      if (message.type === 'lab-settings-updated') {
        this.currentSettings = message.settings;
        this.updatePanelWithSettings();
      } else if (message.type === 'lab-settings-data') {
        // Response from backend with current settings
        this.currentSettings = message.settings;
        if (this.isPanelVisible()) {
          (window as any).showLabSettingsPanel(this.currentSettings);
        }
      } else if (message.type === 'yaml-content-updated') {
        // Update the YAML editor with new content
        if ((window as any).yamlEditor && message.yamlContent) {
          (window as any).yamlEditor.setValue(message.yamlContent);
        }
      }
    });
  }

  /**
   * Load current lab settings from the YAML
   */
  private async loadCurrentSettings(): Promise<void> {
    try {
      // Request current settings from backend
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        'lab-settings-get',
        {}
      );

      if (response && response.settings) {
        this.currentSettings = response.settings;
        log.info('[ManagerLabSettings] Loaded current settings');
      }
    } catch {
      log.error('[ManagerLabSettings] Error loading settings from backend');
    }
  }

  /**
   * Show the lab settings panel with current settings
   */
  private async showLabSettingsPanel(): Promise<void> {
    // Load fresh settings before showing
    await this.loadCurrentSettings();

    // Call the global function defined in the HTML
    if ((window as any).showLabSettingsPanel) {
      (window as any).showLabSettingsPanel(this.currentSettings);
    }

    log.info('[ManagerLabSettings] Showing lab settings panel');
  }

  /**
   * Update the panel with current settings
   */
  private updatePanelWithSettings(): void {
    // This would update the panel if it's already open
    if ((window as any).showLabSettingsPanel && this.isPanelVisible()) {
      (window as any).showLabSettingsPanel(this.currentSettings);
    }
  }

  /**
   * Check if the lab settings panel is visible
   */
  private isPanelVisible(): boolean {
    const panel = document.getElementById('panel-lab-settings');
    return panel ? panel.style.display !== 'none' : false;
  }

  /**
   * Handle apply settings from the panel
   */
  private async handleApplySettings(settings: LabSettings): Promise<void> {
    log.info('[ManagerLabSettings] Applying settings');

    try {
      // Send settings to backend to update YAML
      const response = await this.messageSender.sendMessageToVscodeEndpointPost(
        'lab-settings-update',
        settings
      );

      if (response && response.success) {
        // Update stored settings
        this.currentSettings = settings;
        log.info('[ManagerLabSettings] Settings applied successfully');

        // Update the YAML editor if we have the content
        if (response.yamlContent && (window as any).yamlEditor) {
          (window as any).yamlEditor.setValue(response.yamlContent);
        }
      } else {
        throw new Error(response?.error || 'Failed to update settings');
      }
    } catch (error) {
      log.error('[ManagerLabSettings] Error applying settings');
      // Show error to user
      const errorMessage = `Failed to apply lab settings: ${String(error)}`;
      await this.messageSender.sendMessageToVscodeEndpointPost(
        'show-error-message',
        { message: errorMessage }
      );
    }
  }



  /**
   * Extract lab settings from YAML content
   */
  public static extractSettings(yamlContent: string): LabSettings {
    try {
      const parsed = YAML.parse(yamlContent) as any;
      return {
        name: parsed.name,
        prefix: parsed.prefix,
        mgmt: parsed.mgmt
      };
    } catch {
      log.error('[ManagerLabSettings] Error extracting settings');
      return {};
    }
  }

  /**
   * Update YAML content with new lab settings
   */
  public static updateYamlWithSettings(yamlContent: string, settings: LabSettings): string {
    try {
      const doc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any);

      // Update fields
      if (settings.name !== undefined) {
        if (settings.name) {
          doc.set('name', settings.name);
        } else {
          doc.delete('name');
        }
      }

      if (settings.prefix !== undefined) {
        if (settings.prefix === '') {
          doc.set('prefix', '');
        } else if (settings.prefix) {
          doc.set('prefix', settings.prefix);
        } else {
          doc.delete('prefix');
        }
      }

      if (settings.mgmt !== undefined) {
        if (settings.mgmt && Object.keys(settings.mgmt).length > 0) {
          doc.set('mgmt', settings.mgmt);
        } else {
          doc.delete('mgmt');
        }
      }

      return doc.toString();
    } catch {
      log.error('[ManagerLabSettings] Error updating YAML');
      return yamlContent;
    }
  }
}

// Export for use in other modules
export default ManagerLabSettings;
