import type cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../webview-ui/groups/GroupManager';
import type { ManagerGroupStyle } from '../webview-ui/groups/GroupStyleManager';
import { ManagerLayoutAlgo } from '../webview-ui/cytoscape/LayoutAlgorithms';
import { ManagerZoomToFit } from '../webview-ui/cytoscape/ZoomToFit';
import { ManagerLabelEndpoint } from '../webview-ui/cytoscape/LinkLabelManager';
import { ManagerDummyLinks } from '../webview-ui/cytoscape/DummyLinks';

// Singleton instances for managers that don't require external dependencies
export const layoutAlgoManager = new ManagerLayoutAlgo();
export const zoomToFitManager = new ManagerZoomToFit();
export const labelEndpointManager = new ManagerLabelEndpoint();
export const dummyLinksManager = new ManagerDummyLinks();

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

