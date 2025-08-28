// uiHandlers.ts - UI event handlers for TopoViewer TypeScript version
// Contains functions referenced by onclick handlers in the HTML template

// Import logger for webview
import { log } from '../logging/logger';
import { VscodeMessageSender } from './managerVscodeWebview';
import { exportViewportAsSvg } from './utils';
import topoViewerState from '../state';
import { zoomToFitManager } from '../core/managerRegistry';
import { FilterUtils } from '../../helpers/filterUtils';

// Global message sender instance
let messageSender: VscodeMessageSender | null = null;

// Initialize message sender on first use
function getMessageSender(): VscodeMessageSender {
  if (topoViewerState.editorEngine?.messageSender) {
    return topoViewerState.editorEngine.messageSender;
  }
  if (!messageSender) {
    try {
      messageSender = new VscodeMessageSender(log);
    } catch (error) {
      log.error(`Failed to initialize VscodeMessageSender: ${error}`);
      throw error;
    }
  }
  return messageSender;
}


/**
 * Toggle the About panel
 */
export async function showPanelAbout(): Promise<void> {
  try {
    const aboutPanel = document.getElementById("panel-topoviewer-about");
    if (!aboutPanel) {
      log.error('About panel element not found');
      return;
    }

    // Check if panel is currently visible
    if (aboutPanel.style.display === "block") {
      // Hide the panel
      aboutPanel.style.display = "none";
    } else {
      // Remove all overlay panels first
      const panelOverlays = document.getElementsByClassName("panel-overlay");
      for (let i = 0; i < panelOverlays.length; i++) {
        (panelOverlays[i] as HTMLElement).style.display = "none";
      }

      // Hide shortcuts panel if open
      const shortcutsPanel = document.getElementById('shortcuts-panel');
      if (shortcutsPanel) {
        shortcutsPanel.style.display = 'none';
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
      aboutPanel.style.display = "block";
    }
  } catch (error) {
    log.error(`Error toggling about panel: ${error}`);
  }
}

/**
 * Zoom to fit all nodes in the viewport
 */
export function viewportButtonsZoomToFit(): void {
  try {
    if (!topoViewerState.cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    zoomToFitManager.viewportButtonsZoomToFit(topoViewerState.cy);
  } catch (error) {
    log.error(`Error in zoom to fit: ${error}`);
  }
}


/**
 * Show/hide topology overview panel
 */
export function viewportButtonsTopologyOverview(): void {
  try {
    const overviewDrawer = document.getElementById("viewport-drawer-topology-overview");
    if (!overviewDrawer) {
      log.warn('Topology overview drawer not found');
      return;
    }

    // Toggle visibility
    if (overviewDrawer.style.display === "block") {
      overviewDrawer.style.display = "none";
    } else {
      // Hide all viewport drawers first
      const viewportDrawer = document.getElementsByClassName("viewport-drawer");
      for (let i = 0; i < viewportDrawer.length; i++) {
        (viewportDrawer[i] as HTMLElement).style.display = "none";
      }
      // Show the topology overview drawer
      overviewDrawer.style.display = "block";
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
    topoViewerState.linkEndpointVisibility = !topoViewerState.linkEndpointVisibility;

    const cy = topoViewerState.cy;

    if (cy) {
      // Trigger style update if loadCytoStyle is available
      if (typeof (globalThis as any).loadCytoStyle === 'function') {
        (globalThis as any).loadCytoStyle(cy);
      }
    }

    log.info(`Endpoint label visibility toggled to: ${topoViewerState.linkEndpointVisibility}`);
  } catch (error) {
    log.error(`Error toggling endpoint labels: ${error}`);
  }
}

/**
 * Reload the topology by requesting fresh data from the VS Code extension backend.
 */
export async function viewportButtonsReloadTopo(): Promise<void> {
  try {
    const sender = getMessageSender();
    await sender.sendMessageToVscodeEndpointPost('reload-viewport', 'Empty Payload');
    log.info('Reload viewport request sent');
  } catch (error) {
    log.error(`Error reloading topology: ${error}`);
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

    if (!topoViewerState.cy) {
      log.error('Cytoscape instance not available');
      return;
    }
    const cy = topoViewerState.cy;

    const filter = FilterUtils.createFilter(searchTerm);

    // Search for nodes by name or longname
    const matchingNodes = cy.nodes().filter((node: any) => {
      const data = node.data();
      const shortName = data.name || '';
      const longName = data.extraData?.longname || '';
      const combined = `${shortName} ${longName}`;
      return filter(combined);
    });

    if (matchingNodes.length > 0) {
      // Select matching nodes
      cy.elements().unselect();
      matchingNodes.select();

      // Fit to show selected nodes (or entire map if Geo layout active)
      const layoutManager = window.layoutManager;
      if (layoutManager?.isGeoMapInitialized && layoutManager.cytoscapeLeafletLeaf) {
        layoutManager.cytoscapeLeafletLeaf.fit();
      } else {
        cy.fit(matchingNodes, 50);
      }

      log.info(`Found ${matchingNodes.length} nodes matching: ${searchTerm}`);
    } else {
      log.warn(`No nodes found matching: ${searchTerm}`);
    }
  } catch (error) {
    log.error(`Error in node search: ${error}`);
  }
}

/**
 * Handle capture/screenshot functionality
 */
export function viewportDrawerCaptureFunc(event: Event): void {
  event.preventDefault();
  try {
    if (!topoViewerState.cy) {
      log.error('Cytoscape instance not available');
      return;
    }
    const cy = topoViewerState.cy;
    exportViewportAsSvg(cy);
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
  }
}

/**
 * Capture viewport as SVG - called by the navbar button
 */
export function viewportButtonsCaptureViewportAsSvg(): void {
  try {
    if (!topoViewerState.cy) {
      log.error('Cytoscape instance not available for SVG capture');
      return;
    }
    const cy = topoViewerState.cy;
    exportViewportAsSvg(cy);
    log.info('Viewport captured as SVG');
  } catch (error) {
    log.error(`Error capturing viewport as SVG: ${error}`);
  }
}

/**
 * Save topology data back to the backend
 * Updates node positions and group information before saving
 */
export async function viewportButtonsSaveTopo(): Promise<void> {
  try {
    log.info('viewportButtonsSaveTopo triggered');

    // Ensure Cytoscape instance is available
    if (!topoViewerState.cy) {
      log.error('Cytoscape instance "cy" is not defined.');
      return;
    }
    const cy = topoViewerState.cy;

    // Check if geo-map is active and update geo coordinates
    const layoutManager = window.layoutManager;
    const isGeoActive = layoutManager?.isGeoMapInitialized || false;

    if (isGeoActive && layoutManager && typeof layoutManager.updateNodeGeoCoordinates === 'function') {
      layoutManager.updateNodeGeoCoordinates();
    }

    // Process nodes: update each node's "position" property with the current position
    const updatedNodes = cy.nodes().map((node: any) => {
      const nodeJson = node.json();

      // Update position property
      let posX = node.position().x;
      let posY = node.position().y;
      if (isGeoActive) {
        const origX = node.data('_origPosX');
        const origY = node.data('_origPosY');
        if (origX !== undefined && origY !== undefined) {
          posX = origX;
          posY = origY;
        }
      }
      nodeJson.position = { x: posX, y: posY };

      // Save geo coordinates if available
      const lat = node.data('lat');
      const lng = node.data('lng');
      if (lat !== undefined && lng !== undefined) {
        nodeJson.data = nodeJson.data || {};
        nodeJson.data.lat = lat.toString();
        nodeJson.data.lng = lng.toString();
      }

      // Update parent property
      const parentId = node.parent().id();
      if (parentId) {
        nodeJson.parent = parentId;

        // Check if extraData and labels exist before modifying
        if (nodeJson.data?.extraData?.labels) {
          const parentParts = parentId.split(':');
          if (parentParts.length >= 2) {
            nodeJson.data.extraData.labels['graph-group'] = parentParts[0];
            nodeJson.data.extraData.labels['graph-level'] = parentParts[1];
          }

          // Get label position from parent's classes
          const validLabelClasses = [
            'top-center',
            'top-left',
            'top-right',
            'bottom-center',
            'bottom-left',
            'bottom-right'
          ];

          // Get the parent's classes as array
          const parentElement = cy.getElementById(parentId);
          if (parentElement) {
            const parentClasses = parentElement.classes();

            // Filter the classes so that only valid entries remain
            const validParentClasses = parentClasses.filter((cls: string) => validLabelClasses.includes(cls));

            // Assign only the first valid class, or an empty string if none exists
            nodeJson.data.groupLabelPos = validParentClasses.length > 0 ? validParentClasses[0] : '';
          }
        }
      }

      return nodeJson;
    });

    // Send updated topology data to backend
    const sender = getMessageSender();
    const response = await sender.sendMessageToVscodeEndpointPost('topo-viewport-save', updatedNodes);
    log.info(`Topology saved successfully: ${JSON.stringify(response)}`);

    // Also save free text annotations in view mode
    // Filter out only the free text nodes from the updated nodes
    const freeTextNodes = updatedNodes.filter((node: any) =>
      node.data && node.data.topoViewerRole === 'freeText'
    );
    const groupStyles = topoViewerState.editorEngine?.groupStyleManager?.getGroupStyles() || [];

    if (freeTextNodes.length > 0 || groupStyles.length > 0) {
      if (freeTextNodes.length > 0) {
        log.info(`Found ${freeTextNodes.length} free text nodes to save as annotations`);
      }

      // Convert free text nodes to annotations format
      const annotations = freeTextNodes.map((node: any) => {
        const data = node.data.freeTextData || {};
        return {
          id: node.data.id,
          text: node.data.name || '',
          position: node.position || { x: 0, y: 0 },
          fontSize: data.fontSize || 14,
          fontColor: data.fontColor || '#FFFFFF',
          backgroundColor: data.backgroundColor || 'transparent',
          fontWeight: data.fontWeight || 'normal',
          fontStyle: data.fontStyle || 'normal',
          textDecoration: data.textDecoration || 'none',
          fontFamily: data.fontFamily || 'monospace'
        };
      });

      // Send annotations and group styles to backend for saving
      const annotationResponse = await sender.sendMessageToVscodeEndpointPost(
        'topo-editor-save-annotations',
        { annotations, groupStyles }
      );
      log.info(`Annotations save response: ${JSON.stringify(annotationResponse)}`);

      // Reapply group styles after saving to maintain visual consistency
      if (topoViewerState.editorEngine?.groupStyleManager) {
        groupStyles.forEach((style: any) => {
          topoViewerState.editorEngine.groupStyleManager.applyStyleToNode(style.id);
        });
        log.info('Reapplied group styles after save');
      }
    } else {
      log.info('No annotations to save');
    }

  } catch (error) {
    log.error(`Failed to save topology: ${error}`);
  }
}

/**
 * Toggle split view with YAML editor
 */
export async function viewportButtonsToggleSplit(event?: Event): Promise<void> {
  if (event) {
    event.preventDefault();
  }

  try {
    const sender = getMessageSender();
    await sender.sendMessageToVscodeEndpointPost('topo-toggle-split-view', {});
    log.info('Split view toggle requested');
  } catch (error) {
    log.error(`Failed to toggle split view: ${error}`);
  }
}

/**
 * Initialize global handlers - make functions available globally for onclick handlers
 */
export function initializeGlobalHandlers(): void {
  // Make functions available globally for HTML onclick handlers
  (globalThis as any).showPanelAbout = showPanelAbout;
  // Override the save handler for view mode to include annotation saving
  (globalThis as any).viewportButtonsSaveTopo = viewportButtonsSaveTopo;
  // Note: Most viewport button handlers are now managed by TopologyWebviewController
  // Only set view-specific handlers here that are not provided by the controller
  (globalThis as any).viewportNodeFindEvent = viewportNodeFindEvent;
  (globalThis as any).viewportDrawerCaptureFunc = viewportDrawerCaptureFunc;
  (globalThis as any).viewportButtonsToggleSplit = viewportButtonsToggleSplit;

  log.info('Global UI handlers initialized');
}
