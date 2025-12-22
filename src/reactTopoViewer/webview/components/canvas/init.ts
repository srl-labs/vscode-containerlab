/**
 * Cytoscape initialization, layouts, and configuration utilities
 */
import type { Core, CytoscapeOptions, LayoutOptions } from 'cytoscape';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';

import type { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';

import { cytoscapeStyles } from './styles';

let colaRegistered = false;
let gridGuideRegistered = false;

/**
 * Apply stub-link class to edges connected to network nodes (cloud)
 * This ensures dashed styling for network connections regardless of how elements were loaded
 */
export function applyStubLinkClasses(cy: Core): void {
  cy.edges().forEach(edge => {
    const sourceRole = edge.source().data('topoViewerRole') as string | undefined;
    const targetRole = edge.target().data('topoViewerRole') as string | undefined;
    if (sourceRole === 'cloud' || targetRole === 'cloud') {
      edge.addClass('stub-link');
    }
  });
}

export function ensureColaRegistered(): void {
  if (!colaRegistered) {
    cytoscape.use(cola);
    colaRegistered = true;
  }
}

export function ensureGridGuideRegistered(): void {
  if (!gridGuideRegistered) {
    cytoscape.use(gridGuide);
    gridGuideRegistered = true;
  }
}

/**
 * Check if elements have preset positions (from annotations file)
 * Returns true if ANY regular topology node has a non-zero position
 * This preserves existing positions while allowing new nodes to be added
 *
 * Excluded from check:
 * - Group nodes (their positions are computed from children)
 * - Free text/shape annotations (user-created, always have positions)
 * - Cloud/network nodes (dynamically discovered from links, may not have stored positions)
 */
export function hasPresetPositions(elements: CyElement[]): boolean {
  // Filter to regular topology nodes only
  const regularNodes = elements.filter(el => {
    if (el.group !== 'nodes') return false;
    const role = el.data?.topoViewerRole;
    // Exclude group nodes, annotations, and cloud/network nodes
    return role !== 'group' && role !== 'freeText' && role !== 'freeShape' && role !== 'cloud';
  });

  if (regularNodes.length === 0) return false;

  // Use preset layout if ANY regular topology node has a stored position
  // This preserves existing positions when new nodes are added
  return regularNodes.some(node => {
    const pos = node.position;
    return pos && (pos.x !== 0 || pos.y !== 0);
  });
}

/**
 * Extended layout options including animation properties
 */
type ExtendedLayoutOptions = LayoutOptions & {
  animate?: boolean;
  animationDuration?: number;
  [key: string]: unknown;
};

/**
 * Get layout options for a given layout name
 */
export function getLayoutOptions(layoutName: string): ExtendedLayoutOptions {
  const layouts: Record<string, ExtendedLayoutOptions> = {
    cose: {
      name: 'cose',
      animate: true,
      animationDuration: 500,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 100,
      edgeElasticity: () => 100
    },
    grid: { name: 'grid', animate: true, animationDuration: 300 },
    circle: { name: 'circle', animate: true, animationDuration: 300 },
    concentric: { name: 'concentric', animate: true, animationDuration: 300 },
    preset: { name: 'preset', animate: false },
    cola: {
      name: 'cola',
      animate: true,
      maxSimulationTime: 1500,
      fit: true,
      edgeLength: 120,
      nodeSpacing: 12
    },
    breadthfirst: {
      name: 'breadthfirst',
      directed: true,
      animate: true,
      animationDuration: 400,
      spacingFactor: 0.8
    }
  };
  return layouts[layoutName] || layouts.cose;
}

/**
 * Create Cytoscape configuration options
 */
export function createCytoscapeConfig(container: HTMLElement, elements: CyElement[]): CytoscapeOptions {
  return {
    container: container,
    elements: elements,
    style: cytoscapeStyles,
    layout: { name: 'preset' },
    boxSelectionEnabled: true,
    selectionType: 'additive',
    wheelSensitivity: 0,
    textureOnViewport: true,
    hideEdgesOnViewport: false,
    hideLabelsOnViewport: false,
    pixelRatio: 'auto',
    motionBlur: false,
    motionBlurOpacity: 0.2
  };
}

/**
 * Update cytoscape elements and apply layout
 */
export function updateCytoscapeElements(cy: Core, elements: CyElement[]): void {
  const usePresetLayout = hasPresetPositions(elements);
  cy.batch(() => {
    cy.elements().remove();
    cy.add(elements);
  });

  // Apply stub-link class to edges connected to network/cloud nodes
  applyStubLinkClasses(cy);

  if (!usePresetLayout) {
    cy.layout(getLayoutOptions('cose')).run();
  } else {
    cy.fit(undefined, 50);
  }
}

type NodePositions = Array<{ id: string; position: { x: number; y: number } }>;

/**
 * Collect node positions from Cytoscape (for syncing to React state after layout)
 */
function collectNodePositionsFromCy(cy: Core): NodePositions {
  const excludedRoles = new Set(['group', 'freeText', 'freeShape']);
  const positions: NodePositions = [];

  cy.nodes().forEach(node => {
    const id = node.id();
    const role = node.data('topoViewerRole') as string | undefined;
    if (!id) return;
    if (role && excludedRoles.has(role)) return;
    const pos = node.position();
    positions.push({ id, position: { x: Math.round(pos.x), y: Math.round(pos.y) } });
  });

  return positions;
}

/**
 * Handle cytoscape ready event
 */
export function handleCytoscapeReady(
  cy: Core,
  usePresetLayout: boolean,
  onInitialLayoutPositions?: (positions: NodePositions) => void
): void {
  log.info(`[CytoscapeCanvas] Cytoscape ready - nodes: ${cy.nodes().length}, edges: ${cy.edges().length}`);
  log.info(`[CytoscapeCanvas] Using preset layout: ${usePresetLayout}`);

  // Check if canvas was created
  const container = cy.container();
  if (container) {
    const canvas = container.querySelector('canvas');
    if (canvas) {
      log.info(`[CytoscapeCanvas] Canvas element found: ${canvas.width}x${canvas.height}`);
    } else {
      log.error('[CytoscapeCanvas] No canvas element found inside container!');
    }
  }

  // Log first node position for debugging
  const firstNode = cy.nodes().first();
  if (firstNode.length > 0) {
    const pos = firstNode.position();
    const bb = firstNode.boundingBox();
    log.info(`[CytoscapeCanvas] First node - pos: (${pos.x}, ${pos.y}), bbox: w=${bb.w}, h=${bb.h}`);
  }

  // Apply stub-link class to edges connected to network/cloud nodes
  applyStubLinkClasses(cy);

  // Run COSE layout if nodes don't have preset positions
  if (!usePresetLayout) {
    log.info('[handleCytoscapeReady] Running COSE layout for elements without positions');
    cy.one('layoutstop', () => {
      cy.resize();
      cy.fit(undefined, 50);
      // Sync positions back to React state
      if (onInitialLayoutPositions) {
        const positions = collectNodePositionsFromCy(cy);
        log.info(`[handleCytoscapeReady] Syncing ${positions.length} node positions to React state`);
        onInitialLayoutPositions(positions);
      }
    });
    cy.layout(getLayoutOptions('cose')).run();
  } else {
    // Fit after a short delay for preset layout
    setTimeout(() => {
      cy.resize();
      cy.fit(undefined, 50);
      const extent = cy.extent();
      log.info(`[CytoscapeCanvas] After fit - zoom: ${cy.zoom()}, pan: (${cy.pan().x}, ${cy.pan().y})`);
      log.info(`[CytoscapeCanvas] Extent: x1=${extent.x1}, y1=${extent.y1}, x2=${extent.x2}, y2=${extent.y2}`);
    }, 100);
  }
}
