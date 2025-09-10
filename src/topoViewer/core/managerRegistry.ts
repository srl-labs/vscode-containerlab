import type cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../webview-ui/managerGroupManagement';
import type { ManagerGroupStyle } from '../webview-ui/managerGroupStyle';
import { ManagerLayoutAlgo } from '../webview-ui/managerLayoutAlgo';
import { ManagerZoomToFit } from '../webview-ui/managerZoomToFit';
import { ManagerLabelEndpoint } from '../webview-ui/managerLabelEndpoint';

// Singleton instances for managers that don't require external dependencies
export const layoutAlgoManager = new ManagerLayoutAlgo();
export const zoomToFitManager = new ManagerZoomToFit();
export const labelEndpointManager = new ManagerLabelEndpoint();

// Lazy singletons for managers that require initialization parameters
let groupManager: ManagerGroupManagement | null = null;

export function getGroupManager(
  cy: cytoscape.Core,
  groupStyleManager: ManagerGroupStyle,
  mode: 'edit' | 'view'
): ManagerGroupManagement {
  if (!groupManager) {
    groupManager = new ManagerGroupManagement(cy, groupStyleManager, mode);
  }
  return groupManager;
}

