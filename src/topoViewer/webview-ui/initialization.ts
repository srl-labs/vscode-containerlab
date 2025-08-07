// initialization.ts - Main initialization module for TopoViewer TypeScript
// This module replaces the initialization logic that was in dev.js

import { log } from './logger';
import { initializeGroupManagement, initializeWheelSelection, showPanelGroupEditor } from './managerGroupManagement';

// loadCytoStyle function will be called if available

// Global Variables (previously in common.js)
/* eslint-disable no-unused-vars */
declare global {
  var cy: any;
  var globalSelectedNode: any;
  var globalSelectedEdge: any;
  var globalLinkEndpointVisibility: boolean;
  var globalNodeContainerStatusVisibility: boolean;
  var globalLabName: string;
  var globalPrefixName: string;
  var multiLayerViewPortState: boolean;
  var globalIsGeoMapInitialized: boolean;
  var isPanel01Cy: boolean;
  var nodeClicked: boolean;
  var edgeClicked: boolean;
  var deploymentType: string;
  var globalCytoscapeLeafletMap: any;
  var globalCytoscapeLeafletLeaf: any;
}
/* eslint-enable no-unused-vars */

// Initialize global variables - moved inside DOMContentLoaded to avoid immediate execution
function initializeGlobalVariables(): void {
  globalThis.isPanel01Cy = false;
  globalThis.nodeClicked = false;
  globalThis.edgeClicked = false;
  globalThis.globalSelectedNode = null;
  globalThis.globalSelectedEdge = null;
  globalThis.globalLinkEndpointVisibility = true;
  globalThis.globalNodeContainerStatusVisibility = false;
  globalThis.multiLayerViewPortState = false;
  globalThis.globalIsGeoMapInitialized = false;
}

/**
 * Initialize Cytoscape instance and load topology data
 */
function initializeCytoscape(): void {
  // Check if cytoscape is available
  log.info('Checking for cytoscape availability...');
  log.info('window.cytoscape type: ' + typeof (window as any).cytoscape);

  if (typeof (window as any).cytoscape === 'undefined') {
    log.error('Cytoscape.js is not loaded');
    return;
  }

  const cytoscape = (window as any).cytoscape;
  log.info('Cytoscape loaded successfully');

  // Cytoscape-popper is already registered in libraries.ts, no need to register again

  // Create Cytoscape instance
  const container = document.getElementById("cy");
  log.info('Cytoscape container element: ' + container);

  if (!container) {
    log.error('Could not find cytoscape container element with id "cy"');
    return;
  }

  // Log container dimensions
  const rect = container.getBoundingClientRect();
  log.info('Container dimensions: ' + JSON.stringify({
    width: rect.width,
    height: rect.height,
    offsetWidth: container.offsetWidth,
    offsetHeight: container.offsetHeight
  }));

  try {
    globalThis.cy = cytoscape({
      container: container,
      elements: [],
      style: [{
        selector: "node",
        style: {
          "background-color": "#3498db",
          label: "data(label)",
        },
      }],
      boxSelectionEnabled: true,
      wheelSensitivity: 0,
      selectionType: 'additive'
    });

    log.info('Cytoscape instance created successfully');
    log.info('Cytoscape instance: ' + globalThis.cy);
    registerCustomZoom();
  } catch (error) {
    log.error('Failed to create cytoscape instance: ' + error);
    throw error;
  }

  // Add selection event listeners
  globalThis.cy.on('select', 'node', () => {
    const selectedNodes = globalThis.cy.$('node:selected');
    selectedNodes.style({
      'border-width': 1,
      'border-color': '#ff0000'
    });
    log.debug(`Selected nodes: ${selectedNodes.map((n: any) => n.id()).join(', ')}`);
  });

  globalThis.cy.on('unselect', 'node', () => {
    if (typeof (globalThis as any).loadCytoStyle === 'function') {
      (globalThis as any).loadCytoStyle(globalThis.cy);
    }
    log.debug(`Remaining selected nodes: ${globalThis.cy.$('node:selected').map((n: any) => n.id()).join(', ')}`);
  });

  globalThis.cy.on('select', 'edge', () => {
    const selectedEdges = globalThis.cy.$('edge:selected');
    selectedEdges.style({
      'line-color': '#ff0000',
      'width': 1.5
    });
    log.debug(`Selected edges: ${selectedEdges.map((e: any) => e.id()).join(', ')}`);
  });

  globalThis.cy.on('unselect', 'edge', () => {
    if (typeof (globalThis as any).loadCytoStyle === 'function') {
      (globalThis as any).loadCytoStyle(globalThis.cy);
    }
    log.debug(`Remaining selected edges: ${globalThis.cy.$('edge:selected').map((e: any) => e.id()).join(', ')}`);
  });

  // Handle node clicks to open property panels
  globalThis.cy.on('click', 'node', async (event: any) => {
    const node = event.target;
    globalThis.nodeClicked = true;

    log.info(`Node clicked: ${node.id()}`);

    const extraData = node.data("extraData") || {};
    const originalEvent = event.originalEvent as MouseEvent;

    // Handle parent/group nodes
    if (node.isParent() || node.data('topoViewerRole') === 'group') {
      showPanelGroupEditor(node);
      return;
    }

    // Handle special node types
    if (node.data("topoViewerRole") === "textbox" || node.data("topoViewerRole") === "dummyChild") {
      return;
    }

    // Handle regular nodes - show node properties panel
    if (!originalEvent.altKey && !originalEvent.ctrlKey && !originalEvent.shiftKey) {
      // Hide all overlay panels first
      const panelOverlays = document.getElementsByClassName("panel-overlay");
      Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");

      // Show node properties panel
      const panelNode = document.getElementById("panel-node");
      if (panelNode) {
        panelNode.style.display = panelNode.style.display === "none" ? "block" : "none";

        // Update panel content
        const nameEl = document.getElementById("panel-node-name");
        if (nameEl) nameEl.textContent = extraData.longname || node.data("name") || node.id();

        const kindEl = document.getElementById("panel-node-kind");
        if (kindEl) kindEl.textContent = extraData.kind || "";

        const mgmtIpv4El = document.getElementById("panel-node-mgmtipv4");
        if (mgmtIpv4El) mgmtIpv4El.textContent = extraData.mgmtIpv4Address || "";

        const mgmtIpv6El = document.getElementById("panel-node-mgmtipv6");
        if (mgmtIpv6El) mgmtIpv6El.textContent = extraData.mgmtIpv6Address || "";

        const fqdnEl = document.getElementById("panel-node-fqdn");
        if (fqdnEl) fqdnEl.textContent = extraData.fqdn || "";

        const roleEl = document.getElementById("panel-node-topoviewerrole");
        if (roleEl) roleEl.textContent = node.data("topoViewerRole") || "";

        const stateEl = document.getElementById("panel-node-state");
        if (stateEl) stateEl.textContent = extraData.state || "";

        const imageEl = document.getElementById("panel-node-image");
        if (imageEl) imageEl.textContent = extraData.image || "";

        globalThis.globalSelectedNode = extraData.longname || node.id();
        log.info(`Global selected node: ${globalThis.globalSelectedNode}`);
      }
    }
  });

  // Handle edge clicks to open property panels
  globalThis.cy.on('click', 'edge', async (event: any) => {
    const edge = event.target;
    globalThis.edgeClicked = true;

    log.info(`Edge clicked: ${edge.id()}`);

    // Hide all overlay panels first
    const panelOverlays = document.getElementsByClassName("panel-overlay");
    Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");

    // Change edge color to indicate selection
    const defaultEdgeColor = "#969799";
    if (edge.data("editor") === "true") {
      edge.style("line-color", "#32CD32");
    } else {
      edge.style("line-color", "#0043BF");
    }

    // Revert color of other edges
    globalThis.cy.edges().forEach((e: any) => {
      if (e !== edge) {
        e.style("line-color", defaultEdgeColor);
      }
    });

    // Show link properties panel
    const panelLink = document.getElementById("panel-link");
    if (panelLink) {
      panelLink.style.display = "block";

      // Update panel content
      const linkNameEl = document.getElementById("panel-link-name");
      if (linkNameEl) {
        linkNameEl.innerHTML = `┌ ${edge.data("source")} :: ${edge.data("sourceEndpoint") || ""}<br>└ ${edge.data("target")} :: ${edge.data("targetEndpoint") || ""}`;
      }

      const endpointANameEl = document.getElementById("panel-link-endpoint-a-name");
      if (endpointANameEl) {
        endpointANameEl.textContent = `${edge.data("source")} :: ${edge.data("sourceEndpoint") || ""}`;
      }

      const endpointBNameEl = document.getElementById("panel-link-endpoint-b-name");
      if (endpointBNameEl) {
        endpointBNameEl.textContent = `${edge.data("target")} :: ${edge.data("targetEndpoint") || ""}`;
      }

      globalThis.globalSelectedEdge = edge.data("id");
      log.info(`Global selected edge: ${globalThis.globalSelectedEdge}`);
    }
  });

  // Close open menus when clicking on empty canvas
  globalThis.cy.on('click', (event: any) => {
    if (event.target === globalThis.cy) {
      // Only close panels if no node or edge was clicked
      if (!globalThis.nodeClicked && !globalThis.edgeClicked) {
        const panelOverlays = document.getElementsByClassName('panel-overlay');
        for (let i = 0; i < panelOverlays.length; i++) {
          (panelOverlays[i] as HTMLElement).style.display = 'none';
        }
        const viewportDrawer = document.getElementsByClassName('viewport-drawer');
        for (let i = 0; i < viewportDrawer.length; i++) {
          (viewportDrawer[i] as HTMLElement).style.display = 'none';
        }
      }
      // Reset click flags
      globalThis.nodeClicked = false;
      globalThis.edgeClicked = false;
    }
  });

  // Apply initial styles
  if (typeof (globalThis as any).loadCytoStyle === 'function') {
    (globalThis as any).loadCytoStyle(globalThis.cy);
  }

  // Add container click handler to manage panel visibility
  const cyContainer = document.getElementById("cy");
  if (cyContainer) {
    cyContainer.addEventListener("click", () => {
      log.debug("cy container clicked");
      log.debug(`nodeClicked: ${globalThis.nodeClicked}`);
      log.debug(`edgeClicked: ${globalThis.edgeClicked}`);

      // Execute toggle logic only when no node or edge was clicked
      if (!globalThis.nodeClicked && !globalThis.edgeClicked) {
        // Remove all overlay panels
        const panelOverlays = document.getElementsByClassName("panel-overlay");
        for (let i = 0; i < panelOverlays.length; i++) {
          (panelOverlays[i] as HTMLElement).style.display = "none";
        }

        // Hide viewport drawers
        const viewportDrawers = document.getElementsByClassName("viewport-drawer");
        for (let i = 0; i < viewportDrawers.length; i++) {
          (viewportDrawers[i] as HTMLElement).style.display = "none";
        }
      }

      // Reset the click flags
      globalThis.nodeClicked = false;
      globalThis.edgeClicked = false;
    });
  }

  log.info('Cytoscape instance initialized successfully');
}

function registerCustomZoom(): void {
  if (!globalThis.cy) return;
  globalThis.cy.userZoomingEnabled(false);
  const container = globalThis.cy.container();
  if (container) {
    container.addEventListener('wheel', handleCustomWheel, { passive: false });
  }
}

function handleCustomWheel(event: WheelEvent): void {
  if (!globalThis.cy) return;
  event.preventDefault();
  let step = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    step *= 100;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    step *= window.innerHeight;
  }
  const isTrackpad = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50;
  const sensitivity = isTrackpad ? 0.002 : 0.0002;
  const factor = Math.pow(10, -step * sensitivity);
  const newZoom = globalThis.cy.zoom() * factor;
  globalThis.cy.zoom({
    level: newZoom,
    renderedPosition: { x: event.offsetX, y: event.offsetY }
  });
}

/**
 * Load and display topology data
 */
async function loadTopologyData(): Promise<void> {
  try {
    // Get JSON URLs from window variables
    const cytoscapeUrl = (window as any).jsonFileUrlDataCytoMarshall;

    if (!cytoscapeUrl) {
      log.error('Cytoscape JSON URL is missing');
      return;
    }

    const response = await fetch(cytoscapeUrl);
    const cytoData = await response.json();
    log.debug(`Loaded cytoscape data with ${cytoData.nodes?.length || 0} nodes and ${cytoData.edges?.length || 0} edges`);

    // Load topology into cytoscape
    if (globalThis.cy) {
      globalThis.cy.elements().remove();
      globalThis.cy.add(cytoData);

      let usePreset = false;
      try {
        const environments = await (globalThis as any).getEnvironments?.();
        usePreset = environments?.['topoviewer-layout-preset'] === 'true';
      } catch (err) {
        log.warn(`Could not determine preset layout preference: ${err}`);
      }

      if (usePreset) {
        log.info('Applying preset layout from labels');
        globalThis.cy.layout({ name: 'preset' }).run();
      } else {
        const layout = globalThis.cy.layout({
          name: 'cola',
          nodeSpacing: () => 5,
          edgeLength: () => 100,
          animate: true,
          randomize: false,
          maxSimulationTime: 1500
        });
        layout.run();
      }

      globalThis.cy.fit();

      // Apply styles after loading data
      if (typeof (globalThis as any).loadCytoStyle === 'function') {
        (globalThis as any).loadCytoStyle(globalThis.cy);
      }

      if (cytoData.nodes && cytoData.nodes.length > 0) {
        log.info(`Topology loaded and rendered successfully with ${usePreset ? 'preset' : 'cola'} layout`);
      } else {
        log.warn('No topology elements found in data');
      }
    }
  } catch (error) {
    log.error(`Error loading topology data: ${error}`);
  }
}

/**
 * Initialize resize handling
 */
function initializeResizeHandling(): void {
  const contentDiv = document.getElementById('content');
  const panelSidebar = document.getElementById('panel-sidebar');
  const viewport = document.getElementById('viewport');
  const panelToggle = document.getElementById('panel-toggle');

  if (!contentDiv || !panelSidebar || !viewport || !panelToggle) {
    log.warn('One or more required elements for resizing logic are missing. Initialization aborted.');
    return;
  }

  // Resize Observer
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === contentDiv) {
        const contentRect = entry.contentRect;
        const sidebarWidth = panelSidebar.offsetWidth;
        const availableWidth = contentRect.width - sidebarWidth;
        const availableHeight = contentRect.height;

        viewport.style.width = `${availableWidth}px`;
        viewport.style.height = `${availableHeight}px`;

        // Resize cytoscape if available
        if (globalThis.cy) {
          globalThis.cy.resize();
          log.debug('Fitting Cytoscape to new size with animation');
          globalThis.cy.fit(undefined, 50);
        }
      }
    }
  });

  resizeObserver.observe(contentDiv);

  // Panel toggle functionality
  panelToggle.addEventListener('click', () => {
    log.debug('Panel toggle clicked');
    panelSidebar.classList.toggle('collapsed');
  });
}

/**
 * Initialize helper functions that are referenced from common.js
 */
function initializeHelperFunctions(): void {
  log.info('Starting initializeHelperFunctions...');
  // Add getEnvironments function for compatibility
  (globalThis as any).getEnvironments = async function() {
    try {
      const environmentUrl = (window as any).jsonFileUrlDataEnvironment;
      if (!environmentUrl) {
        log.warn('Environment JSON URL not available');
        return null;
      }

      const response = await fetch(environmentUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch environment JSON: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      log.error(`Error fetching environments: ${error}`);
      return null;
    }
  };
}

/**
 * Fetch and process environment data
 */
async function fetchEnvironmentData(): Promise<void> {
  try {
    const environmentUrl = (window as any).jsonFileUrlDataEnvironment;
    if (environmentUrl) {
      await fetch(environmentUrl);
    } else {
      log.warn('Environment JSON URL not available');
    }
  } catch (error) {
    log.error(`Error fetching environments: ${error}`);
  }
}

/**
 * Initialize menu close behavior - close menus when clicking outside
 */
function initializeMenuCloseBehavior(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    // Check if click is outside viewport drawers
    const viewportDrawers = document.getElementsByClassName('viewport-drawer');
    const isInsideDrawer = Array.from(viewportDrawers).some(drawer =>
      drawer.contains(target) || drawer === target
    );

    // Check if click is on a viewport button
    const isViewportButton = target.closest('[id^="viewport-"]') &&
                           (target.tagName === 'BUTTON' || target.closest('button'));

    if (!isInsideDrawer && !isViewportButton) {
      // Close all viewport drawers
      for (let i = 0; i < viewportDrawers.length; i++) {
        (viewportDrawers[i] as HTMLElement).style.display = 'none';
      }
    }

    // Close dropdown menus
    const dropdowns = document.getElementsByClassName('dropdown');
    for (let i = 0; i < dropdowns.length; i++) {
      const dropdown = dropdowns[i] as HTMLElement;
      if (!dropdown.contains(target)) {
        dropdown.classList.remove('is-active');
      }
    }
  });

  log.info('Menu close behavior initialized');
}

/**
 * Main initialization function
 */
export function initializeTopoViewer(): void {
  log.info('Starting TopoViewer initialization...');

  try {
    log.info('Calling initializeGlobalVariables...');
    initializeGlobalVariables();

    log.info('Calling initializeCytoscape...');
    initializeCytoscape();

    log.info('Calling initializeWheelSelection...');
    initializeWheelSelection();

    log.info('Calling initializeGroupManagement...');
    initializeGroupManagement();

    log.info('Calling loadTopologyData...');
    loadTopologyData();

    log.info('Calling initializeResizeHandling...');
    initializeResizeHandling();

    log.info('Calling initializeMenuCloseBehavior...');
    initializeMenuCloseBehavior();

    log.info('TopoViewer initialization complete');
  } catch (error) {
    log.error('Error in initializeTopoViewer: ' + error);
    throw error;
  }
}

// DOM Content Loaded Event Listener
document.addEventListener('DOMContentLoaded', () => {
  try {
    log.info('DOM ready, initializing TopoViewer...');
    initializeHelperFunctions();
    initializeTopoViewer();
    fetchEnvironmentData();

    // Add listener for theme changes from VS Code
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'theme-changed') {
        log.info(`Theme changed - updating logo to: ${message.logoFile}`);
        const logoImg = document.getElementById('nokia-logo-img') as HTMLImageElement;
        if (logoImg) {
          // Get the base images URI from the current src
          const currentSrc = logoImg.src;
          const baseUri = currentSrc.substring(0, currentSrc.lastIndexOf('/') + 1);
          logoImg.src = baseUri + message.logoFile;
          log.info(`Logo updated to: ${logoImg.src}`);
        }
      }
    });
  } catch (error) {
    console.error('Error during TopoViewer initialization:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
});
