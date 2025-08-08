// file: managerZoomToFit.ts

import cytoscape from 'cytoscape';
import { log } from '../../view/webview-ui/logger';

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

    const layoutMgr = (window as any).topoViewerEditorEngine?.layoutAlgoManager;
    layoutMgr?.cytoscapeLeafletLeaf?.fit();
  }
}