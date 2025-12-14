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
  handleZoomStart,
  handleZoomScaleFinal,
  handleGeoModeChange,
  createInitialGeoMapState
} from './geoMapUtils';

/**
 * Hook for managing Leaflet geo map integration
 */
export function useGeoMap({ cyInstance, isGeoLayout, geoMode }: UseGeoMapOptions): UseGeoMapReturn {
  const stateRef = useRef<GeoMapState>(createInitialGeoMapState());

  // On zoom start: begin animation loop for smooth position updates
  const handleZoom = useCallback(() => {
    handleZoomStart(cyInstance, stateRef.current);
  }, [cyInstance]);

  // On zoom end: stop animation loop and ensure final accuracy
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
