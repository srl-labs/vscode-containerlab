// uiHandlers.ts - UI event handlers for TopoViewer TypeScript version
// Contains functions referenced by onclick handlers in the HTML template

// Import logger for webview
import { log } from '../logging/logger';
import { VscodeMessageSender } from './managerVscodeWebview';
import { exportViewportAsSvg } from './utils';
import topoViewerState from '../state';
import { zoomToFitManager } from '../core/managerRegistry';
import { FilterUtils } from '../../helpers/filterUtils';
import { updateNodePosition, handleGeoData } from './nodeUtils';

// Common class and display constants
const CLASS_PANEL_OVERLAY = 'panel-overlay' as const;
const CLASS_VIEWPORT_DRAWER = 'viewport-drawer' as const;
const DISPLAY_BLOCK = 'block' as const;
const DISPLAY_NONE = 'none' as const;
const ERR_NO_CY = 'Cytoscape instance not available' as const;

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
    if (aboutPanel.style.display === DISPLAY_BLOCK) {
      // Hide the panel
      aboutPanel.style.display = DISPLAY_NONE;
    } else {
      // Remove all overlay panels first
      const panelOverlays = document.getElementsByClassName(CLASS_PANEL_OVERLAY);
      for (let i = 0; i < panelOverlays.length; i++) {
        (panelOverlays[i] as HTMLElement).style.display = DISPLAY_NONE;
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
      aboutPanel.style.display = DISPLAY_BLOCK;
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
      log.error(ERR_NO_CY);
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
    if (overviewDrawer.style.display === DISPLAY_BLOCK) {
      overviewDrawer.style.display = DISPLAY_NONE;
    } else {
      // Hide all viewport drawers first
      const viewportDrawer = document.getElementsByClassName(CLASS_VIEWPORT_DRAWER);
      for (let i = 0; i < viewportDrawer.length; i++) {
        (viewportDrawer[i] as HTMLElement).style.display = DISPLAY_NONE;
      }
      // Show the topology overview drawer
      overviewDrawer.style.display = DISPLAY_BLOCK;
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
function getTopologySearchInput(): HTMLInputElement | null {
  let searchInput = document.getElementById(
    'viewport-drawer-topology-overview-content-edit'
  ) as HTMLInputElement | null;
  if (!searchInput) {
    const container = document.getElementById(
      'viewport-drawer-topology-overview-content'
    );
    if (container) {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative';

      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.id = 'viewport-drawer-topology-overview-content-edit';
      searchInput.placeholder = 'Search for nodes ...';
      searchInput.className = 'input-field pl-8 pr-3 text-sm';

      const icon = document.createElement('span');
      icon.className = 'absolute left-2 top-1/2 transform -translate-y-1/2';
      icon.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';

      wrapper.appendChild(searchInput);
      wrapper.appendChild(icon);

      container.prepend(wrapper);
    }
  }
  return searchInput;
}

export function viewportNodeFindEvent(): void {
  try {
    const searchInput = getTopologySearchInput();
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
      log.error(ERR_NO_CY);
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
export async function viewportDrawerCaptureFunc(event: Event): Promise<void> {
  event.preventDefault();
  try {
    if (!topoViewerState.cy) {
      log.error(ERR_NO_CY);
      return;
    }

    const borderZoomInput = document.getElementById('export-border-zoom') as HTMLInputElement | null;
    const borderPaddingInput = document.getElementById('export-border-padding') as HTMLInputElement | null;

    const borderZoom = borderZoomInput ? parseFloat(borderZoomInput.value) : 100;
    const borderPadding = borderPaddingInput ? parseFloat(borderPaddingInput.value) : 0;

    await exportViewportAsSvg(topoViewerState.cy, {
      borderZoom,
      borderPadding
    });

    const panel = document.getElementById('viewport-drawer-capture-sceenshoot');
    if (panel) {
      panel.style.display = 'none';
    }
  } catch (error) {
    log.error(`Error capturing topology: ${error}`);
  }
}

/**
 * Capture viewport as SVG - called by the navbar button
 */
export function viewportButtonsCaptureViewportAsSvg(): void {
  const panel = document.getElementById('viewport-drawer-capture-sceenshoot');
  if (!panel) return;

  // Hide other viewport drawers
  const drawers = document.getElementsByClassName('viewport-drawer');
  for (let i = 0; i < drawers.length; i++) {
    (drawers[i] as HTMLElement).style.display = 'none';
  }

  panel.style.display = 'block';
}


function applyParentData(node: any, nodeJson: any, cy: any): void {
  const parentId = node.parent().id();
  if (!parentId) return;

  nodeJson.parent = parentId;
  if (!nodeJson.data?.extraData?.labels) return;

  const parentParts = parentId.split(':');
  if (parentParts.length >= 2) {
    nodeJson.data.extraData.labels['graph-group'] = parentParts[0];
    nodeJson.data.extraData.labels['graph-level'] = parentParts[1];
  }

  const validLabelClasses = [
    'top-center',
    'top-left',
    'top-right',
    'bottom-center',
    'bottom-left',
    'bottom-right'
  ];

  const parentElement = cy.getElementById(parentId);
  if (!parentElement) return;

  const parentClasses = parentElement.classes();
  const validParentClasses = parentClasses.filter((cls: string) =>
    validLabelClasses.includes(cls)
  );
  nodeJson.data.groupLabelPos =
    validParentClasses.length > 0 ? validParentClasses[0] : '';
}

function prepareNodeForSave(node: any, isGeoActive: boolean, cy: any): any {
  const nodeJson = node.json();
  updateNodePosition(node, nodeJson, isGeoActive);
  handleGeoData(node, nodeJson, isGeoActive);
  applyParentData(node, nodeJson, cy);
  return nodeJson;
}

function nodeToAnnotation(node: any): any {
  const {
    fontSize = 14,
    fontColor = '#FFFFFF',
    backgroundColor = 'transparent',
    fontWeight = 'normal',
    fontStyle = 'normal',
    textDecoration = 'none',
    fontFamily = 'monospace'
  } = node.data.freeTextData || {};

  return {
    id: node.data.id,
    text: node.data.name || '',
    position: node.position || { x: 0, y: 0 },
    fontSize,
    fontColor,
    backgroundColor,
    fontWeight,
    fontStyle,
    textDecoration,
    fontFamily
  };
}

function buildAnnotations(nodes: any[]): any[] {
  return nodes.map(nodeToAnnotation);
}

function reapplyGroupStyles(groupStyles: any[]): void {
  const manager = topoViewerState.editorEngine?.groupStyleManager;
  if (!manager) {
    return;
  }
  groupStyles.forEach((style: any) => manager.applyStyleToNode(style.id));
  log.info('Reapplied group styles after save');
}

async function saveAnnotationsAndStyles(updatedNodes: any[]): Promise<void> {
  const freeTextNodes = updatedNodes.filter(
    (node: any) => node.data?.topoViewerRole === 'freeText'
  );
  const groupStyles =
    topoViewerState.editorEngine?.groupStyleManager?.getGroupStyles() || [];

  if (freeTextNodes.length === 0 && groupStyles.length === 0) {
    log.info('No annotations to save');
    return;
  }

  if (freeTextNodes.length > 0) {
    log.info(
      `Found ${freeTextNodes.length} free text nodes to save as annotations`
    );
  }

  const annotations = buildAnnotations(freeTextNodes);

  const sender = getMessageSender();
  const annotationResponse = await sender.sendMessageToVscodeEndpointPost(
    'topo-editor-save-annotations',
    { annotations, groupStyles }
  );
  log.info(`Annotations save response: ${JSON.stringify(annotationResponse)}`);

  reapplyGroupStyles(groupStyles);
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

    if (
      isGeoActive &&
      layoutManager &&
      typeof layoutManager.updateNodeGeoCoordinates === 'function'
    ) {
      layoutManager.updateNodeGeoCoordinates();
    }

    // Process nodes: update each node's "position" property with the current position
    const updatedNodes = cy
      .nodes()
      .map((node: any) => prepareNodeForSave(node, isGeoActive, cy));

    // Send updated topology data to backend
    const sender = getMessageSender();
    const response = await sender.sendMessageToVscodeEndpointPost(
      'topo-viewport-save',
      updatedNodes
    );
    log.info(`Topology saved successfully: ${JSON.stringify(response)}`);

    await saveAnnotationsAndStyles(updatedNodes);
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
