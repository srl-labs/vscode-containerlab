/**
 * useAnnotationInteractions - Combined hook for annotation interaction state
 * Wraps drag, rotation, and resize hooks for cleaner component code
 */
import type React from "react";

import type { FreeTextAnnotation } from "../../../shared/types/topology";
import type { MapLibreState } from "../canvas/maplibreUtils";
import type { CyCompatCore } from "../useCytoCompatInstance";

import { useAnnotationDrag } from "./useAnnotationDrag";
import { useRotationDrag, useResizeDrag } from "./useAnnotationHandles";

interface UseAnnotationInteractionsOptions {
  cyCompat: CyCompatCore | null;
  annotation: FreeTextAnnotation;
  isLocked: boolean;
  onPositionChange: (position: { x: number; y: number }) => void;
  onRotationChange: (rotation: number) => void;
  onSizeChange: (width: number, height: number) => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isGeoMode?: boolean;
  geoMode?: "pan" | "edit";
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
  /** Called when drag starts (for reparenting) */
  onDragStart?: () => void;
  /** Called when drag ends with final position (for reparenting) */
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
}

/**
 * Combined hook for all annotation interaction behaviors
 */
export function useAnnotationInteractions(options: UseAnnotationInteractionsOptions) {
  const {
    cyCompat,
    annotation,
    isLocked,
    onPositionChange,
    onRotationChange,
    onSizeChange,
    contentRef,
    isGeoMode,
    geoMode,
    mapLibreState,
    onGeoPositionChange,
    onDragStart,
    onDragEnd
  } = options;

  const { isDragging, renderedPos, handleMouseDown } = useAnnotationDrag({
    cyCompat,
    modelPosition: annotation.position,
    isLocked,
    onPositionChange,
    onDragStart,
    onDragEnd,
    isGeoMode,
    geoMode,
    geoCoordinates: annotation.geoCoordinates,
    mapLibreState,
    onGeoPositionChange
  });

  const { isRotating, handleRotationMouseDown } = useRotationDrag({
    cyCompat,
    renderedPos,
    currentRotation: annotation.rotation || 0,
    isLocked,
    onRotationChange
  });

  const { isResizing, handleResizeMouseDown } = useResizeDrag({
    renderedPos,
    currentWidth: annotation.width,
    currentHeight: annotation.height,
    contentRef,
    isLocked,
    onSizeChange
  });

  return {
    isDragging,
    isRotating,
    isResizing,
    renderedPos,
    handleMouseDown,
    handleRotationMouseDown,
    handleResizeMouseDown
  };
}
