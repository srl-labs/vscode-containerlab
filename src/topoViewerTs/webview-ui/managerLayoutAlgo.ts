// managerLayoutAlgo.ts

/* eslint-disable no-unused-vars */
// Declarations for global variables provided elsewhere in the webview
// These will be replaced with proper imports and types as the migration progresses.
// cy is accessed via globalThis.cy
declare let globalIsGeoMapInitialized: boolean;
declare let globalCytoscapeLeafletLeaf: any;
declare let globalCytoscapeLeafletMap: any;
declare function loadCytoStyle(cy: any): void;
declare function viewportButtonsGeoMapEdit(): void;
declare let topoViewerNode: any;

// Leaflet global
declare const L: any;

/**
 * Initializes and applies the GeoMap layout using Leaflet and Cytoscape.
 */
export function viewportDrawerLayoutGeoMap(): void {
  // Disable any active GeoMap layout before initializing a new one
  viewportDrawerDisableGeoMap();

  if (!globalIsGeoMapInitialized) {
    // Show the Leaflet container element
    const leafletContainer = document.getElementById("cy-leaflet");
    if (leafletContainer) {
      leafletContainer.style.display = "block";
    }

    // Initialize the Cytoscape-Leaflet integration
    globalCytoscapeLeafletLeaf = globalThis.cy.leaflet({
      container: leafletContainer,
    });

    // Remove the default tile layer from the Leaflet map
    globalCytoscapeLeafletLeaf.map.removeLayer(
      globalCytoscapeLeafletLeaf.defaultTileLayer
    );

    // Assign the map reference to a global variable
    globalCytoscapeLeafletMap = globalCytoscapeLeafletLeaf.map;

    // Add a custom tile layer to the Leaflet map
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(globalCytoscapeLeafletMap);

    // Mark GeoMap as initialized
    globalIsGeoMapInitialized = true;
  }

  // Reapply the Cytoscape stylesheet
  loadCytoStyle(globalThis.cy);

  // Apply GeoMap layout using a preset layout and custom positions based on geographical coordinates
  globalThis.cy.layout({
    name: "preset",
    fit: false,
    positions: function (node: any) {
      const data = node.data();
      const point = globalCytoscapeLeafletMap.latLngToContainerPoint([
        Number(data.lat),
        Number(data.lng),
      ]);
      return { x: point.x, y: point.y };
    },
  }).run();

  // Adjust the Leaflet map to fit the nodes
  globalCytoscapeLeafletLeaf.fit();

  // Show GeoMap-related buttons by removing the 'is-hidden' class
  const viewportDrawerGeoMapElements = document.getElementsByClassName(
    "viewport-geo-map"
  );
  for (let i = 0; i < viewportDrawerGeoMapElements.length; i++) {
    (viewportDrawerGeoMapElements[i] as HTMLElement).classList.remove(
      "is-hidden"
    );
  }

  // Enable node editing specific to GeoMap layout
  viewportButtonsGeoMapEdit();
}

/**
 * Disables the GeoMap layout and reverts to the default Cytoscape layout.
 */
export function viewportDrawerDisableGeoMap(): void {
  if (!globalIsGeoMapInitialized) {
    return;
  }

  // Hide the Leaflet container element
  const leafletContainer = document.getElementById("cy-leaflet");
  if (leafletContainer) {
    leafletContainer.style.display = "none";
  }

  // Destroy the Cytoscape-Leaflet instance
  globalCytoscapeLeafletLeaf.destroy();

  // Revert to the default Cytoscape layout using the 'cola' layout
  const layout = globalThis.cy.layout({
    name: "cola",
    nodeGap: 5,
    edgeLength: 100,
    animate: true,
    randomize: false,
    maxSimulationTime: 1500,
  });
  layout.run();

  // Remove the node used by the topoViewer if it exists
  topoViewerNode = globalThis.cy.filter('node[name = "topoviewer"]');
  topoViewerNode.remove();

  // Initialize the expandCollapse plugin for potential collapse/expand actions
  globalThis.cy.expandCollapse({
    layoutBy: null, // Use existing layout
    undoable: false,
    fisheye: false,
    animationDuration: 10, // Duration of animation in milliseconds
    animate: true,
  });

  // Example collapse/expand operation on the node with ID 'parent'
  // Future logic will be added here as needed
}

/**
 * Handle layout algorithm selection changes.
 */
export function layoutAlgoChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const value = target.value;

  // Hide all layout panels
  const panels = document.getElementsByClassName('layout-algo');
  for (let i = 0; i < panels.length; i++) {
    (panels[i] as HTMLElement).style.display = 'none';
  }

  const show = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'block';
    }
  };

  switch (value) {
    case 'Force Directed Radial':
      show('viewport-drawer-force-directed-radial');
      show('viewport-drawer-force-directed-radial-reset-start');
      break;
    case 'Vertical':
      show('viewport-drawer-dc-vertical');
      show('viewport-drawer-dc-vertical-reset-start');
      break;
    case 'Horizontal':
      show('viewport-drawer-dc-horizontal');
      show('viewport-drawer-dc-horizontal-reset-start');
      break;
    case 'Preset':
      viewportDrawerPreset();
      break;
    case 'Geo Positioning':
      viewportDrawerLayoutGeoMap();
      break;
    default:
      show('viewport-drawer-force-directed');
      show('viewport-drawer-force-directed-reset-start');
      break;
  }
}

/**
 * Apply force-directed (cola) layout using slider values.
 */
export function viewportDrawerLayoutForceDirected(): void {
  viewportDrawerDisableGeoMap();

  const edgeLengthSlider = document.getElementById('force-directed-slider-link-lenght') as HTMLInputElement | null;
  const nodeGapSlider = document.getElementById('force-directed-slider-node-gap') as HTMLInputElement | null;

  const edgeLengthValue = edgeLengthSlider ? parseFloat(edgeLengthSlider.value) : 100;
  const nodeGapValue = nodeGapSlider ? parseFloat(nodeGapSlider.value) : 1;

  globalThis.cy.layout({
    name: 'cola',
    nodeSpacing: () => nodeGapValue,
    edgeLength: (edge: any) => (edgeLengthValue * 100) / edge.data('weight'),
    animate: true,
    randomize: false,
    maxSimulationTime: 1500
  }).run();
}

/**
 * Apply force-directed radial layout.
 */
export function viewportDrawerLayoutForceDirectedRadial(): void {
  viewportDrawerDisableGeoMap();

  const edgeLengthSlider = document.getElementById('force-directed-radial-slider-link-lenght') as HTMLInputElement | null;
  const nodeGapSlider = document.getElementById('force-directed-radial-slider-node-gap') as HTMLInputElement | null;

  const edgeLengthValue = edgeLengthSlider ? parseFloat(edgeLengthSlider.value) : 100;
  const nodeGapValue = nodeGapSlider ? parseFloat(nodeGapSlider.value) : 1;

  const nodeWeights: Record<string, number> = {};
  globalThis.cy.nodes().forEach((node: any) => {
    const level = parseInt(node.data('extraData')?.labels?.TopoViewerGroupLevel || '1', 10);
    nodeWeights[node.id()] = 1 / level;
  });

  globalThis.cy.edges().forEach((edge: any) => {
    edge.style({ 'curve-style': 'bezier', 'control-point-step-size': 20 });
  });

  globalThis.cy.layout({
    name: 'cola',
    fit: true,
    nodeSpacing: nodeGapValue,
    edgeLength: (edge: any) => {
      const sw = nodeWeights[edge.source().id()] || 1;
      const tw = nodeWeights[edge.target().id()] || 1;
      return (edgeLengthValue) / (sw + tw);
    },
    edgeSymDiffLength: 10,
    nodeDimensionsIncludeLabels: true,
    animate: true,
    maxSimulationTime: 2000,
    avoidOverlap: true
  }).run();
}

/**
 * Arrange nodes in a vertical layout.
 */
export function viewportDrawerLayoutVertical(): void {
  viewportDrawerDisableGeoMap();

  const nodevGap = document.getElementById('vertical-layout-slider-node-v-gap') as HTMLInputElement | null;
  const groupvGap = document.getElementById('vertical-layout-slider-group-v-gap') as HTMLInputElement | null;

  const nodevGapValue = nodevGap ? parseFloat(nodevGap.value) : 1;
  const groupvGapValue = groupvGap ? parseFloat(groupvGap.value) : 100;

  setTimeout(() => {
    globalThis.cy.nodes().forEach((node: any) => {
      if (node.isParent()) {
        const children = node.children();
        const cellWidth = node.width() / children.length;
        children.forEach((child: any, index: number) => {
          const xPos = index * (cellWidth + nodevGapValue);
          child.position({ x: xPos, y: 0 });
        });
      }
    });

    const sortedParents = globalThis.cy.nodes().filter((n: any) => n.isParent()).sort((a: any, b: any) => {
      const levelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || '0', 10);
      const levelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || '0', 10);
      if (levelA !== levelB) return levelA - levelB;
      return (a.data('id') || '').localeCompare(b.data('id') || '');
    });

    let yPos = 0;
    let maxWidth = 0;
    globalThis.cy.nodes().forEach((n: any) => {
      if (n.isParent()) {
        const w = n.width();
        if (w > maxWidth) maxWidth = w;
      }
    });
    const divisionFactor = maxWidth / 2;
    const centerX = 0;

    sortedParents.forEach((parent: any) => {
      const xPos = centerX - parent.width() / divisionFactor;
      parent.position({ x: xPos, y: yPos });
      yPos += groupvGapValue;
    });

    globalThis.cy.fit();
  }, 100);
}

/**
 * Arrange nodes in a horizontal layout.
 */
export function viewportDrawerLayoutHorizontal(): void {
  viewportDrawerDisableGeoMap();

  const nodehGap = document.getElementById('horizontal-layout-slider-node-h-gap') as HTMLInputElement | null;
  const grouphGap = document.getElementById('horizontal-layout-slider-group-h-gap') as HTMLInputElement | null;

  const nodehGapValue = nodehGap ? parseFloat(nodehGap.value) * 10 : 0;
  const grouphGapValue = grouphGap ? parseFloat(grouphGap.value) : 100;

  setTimeout(() => {
    globalThis.cy.nodes().forEach((node: any) => {
      if (node.isParent()) {
        const children = node.children();
        const cellHeight = node.height() / children.length;
        children.forEach((child: any, index: number) => {
          const yPos = index * (cellHeight + nodehGapValue);
          child.position({ x: 0, y: yPos });
        });
      }
    });

    const sortedParents = globalThis.cy.nodes().filter((n: any) => n.isParent()).sort((a: any, b: any) => {
      const levelA = parseInt(a.data('extraData')?.topoViewerGroupLevel || '0', 10);
      const levelB = parseInt(b.data('extraData')?.topoViewerGroupLevel || '0', 10);
      if (levelA !== levelB) return levelA - levelB;
      return (a.data('id') || '').localeCompare(b.data('id') || '');
    });

    let xPos = 0;
    let maxHeight = 0;
    globalThis.cy.nodes().forEach((n: any) => {
      if (n.isParent()) {
        const h = n.height();
        if (h > maxHeight) maxHeight = h;
      }
    });
    const divisionFactor = maxHeight / 2;
    const centerY = 0;

    sortedParents.forEach((parent: any) => {
      const yPos = centerY - parent.height() / divisionFactor;
      parent.position({ x: xPos, y: yPos });
      xPos += grouphGapValue;
    });

    globalThis.cy.fit();
  }, 100);
}

/**
 * Apply preset layout by using existing node positions.
 */
export function viewportDrawerPreset(): void {
  viewportDrawerDisableGeoMap();
  globalThis.cy.layout({ name: 'preset' }).run();
  globalThis.cy.fit();
}

// Expose functions globally for HTML event handlers
(globalThis as any).layoutAlgoChange = layoutAlgoChange;
(globalThis as any).viewportDrawerLayoutForceDirected = viewportDrawerLayoutForceDirected;
(globalThis as any).viewportDrawerLayoutForceDirectedRadial = viewportDrawerLayoutForceDirectedRadial;
(globalThis as any).viewportDrawerLayoutVertical = viewportDrawerLayoutVertical;
(globalThis as any).viewportDrawerLayoutHorizontal = viewportDrawerLayoutHorizontal;
(globalThis as any).viewportDrawerPreset = viewportDrawerPreset;

