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
import type { MapLibreState } from "./maplibreUtils";
import {
  createInitialMapLibreState,
  initializeMapLibre,
  cleanupMapLibreState,
  handleMapMove,
  handleNodeDragFree,
  handleGeoModeChange
} from "./maplibreUtils";

export interface UseGeoMapOptions {
  isGeoLayout: boolean;
  geoMode: "pan" | "edit";
  /** Callback fired when geomap is fully initialized */
  onGeoMapReady?: (state: MapLibreState) => void;
}

export interface UseGeoMapReturn {
  isGeoMapActive: boolean;
  mapLibreState: MapLibreState | null;
}

// Stub for suppressing unused function warnings
function cancelPendingMoveRequest(): void {
  // Disabled during ReactFlow migration
}

/**
 * Hook for managing MapLibre GL geo map integration
 *
 * NOTE: The geo map functionality requires deep integration with the graph library
 * for features like node position updates and geo coordinate projection.
 * This is currently disabled during the ReactFlow migration and will need
 * a complete reimplementation for ReactFlow.
 */
export function useGeoMap({
  isGeoLayout,
  geoMode,
  onGeoMapReady
}: UseGeoMapOptions): UseGeoMapReturn {
  // Suppress unused imports during migration
  void createInitialMapLibreState;
  void initializeMapLibre;
  void cleanupMapLibreState;
  void handleMapMove;
  void handleNodeDragFree;
  void handleGeoModeChange;
  void cancelPendingMoveRequest;
  void onGeoMapReady;
  void isGeoLayout;
  void geoMode;

  // Geo map is disabled during ReactFlow migration
  // TODO: Re-implement geo map with ReactFlow
  return {
    isGeoMapActive: false,
    mapLibreState: null
  };
}
