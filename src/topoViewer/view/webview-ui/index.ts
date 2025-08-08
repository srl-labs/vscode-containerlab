// Import libraries first (must be before any code that uses them)
import './libraries';

// Import initialization to set up global variables and cytoscape
import './initialization';

// Import UI handlers to make them available globally
import { initializeGlobalHandlers } from './uiHandlers';

// Import Tailwind CSS framework
import './tailwind.css';

// Import cytoscape styles
import './cytoscapeStyles';

// Initialize global handlers for HTML onclick functions
initializeGlobalHandlers();

export * from '../../common/webview-ui/managerVscodeWebview';
export { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
export * from './managerGroupManagement';
export * from './managerSvg';
export * from './uiHandlers';
