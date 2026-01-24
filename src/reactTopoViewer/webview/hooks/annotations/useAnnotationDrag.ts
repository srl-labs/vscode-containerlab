/**
 * Hook for annotation drag functionality
 */
import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";

import type { MapLibreState } from "../canvas/maplibreUtils";
import { unprojectToGeoCoords, calculateScale } from "../canvas/maplibreUtils";

import type { RenderedPosition } from "./freeText";
import { modelToRendered, modelToRenderedGeo } from "./freeText";

interface DragStart {
  mouseX: number;
  mouseY: number;
  modelX: number;
  modelY: number;
}

interface UseAnnotationDragOptions {
  cyCompat: null;
  modelPosition: { x: number; y: number };
  isLocked: boolean;
  onPositionChange: (position: { x: number; y: number }) => void;
  // Drag visual feedback callbacks (for syncing with background layers)
  onDragStart?: () => void;
  onDragMove?: (modelPosition: { x: number; y: number }) => void;
  /** Called with final model position when drag ends */
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
  // Geo mode options
  isGeoMode?: boolean;
  geoMode?: "pan" | "edit";
  geoCoordinates?: { lat: number; lng: number };
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
}

interface UseAnnotationDragReturn {
  isDragging: boolean;
  renderedPos: RenderedPosition;
  handleMouseDown: (e: React.MouseEvent) => void;
}

// Helper to calculate delta from drag start
function calculateDelta(
  e: MouseEvent,
  dragStart: DragStart,
  zoom: number
): { deltaX: number; deltaY: number } {
  return {
    deltaX: (e.clientX - dragStart.mouseX) / zoom,
    deltaY: (e.clientY - dragStart.mouseY) / zoom
  };
}

// Get container-relative screen position
function getContainerRelativePos(_cyCompat: null, _e: MouseEvent): { x: number; y: number } | null {
  // Disabled during ReactFlow migration - container access needs to use ViewportContext
  return null;
}

// Handle geo mode mouse move - update rendered position to screen position
function handleGeoModeMove(
  cyCompat: null,
  e: MouseEvent,
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>
): void {
  const pos = getContainerRelativePos(cyCompat, e);
  if (pos) {
    setRenderedPos((prev) => ({ ...prev, x: pos.x, y: pos.y }));
  }
}

// Handle non-geo mode mouse move - update rendered position via model transformation
function handleNonGeoModeMove(
  cyCompat: null,
  dragStart: DragStart,
  deltaX: number,
  deltaY: number,
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>
): void {
  const newModelX = dragStart.modelX + deltaX;
  const newModelY = dragStart.modelY + deltaY;
  const rendered = modelToRendered(cyCompat, newModelX, newModelY);
  setRenderedPos((prev) => ({ ...prev, x: rendered.x, y: rendered.y }));
}

// Finalize geo mode drag - convert screen to geo coords and call callback
function finalizeGeoDrag(
  cyCompat: null,
  e: MouseEvent,
  mapLibreState: MapLibreState,
  onGeoPositionChange: (geoCoords: { lat: number; lng: number }) => void
): void {
  const pos = getContainerRelativePos(cyCompat, e);
  if (pos) {
    const geoCoords = unprojectToGeoCoords(mapLibreState, pos);
    if (geoCoords) {
      onGeoPositionChange(geoCoords);
    }
  }
}

// Finalize non-geo mode drag - update model position
function finalizeNonGeoDrag(
  _cyCompat: null,
  e: MouseEvent,
  dragStart: DragStart,
  modelPosition: { x: number; y: number },
  onPositionChange: (position: { x: number; y: number }) => void,
  zoom: number = 1
): void {
  const { deltaX, deltaY } = calculateDelta(e, dragStart, zoom);
  const newModelX = Math.round(dragStart.modelX + deltaX);
  const newModelY = Math.round(dragStart.modelY + deltaY);
  if (newModelX !== modelPosition.x || newModelY !== modelPosition.y) {
    onPositionChange({ x: newModelX, y: newModelY });
  }
}

// Hook for viewport position synchronization (geo-aware)
function useViewportSync(
  cyCompat: null,
  modelX: number,
  modelY: number,
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>,
  mapLibreState?: MapLibreState | null,
  geoCoordinates?: { lat: number; lng: number }
): void {
  useEffect(() => {
    // Disabled during ReactFlow migration - viewport sync should use ViewportContext
    // Use geo-aware position calculation if in geo mode
    if (mapLibreState?.isInitialized && geoCoordinates) {
      const rendered = modelToRenderedGeo(mapLibreState, geoCoordinates, modelX, modelY);
      setRenderedPos(rendered);

      // In geo mode, listen to map move events to update positions
      if (mapLibreState.map) {
        const updatePosition = () => {
          const r = modelToRenderedGeo(mapLibreState, geoCoordinates, modelX, modelY);
          setRenderedPos(r);
        };
        mapLibreState.map.on("move", updatePosition);
        return () => {
          mapLibreState.map?.off("move", updatePosition);
        };
      }
      return; // No cleanup needed when map is not available
    }
    // Non-geo mode: set default position, viewport sync disabled
    setRenderedPos({ x: modelX, y: modelY, zoom: 1 });
    void cyCompat;
    return; // No cleanup needed
  }, [cyCompat, modelX, modelY, setRenderedPos, mapLibreState, geoCoordinates]);
}

// Get zoom factor for drag calculations
function getZoomFactor(_cyCompat: null, mapLibreState?: MapLibreState | null): number {
  if (mapLibreState?.isInitialized) {
    return calculateScale(mapLibreState);
  }
  // Default zoom when cyCompat is not available - should use ViewportContext
  return 1;
}

// Hook for drag event handlers (geo-aware)
interface DragHandlersOptions {
  cyCompat: null;
  isDragging: boolean;
  modelPosition: { x: number; y: number };
  dragStartRef: { current: DragStart | null };
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>;
  onPositionChange: (position: { x: number; y: number }) => void;
  mapLibreState?: MapLibreState | null;
  onGeoPositionChange?: (geoCoords: { lat: number; lng: number }) => void;
  onDragMove?: (modelPosition: { x: number; y: number }) => void;
  onDragEnd?: (finalPosition: { x: number; y: number }) => void;
}

function useDragHandlers(options: DragHandlersOptions): void {
  const {
    cyCompat,
    isDragging,
    modelPosition,
    dragStartRef,
    setIsDragging,
    setRenderedPos,
    onPositionChange,
    mapLibreState,
    onGeoPositionChange,
    onDragMove,
    onDragEnd
  } = options;
  useEffect(() => {
    if (!isDragging || !cyCompat) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      if (mapLibreState?.isInitialized) {
        handleGeoModeMove(cyCompat, e, setRenderedPos);
      } else {
        const zoomFactor = getZoomFactor(cyCompat, mapLibreState);
        const { deltaX, deltaY } = calculateDelta(e, dragStartRef.current, zoomFactor);
        handleNonGeoModeMove(cyCompat, dragStartRef.current, deltaX, deltaY, setRenderedPos);
        // Report model position during drag for background layer sync
        if (onDragMove) {
          const newModelX = dragStartRef.current.modelX + deltaX;
          const newModelY = dragStartRef.current.modelY + deltaY;
          onDragMove({ x: newModelX, y: newModelY });
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      setIsDragging(false);

      // Calculate final position
      const zoomFactor = getZoomFactor(cyCompat, mapLibreState);
      const { deltaX, deltaY } = calculateDelta(e, dragStartRef.current, zoomFactor);
      const finalX = Math.round(dragStartRef.current.modelX + deltaX);
      const finalY = Math.round(dragStartRef.current.modelY + deltaY);
      const finalPosition = { x: finalX, y: finalY };

      if (mapLibreState?.isInitialized && onGeoPositionChange) {
        finalizeGeoDrag(cyCompat, e, mapLibreState, onGeoPositionChange);
      } else {
        finalizeNonGeoDrag(cyCompat, e, dragStartRef.current, modelPosition, onPositionChange);
      }
      dragStartRef.current = null;
      // Notify that drag ended with final position (for reparenting)
      onDragEnd?.(finalPosition);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    cyCompat,
    modelPosition.x,
    modelPosition.y,
    dragStartRef,
    setIsDragging,
    setRenderedPos,
    onPositionChange,
    mapLibreState,
    onGeoPositionChange,
    onDragMove,
    onDragEnd
  ]);
}

export function useAnnotationDrag(options: UseAnnotationDragOptions): UseAnnotationDragReturn {
  const {
    cyCompat,
    modelPosition,
    isLocked,
    onPositionChange,
    onDragStart,
    onDragMove,
    onDragEnd,
    isGeoMode,
    geoMode,
    geoCoordinates,
    mapLibreState,
    onGeoPositionChange
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [renderedPos, setRenderedPos] = useState<RenderedPosition>({ x: 0, y: 0, zoom: 1 });
  const dragStartRef = useRef<DragStart | null>(null);

  // In geo mode, disable drag in pan mode (only map navigation should work)
  const effectivelyLocked = isLocked || (isGeoMode && geoMode === "pan");

  useViewportSync(
    cyCompat,
    modelPosition.x,
    modelPosition.y,
    setRenderedPos,
    mapLibreState,
    geoCoordinates
  );
  useDragHandlers({
    cyCompat,
    isDragging,
    modelPosition,
    dragStartRef,
    setIsDragging,
    setRenderedPos,
    onPositionChange,
    mapLibreState,
    onGeoPositionChange,
    onDragMove,
    onDragEnd
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (effectivelyLocked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        modelX: modelPosition.x,
        modelY: modelPosition.y
      };
      // Notify drag started (for reparenting)
      onDragStart?.();
    },
    [effectivelyLocked, modelPosition.x, modelPosition.y, onDragStart]
  );

  return { isDragging, renderedPos, handleMouseDown };
}
