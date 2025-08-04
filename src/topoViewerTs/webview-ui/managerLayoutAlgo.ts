// managerLayoutAlgo.ts

/* eslint-disable no-unused-vars */
// Declarations for global variables provided elsewhere in the webview
// These will be replaced with proper imports and types as the migration progresses.
declare const cy: any;
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
    globalCytoscapeLeafletLeaf = cy.leaflet({
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
  loadCytoStyle(cy);

  // Apply GeoMap layout using a preset layout and custom positions based on geographical coordinates
  cy.layout({
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
  const layout = cy.layout({
    name: "cola",
    nodeGap: 5,
    edgeLength: 100,
    animate: true,
    randomize: false,
    maxSimulationTime: 1500,
  });
  layout.run();

  // Remove the node used by the topoViewer if it exists
  topoViewerNode = cy.filter('node[name = "topoviewer"]');
  topoViewerNode.remove();

  // Initialize the expandCollapse plugin for potential collapse/expand actions
  cy.expandCollapse({
    layoutBy: null, // Use existing layout
    undoable: false,
    fisheye: false,
    animationDuration: 10, // Duration of animation in milliseconds
    animate: true,
  });

  // Example collapse/expand operation on the node with ID 'parent'
  // Future logic will be added here as needed
}

