// file: managerLabelEndpoint.ts

import cytoscape from 'cytoscape';

export let globalLinkEndpointVisibility = true;

/**
 * Manages toggling the visibility of endpoint labels on edges.
 */
export class ManagerLabelEndpoint {
  public viewportButtonsLabelEndpoint(cy: cytoscape.Core): void {
    if (globalLinkEndpointVisibility) {
      cy.edges().forEach(edge => {
        edge.style('text-opacity', 0);
        edge.style('text-background-opacity', 0);
      });
      globalLinkEndpointVisibility = false;
    } else {
      cy.edges().forEach(edge => {
        edge.style('text-opacity', 1);
        edge.style('text-background-opacity', 0.7);
      });
      globalLinkEndpointVisibility = true;
    }
  }
}