// file: managerRegistry.ts
// Provides singleton accessors for TopoViewer managers.

import type cytoscape from 'cytoscape';
import { ManagerGroupManagement } from '../webview-ui/managerGroupManagement';
import type { ManagerGroupStyle } from '../webview-ui/managerGroupStyle';
import { ManagerLayoutAlgo } from '../webview-ui/managerLayoutAlgo';
import { ManagerZoomToFit } from '../webview-ui/managerZoomToFit';
import { ManagerLabelEndpoint } from '../webview-ui/managerLabelEndpoint';
import { ManagerReloadTopo } from '../webview-ui/managerReloadTopo';
import type { VscodeMessageSender } from '../webview-ui/managerVscodeWebview';

// Singleton instances for managers that don't require external dependencies
export const layoutAlgoManager = new ManagerLayoutAlgo();
export const zoomToFitManager = new ManagerZoomToFit();
export const labelEndpointManager = new ManagerLabelEndpoint();

// Lazy singletons for managers that require initialization parameters
let groupManager: ManagerGroupManagement | null = null;
let reloadTopoManager: ManagerReloadTopo | null = null;

/**
 * Retrieves a singleton instance of {@link ManagerGroupManagement}.
 *
 * @param cy - The Cytoscape core instance for the viewer.
 * @param groupStyleManager - Manager controlling group styling.
 * @param mode - Current viewer mode, either 'edit' or 'view'.
 * @returns Shared instance of {@link ManagerGroupManagement}.
 */
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

/**
 * Retrieves a singleton instance of {@link ManagerReloadTopo}.
 *
 * @param messageSender - Webview message sender for VS Code communication.
 * @returns Shared instance of {@link ManagerReloadTopo}.
 */
export function getReloadTopoManager(messageSender: VscodeMessageSender): ManagerReloadTopo {
  if (!reloadTopoManager) {
    reloadTopoManager = new ManagerReloadTopo(messageSender);
  }
  return reloadTopoManager;
}
