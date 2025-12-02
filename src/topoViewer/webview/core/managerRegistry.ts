import type cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../features/groups/GroupManager';
import type { ManagerGroupStyle } from '../features/groups/GroupStyleManager';
import { ManagerLayoutAlgo } from '../features/canvas/LayoutAlgorithms';
import { ManagerZoomToFit } from '../features/canvas/ZoomToFit';
import { ManagerLabelEndpoint } from '../features/canvas/LinkLabelManager';
import { ManagerDummyLinks } from '../features/canvas/DummyLinks';

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

