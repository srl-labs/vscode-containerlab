// cytoscapeStyles.ts - Cytoscape styling functions for TopoViewer TypeScript version

import { log } from './logger';

/**
 * Detect color scheme preference (light/dark mode)
 */
function detectColorScheme(): 'light' | 'dark' {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Apply Cytoscape styles to the graph
 * This function is called to update the visual appearance of nodes and edges
 * 
 * @param cy - The Cytoscape instance to style
 */
export function loadCytoStyle(cy: any): void {
  try {
    // Remove existing styles
    cy.nodes().removeStyle();
    cy.edges().removeStyle();

    // Detect color scheme
    const colorScheme = detectColorScheme();
    log.info(`Applying ${colorScheme} theme to cytoscape`);

    // Define the styles
    const cytoscapeStyles = [
      {
        selector: 'core',
        style: {
          'selection-box-color': '#AAD8FF',
          'selection-box-border-color': '#8BB0D0',
          'selection-box-opacity': '0.5'
        }
      },
      {
        selector: 'node',
        style: {
          'shape': 'rectangle',
          'width': '10',
          'height': '10',
          'content': 'data(name)',
          'label': 'data(name)',
          'font-size': '7px',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'background-color': '#8F96AC',
          'min-zoomed-font-size': '7px',
          'color': '#F5F5F5',
          'text-outline-color': '#3C3E41',
          'text-outline-width': '0.3px',
          'text-background-color': '#000000',
          'text-background-opacity': 0.7,
          'text-background-shape': 'roundrectangle',
          'text-background-padding': '1px',
          'z-index': '2'
        }
      },
      {
        selector: 'node[topoViewerRole="group"]',
        style: {
          'shape': 'roundrectangle',
          'text-valign': 'top',
          'background-color': '#6C5B7B',
          'background-opacity': 0.3
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 2,
          'border-color': '#ff0000'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1,
          'target-arrow-shape': 'none',
          'curve-style': 'bezier',
          'line-color': '#7C90DB',
          'source-text-offset': 10,
          'target-text-offset': 10,
          'font-size': '5px',
          'color': '#F5F5F5',
          'text-outline-color': '#3C3E41',
          'text-outline-width': '0.3px',
          'text-rotation': 'autorotate',
          'text-background-color': '#000000',
          'text-background-opacity': 0.8,
          'text-background-shape': 'roundrectangle',
          'text-background-padding': '1px',
          'min-zoomed-font-size': '6px'
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#ff0000',
          'width': 3
        }
      },
      {
        selector: ':parent',
        style: {
          'text-valign': 'top',
          'text-halign': 'center',
          'background-color': '#7C90DB',
          'background-opacity': 0.3
        }
      }
    ];

    // Apply endpoint label visibility
    if (globalThis.globalLinkEndpointVisibility) {
      cytoscapeStyles.push({
        selector: 'edge',
        style: {
          'source-label': 'data(srcEndpoint)',
          'target-label': 'data(trgEndpoint)'
        } as any
      });
    }

    // Apply the styles
    cy.style(cytoscapeStyles);

    log.debug('Cytoscape styles applied successfully');
  } catch (error) {
    log.error(`Error applying cytoscape styles: ${error}`);
  }
}

// Make the function globally available
(globalThis as any).loadCytoStyle = loadCytoStyle;