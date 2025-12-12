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

type SelectCallback = (id: string | null) => void;

function useCytoscapeInitializer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  cyRef: React.RefObject<Core | null>,
  selectNode: SelectCallback,
  selectEdge: SelectCallback
) {
  return useCallback((initialElements: CyElement[]) => {
    const container = containerRef.current;
    if (!container) return null;
    ensureGridGuideRegistered();

    const rect = container.getBoundingClientRect();
    log.info(`[CytoscapeCanvas] Container size: ${rect.width}x${rect.height}`);
    log.info(`[CytoscapeCanvas] Initializing with ${initialElements.length} elements`);

    if (rect.width === 0 || rect.height === 0) {
      log.warn('[CytoscapeCanvas] Container has zero dimensions, skipping init');
      return null;
    }

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
  }, [selectNode, selectEdge, containerRef, cyRef]);
}

function setupDelayedInit(
  container: HTMLDivElement,
  initialElementsRef: React.RefObject<CyElement[] | null>,
  initCytoscape: (initialElements: CyElement[]) => (() => void) | null,
  cleanupRef: React.RefObject<(() => void) | null>
): () => void {
  let initialized = false;
  let resizeObserver: ResizeObserver | null = null;
  let intervalId: number | null = null;

  const tryInit = () => {
    if (initialized) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    initialized = true;
    cleanupRef.current = initCytoscape(initialElementsRef.current ?? []) ?? null;
    resizeObserver?.disconnect();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  tryInit();

  if (!initialized) {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => tryInit());
      resizeObserver.observe(container);
    } else {
      intervalId = window.setInterval(() => tryInit(), 100);
    }
  }

  return () => {
    resizeObserver?.disconnect();
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
    cleanupRef.current?.();
    cleanupRef.current = null;
  };
}

function useDelayedCytoscapeInit(
  containerRef: React.RefObject<HTMLDivElement | null>,
  initialElementsRef: React.RefObject<CyElement[] | null>,
  initCytoscape: (initialElements: CyElement[]) => (() => void) | null,
  cleanupRef: React.RefObject<(() => void) | null>
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return setupDelayedInit(container, initialElementsRef, initCytoscape, cleanupRef);
  }, [containerRef, initialElementsRef, initCytoscape, cleanupRef]);
}

export const CytoscapeCanvas = forwardRef<CytoscapeCanvasRef, CytoscapeCanvasProps>(
  ({ elements }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const { selectNode, selectEdge } = useTopoViewer();
    const initialElementsRef = useRef<CyElement[] | null>(null);

    if (initialElementsRef.current === null) {
      initialElementsRef.current = elements;
    }

    // Expose methods via ref
    useImperativeHandle(ref, () => createRefMethods(cyRef), []);

    const initCytoscape = useCytoscapeInitializer(
      containerRef,
      cyRef,
      selectNode,
      selectEdge
    );

    useDelayedCytoscapeInit(
      containerRef,
      initialElementsRef,
      initCytoscape,
      cleanupRef
    );

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
