/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { log } from '../../utils/logger';

interface CytoscapeCanvasProps {
  elements: CyElement[];
}

/**
 * Ref interface for external control
 */
export interface CytoscapeCanvasRef {
  fit: () => void;
  // eslint-disable-next-line no-unused-vars
  runLayout: (layoutName: string) => void;
  getCy: () => Core | null;
}

/**
 * Basic Cytoscape styles for nodes and edges
 */
const cytoscapeStyles: cytoscape.StylesheetCSS[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#4a90d9',
      'label': 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '12px',
      'color': '#ffffff',
      'text-margin-y': 8,
      'width': 50,
      'height': 50,
      'border-width': 2,
      'border-color': '#2a5a9a',
      'text-outline-color': '#000000',
      'text-outline-width': 1,
      'text-outline-opacity': 0.5
    }
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#ff6b6b',
      'background-color': '#5aa0e9'
    }
  },
  {
    selector: 'node[?isGroup]',
    style: {
      'background-color': 'rgba(100, 100, 100, 0.2)',
      'border-width': 1,
      'border-color': '#888888',
      'shape': 'round-rectangle',
      'padding': '20px'
    }
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#888888',
      'target-arrow-shape': 'none',
      'curve-style': 'bezier'
    }
  },
  {
    selector: 'edge:selected',
    style: {
      'width': 3,
      'line-color': '#ff6b6b'
    }
  },
  {
    selector: 'edge.link-up',
    style: {
      'line-color': '#4caf50'
    }
  },
  {
    selector: 'edge.link-down',
    style: {
      'line-color': '#f44336'
    }
  }
];

/**
 * Setup Cytoscape event handlers
 */
/* eslint-disable no-unused-vars */
function setupEventHandlers(
  cy: Core,
  selectNode: (nodeId: string | null) => void,
  selectEdge: (edgeId: string | null) => void
): void {
/* eslint-enable no-unused-vars */
  cy.on('tap', 'node', (evt) => {
    selectNode(evt.target.id());
  });

  cy.on('tap', 'edge', (evt) => {
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
    concentric: { name: 'concentric', animate: true, animationDuration: 300 }
  };
  return layouts[layoutName] || layouts.cose;
}

/**
 * Create cytoscape ref methods
 */
function createRefMethods(cyRef: React.MutableRefObject<Core | null>): CytoscapeCanvasRef {
  return {
    fit: () => cyRef.current?.fit(undefined, 50),
    runLayout: (layoutName: string) => {
      if (cyRef.current) {
        cyRef.current.layout(getLayoutOptions(layoutName)).run();
      }
    },
    getCy: () => cyRef.current
  };
}

/**
 * Handle cytoscape ready event
 */
function handleCytoscapeReady(cy: Core): void {
  log.info(`[CytoscapeCanvas] Cytoscape ready - nodes: ${cy.nodes().length}, edges: ${cy.edges().length}`);

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

  // Run layout after initialization
  cy.layout(getLayoutOptions('cose')).run();

  // Fit after layout completes
  setTimeout(() => {
    cy.resize();
    cy.fit(undefined, 50);
    const extent = cy.extent();
    log.info(`[CytoscapeCanvas] After fit - zoom: ${cy.zoom()}, pan: (${cy.pan().x}, ${cy.pan().y})`);
    log.info(`[CytoscapeCanvas] Extent: x1=${extent.x1}, y1=${extent.y1}, x2=${extent.x2}, y2=${extent.y2}`);
  }, 600);
}

export const CytoscapeCanvas = forwardRef<CytoscapeCanvasRef, CytoscapeCanvasProps>(
  ({ elements }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const { selectNode, selectEdge } = useTopoViewer();

    // Expose methods via ref
    useImperativeHandle(ref, () => createRefMethods(cyRef), []);

    // Initialize Cytoscape
    const initCytoscape = useCallback(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      log.info(`[CytoscapeCanvas] Container size: ${rect.width}x${rect.height}`);
      log.info(`[CytoscapeCanvas] Initializing with ${elements.length} elements`);

      // If container has no size, wait for layout
      if (rect.width === 0 || rect.height === 0) {
        log.warn('[CytoscapeCanvas] Container has zero dimensions, delaying init');
        const timeoutId = setTimeout(() => initCytoscape(), 100);
        return () => clearTimeout(timeoutId);
      }

      const cy = cytoscape({
        container: container,
        elements: elements,
        style: cytoscapeStyles,
        layout: { name: 'preset' }, // Use preset first, then run layout
        minZoom: 0.1,
        maxZoom: 3,
        wheelSensitivity: 0.2
      });

      cyRef.current = cy;
      setupEventHandlers(cy, selectNode, selectEdge);

      cy.ready(() => handleCytoscapeReady(cy));

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, [selectNode, selectEdge, elements]);

    useEffect(() => {
      const cleanup = initCytoscape();
      return cleanup;
    }, [initCytoscape]);

    // Update elements when they change
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy || !elements.length) return;

      cy.batch(() => {
        cy.elements().remove();
        cy.add(elements);
      });
      cy.layout(getLayoutOptions('cose')).run();
    }, [elements]);

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
