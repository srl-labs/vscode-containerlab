/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { log } from '../../utils/logger';

import {
  ensureColaRegistered,
  ensureGridGuideRegistered,
  hasPresetPositions,
  getLayoutOptions,
  createCytoscapeConfig,
  updateCytoscapeElements,
  handleCytoscapeReady
} from './init';

import { setupEventHandlers, attachCustomWheelZoom } from './events';

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
        const timeoutId = setTimeout(() => initCytoscape(initialElements), 100);
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
