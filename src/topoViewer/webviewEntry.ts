// Mode is now set from the HTML template via window.topoViewerMode

import { initializeGlobalHandlers } from './ui/UiHandlers';
import { windowManager, WindowManager, ManagedWindow } from './lib/WindowManager';
import { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from './lib/WindowManagerIntegration';

import('./TopologyController').then(() => {
  initializeGlobalHandlers();
});

// Expose window manager globally for use in HTML templates
/* eslint-disable no-unused-vars */
declare global {
  interface Window {
    windowManager: typeof windowManager;
    WindowManager: typeof WindowManager;
    ManagedWindow: typeof ManagedWindow;
    panelManager: typeof panelManager;
    PanelManager: typeof PanelManager;
    defaultPanelConfigs: typeof defaultPanelConfigs;
    initializeDefaultPanels: typeof initializeDefaultPanels;
  }
}
/* eslint-enable no-unused-vars */

window.windowManager = windowManager;
window.WindowManager = WindowManager;
window.ManagedWindow = ManagedWindow;
window.panelManager = panelManager;
window.PanelManager = PanelManager;
window.defaultPanelConfigs = defaultPanelConfigs;
window.initializeDefaultPanels = initializeDefaultPanels;

export { default as TopologyWebviewController } from './TopologyController';
export * from './core/VscodeMessaging';
export { ManagerLayoutAlgo } from './cytoscape/LayoutAlgorithms';
export { ManagerGroupManagement } from './groups/GroupManager';
/**
 * @deprecated Use ManagerGroupManagement instead.
 */
export { ManagerGroupManagemetn } from './groups/GroupManager';
export * from './cytoscape/SvgGenerator';
export * from './ui/UiHandlers';
export { windowManager, WindowManager, ManagedWindow } from './lib/WindowManager';
export { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from './lib/WindowManagerIntegration';
