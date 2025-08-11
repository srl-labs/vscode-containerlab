import type cytoscape from 'cytoscape';

/**
 * Utility wrapper to register common Cytoscape event handlers for clicks
 * on the canvas, nodes and edges. This helps reduce duplicated wiring of
 * event listeners between the TopoViewer view and editor implementations.
 */
export interface CyEventHandlerOptions {
  cy: cytoscape.Core;
  // eslint-disable-next-line no-unused-vars
  onCanvasClick?: (event: cytoscape.EventObject) => void;
  // eslint-disable-next-line no-unused-vars
  onNodeClick?: (event: cytoscape.EventObject) => void | Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onEdgeClick?: (event: cytoscape.EventObject) => void | Promise<void>;
}

export function registerCyEventHandlers(options: CyEventHandlerOptions): void {
  const { cy, onCanvasClick, onNodeClick, onEdgeClick } = options;

  if (onCanvasClick) {
    cy.on('click', (event) => {
      if (event.target === cy) {
        onCanvasClick(event);
      }
    });
  }

  if (onNodeClick) {
    cy.on('click', 'node', onNodeClick);
  }

  if (onEdgeClick) {
    cy.on('click', 'edge', onEdgeClick);
  }
}

