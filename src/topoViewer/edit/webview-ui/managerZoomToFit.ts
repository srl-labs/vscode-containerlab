// file: managerZoomToFit.ts

import cytoscape from 'cytoscape';
import { log } from '../../common/logging/webviewLogger';
import topoViewerState from '../../common/webview-ui/state';

/**
 * Provides functionality to zoom and fit the Cytoscape viewport.
 */
export class ManagerZoomToFit {
  public viewportButtonsZoomToFit(cy: cytoscape.Core): void {
    const initialZoom = cy.zoom();
    log.info(`Initial zoom level is "${initialZoom}".`);

    cy.fit();
    const currentZoom = cy.zoom();
    log.info(`And now the zoom level is "${currentZoom}".`);

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager;
    layoutMgr?.cytoscapeLeafletLeaf?.fit();
  }
}