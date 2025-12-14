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
  createInitialGeoMapState,
  handleZoomProgress
} from './geoMapUtils';

/**
 * Hook for managing Leaflet geo map integration
 */
export function useGeoMap({ cyInstance, isGeoLayout, geoMode }: UseGeoMapOptions): UseGeoMapReturn {
  const stateRef = useRef<GeoMapState>(createInitialGeoMapState());

  const handleZoom = useCallback(
    (event: any) => {
      handleZoomProgress(cyInstance as any, stateRef.current, event);
    },
    [cyInstance]
  );

  const handleZoomStartCb = useCallback(() => {
    handleZoomStart(cyInstance as any, stateRef.current);
  }, [cyInstance]);

  // On zoom end: stop animation loop and ensure final accuracy
  const handleZoomEnd = useCallback(
    (event: any) => {
      handleZoomScaleFinal(cyInstance as any, stateRef.current, event);
    },
    [cyInstance]
  );

  // Geo map lifecycle
  useEffect(() => {
    if (!cyInstance || !isGeoLayout) {
      if (stateRef.current.isInitialized) {
        cleanupGeoMapState(cyInstance, stateRef.current, handleZoom, handleZoomEnd, handleZoomStartCb);
        stateRef.current = createInitialGeoMapState();
      }
      return;
    }
    if (!stateRef.current.isInitialized) {
      initializeGeoMap(cyInstance, stateRef.current, handleZoom, handleZoomEnd, handleZoomStartCb);
    }
  }, [cyInstance, isGeoLayout, handleZoom, handleZoomEnd, handleZoomStartCb]);

  // Pan/edit mode changes
  useEffect(() => {
    handleGeoModeChange(cyInstance, stateRef.current, geoMode);
  }, [cyInstance, geoMode]);

  return { isGeoMapActive: stateRef.current.isInitialized };
}
