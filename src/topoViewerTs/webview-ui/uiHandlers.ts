// uiHandlers.ts - UI event handlers for TopoViewer TypeScript version
// Contains functions referenced by onclick handlers in the HTML template

// Import logger for webview
import { log } from './logger';

/**
 * Show the About panel
 */
export async function showPanelAbout(): Promise<void> {
  try {
    // Remove all overlay panels first
    const panelOverlays = document.getElementsByClassName("panel-overlay");
    for (let i = 0; i < panelOverlays.length; i++) {
      (panelOverlays[i] as HTMLElement).style.display = "none";
    }

    // Get environment data if available
    let environments: any = null;
    try {
      if (typeof (globalThis as any).getEnvironments === 'function') {
        environments = await (globalThis as any).getEnvironments();
      }
    } catch (error) {
      log.warn(`Could not load environment data for about panel: ${error}`);
    }

    if (environments) {
      log.debug('Environment data loaded for about panel');
      const topoViewerVersion = environments["topoviewer-version"];
      log.info(`TopoViewer version: ${topoViewerVersion}`);
    }

    // Show the about panel
    const aboutPanel = document.getElementById("panel-topoviewer-about");
    if (aboutPanel) {
      aboutPanel.style.display = "block";
    } else {
      log.error('About panel element not found');
    }
  } catch (error) {
    log.error(`Error showing about panel: ${error}`);
  }
}

/**
 * Zoom to fit all nodes in the viewport
 */
export function viewportButtonsZoomToFit(): void {
  try {
    if (!globalThis.cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    const initialZoom = globalThis.cy.zoom();
    log.debug(`Initial zoom level: ${initialZoom}`);

    // Fit all nodes with padding
    globalThis.cy.fit();

    const currentZoom = globalThis.cy.zoom();
    log.debug(`New zoom level: ${currentZoom}`);

    // If cytoscape-leaflet is available, fit it too
    if (globalThis.globalCytoscapeLeafletLeaf && typeof globalThis.globalCytoscapeLeafletLeaf.fit === 'function') {
      globalThis.globalCytoscapeLeafletLeaf.fit();
      log.info('Fitted cytoscape-leaflet map');
    }
  } catch (error) {
    log.error(`Error in zoom to fit: ${error}`);
  }
}

/**
 * Show/hide layout algorithm panel
 */
export function viewportButtonsLayoutAlgo(): void {
  try {
    const viewportDrawer = document.getElementsByClassName("viewport-drawer");

    // Hide all viewport drawers first
    for (let i = 0; i < viewportDrawer.length; i++) {
      (viewportDrawer[i] as HTMLElement).style.display = "none";
    }

    // Show the layout drawer
    const layoutDrawer = document.getElementById("viewport-drawer-layout");
    if (layoutDrawer) {
      layoutDrawer.style.display = "block";
    } else {
      log.warn('Layout algorithm drawer not found');
    }
  } catch (error) {
    log.error(`Error in layout algorithm button: ${error}`);
  }
}

/**
 * Show/hide topology overview panel
 */
export function viewportButtonsTopologyOverview(): void {
  try {
    const viewportDrawer = document.getElementsByClassName("viewport-drawer");

    // Hide all viewport drawers first
    for (let i = 0; i < viewportDrawer.length; i++) {
      (viewportDrawer[i] as HTMLElement).style.display = "none";
    }

    // Show the topology overview drawer
    const overviewDrawer = document.getElementById("viewport-drawer-topology-overview");
    if (overviewDrawer) {
      overviewDrawer.style.display = "block";
    } else {
      log.warn('Topology overview drawer not found');
    }
  } catch (error) {
    log.error(`Error in topology overview button: ${error}`);
  }
}

/**
 * Toggle endpoint label visibility
 */
export function viewportButtonsLabelEndpoint(): void {
  try {
    globalThis.globalLinkEndpointVisibility = !globalThis.globalLinkEndpointVisibility;

    if (globalThis.cy) {
      // Trigger style update if loadCytoStyle is available
      if (typeof (globalThis as any).loadCytoStyle === 'function') {
        (globalThis as any).loadCytoStyle(globalThis.cy);
      }
    }

    log.info(`Endpoint label visibility toggled to: ${globalThis.globalLinkEndpointVisibility}`);
  } catch (error) {
    log.error(`Error toggling endpoint labels: ${error}`);
  }
}

/**
 * Search for nodes in the topology
 */
export function viewportNodeFindEvent(): void {
  try {
    const searchInput = document.getElementById('viewport-drawer-topology-overview-content-edit') as HTMLInputElement;
    if (!searchInput) {
      log.error('Search input element not found');
      return;
    }

    const searchTerm = searchInput.value.trim();
    if (!searchTerm) {
      log.warn('No search term entered');
      return;
    }

    if (!globalThis.cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    // Search for nodes by label
    const matchingNodes = globalThis.cy.nodes().filter((node: any) => {
      const label = node.data('label') || '';
      return label.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (matchingNodes.length > 0) {
      // Select matching nodes
      globalThis.cy.elements().unselect();
      matchingNodes.select();

      // Fit to show selected nodes
      globalThis.cy.fit(matchingNodes, 50);

      log.info(`Found ${matchingNodes.length} nodes matching: ${searchTerm}`);
    } else {
      log.warn(`No nodes found matching: ${searchTerm}`);
    }
  } catch (error) {
    log.error(`Error in node search: ${error}`);
  }
}

/**
 * Initialize global handlers - make functions available globally for onclick handlers
 */
export function initializeGlobalHandlers(): void {
  // Make functions available globally for HTML onclick handlers
  (globalThis as any).showPanelAbout = showPanelAbout;
  (globalThis as any).viewportButtonsZoomToFit = viewportButtonsZoomToFit;
  (globalThis as any).viewportButtonsLayoutAlgo = viewportButtonsLayoutAlgo;
  (globalThis as any).viewportButtonsTopologyOverview = viewportButtonsTopologyOverview;
  (globalThis as any).viewportButtonsLabelEndpoint = viewportButtonsLabelEndpoint;
  (globalThis as any).viewportNodeFindEvent = viewportNodeFindEvent;

  log.info('Global UI handlers initialized');
}