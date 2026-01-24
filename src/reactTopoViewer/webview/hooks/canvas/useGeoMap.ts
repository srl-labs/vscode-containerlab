/**
 * Geo Map Hook for React TopoViewer
 * Manages MapLibre GL map integration with the graph for geographic positioning
 *
 * This replaces the previous Leaflet-based implementation with MapLibre GL
 * for smoother WebGL-powered animations that match Google Maps quality.
 *
 * NOTE: This hook is designed to work with the unknown compatibility layer
 * that bridges ReactFlow to a Cytoscape-like API for the geo map utilities.
 */
import { useEffect, useRef, useCallback, useState } from "react";

import type { MapLibreState, NodeDragEvent } from "./maplibreUtils";
import {
  createInitialMapLibreState,
  initializeMapLibre,
  cleanupMapLibreState,
  handleMapMove,
  handleNodeDragFree,
  handleGeoModeChange
} from "./maplibreUtils";

export interface UseGeoMapOptions {
  cyInstance: null;
  isGeoLayout: boolean;
  geoMode: "pan" | "edit";
  /** Callback fired when geomap is fully initialized */
  onGeoMapReady?: (state: MapLibreState) => void;
}

export interface UseGeoMapReturn {
  isGeoMapActive: boolean;
  mapLibreState: MapLibreState | null;
}

type WritableRef<T> = { current: T };

function cancelPendingMoveRequest(moveRafRef: WritableRef<number | null>): void {
  if (moveRafRef.current === null) return;
  window.cancelAnimationFrame(moveRafRef.current);
  moveRafRef.current = null;
}

/**
 * Hook for managing MapLibre GL geo map integration
 *
 * NOTE: The geo map functionality requires deep integration with the graph library
 * for features like node position updates and geo coordinate projection.
 * This is currently stubbed out for the ReactFlow migration and will need
 * a complete reimplementation for ReactFlow.
 */
export function useGeoMap({
  cyInstance,
  isGeoLayout,
  geoMode,
  onGeoMapReady
}: UseGeoMapOptions): UseGeoMapReturn {
  const stateRef = useRef<MapLibreState>(createInitialMapLibreState());
  const isInitializingRef = useRef(false);
  const moveRafRef = useRef<number | null>(null);
  // State to trigger re-renders when map initializes (refs don't cause re-renders)
  const [isInitialized, setIsInitialized] = useState(false);

  // Map move handler - updates positions and scale on pan/zoom
  const handleMove = useCallback(() => {
    if (!cyInstance || moveRafRef.current !== null) return;

    moveRafRef.current = window.requestAnimationFrame(() => {
      moveRafRef.current = null;
      handleMapMove(cyInstance, stateRef.current);
    });
  }, [cyInstance]);

  // Node drag handler - updates geo coordinates after dragging
  const handleDragFree = useCallback((event: NodeDragEvent) => {
    const target = event.target;
    // Check if target is a node element
    if (target && typeof target.isNode === "function" && target.isNode()) {
      handleNodeDragFree(target, stateRef.current);
    }
  }, []);

  // Geo map lifecycle
  useEffect(() => {
    let didCancel = false;

    if (!cyInstance || !isGeoLayout) {
      // Reset state when geomap is disabled
      if (stateRef.current.isInitialized) {
        cancelPendingMoveRequest(moveRafRef);
        cleanupMapLibreState(cyInstance, stateRef.current, handleMove, handleDragFree);
        stateRef.current = createInitialMapLibreState();
        setIsInitialized(false);
      }
      isInitializingRef.current = false;
      return;
    }

    if (stateRef.current.isInitialized || isInitializingRef.current) {
      return;
    }

    isInitializingRef.current = true;
    void (async () => {
      try {
        await initializeMapLibre(cyInstance, stateRef.current, handleMove, handleDragFree);
        if (!didCancel && stateRef.current.isInitialized) {
          handleGeoModeChange(cyInstance, stateRef.current, geoMode);
          // Update state to trigger re-render so consumers get the initialized state
          setIsInitialized(true);
          // Notify that geomap is ready
          onGeoMapReady?.(stateRef.current);
        }
      } finally {
        isInitializingRef.current = false;
      }
    })();

    return () => {
      didCancel = true;
    };
  }, [cyInstance, isGeoLayout, geoMode, handleMove, handleDragFree, onGeoMapReady]);

  // Handle pan/edit mode changes
  useEffect(() => {
    handleGeoModeChange(cyInstance, stateRef.current, geoMode);
  }, [cyInstance, geoMode]);

  return {
    isGeoMapActive: isInitialized,
    mapLibreState: isInitialized ? stateRef.current : null
  };
}
