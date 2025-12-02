import type cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../groups/GroupManager';
import type { ManagerGroupStyle } from '../groups/GroupStyleManager';
import { ManagerLayoutAlgo } from '../cytoscape/LayoutAlgorithms';
import { ManagerZoomToFit } from '../cytoscape/ZoomToFit';
import { ManagerLabelEndpoint } from '../cytoscape/LinkLabelManager';
import { ManagerDummyLinks } from '../cytoscape/DummyLinks';

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

