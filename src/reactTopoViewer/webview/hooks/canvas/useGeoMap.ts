/**
 * Geo Map Hook for React TopoViewer
 * Manages MapLibre GL map integration with Cytoscape for geographic positioning
 *
 * This replaces the previous Leaflet-based implementation with MapLibre GL
 * for smoother WebGL-powered animations that match Google Maps quality.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Core } from 'cytoscape';
import {
  MapLibreState,
  createInitialMapLibreState,
  initializeMapLibre,
  cleanupMapLibreState,
  handleMapMove,
  handleNodeDragFree,
  handleGeoModeChange
} from './maplibreUtils';

export interface UseGeoMapOptions {
  cyInstance: Core | null;
  isGeoLayout: boolean;
  geoMode: 'pan' | 'edit';
}

export interface UseGeoMapReturn {
  isGeoMapActive: boolean;
}

/**
 * Hook for managing MapLibre GL geo map integration
 */
export function useGeoMap({ cyInstance, isGeoLayout, geoMode }: UseGeoMapOptions): UseGeoMapReturn {
  const stateRef = useRef<MapLibreState>(createInitialMapLibreState());
  const isInitializingRef = useRef(false);
  const moveRafRef = useRef<number | null>(null);

  // Map move handler - updates positions and scale on pan/zoom
  const handleMove = useCallback(() => {
    if (!cyInstance) return;
    if (moveRafRef.current !== null) return;

    moveRafRef.current = window.requestAnimationFrame(() => {
      moveRafRef.current = null;
      handleMapMove(cyInstance, stateRef.current);
    });
  }, [cyInstance]);

  // Node drag handler - updates geo coordinates after dragging
  const handleDragFree = useCallback(
    (event: any) => {
      if (event.target.isNode()) {
        handleNodeDragFree(event.target, stateRef.current);
      }
    },
    []
  );

  // Geo map lifecycle
  useEffect(() => {
    let didCancel = false;

    if (!cyInstance || !isGeoLayout) {
      // Cleanup if geo layout is disabled
      if (stateRef.current.isInitialized) {
        if (moveRafRef.current !== null) {
          window.cancelAnimationFrame(moveRafRef.current);
          moveRafRef.current = null;
        }
        cleanupMapLibreState(cyInstance, stateRef.current, handleMove, handleDragFree);
        stateRef.current = createInitialMapLibreState();
      }
      isInitializingRef.current = false;
      return;
    }

    // Initialize if geo layout is enabled and not already initialized
    if (!stateRef.current.isInitialized && !isInitializingRef.current) {
      isInitializingRef.current = true;
      void (async () => {
        try {
          await initializeMapLibre(cyInstance, stateRef.current, handleMove, handleDragFree);
          if (!didCancel) {
            handleGeoModeChange(cyInstance, stateRef.current, geoMode);
          }
        } finally {
          isInitializingRef.current = false;
        }
      })();
    }

    return () => {
      didCancel = true;
    };
  }, [cyInstance, isGeoLayout, geoMode, handleMove, handleDragFree]);

  // Handle pan/edit mode changes
  useEffect(() => {
    handleGeoModeChange(cyInstance, stateRef.current, geoMode);
  }, [cyInstance, geoMode]);

  return { isGeoMapActive: stateRef.current.isInitialized };
}
