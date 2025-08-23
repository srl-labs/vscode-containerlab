// file: index.ts
// Entry point that bootstraps the TopoViewer webview.

// Mode is now set from the HTML template via window.topoViewerMode

import { initializeGlobalHandlers } from './uiHandlers';

import('./topologyWebviewController').then(() => {
  initializeGlobalHandlers();
});

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
