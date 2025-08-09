import type cytoscape from 'cytoscape';
import { ManagerGroupManagemetn } from '../webview-ui/managerGroupManagement';
import { ManagerLayoutAlgo } from '../webview-ui/managerLayoutAlgo';
import { ManagerZoomToFit } from '../../edit/webview-ui/managerZoomToFit';
import { ManagerLabelEndpoint } from '../../edit/webview-ui/managerLabelEndpoint';
import { ManagerReloadTopo } from '../../edit/webview-ui/managerReloadTopo';
import type { VscodeMessageSender } from '../webview-ui/managerVscodeWebview';

// Singleton instances for managers that don't require external dependencies
export const layoutAlgoManager = new ManagerLayoutAlgo();
export const zoomToFitManager = new ManagerZoomToFit();
export const labelEndpointManager = new ManagerLabelEndpoint();

// Lazy singletons for managers that require initialization parameters
let groupManager: ManagerGroupManagemetn | null = null;
let reloadTopoManager: ManagerReloadTopo | null = null;

export function getGroupManager(cy: cytoscape.Core, mode: 'edit' | 'view'): ManagerGroupManagemetn {
  if (!groupManager) {
    groupManager = new ManagerGroupManagemetn(cy, mode);
  }
  return groupManager;
}

export function getReloadTopoManager(messageSender: VscodeMessageSender): ManagerReloadTopo {
  if (!reloadTopoManager) {
    reloadTopoManager = new ManagerReloadTopo(messageSender);
  }
  return reloadTopoManager;
}
