import type cytoscape from 'cytoscape';
import { GroupManager } from '../features/groups/GroupManager';
import type { GroupStyleManager } from '../features/groups/GroupStyleManager';
import { LayoutManager } from '../features/canvas/LayoutManager';
import { ZoomToFitManager } from '../features/canvas/ZoomToFitManager';
import { LinkLabelManager } from '../features/canvas/LinkLabelManager';
import { DummyLinksManager } from '../features/canvas/DummyLinksManager';

// Singleton instances for managers that don't require external dependencies
export const layoutAlgoManager = new LayoutManager();
export const zoomToFitManager = new ZoomToFitManager();
export const labelEndpointManager = new LinkLabelManager();
export const dummyLinksManager = new DummyLinksManager();

// Lazy singletons for managers that require initialization parameters
let groupManager: GroupManager | null = null;

export function getGroupManager(
  cy: cytoscape.Core,
  groupStyleManager: GroupStyleManager,
  mode: 'edit' | 'view'
): GroupManager {
  if (!groupManager) {
    groupManager = new GroupManager(cy, groupStyleManager, mode);
  }
  return groupManager;
}

