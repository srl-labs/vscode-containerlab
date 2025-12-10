/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import cola from 'cytoscape-cola';
import gridGuide from 'cytoscape-grid-guide';
import { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { log } from '../../utils/logger';
import { generateEncodedSVG, NodeType } from '../../utils/SvgGenerator';

interface CytoscapeCanvasProps {
  elements: CyElement[];
}

/**
 * Ref interface for external control
 */
export interface CytoscapeCanvasRef {
  fit: () => void;
  runLayout: (layoutName: string) => void;
  getCy: () => Core | null;
}

let colaRegistered = false;
let gridGuideRegistered = false;

function ensureColaRegistered(): void {
  if (!colaRegistered) {
    cytoscape.use(cola);
    colaRegistered = true;
  }
}

function ensureGridGuideRegistered(): void {
  if (!gridGuideRegistered) {
    cytoscape.use(gridGuide);
    gridGuideRegistered = true;
  }
}

// Style constants to avoid duplication
const DATA_NAME = 'data(name)';
const SELECTION_COLOR = 'var(--vscode-focusBorder, #007ACC)';

/**
 * Check if elements have preset positions (from annotations file)
 * Returns true if all nodes have non-zero positions
 */
function hasPresetPositions(elements: CyElement[]): boolean {
  const nodes = elements.filter(el => el.group === 'nodes');
  if (nodes.length === 0) return false;

  // Check if all nodes have valid positions
  return nodes.every(node => {
    const pos = node.position;
    return pos && (pos.x !== 0 || pos.y !== 0);
  });
}

/**
 * Role to SVG node type mapping
 */
const ROLE_SVG_MAP: Record<string, NodeType> = {
  router: 'pe',
  default: 'pe',
  pe: 'pe',
  p: 'pe',
  controller: 'controller',
  pon: 'pon',
  dcgw: 'dcgw',
  leaf: 'leaf',
  switch: 'switch',
  rgw: 'rgw',
  'super-spine': 'super-spine',
  spine: 'spine',
  server: 'server',
  bridge: 'bridge',
  ue: 'ue',
  cloud: 'cloud',
  client: 'client'
};

/**
 * Common style for role-based nodes
 */
const commonRoleStyle = {
  width: '14',
  height: '14',
  'background-fit': 'cover',
  'background-position-x': '50%',
  'background-position-y': '50%',
  'background-repeat': 'no-repeat'
};

/**
 * Generate role-based styles with SVG icons
 */
function generateRoleStyles(): cytoscape.StylesheetCSS[] {
  const defaultColor = '#005aff';
  return Object.entries(ROLE_SVG_MAP).map(([role, svgId]) => ({
    selector: `node[topoViewerRole="${role}"]`,
    style: {
      ...commonRoleStyle,
      'background-image': generateEncodedSVG(svgId, defaultColor),
      'background-clip': role === 'router' || role === 'default' ? 'none' : undefined
    } as cytoscape.Css.Node
  }));
}

/**
 * Basic Cytoscape styles for nodes and edges
 */
const cytoscapeStylesBase: cytoscape.StylesheetCSS[] = [
  {
    selector: 'node',
    style: {
      shape: 'rectangle',
      width: '10',
      height: '10',
      content: DATA_NAME,
      label: DATA_NAME,
      'font-size': '0.58em',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'background-color': '#8F96AC',
      'min-zoomed-font-size': '0.58em',
      color: '#F5F5F5',
      'text-outline-color': '#3C3E41',
      'text-outline-width': '0.3px',
      'text-background-color': '#000000',
      'text-background-opacity': 0.7,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '1px',
      'z-index': '2'
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': '3px',
      'border-color': SELECTION_COLOR,
      'border-opacity': 1,
      'border-style': 'solid',
      'overlay-color': SELECTION_COLOR,
      'overlay-opacity': 0.3,
      'overlay-padding': '3px'
    }
  },
  {
    selector: 'node:parent',
    style: {
      shape: 'rectangle',
      'border-width': '0.5px',
      'border-color': '#DDDDDD',
      'background-color': '#d9d9d9',
      width: '80px',
      height: '80px',
      'background-opacity': 0.2,
      color: '#EBECF0',
      'text-outline-color': '#000000',
      'font-size': '0.67em',
      'z-index': '1'
    }
  },
  {
    selector: 'node[topoViewerRole="group"]',
    style: {
      'background-color': '#d9d9d9',
      'background-opacity': 0.2
    }
  },
  {
    selector: 'edge',
    style: {
      'target-arrow-shape': 'none',
      'font-size': '0.42em',
      'source-label': 'data(sourceEndpoint)',
      'target-label': 'data(targetEndpoint)',
      'source-text-offset': 20,
      'target-text-offset': 20,
      'arrow-scale': '0.5',
      color: '#000000',
      'text-outline-width': '0.3px',
      'text-outline-color': '#FFFFFF',
      'text-background-color': '#CACBCC',
      'text-opacity': 1,
      'text-background-opacity': 1,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '1px',
      'curve-style': 'bezier',
      'control-point-step-size': 20,
      opacity: 0.7,
      'line-color': '#969799',
      width: '1.5',
      label: ' ',
      'overlay-padding': '2px'
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': SELECTION_COLOR,
      'target-arrow-color': SELECTION_COLOR,
      'source-arrow-color': SELECTION_COLOR,
      'overlay-color': SELECTION_COLOR,
      'overlay-opacity': 0.2,
      'overlay-padding': '6px',
      width: '4px',
      opacity: 1,
      'z-index': '10'
    }
  },
  {
    selector: 'edge.link-up',
    style: {
      'line-color': '#00df2b'
    }
  },
  {
    selector: 'edge.link-down',
    style: {
      'line-color': '#df2b00'
    }
  },
  // Special endpoint nodes (host, mgmt-net, etc.)
  {
    selector: 'node.special-endpoint',
    style: {
      'background-color': '#E8E8E8',
      'border-width': '1px',
      'border-color': '#969799',
      'background-opacity': 0.9,
      shape: 'round-rectangle',
      width: '14',
      height: '14'
    }
  },
  // Cloud node styles
  {
    selector: 'node[topoViewerRole="cloud"]',
    style: {
      'background-color': '#E8E8E8',
      'border-width': '0px',
      'border-color': '#969799',
      'background-opacity': 0.9,
      shape: 'rectangle',
      width: '14',
      height: '14',
      'font-size': '0.5em',
      content: DATA_NAME,
      label: DATA_NAME
    }
  }
];

// Insert role styles before edge styles
const cytoscapeStyles: cytoscape.StylesheetCSS[] = [
  ...cytoscapeStylesBase.slice(0, 4), // core + node styles
  ...generateRoleStyles(),
  ...cytoscapeStylesBase.slice(4) // edge styles and rest
];

// Scratch key for edge creation state (must match useEdgeCreation.ts)
const EDGE_CREATION_SCRATCH_KEY = '_isCreatingEdge';
// Scratch key for context menu state (must match useContextMenu.ts)
const CONTEXT_MENU_SCRATCH_KEY = '_isContextMenuActive';

/**
 * Check if edge creation is in progress
 */
function isCreatingEdge(cy: Core): boolean {
  return cy.scratch(EDGE_CREATION_SCRATCH_KEY) === true;
}

/**
 * Check if context menu is active
 */
function isContextMenuActive(cy: Core): boolean {
  return cy.scratch(CONTEXT_MENU_SCRATCH_KEY) === true;
}

/**
 * Check if event is a right-click (context menu)
 */
function isRightClick(evt: cytoscape.EventObject): boolean {
  const originalEvent = evt.originalEvent as MouseEvent;
  return originalEvent?.button === 2;
}

/**
 * Setup Cytoscape event handlers
 */
function setupEventHandlers(
  cy: Core,
  selectNode: (nodeId: string | null) => void,
  selectEdge: (edgeId: string | null) => void
): void {
  cy.on('tap', 'node', (evt) => {
    // Skip selection during edge creation or context menu interaction
    if (isCreatingEdge(cy) || isContextMenuActive(cy)) {
      return;
    }
    // Skip selection on right-click (context menu)
    if (isRightClick(evt)) {
      return;
    }
    const originalEvent = evt.originalEvent as MouseEvent;
    // If shift is held, let Cytoscape handle multi-selection
    // Don't update React single-selection state
    if (originalEvent?.shiftKey) {
      return;
    }
    selectNode(evt.target.id());
  });

  cy.on('tap', 'edge', (evt) => {
    // Skip selection during edge creation or context menu interaction
    if (isCreatingEdge(cy) || isContextMenuActive(cy)) {
      return;
    }
    // Skip selection on right-click (context menu)
    if (isRightClick(evt)) {
      return;
    }
    const originalEvent = evt.originalEvent as MouseEvent;
    // If shift is held, let Cytoscape handle multi-selection
    if (originalEvent?.shiftKey) {
      return;
    }
    selectEdge(evt.target.id());
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      selectNode(null);
      selectEdge(null);
    }
  });
}

/**
 * Get layout options for a given layout name
 */
function getLayoutOptions(layoutName: string): cytoscape.LayoutOptions {
  const layouts: Record<string, cytoscape.LayoutOptions> = {
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
 * Create cytoscape ref methods
 */
function createRefMethods(cyRef: React.RefObject<Core | null>): CytoscapeCanvasRef {
  return {
    fit: () => cyRef.current?.fit(undefined, 50),
    runLayout: (layoutName: string) => {
      if (layoutName === 'cola') {
        ensureColaRegistered();
      }
      if (cyRef.current) {
        cyRef.current.layout(getLayoutOptions(layoutName)).run();
      }
    },
    getCy: () => cyRef.current
  };
}

/**
 * Update cytoscape elements and apply layout
 */
function updateCytoscapeElements(cy: Core, elements: CyElement[]): void {
  const usePresetLayout = hasPresetPositions(elements);
  cy.batch(() => {
    cy.elements().remove();
    cy.add(elements);
  });

  if (!usePresetLayout) {
    cy.layout(getLayoutOptions('cose')).run();
  } else {
    cy.fit(undefined, 50);
  }
}

/**
 * Handle cytoscape ready event
 */
function handleCytoscapeReady(cy: Core, usePresetLayout: boolean): void {
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

  // Only run layout if no preset positions
  if (!usePresetLayout) {
    log.info('[CytoscapeCanvas] No preset positions, running COSE layout');
    cy.layout(getLayoutOptions('cose')).run();
  }

  // Fit after layout completes
  setTimeout(() => {
    cy.resize();
    cy.fit(undefined, 50);
    const extent = cy.extent();
    log.info(`[CytoscapeCanvas] After fit - zoom: ${cy.zoom()}, pan: (${cy.pan().x}, ${cy.pan().y})`);
    log.info(`[CytoscapeCanvas] Extent: x1=${extent.x1}, y1=${extent.y1}, x2=${extent.x2}, y2=${extent.y2}`);
  }, usePresetLayout ? 100 : 600);
}

function createCustomWheelHandler(cyRef: React.RefObject<Core | null>): (event: WheelEvent) => void {
  return (event: WheelEvent) => {
    const cy = cyRef.current;
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
  };
}

function attachCustomWheelZoom(cyRef: React.RefObject<Core | null>, container: HTMLElement | null): () => void {
  if (!container) return () => {};
  const handler = createCustomWheelHandler(cyRef);
  container.addEventListener('wheel', handler, { passive: false });
  return () => container.removeEventListener('wheel', handler);
}

/**
 * Create Cytoscape configuration options
 */
function createCytoscapeConfig(container: HTMLElement, elements: CyElement[]): cytoscape.CytoscapeOptions {
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
 * Hook for updating elements when they change
 */
function useElementsUpdate(cyRef: React.RefObject<Core | null>, elements: CyElement[]): void {
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!elements.length) {
      cy.elements().remove();
      return;
    }
    updateCytoscapeElements(cy, elements);
  }, [cyRef, elements]);
}

export const CytoscapeCanvas = forwardRef<CytoscapeCanvasRef, CytoscapeCanvasProps>(
  ({ elements }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const { selectNode, selectEdge } = useTopoViewer();
    const initialElementsRef = useRef<CyElement[] | null>(null);

    if (initialElementsRef.current === null) {
      initialElementsRef.current = elements;
    }

    // Expose methods via ref
    useImperativeHandle(ref, () => createRefMethods(cyRef), []);

    // Initialize Cytoscape
    const initCytoscape = useCallback((initialElements: CyElement[]) => {
      if (!containerRef.current) return;
      ensureGridGuideRegistered();

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      log.info(`[CytoscapeCanvas] Container size: ${rect.width}x${rect.height}`);
      log.info(`[CytoscapeCanvas] Initializing with ${initialElements.length} elements`);

      // If container has no size, wait for layout
      if (rect.width === 0 || rect.height === 0) {
        log.warn('[CytoscapeCanvas] Container has zero dimensions, delaying init');
        const timeoutId = setTimeout(() => initCytoscape(), 100);
        return () => clearTimeout(timeoutId);
      }

      // Check if elements have preset positions from annotations
      const usePresetLayout = hasPresetPositions(initialElements);
      log.info(`[CytoscapeCanvas] Preset positions detected: ${usePresetLayout}`);

      const cy = cytoscape(createCytoscapeConfig(container, initialElements));

      cyRef.current = cy;
      cy.userZoomingEnabled(false);
      const detachWheel = attachCustomWheelZoom(cyRef, container);

      setupEventHandlers(cy, selectNode, selectEdge);

      cy.ready(() => handleCytoscapeReady(cy, usePresetLayout));

      return () => {
        detachWheel();
        cy.destroy();
        cyRef.current = null;
      };
    }, [selectNode, selectEdge]);

    useEffect(() => {
      const cleanup = initCytoscape(initialElementsRef.current ?? []);
      return cleanup;
    }, [initCytoscape]);

    // Update elements when they change
    useElementsUpdate(cyRef, elements);

    return (
      <div
        ref={containerRef}
        className="cytoscape-container"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
        tabIndex={0}
      />
    );
  }
);

CytoscapeCanvas.displayName = 'CytoscapeCanvas';
