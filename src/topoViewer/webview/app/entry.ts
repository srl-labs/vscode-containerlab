// Mode is now set from the HTML template via window.topoViewerMode

import { initializeGlobalHandlers } from '../ui/UiHandlers';
import { windowManager, WindowManager, ManagedWindow } from '../platform/windowing/WindowManager';
import { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from '../platform/windowing/PanelManager';

import('./TopologyShell').then(() => {
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

export { default as TopologyWebviewController } from './TopologyShell';
export * from '../platform/messaging/VscodeMessaging';
export { ManagerLayoutAlgo } from '../features/canvas/LayoutAlgorithms';
export { ManagerGroupManagement } from '../features/groups/GroupManager';
/**
 * @deprecated Use ManagerGroupManagement instead.
 */
export { ManagerGroupManagemetn } from '../features/groups/GroupManager';
export * from '../features/canvas/SvgGenerator';
export * from '../ui/UiHandlers';
export { windowManager, WindowManager, ManagedWindow } from '../platform/windowing/WindowManager';
export { panelManager, PanelManager, defaultPanelConfigs, initializeDefaultPanels } from '../platform/windowing/PanelManager';
