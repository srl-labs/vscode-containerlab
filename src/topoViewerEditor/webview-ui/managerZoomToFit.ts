// file: managerZoomToFit.ts

import cytoscape from 'cytoscape';

/**
 * Provides functionality to zoom and fit the Cytoscape viewport.
 */
export class ManagerZoomToFit {
  public viewportButtonsZoomToFit(cy: cytoscape.Core): void {
    const initialZoom = cy.zoom();
    console.info(`Initial zoom level is "${initialZoom}".`);

    cy.fit();
    const currentZoom = cy.zoom();
    console.info(`And now the zoom level is "${currentZoom}".`);

    const layoutMgr = (window as any).topoViewerEditorEngine?.layoutAlgoManager;
    layoutMgr?.cytoscapeLeafletLeaf?.fit();
  }
}