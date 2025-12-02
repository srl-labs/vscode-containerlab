/**
 * WindowManager Integration Helper
 *
 * This module provides helper functions to easily integrate the WindowManager
 * with existing topoviewer panels.
 */

import { windowManager, WindowConfig, ManagedWindow } from './WindowManager';

/**
 * Panel configuration for easy registration
 */
export interface PanelConfig {
  id: string;
  element?: HTMLElement;
  selector?: string;
  title?: string;
  defaultX?: number;
  defaultY?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  draggable?: boolean;
  fixedSize?: boolean;
  persistState?: boolean;
  onShow?: () => void;
  onHide?: () => void;
}

/**
 * Manages all panels in the topoviewer
 */
export class PanelManager {
  private panels: Map<string, ManagedWindow> = new Map();
  private panelInstances: Map<string, Map<string, ManagedWindow>> = new Map(); // type -> (instanceId -> window)
  private instanceCloseCallbacks: Map<string, Map<string, () => void>> = new Map(); // type -> (instanceId -> callback)

  /**
   * Register a panel with the window manager
   */
  registerPanel(config: PanelConfig): ManagedWindow | null {
    // Get the element
    const element = config.element || (config.selector ? document.querySelector(config.selector) : null);

    if (!element) {
      console.warn(`Panel ${config.id} element not found`);
      return null;
    }

    // Create window config
    const windowConfig: WindowConfig = {
      id: config.id,
      title: config.title,
      x: config.defaultX,
      y: config.defaultY,
      width: config.defaultWidth,
      height: config.defaultHeight,
      minWidth: config.minWidth ?? 300,
      minHeight: config.minHeight ?? 200,
      resizable: config.resizable !== false,
      draggable: config.draggable !== false,
      fixedSize: config.fixedSize ?? false,
      storageKey: config.persistState ? `wm-panel-${config.id}` : undefined,
    };

    // Register with window manager
    const managedWindow = windowManager.register(element as HTMLElement, windowConfig);
    this.panels.set(config.id, managedWindow);

    // Setup close button if exists
    this.setupCloseButton(element as HTMLElement, managedWindow);

    return managedWindow;
  }

  /**
   * Register multiple panels at once
   */
  registerPanels(configs: PanelConfig[]): void {
    configs.forEach(config => this.registerPanel(config));
  }

  /**
   * Get a managed window by ID
   */
  getPanel(id: string): ManagedWindow | undefined {
    return this.panels.get(id);
  }

  /**
   * Show a panel
   */
  showPanel(id: string): void {
    const panel = this.panels.get(id);
    if (panel) {
      panel.show();
    }
  }

  /**
   * Hide a panel
   */
  hidePanel(id: string): void {
    const panel = this.panels.get(id);
    if (panel) {
      panel.hide();
    }
  }

  /**
   * Toggle a panel's visibility
   */
  togglePanel(id: string): void {
    const panel = this.panels.get(id);
    if (panel) {
      const isVisible = panel.element.style.display !== 'none';
      if (isVisible) {
        panel.hide();
      } else {
        panel.show();
      }
    }
  }

  /**
   * Unregister a panel
   */
  unregisterPanel(id: string): void {
    const panel = this.panels.get(id);
    if (panel) {
      windowManager.unregister(id);
      this.panels.delete(id);
    }
  }

  /**
   * Setup close button handler for a panel
   */
  private setupCloseButton(element: HTMLElement, managedWindow: ManagedWindow): void {
    const closeBtn = element.querySelector('.panel-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        managedWindow.close();
      });
    }
  }

  /**
   * Get all registered panels
   */
  getAllPanels(): ManagedWindow[] {
    const allPanels = Array.from(this.panels.values());
    // Also include all instances
    this.panelInstances.forEach(instances => {
      allPanels.push(...Array.from(instances.values()));
    });
    return allPanels;
  }

  /**
   * Get or create a panel instance for a specific item (e.g., specific link or node)
   * @param panelType - The type of panel (e.g., 'panel-link', 'panel-node')
   * @param instanceId - Unique identifier for this instance (e.g., link ID, node ID)
   * @returns The managed window for this instance
   */
  getOrCreatePanelInstance(panelType: string, instanceId: string): ManagedWindow | null {
    // Check if instance already exists
    const existingWindow = this.getExistingPanelInstance(panelType, instanceId);
    if (existingWindow) {
      return existingWindow;
    }

    // Create new panel instance
    return this.createNewPanelInstance(panelType, instanceId);
  }

  private getExistingPanelInstance(panelType: string, instanceId: string): ManagedWindow | null {
    if (this.panelInstances.has(panelType)) {
      const instances = this.panelInstances.get(panelType)!;
      if (instances.has(instanceId)) {
        const existingWindow = instances.get(instanceId)!;
        existingWindow.show();
        existingWindow.focus();
        return existingWindow;
      }
    }
    return null;
  }

  private createNewPanelInstance(panelType: string, instanceId: string): ManagedWindow | null {
    const templatePanel = document.getElementById(panelType);
    if (!templatePanel) {
      console.warn(`Template panel ${panelType} not found`);
      return null;
    }

    const newPanel = this.cloneTemplatePanel(templatePanel, panelType, instanceId);
    const defaultConfig = defaultPanelConfigs.find(c => c.id === panelType);
    const windowConfig = this.createInstanceWindowConfig(panelType, instanceId, defaultConfig);

    const managedWindow = windowManager.register(newPanel, windowConfig);
    this.setupCloseButton(newPanel, managedWindow);
    this.storeInstance(panelType, instanceId, managedWindow);

    return managedWindow;
  }

  private cloneTemplatePanel(templatePanel: HTMLElement, panelType: string, instanceId: string): HTMLElement {
    const newPanel = templatePanel.cloneNode(true) as HTMLElement;
    newPanel.id = `${panelType}-${instanceId}`;
    newPanel.style.display = 'none';
    templatePanel.parentNode?.insertBefore(newPanel, templatePanel.nextSibling);

    // Set up tab switching for link panels
    if (panelType === 'panel-link') {
      this.setupLinkPanelTabs(newPanel);
    }

    return newPanel;
  }

  private setupLinkPanelTabs(panel: HTMLElement): void {
    const tabs = panel.querySelectorAll('.endpoint-tab');
    const contents = panel.querySelectorAll('.endpoint-content');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.handleTabClick(tab, tabs, contents, panel);
      });
    });
  }

  private handleTabClick(tab: Element, tabs: NodeListOf<Element>, contents: NodeListOf<Element>, panel: HTMLElement): void {
    const endpoint = tab.getAttribute('data-endpoint');

    // Update tab styles
    tabs.forEach((t) => {
      t.classList.remove('tab-active');
    });
    tab.classList.add('tab-active');

    // Update content visibility
    contents.forEach((content) => {
      (content as HTMLElement).style.display = 'none';
    });

    const activeContent = panel.querySelector(`#endpoint-${endpoint}-content`) as HTMLElement;
    if (activeContent) {
      activeContent.style.display = 'flex';
      this.resizeGraphsInContent(activeContent);
    }
  }

  private resizeGraphsInContent(activeContent: HTMLElement): void {
    const graphContainers = activeContent.querySelectorAll('[id$="-graph"]');
    graphContainers.forEach((container) => {
      const graphInstance = (container as any).__uplot_instance__;
      if (graphInstance) {
        setTimeout(() => {
          const rect = container.getBoundingClientRect();
          const width = rect.width;
          const height = rect.height - 60;
          if (width > 0 && height > 0) {
            graphInstance.setSize({ width, height });
          }
        }, 0);
      }
    });
  }

  private createInstanceWindowConfig(
    panelType: string,
    instanceId: string,
    defaultConfig: PanelConfig | undefined
  ): WindowConfig {
    const instanceCount = this.panelInstances.get(panelType)?.size ?? 0;
    const { offsetX, offsetY } = this.calculatePanelOffset(defaultConfig, instanceCount);

    return {
      id: `${panelType}-${instanceId}`,
      title: defaultConfig?.title ?? 'Panel',
      x: offsetX,
      y: offsetY,
      width: defaultConfig?.defaultWidth,
      height: defaultConfig?.defaultHeight,
      minWidth: defaultConfig?.minWidth ?? 300,
      minHeight: defaultConfig?.minHeight ?? 200,
      resizable: defaultConfig?.resizable !== false,
      draggable: defaultConfig?.draggable !== false,
      fixedSize: defaultConfig?.fixedSize ?? false,
      onClose: () => this.removePanelInstance(panelType, instanceId)
    };
  }

  private calculatePanelOffset(defaultConfig: PanelConfig | undefined, instanceCount: number): { offsetX: number; offsetY: number } {
    return {
      offsetX: (defaultConfig?.defaultX ?? 100) + (instanceCount * 30),
      offsetY: (defaultConfig?.defaultY ?? 100) + (instanceCount * 30)
    };
  }

  private storeInstance(panelType: string, instanceId: string, managedWindow: ManagedWindow): void {
    if (!this.panelInstances.has(panelType)) {
      this.panelInstances.set(panelType, new Map());
    }
    this.panelInstances.get(panelType)!.set(instanceId, managedWindow);
  }

  /**
   * Remove a panel instance
   */
  private removePanelInstance(panelType: string, instanceId: string): void {
    // Call registered close callback if exists
    if (this.instanceCloseCallbacks.has(panelType)) {
      const callbacks = this.instanceCloseCallbacks.get(panelType)!;
      const callback = callbacks.get(instanceId);
      if (callback) {
        callback();
        callbacks.delete(instanceId);
        if (callbacks.size === 0) {
          this.instanceCloseCallbacks.delete(panelType);
        }
      }
    }

    if (this.panelInstances.has(panelType)) {
      const instances = this.panelInstances.get(panelType)!;
      const panel = instances.get(instanceId);
      if (panel) {
        windowManager.unregister(panel.id);
        panel.element.remove(); // Remove from DOM
        instances.delete(instanceId);

        // Clean up empty map
        if (instances.size === 0) {
          this.panelInstances.delete(panelType);
        }
      }
    }
  }

  /**
   * Check if a panel instance exists for a specific item
   */
  hasPanelInstance(panelType: string, instanceId: string): boolean {
    return this.panelInstances.get(panelType)?.has(instanceId) ?? false;
  }

  /**
   * Register a callback to be called when a panel instance is closed
   */
  onInstanceClose(panelType: string, instanceId: string, callback: () => void): void {
    if (!this.instanceCloseCallbacks.has(panelType)) {
      this.instanceCloseCallbacks.set(panelType, new Map());
    }
    this.instanceCloseCallbacks.get(panelType)!.set(instanceId, callback);
  }

  /**
   * Destroy all panels
   */
  destroyAll(): void {
    this.panels.forEach(panel => {
      windowManager.unregister(panel.id);
    });
    this.panels.clear();

    // Also destroy all instances
    this.panelInstances.forEach(instances => {
      instances.forEach(panel => {
        windowManager.unregister(panel.id);
        panel.element.remove();
      });
    });
    this.panelInstances.clear();
    this.instanceCloseCallbacks.clear();
  }
}

/**
 * Default panel configurations for topoviewer panels
 * These match the existing panels in the codebase
 */
export const defaultPanelConfigs: PanelConfig[] = [
  {
    id: 'panel-node',
    selector: '#panel-node',
    title: 'Node Properties',
    defaultX: 100,
    defaultY: 80,
    defaultWidth: 0,
    defaultHeight: 0,
    minWidth: 400,
    minHeight: 200,
    fixedSize: true,
    persistState: true,
  },
  {
    id: 'panel-node-editor',
    selector: '#panel-node-editor',
    title: 'Edit Node',
    defaultX: 520,
    defaultY: 80,
    defaultWidth: 450,
    defaultHeight: 475,
    minWidth: 400,
    minHeight: 300,
    persistState: true,
  },
  {
    id: 'panel-node-editor-parent',
    selector: '#panel-node-editor-parent',
    title: 'Edit Parent Node',
    defaultX: 150,
    defaultY: 130,
    defaultWidth: 450,
    defaultHeight: 600,
    minWidth: 400,
    minHeight: 300,
    persistState: true,
  },
  {
    id: 'panel-link',
    selector: '#panel-link',
    title: 'Link Properties',
    defaultX: 200,
    defaultY: 180,
    defaultWidth: 0,
    defaultHeight: 0,
    minWidth: 400,
    minHeight: 300,
    persistState: true,
  },
  {
    id: 'panel-link-editor',
    selector: '#panel-link-editor',
    title: 'Edit Link',
    defaultX: 250,
    defaultY: 230,
    defaultWidth: 400,
    defaultHeight: 350,
    minWidth: 350,
    minHeight: 250,
    persistState: true,
  },
  {
    id: 'panel-network-editor',
    selector: '#panel-network-editor',
    title: 'Edit Network',
    defaultX: 300,
    defaultY: 280,
    defaultWidth: 450,
    defaultHeight: 500,
    minWidth: 400,
    minHeight: 300,
    persistState: true,
  },
  {
    id: 'panel-lab-settings',
    selector: '#panel-lab-settings',
    title: 'Lab Settings',
    defaultX: 350,
    defaultY: 100,
    defaultWidth: 500,
    defaultHeight: 600,
    minWidth: 400,
    minHeight: 400,
    persistState: true,
  },
  {
    id: 'panel-bulk-link',
    selector: '#panel-bulk-link',
    title: 'Bulk Link Creation',
    defaultX: 400,
    defaultY: 150,
    defaultWidth: 500,
    defaultHeight: 400,
    minWidth: 400,
    minHeight: 300,
    persistState: true,
  },
  {
    id: 'panel-free-text',
    selector: '#panel-free-text',
    title: 'Add Text',
    defaultX: 450,
    defaultY: 200,
    defaultWidth: 420,
    defaultHeight: 580,
    minWidth: 380,
    minHeight: 400,
    persistState: true,
  },
  {
    id: 'panel-free-shapes',
    selector: '#panel-free-shapes',
    title: 'Add Shape',
    defaultX: 480,
    defaultY: 180,
    defaultWidth: 400,
    defaultHeight: 600,
    minWidth: 350,
    minHeight: 450,
    persistState: true,
  },
  {
    id: 'panel-topoviewer-about',
    selector: '#panel-topoviewer-about',
    title: 'About',
    defaultX: 500,
    defaultY: 250,
    defaultWidth: 500,
    defaultHeight: 400,
    minWidth: 400,
    minHeight: 300,
    persistState: false,
  },
];

/**
 * Initialize all default panels
 */
export function initializeDefaultPanels(): PanelManager {
  const panelManager = new PanelManager();

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      panelManager.registerPanels(defaultPanelConfigs);
    });
  } else {
    panelManager.registerPanels(defaultPanelConfigs);
  }

  return panelManager;
}

// Export singleton panel manager
export const panelManager = new PanelManager();
