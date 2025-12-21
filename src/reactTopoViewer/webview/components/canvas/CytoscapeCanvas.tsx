/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import type { Core } from 'cytoscape';

import type { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';
import {
  useElementsUpdate,
  useCytoscapeInitializer,
  useDelayedCytoscapeInit
} from '../../hooks/canvas';

import { ensureColaRegistered, getLayoutOptions } from './init';

interface NodeDataUpdatedMessage {
  type: 'node-data-updated';
  data: {
    nodeId: string;
    extraData: Record<string, unknown>;
  };
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
    const { state, selectNode, selectEdge, editNode, editEdge } = useTopoViewer();
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
    useElementsUpdate(cyRef, elements);

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
