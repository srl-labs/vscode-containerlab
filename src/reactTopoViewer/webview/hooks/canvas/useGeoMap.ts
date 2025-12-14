/**
 * Geo Map Hook for React TopoViewer
 * Manages Leaflet map integration with Cytoscape for geographic positioning
 */
import { useEffect, useRef, useCallback } from 'react';
import {
  GeoMapState,
  UseGeoMapOptions,
  UseGeoMapReturn,
  initializeGeoMap,
  cleanupGeoMapState,
  handleZoomScaleFast,
  handleZoomScaleFinal,
  handleGeoModeChange,
  createInitialGeoMapState
} from './geoMapUtils';

/**
 * Hook for managing Leaflet geo map integration
 */
export function useGeoMap({ cyInstance, isGeoLayout, geoMode }: UseGeoMapOptions): UseGeoMapReturn {
  const stateRef = useRef<GeoMapState>(createInitialGeoMapState());

  // During zoom: apply CSS transform for instant visual scaling (GPU-accelerated)
  const handleZoom = useCallback(() => {
    handleZoomScaleFast(cyInstance, stateRef.current);
  }, [cyInstance]);

  // On zoom end: remove CSS transform and apply actual Cytoscape styles
  const handleZoomEnd = useCallback(() => {
    handleZoomScaleFinal(cyInstance, stateRef.current);
  }, [cyInstance]);

  // Geo map lifecycle
  useEffect(() => {
    if (!cyInstance || !isGeoLayout) {
      if (stateRef.current.isInitialized) {
        cleanupGeoMapState(cyInstance, stateRef.current, handleZoom, handleZoomEnd);
        stateRef.current = createInitialGeoMapState();
      }
      return;
    }
    if (!stateRef.current.isInitialized) {
      initializeGeoMap(cyInstance, stateRef.current, handleZoom, handleZoomEnd);
    }
  }, [cyInstance, isGeoLayout, handleZoom, handleZoomEnd]);

  // Pan/edit mode changes
  useEffect(() => {
    handleGeoModeChange(cyInstance, stateRef.current, geoMode);
  }, [cyInstance, geoMode]);

  return { isGeoMapActive: stateRef.current.isInitialized };
}
