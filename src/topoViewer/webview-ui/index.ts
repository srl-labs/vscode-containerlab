// Mode is now set from the HTML template via window.topoViewerMode

import { initializeGlobalHandlers } from './uiHandlers';
import { windowManager, WindowManager, ManagedWindow } from './lib/windowManager';
import { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from './lib/windowManagerIntegration';

import('./topologyWebviewController').then(() => {
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

export { default as TopologyWebviewController } from './topologyWebviewController';
export * from './managerVscodeWebview';
export { ManagerLayoutAlgo } from './managerLayoutAlgo';
export { ManagerGroupManagement } from './managerGroupManagement';
/**
 * @deprecated Use ManagerGroupManagement instead.
 */
export { ManagerGroupManagemetn } from './managerGroupManagement';
export * from './managerSvgGenerator';
export * from './uiHandlers';
export { windowManager, WindowManager, ManagedWindow } from './lib/windowManager';
export { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from './lib/windowManagerIntegration';
