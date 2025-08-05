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
    const layoutDrawer = document.getElementById("drawer-layout-algo");
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
    const overviewDrawer = document.getElementById("drawer-topology-overview");
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
 * Initialize global handlers - make functions available globally for onclick handlers
 */
export function initializeGlobalHandlers(): void {
  // Make functions available globally for HTML onclick handlers
  (globalThis as any).showPanelAbout = showPanelAbout;
  (globalThis as any).viewportButtonsZoomToFit = viewportButtonsZoomToFit;
  (globalThis as any).viewportButtonsLayoutAlgo = viewportButtonsLayoutAlgo;
  (globalThis as any).viewportButtonsTopologyOverview = viewportButtonsTopologyOverview;

  log.info('Global UI handlers initialized');
}