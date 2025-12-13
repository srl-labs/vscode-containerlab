/**
 * Shared Cytoscape instance factory that registers common extensions and
 * applies default styling and behavior in one place.
 */
import cytoscape, { Core, CytoscapeOptions } from 'cytoscape';

let extensionsRegistered = false;
let extensionPromises: Record<string, Promise<void>> = {};

// Lazy load extensions only when needed
function registerCoreExtensions(): void {
  if (extensionsRegistered) {
    return;
  }

  // Only register grid guide initially (needed for grid display)
  try {
    const gridGuide = require('cytoscape-grid-guide');
    cytoscape.use(gridGuide);
  } catch { /* ignore */ }

  extensionsRegistered = true;
}

// Lazy load other extensions asynchronously
export async function loadExtension(name: 'edgehandles' | 'cola' | 'cxtmenu' | 'svg' | 'leaflet'): Promise<void> {
  if (!extensionPromises[name]) {
    extensionPromises[name] = (async () => {
      try {
        switch(name) {
          case 'edgehandles': {
            const edgehandles = await import('cytoscape-edgehandles');
            cytoscape.use(edgehandles.default);
            break;
          }
          case 'cola': {
            const cola = await import('cytoscape-cola');
            cytoscape.use(cola.default);
            break;
          }
          case 'cxtmenu': {
            const cxtmenu = await import('cytoscape-cxtmenu');
            cytoscape.use(cxtmenu.default);
            break;
          }
          case 'svg': {
            const cytoscapeSvg = await import('cytoscape-svg');
            cytoscape.use(cytoscapeSvg.default);
            break;
          }
          case 'leaflet': {
            const leaflet = await import('cytoscape-leaf');
            cytoscape.use(leaflet.default);
            break;
          }
        }
      } catch { /* ignore */ }
    })();
  }
  return extensionPromises[name];
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
  // Performance optimizations
  textureOnViewport: true,
  hideEdgesOnViewport: false,
  hideLabelsOnViewport: false,
  pixelRatio: 'auto',
  motionBlur: false,
  motionBlurOpacity: 0.2,
};

export function createConfiguredCytoscape(container: HTMLElement | undefined, options: CytoscapeOptions = {}): Core {
  registerCoreExtensions();
  return cytoscape({
    container,
    ...defaultOptions,
    ...options,
  });
}

export type { Core as CytoscapeCore };
