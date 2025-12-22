/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import type { Core } from 'cytoscape';
import cytoscape from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';
import { useElementsUpdate } from '../../hooks/canvas';
import { log } from '../../utils/logger';

import {
  ensureColaRegistered,
  getLayoutOptions,
  ensureGridGuideRegistered,
  hasPresetPositions,
  createCytoscapeConfig,
  handleCytoscapeReady
} from './init';
import { setupEventHandlers, attachCustomWheelZoom } from './events';

interface NodeDataUpdatedMessage {
  type: 'node-data-updated';
  data: {
    nodeId: string;
    extraData: Record<string, unknown>;
  };
}

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
  options?: CytoscapeInitOptions
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

    setupEventHandlers(cy, selectNode, selectEdge, {
      editNode: options?.editNode,
      editEdge: options?.editEdge,
      getMode: options?.getMode,
      getIsLocked: options?.getIsLocked
    });

    cy.ready(() => handleCytoscapeReady(cy, usePresetLayout));

    return () => {
      detachWheel();
      cy.destroy();
      cyRef.current = null;
    };
  }, [selectNode, selectEdge, containerRef, cyRef, options?.editNode, options?.editEdge, options?.getMode, options?.getIsLocked]);
}


/**
 * Hook to listen for node-data-updated messages and dispatch to React state.
 * When the extension saves node data, it sends back a node-data-updated message.
 * We dispatch UPDATE_NODE_DATA to update React state, which then triggers
 * useElementsUpdate to update Cytoscape via the normal React flow.
 */
function useCytoscapeDataUpdateListener(cyRef: React.RefObject<Core | null>): void {
  const { dispatch } = useTopoViewer();

  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as NodeDataUpdatedMessage | undefined;
      if (!message || message.type !== 'node-data-updated') return;

      const data = message.data;
      if (!data?.nodeId || !data?.extraData) {
        return;
      }

      // Dispatch to React state - this is the source of truth.
      // Cytoscape will be updated by useElementsUpdate when React re-renders.
      // We do NOT update Cytoscape directly here to avoid race conditions
      // with other state updates (like undo push) that might trigger re-renders
      // with stale state before our dispatch is processed.
      dispatch({ type: 'UPDATE_NODE_DATA', payload: { nodeId: data.nodeId, extraData: data.extraData } });
    };

    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'node-data-updated');
  }, [cyRef, dispatch]);
}

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

export const CytoscapeCanvas = forwardRef<CytoscapeCanvasRef, CytoscapeCanvasProps>(
  ({ elements }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const { state, selectNode, selectEdge, editNode, editEdge, updateNodePositions } = useTopoViewer();
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
      { editNode, editEdge, getMode, getIsLocked }
    );

    useDelayedCytoscapeInit(
      containerRef,
      initialElementsRef,
      initCytoscape,
      cleanupRef
    );

    // Update elements when they change
    useElementsUpdate(cyRef, elements, updateNodePositions);

    // Listen for node-data-updated messages and update Cytoscape directly
    useCytoscapeDataUpdateListener(cyRef);

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
