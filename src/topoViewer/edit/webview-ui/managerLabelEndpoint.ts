// file: managerLabelEndpoint.ts

import cytoscape from 'cytoscape';
import topoViewerState from '../../common/state';

/**
 * Manages toggling the visibility of endpoint labels on edges.
 */
export class ManagerLabelEndpoint {
  public viewportButtonsLabelEndpoint(cy: cytoscape.Core): void {
    if (topoViewerState.linkEndpointVisibility) {
      cy.edges().forEach(edge => {
        edge.style('text-opacity', 0);
        edge.style('text-background-opacity', 0);
      });
      topoViewerState.linkEndpointVisibility = false;
    } else {
      cy.edges().forEach(edge => {
        edge.style('text-opacity', 1);
        edge.style('text-background-opacity', 0.7);
      });
      topoViewerState.linkEndpointVisibility = true;
    }
  }
}