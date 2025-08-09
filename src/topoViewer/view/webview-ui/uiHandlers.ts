// uiHandlers.ts - UI event handlers for TopoViewer TypeScript version
// Contains functions referenced by onclick handlers in the HTML template

// Import logger for webview
import { log } from '../../common/logger';
import { VscodeMessageSender } from '../../common/webview-ui/managerVscodeWebview';

// Global message sender instance
let messageSender: VscodeMessageSender | null = null;

// Initialize message sender on first use
function getMessageSender(): VscodeMessageSender {
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

    const layoutManager = (window as any).layoutManager;
    const geoActive = layoutManager?.isGeoMapInitialized && layoutManager.cytoscapeLeafletLeaf;
    if (geoActive) {
      layoutManager.cytoscapeLeafletLeaf.fit();
      log.info('Fitted cytoscape-leaflet map');
    } else {
      // Fit all nodes with padding
      globalThis.cy.fit();
      const currentZoom = globalThis.cy.zoom();
      log.debug(`New zoom level: ${currentZoom}`);
    }
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

    if (!globalThis.cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    // Search for nodes by name or longname
    const matchingNodes = globalThis.cy.nodes().filter((node: any) => {
      const data = node.data();
      const shortName = data.name || '';
      const longName = data.extraData?.longname || '';
      const combined = `${shortName} ${longName}`.toLowerCase();
      return combined.includes(searchTerm.toLowerCase());
    });

    if (matchingNodes.length > 0) {
      // Select matching nodes
      globalThis.cy.elements().unselect();
      matchingNodes.select();

      // Fit to show selected nodes (or entire map if Geo layout active)
      const layoutManager = (window as any).layoutManager;
      if (layoutManager?.isGeoMapInitialized && layoutManager.cytoscapeLeafletLeaf) {
        layoutManager.cytoscapeLeafletLeaf.fit();
      } else {
        globalThis.cy.fit(matchingNodes, 50);
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
    if (!globalThis.cy) {
      log.error('Cytoscape instance not available');
      return;
    }

    // Use cytoscape-svg extension if available
    if (typeof globalThis.cy.svg === 'function') {
      const svgContent = globalThis.cy.svg({ scale: 1, full: true });
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'topology.svg';
      link.click();

      URL.revokeObjectURL(url);
      log.info('Topology exported as SVG');
    } else {
      log.warn('Cytoscape SVG extension not available');
    }
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
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
    if (!globalThis.cy) {
      log.error('Cytoscape instance "cy" is not defined.');
      return;
    }

    // Check if geo-map is active and update geo coordinates
    const layoutManager = (window as any).layoutManager;
    const isGeoActive = layoutManager?.isGeoMapInitialized || false;

    if (isGeoActive && layoutManager && typeof layoutManager.updateNodeGeoCoordinates === 'function') {
      layoutManager.updateNodeGeoCoordinates();
    }

    // Process nodes: update each node's "position" property with the current position
    const updatedNodes = globalThis.cy.nodes().map((node: any) => {
      const nodeJson = node.json();

      // Update position property
      nodeJson.position = node.position();

      // Check if extraData and labels exist before modifying
      if (nodeJson.data?.extraData?.labels) {
        // If in geo map mode, use original positions for graph-posX/Y
        let posX = nodeJson.position.x;
        let posY = nodeJson.position.y;

        if (isGeoActive) {
          const origX = node.data('_origPosX');
          const origY = node.data('_origPosY');
          if (origX !== undefined && origY !== undefined) {
            posX = origX;
            posY = origY;
          }
        }

        nodeJson.data.extraData.labels['graph-posX'] = posX.toString();
        nodeJson.data.extraData.labels['graph-posY'] = posY.toString();

        // Save geo coordinates if available
        const lat = node.data('lat');
        const lng = node.data('lng');
        if (lat !== undefined && lng !== undefined) {
          nodeJson.data.extraData.labels['graph-geoCoordinateLat'] = lat.toString();
          nodeJson.data.extraData.labels['graph-geoCoordinateLng'] = lng.toString();
        }
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
          const parentElement = globalThis.cy.getElementById(parentId);
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

  } catch (error) {
    log.error(`Failed to save topology: ${error}`);
  }
}

/**
 * Connect to a node via SSH using VS Code backend
 */
export async function nodeActionConnectToSSH(): Promise<void> {
  try {
    const nodeName = globalThis.globalSelectedNode;
    if (!nodeName) {
      log.warn('No node selected for SSH connection');
      return;
    }
    const sender = getMessageSender();
    await sender.sendMessageToVscodeEndpointPost('clab-node-connect-ssh', nodeName);
    log.info(`SSH connection requested for node: ${nodeName}`);
  } catch (error) {
    log.error(`nodeActionConnectToSSH failed: ${error}`);
  }
}

/**
 * Attach a shell to the selected node
 */
export async function nodeActionAttachShell(): Promise<void> {
  try {
    const nodeName = globalThis.globalSelectedNode;
    if (!nodeName) {
      log.warn('No node selected to attach shell');
      return;
    }
    const sender = getMessageSender();
    await sender.sendMessageToVscodeEndpointPost('clab-node-attach-shell', nodeName);
    log.info(`Attach shell requested for node: ${nodeName}`);
  } catch (error) {
    log.error(`nodeActionAttachShell failed: ${error}`);
  }
}

/**
 * View logs of the selected node
 */
export async function nodeActionViewLogs(): Promise<void> {
  try {
    const nodeName = globalThis.globalSelectedNode;
    if (!nodeName) {
      log.warn('No node selected to view logs');
      return;
    }
    const sender = getMessageSender();
    await sender.sendMessageToVscodeEndpointPost('clab-node-view-logs', nodeName);
    log.info(`View logs requested for node: ${nodeName}`);
  } catch (error) {
    log.error(`nodeActionViewLogs failed: ${error}`);
  }
}

/**
 * Remove selected node from its parent group
 */
export function nodeActionRemoveFromParent(): void {
  try {
    if (!globalThis.cy || !globalThis.globalSelectedNode) {
      log.warn('Cytoscape instance or selected node not available');
      return;
    }
    const node = globalThis.cy
      .nodes()
      .filter((ele: any) => ele.data('extraData')?.longname === globalThis.globalSelectedNode)[0];
    if (!node) {
      log.warn('Selected node not found in cytoscape');
      return;
    }
    const currentParentId = node.parent().id();
    node.move({ parent: null });
    const formerParentNode = globalThis.cy.getElementById(currentParentId);
    if (formerParentNode && formerParentNode.isChildless()) {
      formerParentNode.remove();
    }
  } catch (error) {
    log.error(`nodeActionRemoveFromParent failed: ${error}`);
  }
}

/**
 * Capture traffic on link endpoints using backend services
 */
export async function linkWireshark(
  _event: Event,
  option: string,
  endpoint: string,
  referenceElementAfterId: string | null
): Promise<void> {
  try {
    if (!globalThis.cy || !globalThis.globalSelectedEdge) {
      log.warn('Cytoscape instance or selected edge not available');
      return;
    }
    const edge = globalThis.cy.getElementById(globalThis.globalSelectedEdge);
    const extra = edge.data('extraData') || {};
    const sourceNode = extra.clabSourceLongName;
    const sourcePort = extra.clabSourcePort;
    const targetNode = extra.clabTargetLongName;
    const targetPort = extra.clabTargetPort;

    let nodeName: string | undefined;
    let interfaceName: string | undefined;
    const sender = getMessageSender();

    switch (option) {
      case 'edgeSharkInterface':
        if (endpoint === 'source') {
          nodeName = sourceNode;
          interfaceName = sourcePort;
        } else if (endpoint === 'target') {
          nodeName = targetNode;
          interfaceName = targetPort;
        }
        if (nodeName && interfaceName) {
          await sender.sendMessageToVscodeEndpointPost('clab-link-capture', { nodeName, interfaceName });
        }
        break;
      case 'edgeSharkSubInterface':
        if (referenceElementAfterId === 'endpoint-a-top') {
          nodeName = sourceNode;
          interfaceName = endpoint;
        } else if (referenceElementAfterId === 'endpoint-b-top') {
          nodeName = targetNode;
          interfaceName = endpoint;
        }
        if (nodeName && interfaceName) {
          await sender.sendMessageToVscodeEndpointPost('clab-link-capture', { nodeName, interfaceName });
        }
        break;
      case 'edgeSharkInterfaceVnc':
        if (endpoint === 'source') {
          nodeName = sourceNode;
          interfaceName = sourcePort;
        } else if (endpoint === 'target') {
          nodeName = targetNode;
          interfaceName = targetPort;
        }
        if (nodeName && interfaceName) {
          await sender.sendMessageToVscodeEndpointPost('clab-link-capture-edgeshark-vnc', { nodeName, interfaceName });
        }
        break;
      case 'edgeSharkSubInterfaceVnc':
        if (referenceElementAfterId === 'endpoint-a-vnc-top') {
          nodeName = sourceNode;
          interfaceName = endpoint;
        } else if (referenceElementAfterId === 'endpoint-b-vnc-top') {
          nodeName = targetNode;
          interfaceName = endpoint;
        }
        if (nodeName && interfaceName) {
          await sender.sendMessageToVscodeEndpointPost('clab-link-capture-edgeshark-vnc', { nodeName, interfaceName });
        }
        break;
      default:
        log.warn(`linkWireshark - Unknown option ${option}`);
        break;
    }
  } catch (error) {
    log.error(`linkWireshark error: ${error}`);
  }
}

/**
 * Initialize global handlers - make functions available globally for onclick handlers
 */
export function initializeGlobalHandlers(): void {
  // Make functions available globally for HTML onclick handlers
  (globalThis as any).showPanelAbout = showPanelAbout;
  (globalThis as any).viewportButtonsZoomToFit = viewportButtonsZoomToFit;
  (globalThis as any).viewportButtonsTopologyOverview = viewportButtonsTopologyOverview;
  (globalThis as any).viewportButtonsLabelEndpoint = viewportButtonsLabelEndpoint;
  (globalThis as any).viewportButtonsReloadTopo = viewportButtonsReloadTopo;
  (globalThis as any).viewportNodeFindEvent = viewportNodeFindEvent;
  (globalThis as any).viewportDrawerCaptureFunc = viewportDrawerCaptureFunc;
  (globalThis as any).viewportButtonsSaveTopo = viewportButtonsSaveTopo;
  (globalThis as any).nodeActionConnectToSSH = nodeActionConnectToSSH;
  (globalThis as any).nodeActionAttachShell = nodeActionAttachShell;
  (globalThis as any).nodeActionViewLogs = nodeActionViewLogs;
  (globalThis as any).nodeActionRemoveFromParent = nodeActionRemoveFromParent;
  (globalThis as any).linkWireshark = linkWireshark;

  log.info('Global UI handlers initialized');
}