// Mode is now set from the HTML template via window.topoViewerMode

import { initializeGlobalHandlers } from '../../common/webview-ui/uiHandlers';

import('../../common/webview-ui/topologyWebviewController').then(() => {
  initializeGlobalHandlers();
});

export { default as TopologyWebviewController } from '../../common/webview-ui/topologyWebviewController';
export * from '../../common/webview-ui/managerVscodeWebview';
export { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
export { ManagerGroupManagement } from '../../common/webview-ui/managerGroupManagement';
/**
 * @deprecated Use ManagerGroupManagement instead.
 */
export { ManagerGroupManagemetn } from '../../common/webview-ui/managerGroupManagement';
export * from '../../common/webview-ui/managerSvgGenerator';
export * from '../../common/webview-ui/uiHandlers';
