/**
 * Cytoscape Canvas Component
 * Renders the topology graph using Cytoscape.js
 */
import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import { Core } from 'cytoscape';
import { CyElement } from '../../../shared/types/messages';
import { useTopoViewer } from '../../context/TopoViewerContext';

import {
  ensureColaRegistered,
  getLayoutOptions
} from './init';

import {
  useElementsUpdate,
  useCytoscapeInitializer,
  useDelayedCytoscapeInit
} from '../../hooks/canvas';

/**
 * Hook to listen for node-data-updated messages and update Cytoscape directly.
 * This provides immediate feedback when node properties are saved.
 */
function useCytoscapeDataUpdateListener(cyRef: React.RefObject<Core | null>): void {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type !== 'node-data-updated') return;

      const data = message.data as { nodeId?: string; extraData?: Record<string, unknown> } | undefined;
      if (!data?.nodeId || !data?.extraData) return;

      const cy = cyRef.current;
      if (!cy) return;

      const node = cy.getElementById(data.nodeId);
      if (node.empty()) return;

      // Update the node's extraData directly in Cytoscape
      const currentExtraData = (node.data('extraData') || {}) as Record<string, unknown>;
      node.data('extraData', { ...currentExtraData, ...data.extraData });

      // Also update top-level data properties that Cytoscape uses for styling
      // These are stored in extraData but need to be at the top level for styling
      if (data.extraData.topoViewerRole !== undefined) {
        node.data('topoViewerRole', data.extraData.topoViewerRole);
      }
      if (data.extraData.iconColor !== undefined) {
        node.data('iconColor', data.extraData.iconColor);
      }
      if (data.extraData.iconCornerRadius !== undefined) {
        node.data('iconCornerRadius', data.extraData.iconCornerRadius);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cyRef]);
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
