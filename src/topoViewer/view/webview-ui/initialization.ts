// initialization.ts - Main initialization module for TopoViewer TypeScript
// This module replaces the initialization logic that was in dev.js

import { log } from '../../common/logging/webviewLogger';
import type { ManagerGroupManagement } from '../../common/webview-ui/managerGroupManagement';
import type { ManagerLayoutAlgo } from '../../common/webview-ui/managerLayoutAlgo';
import { layoutAlgoManager, getGroupManager } from '../../common/core/managerRegistry';
import { registerCyEventHandlers } from '../../common/webview-ui/cyEventHandlers';
import topoViewerState, { resetState } from '../../common/webview-ui/state';
import { createCytoscapeInstance } from '../../common/topoViewerEngineFactory';

// loadCytoStyle function will be called if available

let groupManager: ManagerGroupManagement;

// Reset shared state - moved inside DOMContentLoaded to avoid immediate execution
function initializeState(): void {
  resetState();
}

/**
 * Initialize Cytoscape instance and load topology data
 */
function initializeCytoscape(): void {
  const container = document.getElementById("cy");
  log.info('Cytoscape container element: ' + container);

  if (!container) {
    log.error('Could not find cytoscape container element with id "cy"');
    return;
  }

  try {
    topoViewerState.cy = createCytoscapeInstance(container);
    const cy = topoViewerState.cy!;

    log.info('Cytoscape instance created successfully');
    log.info('Cytoscape instance: ' + cy);
    registerCustomZoom();
  } catch (error) {
    log.error('Failed to create cytoscape instance: ' + error);
    throw error;
  }

  // Add selection event listeners
  const cy = topoViewerState.cy!;
  cy.on('select', 'node', () => {
    const selectedNodes = cy.$('node:selected');
    selectedNodes.style({
      'border-width': 1,
      'border-color': '#ff0000'
    });
    log.debug(`Selected nodes: ${selectedNodes.map((n: any) => n.id()).join(', ')}`);
  });

  cy.on('unselect', 'node', () => {
    if (typeof (globalThis as any).loadCytoStyle === 'function') {
      (globalThis as any).loadCytoStyle(cy);
    }
    log.debug(`Remaining selected nodes: ${cy.$('node:selected').map((n: any) => n.id()).join(', ')}`);
  });

  cy.on('select', 'edge', () => {
    const selectedEdges = cy.$('edge:selected');
    selectedEdges.style({
      'line-color': '#ff0000',
      'width': 1.5
    });
    log.debug(`Selected edges: ${selectedEdges.map((e: any) => e.id()).join(', ')}`);
  });

  cy.on('unselect', 'edge', () => {
    if (typeof (globalThis as any).loadCytoStyle === 'function') {
      (globalThis as any).loadCytoStyle(cy);
    }
    log.debug(`Remaining selected edges: ${cy.$('edge:selected').map((e: any) => e.id()).join(', ')}`);
  });

    registerCyEventHandlers({
      cy,
      onNodeClick: async (event: any) => {
        const node = event.target;
        topoViewerState.nodeClicked = true;
        log.info(`Node clicked: ${node.id()}`);
        const extraData = node.data("extraData") || {};
        const originalEvent = event.originalEvent as MouseEvent;
        if (node.isParent() || node.data('topoViewerRole') === 'group') {
          groupManager.showGroupEditor(node);
          return;
        }
        if (node.data("topoViewerRole") === "textbox" || node.data("topoViewerRole") === "dummyChild") {
          return;
        }
        if (!originalEvent.altKey && !originalEvent.ctrlKey && !originalEvent.shiftKey) {
          const panelOverlays = document.getElementsByClassName("panel-overlay");
          Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");
          const panelNode = document.getElementById("panel-node");
          if (panelNode) {
            panelNode.style.display = panelNode.style.display === "none" ? "block" : "none";
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
            topoViewerState.selectedNode = extraData.longname || node.id();
            log.info(`Global selected node: ${topoViewerState.selectedNode}`);
          }
        }
      },
      onEdgeClick: async (event: any) => {
        const edge = event.target;
        topoViewerState.edgeClicked = true;
        log.info(`Edge clicked: ${edge.id()}`);
        const panelOverlays = document.getElementsByClassName("panel-overlay");
        Array.from(panelOverlays).forEach(panel => (panel as HTMLElement).style.display = "none");
        const defaultEdgeColor = "#969799";
        if (edge.data("editor") === "true") {
          edge.style("line-color", "#32CD32");
        } else {
          edge.style("line-color", "#0043BF");
        }
        cy.edges().forEach((e: any) => {
          if (e !== edge) {
            e.style("line-color", defaultEdgeColor);
          }
        });
        const panelLink = document.getElementById("panel-link");
        if (panelLink) {
          panelLink.style.display = "block";
          const extraData = edge.data("extraData") || {};
          const linkNameEl = document.getElementById("panel-link-name");
          if (linkNameEl) {
            linkNameEl.innerHTML = `┌ ${edge.data("source")} :: ${edge.data("sourceEndpoint") || ""}<br>└ ${edge.data("target")} :: ${edge.data("targetEndpoint") || ""}`;
          }
          const endpointANameEl = document.getElementById("panel-link-endpoint-a-name");
          if (endpointANameEl) {
            endpointANameEl.textContent = `${edge.data("source")} :: ${edge.data("sourceEndpoint") || ""}`;
          }
          const endpointAMacEl = document.getElementById("panel-link-endpoint-a-mac-address");
          if (endpointAMacEl) {
            endpointAMacEl.textContent = extraData.clabSourceMacAddress || "N/A";
          }
          const endpointAMtuEl = document.getElementById("panel-link-endpoint-a-mtu");
          if (endpointAMtuEl) {
            endpointAMtuEl.textContent = extraData.clabSourceMtu || "N/A";
          }
          const endpointATypeEl = document.getElementById("panel-link-endpoint-a-type");
          if (endpointATypeEl) {
            endpointATypeEl.textContent = extraData.clabSourceType || "N/A";
          }
          const endpointBNameEl = document.getElementById("panel-link-endpoint-b-name");
          if (endpointBNameEl) {
            endpointBNameEl.textContent = `${edge.data("target")} :: ${edge.data("targetEndpoint") || ""}`;
          }
          const endpointBMacEl = document.getElementById("panel-link-endpoint-b-mac-address");
          if (endpointBMacEl) {
            endpointBMacEl.textContent = extraData.clabTargetMacAddress || "N/A";
          }
          const endpointBMtuEl = document.getElementById("panel-link-endpoint-b-mtu");
          if (endpointBMtuEl) {
            endpointBMtuEl.textContent = extraData.clabTargetMtu || "N/A";
          }
          const endpointBTypeEl = document.getElementById("panel-link-endpoint-b-type");
          if (endpointBTypeEl) {
            endpointBTypeEl.textContent = extraData.clabTargetType || "N/A";
          }
          topoViewerState.selectedEdge = edge.data("id");
          log.info(`Global selected edge: ${topoViewerState.selectedEdge}`);
          log.debug(`Edge extraData: ${JSON.stringify(extraData)}`);
        }
      },
      onCanvasClick: () => {
        if (!topoViewerState.nodeClicked && !topoViewerState.edgeClicked) {
          const panelOverlays = document.getElementsByClassName('panel-overlay');
          for (let i = 0; i < panelOverlays.length; i++) {
            (panelOverlays[i] as HTMLElement).style.display = 'none';
          }
          const viewportDrawer = document.getElementsByClassName('viewport-drawer');
          for (let i = 0; i < viewportDrawer.length; i++) {
            (viewportDrawer[i] as HTMLElement).style.display = 'none';
          }
        }
        topoViewerState.nodeClicked = false;
        topoViewerState.edgeClicked = false;
      }
    });

  // Apply initial styles
  if (typeof (globalThis as any).loadCytoStyle === 'function') {
    (globalThis as any).loadCytoStyle(cy);
  }

  // Add container click handler to manage panel visibility
  const cyContainer = document.getElementById("cy");
  if (cyContainer) {
    cyContainer.addEventListener("click", () => {
      log.debug("cy container clicked");
      log.debug(`nodeClicked: ${topoViewerState.nodeClicked}`);
      log.debug(`edgeClicked: ${topoViewerState.edgeClicked}`);

      // Execute toggle logic only when no node or edge was clicked
      if (!topoViewerState.nodeClicked && !topoViewerState.edgeClicked) {
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
      topoViewerState.nodeClicked = false;
      topoViewerState.edgeClicked = false;
    });
  }

  log.info('Cytoscape instance initialized successfully');
}

function registerCustomZoom(): void {
  const cy = topoViewerState.cy;
  if (!cy) return;
  cy.userZoomingEnabled(false);
  const container = cy.container();
  if (container) {
    container.addEventListener('wheel', handleCustomWheel, { passive: false });
  }
}

function handleCustomWheel(event: WheelEvent): void {
  const cy = topoViewerState.cy;
  if (!cy) return;
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
  const newZoom = cy.zoom() * factor;
  cy.zoom({
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
    const cytoscapeUrl = window.jsonFileUrlDataCytoMarshall;

    if (!cytoscapeUrl) {
      log.error('Cytoscape JSON URL is missing');
      return;
    }

    const response = await fetch(cytoscapeUrl);
    const cytoData = await response.json();
    log.debug(`Loaded cytoscape data with ${cytoData.nodes?.length || 0} nodes and ${cytoData.edges?.length || 0} edges`);

    // Load topology into cytoscape
    if (topoViewerState.cy) {
      const cy = topoViewerState.cy;
      cy.elements().remove();
      cy.add(cytoData);

      let usePreset = false;
      try {
        const environments = await (globalThis as any).getEnvironments?.();
        usePreset = environments?.['topoviewer-layout-preset'] === 'true';
      } catch (err) {
        log.warn(`Could not determine preset layout preference: ${err}`);
      }

      if (usePreset) {
        log.info('Applying preset layout from labels');
        cy.layout({ name: 'preset' }).run();
      } else {
        const layout = cy.layout({
          name: 'cola',
          nodeSpacing: () => 5,
          edgeLength: () => 100,
          animate: true,
          randomize: false,
          maxSimulationTime: 1500
        } as any);
        layout.run();
      }

      const layoutManager = window.layoutManager;
      if (layoutManager?.isGeoMapInitialized && layoutManager.cytoscapeLeafletLeaf) {
        layoutManager.cytoscapeLeafletLeaf.fit();
      } else {
        cy.fit();
      }

      // Apply styles after loading data
      if (typeof (globalThis as any).loadCytoStyle === 'function') {
        (globalThis as any).loadCytoStyle(cy);
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
 * Update topology data without reloading the page
 * This preserves the current layout and only updates element properties
 */
function updateTopologyData(cytoData: any): void {
  try {
    const cy = topoViewerState.cy;
    if (!cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    log.debug(`Updating topology with ${cytoData.length || 0} elements`);

    // Check if geo-map is active
    const geoLayoutManager = window.layoutManager;
    const isGeoActive = geoLayoutManager?.isGeoMapInitialized || false;

    if (isGeoActive) {
      log.debug('Geo-map is active, preserving geo positions during update');
    }

    // Store current positions to preserve layout (only for non-geo mode)
    const positions = new Map();
    if (!isGeoActive) {
      cy.nodes().forEach((node: any) => {
        positions.set(node.id(), node.position());
      });
    }

    // Update edges - this is where link states change
    cytoData.forEach((element: any) => {
      if (element.group === 'edges') {
        const edge = cy.getElementById(element.data.id);
        if (edge.length > 0) {
          // Update edge classes (link-up or link-down)
          edge.classes(element.classes || '');
          // Update edge data (includes interface states)
          edge.data(element.data);
        }
      } else if (element.group === 'nodes') {
        const node = cy.getElementById(element.data.id);
        if (node.length > 0) {
          // Preserve lat/lng coordinates if geo-map is active
          const currentLat = node.data('lat');
          const currentLng = node.data('lng');

          // Update node data while preserving position
          node.data(element.data);

          // Restore lat/lng if geo-map is active and they were present
          if (isGeoActive && currentLat !== undefined && currentLng !== undefined) {
            node.data('lat', currentLat);
            node.data('lng', currentLng);
          }
        }
      }
    });

    // Restore positions to prevent layout shift (only for non-geo mode)
    if (!isGeoActive) {
      positions.forEach((pos, id) => {
        const node = cy.getElementById(id);
        if (node.length > 0) {
          node.position(pos);
        }
      });
    } else {
      // In geo mode, let cytoscape-leaflet maintain positions based on lat/lng
      // The plugin will automatically sync positions with the geographic coordinates
      log.debug('Geo-map active: positions maintained by cytoscape-leaflet plugin');
    }

    // Re-apply styles to ensure colors are updated
    // But only if geo-map is not active (geo-map uses light theme)
    const currentLayoutManager = window.layoutManager;
    const geoMapActive = currentLayoutManager?.isGeoMapInitialized || false;

    if (!geoMapActive && typeof (globalThis as any).loadCytoStyle === 'function') {
      (globalThis as any).loadCytoStyle(cy);
    } else if (geoMapActive) {
      // If geo-map is active, reapply the scale to ensure nodes remain visible
      if (currentLayoutManager && typeof currentLayoutManager.applyGeoScale === 'function') {
        const factor = currentLayoutManager.calculateGeoScale();
        currentLayoutManager.applyGeoScale(true, factor);
      }
    }

    log.info('Topology updated successfully without layout change');
  } catch (error) {
    log.error(`Error updating topology data: ${error}`);
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
        const cy = topoViewerState.cy;
        if (cy) {
          cy.resize();
          log.debug('Fitting Cytoscape to new size with animation');
          const layoutManager = window.layoutManager;
          if (layoutManager?.isGeoMapInitialized && layoutManager.cytoscapeLeafletLeaf) {
            layoutManager.cytoscapeLeafletLeaf.fit();
          } else {
            cy.fit(undefined, 50);
          }
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
      const environmentUrl = window.jsonFileUrlDataEnvironment;
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
    const environmentUrl = window.jsonFileUrlDataEnvironment;
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
    log.info('Calling initializeState...');
    initializeState();

    log.info('Calling initializeCytoscape...');
    initializeCytoscape();

    log.info('Initializing layout manager...');
    const layoutManager: ManagerLayoutAlgo = layoutAlgoManager;
    // Make layoutManager globally accessible for update handling
    window.layoutManager = layoutManager;
    window.layoutAlgoChange = layoutManager.layoutAlgoChange.bind(layoutManager);
    window.viewportButtonsLayoutAlgo = layoutManager.viewportButtonsLayoutAlgo.bind(layoutManager);
    window.viewportDrawerLayoutGeoMap = layoutManager.viewportDrawerLayoutGeoMap.bind(layoutManager);
    window.viewportDrawerLayoutForceDirected = layoutManager.viewportDrawerLayoutForceDirected.bind(layoutManager);
    window.viewportDrawerLayoutForceDirectedRadial = layoutManager.viewportDrawerLayoutForceDirectedRadial.bind(layoutManager);
    window.viewportDrawerLayoutVertical = layoutManager.viewportDrawerLayoutVertical.bind(layoutManager);
    window.viewportDrawerLayoutHorizontal = layoutManager.viewportDrawerLayoutHorizontal.bind(layoutManager);
    window.viewportDrawerPreset = layoutManager.viewportDrawerPreset.bind(layoutManager);
    window.viewportButtonsGeoMapPan = layoutManager.viewportButtonsGeoMapPan.bind(layoutManager);
    window.viewportButtonsGeoMapEdit = layoutManager.viewportButtonsGeoMapEdit.bind(layoutManager);

    groupManager = getGroupManager(topoViewerState.cy!, 'view');
    groupManager.initializeWheelSelection();
    groupManager.initializeGroupManagement();

    window.orphaningNode = groupManager.orphaningNode.bind(groupManager);
    window.createNewParent = groupManager.createNewParent.bind(groupManager);
    window.panelNodeEditorParentToggleDropdown = groupManager.panelNodeEditorParentToggleDropdown.bind(groupManager);
    window.nodeParentPropertiesUpdate = groupManager.nodeParentPropertiesUpdate.bind(groupManager);
    window.nodeParentPropertiesUpdateClose = groupManager.nodeParentPropertiesUpdateClose.bind(groupManager);
    window.nodeParentRemoval = groupManager.nodeParentRemoval.bind(groupManager);
    window.viewportButtonsAddGroup = groupManager.viewportButtonsAddGroup.bind(groupManager);
    window.showPanelGroupEditor = groupManager.showGroupEditor.bind(groupManager);

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

    // Add listener for messages from VS Code
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
      } else if (message && message.type === 'updateTopology') {
        log.info('Received topology update from VS Code');
        updateTopologyData(message.data);
      }
    });
  } catch (error) {
    console.error('Error during TopoViewer initialization:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
  }
});
