// Import libraries first (must be before any code that uses them)
import './libraries';

// Import initialization to set up global variables and cytoscape
import './initialization';

// Import UI handlers to make them available globally
import { initializeGlobalHandlers } from './uiHandlers';

// Import Tailwind CSS framework
import '../../common/webview-ui/tailwind.css';

// Import cytoscape-leaflet CSS
import './cytoscape-leaflet.css';

// Import cytoscape styles
import '../../common/webview-ui/managerCytoscapeBaseStyles';

// Initialize global handlers for HTML onclick functions
initializeGlobalHandlers();

export * from '../../common/webview-ui/managerVscodeWebview';
export { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
export { ManagerGroupManagemetn } from '../../common/webview-ui/managerGroupManagemetn';
export * from '../../common/webview-ui/managerSvgGenerator';
export * from './uiHandlers';
