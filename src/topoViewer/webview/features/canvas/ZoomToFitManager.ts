import cytoscape from 'cytoscape';
import { log } from '../../platform/logging/logger';
import topoViewerState from '../../app/state';

/**
 * Provides functionality to zoom and fit the Cytoscape viewport across modes.
 */
export class ZoomToFitManager {
  public viewportButtonsZoomToFit(cy: cytoscape.Core): void {
    const initialZoom = cy.zoom();
    log.info(`Initial zoom level is "${initialZoom}".`);

    cy.fit();
    const currentZoom = cy.zoom();
    log.info(`And now the zoom level is "${currentZoom}".`);

    const layoutMgr = topoViewerState.editorEngine?.layoutAlgoManager || (window as any).layoutManager;
    layoutMgr?.cytoscapeLeafletLeaf?.fit();
  }
}
