// Set mode to view before loading shared engine
(window as any).topoViewerMode = 'view';

// Import UI handlers to make them available globally
import { initializeGlobalHandlers } from './uiHandlers';

// Import the topology controller which will set up all viewport handlers
import('../../common/webview-ui/topologyWebviewController').then(() => {
  // Initialize view-specific global handlers AFTER the controller is loaded
  // This ensures our overrides take effect
  setTimeout(() => {
    initializeGlobalHandlers();
    console.log('View mode handlers initialized, viewportButtonsSaveTopo overridden');
  }, 100);
});

// Import Tailwind CSS framework
import '../../common/webview-ui/tailwind.css';

// Import cytoscape-leaflet CSS
import './cytoscape-leaflet.css';

// Import cytoscape styles
import '../../common/webview-ui/managerCytoscapeBaseStyles';

export * from '../../common/webview-ui/managerVscodeWebview';
export { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
export { ManagerGroupManagement } from '../../common/webview-ui/managerGroupManagement';
/**
 * @deprecated Use ManagerGroupManagement instead.
 */
export { ManagerGroupManagemetn } from '../../common/webview-ui/managerGroupManagement';
export * from '../../common/webview-ui/managerSvgGenerator';
export * from './uiHandlers';
