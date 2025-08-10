/**
 * Shared Cytoscape engine factory that registers common extensions and
 * applies default styling and behavior in one place.
 */
import cytoscape, { Core, CytoscapeOptions } from 'cytoscape';
import edgehandles from 'cytoscape-edgehandles';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';
import cxtmenu from 'cytoscape-cxtmenu';
import cytoscapeSvg from 'cytoscape-svg';

let extensionsRegistered = false;

function registerExtensions(): void {
  if (extensionsRegistered) {
    return;
  }

  try { cytoscape.use(edgehandles); } catch { /* ignore */ }
  try { cytoscape.use(cola); } catch { /* ignore */ }
  try { cytoscape.use(gridGuide); } catch { /* ignore */ }
  try { cytoscape.use(cxtmenu); } catch { /* ignore */ }
  try { const leaflet = require('cytoscape-leaf'); cytoscape.use(leaflet); } catch { /* ignore */ }
  try { cytoscape.use(cytoscapeSvg); } catch { /* ignore */ }

  extensionsRegistered = true;
}

const defaultOptions: CytoscapeOptions = {
  elements: [],
  style: [
    {
      selector: 'node',
      style: {
        'background-color': '#3498db',
        label: 'data(label)',
      },
    },
  ],
  boxSelectionEnabled: true,
  selectionType: 'additive',
  wheelSensitivity: 0,
};

export function createCytoscapeInstance(container: HTMLElement | undefined, options: CytoscapeOptions = {}): Core {
  registerExtensions();
  return cytoscape({
    container,
    ...defaultOptions,
    ...options,
  });
}

export type { Core as CytoscapeCore };
