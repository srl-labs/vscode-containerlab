/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import type { Core } from 'cytoscape';
import cytoscape from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import type { CustomIconInfo } from '../../../shared/types/icons';
import { useTopoViewerActions, useTopoViewerState } from '../../context/TopoViewerContext';
import { useElementsUpdate } from '../../hooks/canvas';
import { log } from '../../utils/logger';

import {
  ensureColaRegistered,
  getLayoutOptions,
  hasPresetPositions,
  createCytoscapeConfig,
  handleCytoscapeReady
} from './init';
import { setupEventHandlers, attachCustomWheelZoom } from './events';

type SelectCallback = (id: string | null) => void;

interface CytoscapeInitOptions {
  editNode?: SelectCallback;
  editEdge?: SelectCallback;
  getMode?: () => 'edit' | 'view';
  getIsLocked?: () => boolean;
}

/**
 * Setup delayed initialization with ResizeObserver fallback
 */
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

/**
 * Hook for delayed Cytoscape initialization
 * Waits for container to have non-zero dimensions before initializing
 */
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

/**
 * Hook that returns a function to initialize Cytoscape
 */
function useCytoscapeInitializer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  cyRef: React.RefObject<Core | null>,
  selectNode: SelectCallback,
  selectEdge: SelectCallback,
  customIcons: CustomIconInfo[],
  options?: CytoscapeInitOptions,
  lifecycle?: { onCyReady?: (cy: Core) => void; onCyDestroyed?: () => void }
) {
  const onCyReady = lifecycle?.onCyReady;
  const onCyDestroyed = lifecycle?.onCyDestroyed;

  return useCallback((initialElements: CyElement[]) => {
    const container = containerRef.current;
    if (!container) return null;

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
    onCyReady?.(cy);
    cy.userZoomingEnabled(false);
    const detachWheel = attachCustomWheelZoom(cyRef, container);

    setupEventHandlers(cy, selectNode, selectEdge, {
      editNode: options?.editNode,
      editEdge: options?.editEdge,
      getMode: options?.getMode,
      getIsLocked: options?.getIsLocked
    });

    cy.ready(() => handleCytoscapeReady(cy, usePresetLayout, customIcons));

    return () => {
      detachWheel();
      cy.destroy();
      cyRef.current = null;
      onCyDestroyed?.();
    };
  }, [
    selectNode,
    selectEdge,
    containerRef,
    cyRef,
    customIcons,
    options?.editNode,
    options?.editEdge,
    options?.getMode,
    options?.getIsLocked,
    onCyReady,
    onCyDestroyed
  ]);
}

interface CytoscapeCanvasProps {
  elements: CyElement[];
  onCyReady?: (cy: Core) => void;
  onCyDestroyed?: () => void;
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

export const CytoscapeCanvas = forwardRef<CytoscapeCanvasRef, CytoscapeCanvasProps>(
  ({ elements, onCyReady, onCyDestroyed }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const { state } = useTopoViewerState();
    const { selectNode, selectEdge, editNode, editEdge, updateNodePositions } = useTopoViewerActions();
    const initialElementsRef = useRef<CyElement[] | null>(null);

    // Store mode in ref to avoid stale closures in event handlers
    const modeRef = useRef(state.mode);
    modeRef.current = state.mode;
    const getMode = useCallback(() => modeRef.current, []);

    // Store isLocked in ref to avoid stale closures in event handlers
    const isLockedRef = useRef(state.isLocked);
    isLockedRef.current = state.isLocked;
    const getIsLocked = useCallback(() => isLockedRef.current, []);

    if (initialElementsRef.current === null) {
      initialElementsRef.current = elements;
    }

    // Expose methods via ref
    useImperativeHandle(ref, () => createRefMethods(cyRef), []);

	    const initCytoscape = useCytoscapeInitializer(
	      containerRef,
	      cyRef,
	      selectNode,
	      selectEdge,
	      state.customIcons,
	      { editNode, editEdge, getMode, getIsLocked },
	      { onCyReady, onCyDestroyed }
	    );

    useDelayedCytoscapeInit(
      containerRef,
      initialElementsRef,
      initCytoscape,
      cleanupRef
    );

	    // Update elements when they change
	    useElementsUpdate(cyRef, elements, updateNodePositions, state.customIcons);

	    return (
	      <div
        ref={containerRef}
        data-testid="cytoscape-canvas"
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
