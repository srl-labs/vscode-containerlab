/**
 * useAnnotationSelection - Consolidated hooks for annotation click handling and box selection
 */
import type React from "react";
import { useState, useEffect, useCallback } from "react";

// Unused during ReactFlow migration
// import { log } from '../../utils/logger';
// import { renderedToModel } from './freeText';

/**
 * Hook for annotation click handlers including selection and context menu
 * @param isLocked - Whether the annotation is locked
 * @param onSelect - Handler for single selection
 * @param onToggleSelect - Handler for toggle selection (Ctrl+click)
 * @param onDoubleClick - Optional handler for double-click (FreeText only)
 * @param onDelete - Optional handler for Alt+click delete
 */
export function useAnnotationClickHandlers(
  isLocked: boolean,
  onSelect: () => void,
  onToggleSelect: () => void,
  onDoubleClick?: () => void,
  onDelete?: () => void
) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't select on right-click
      if (e.button === 2) return;
      e.stopPropagation();

      // Alt+Click deletes the annotation (only in edit mode, i.e. not locked)
      if (e.altKey && onDelete && !isLocked) {
        onDelete();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        onToggleSelect();
      } else {
        onSelect();
      }
    },
    [isLocked, onSelect, onToggleSelect, onDelete]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onDoubleClick) return;
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) onDoubleClick();
    },
    [isLocked, onDoubleClick]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLocked) setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [isLocked]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return { contextMenu, handleClick, handleDoubleClick, handleContextMenu, closeContextMenu };
}

/**
 * Hook for canvas click handler in add-annotation mode
 * @param cyCompat - Cytoscape-compatible core instance
 * @param onCanvasClick - Handler for canvas click with model coordinates
 * @param layerName - Name of the layer for logging
 */
export function useLayerClickHandler(
  cyCompat: null,
  onCanvasClick: (pos: { x: number; y: number }) => void,
  layerName: string = "Layer"
) {
  return useCallback(
    (e: React.MouseEvent) => {
      // Disabled during ReactFlow migration - should use ViewportContext for coordinate conversion
      void cyCompat;
      void layerName;
      // Use client coordinates directly as a fallback (no pan/zoom conversion)
      onCanvasClick({ x: e.clientX, y: e.clientY });
    },
    [cyCompat, onCanvasClick, layerName]
  );
}

interface AnnotationWithPosition {
  id: string;
  position: { x: number; y: number };
  shapeType?: string;
  endPosition?: { x: number; y: number };
}

/**
 * Check if an annotation is within a selection box (in model coordinates)
 */
function isAnnotationInBox<T extends AnnotationWithPosition>(
  annotation: T,
  box: { x1: number; y1: number; x2: number; y2: number },
  getCenter?: (a: T) => { x: number; y: number }
): boolean {
  const center = getCenter ? getCenter(annotation) : annotation.position;
  const minX = Math.min(box.x1, box.x2);
  const maxX = Math.max(box.x1, box.x2);
  const minY = Math.min(box.y1, box.y2);
  const maxY = Math.max(box.y1, box.y2);
  return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY;
}

/**
 * Hook for box selection of annotations
 * Note: Box selection events are not yet implemented in the compatibility layer.
 * This hook is a stub that will need to be implemented when ReactFlow box selection is added.
 * @param cyCompat - Cytoscape-compatible core instance
 * @param annotations - Array of annotations
 * @param onBoxSelect - Handler called with selected annotation IDs
 * @param getCenter - Optional function to get the center position for selection calculation
 * @param layerName - Name of the layer for logging
 */
export function useAnnotationBoxSelection<T extends AnnotationWithPosition>(
  cyCompat: null,
  annotations: T[],
  onBoxSelect?: (ids: string[]) => void,
  getCenter?: (a: T) => { x: number; y: number },
  layerName: string = "Layer"
) {
  useEffect(() => {
    // Disabled during ReactFlow migration - box selection not yet implemented
    void cyCompat;
    void annotations;
    void onBoxSelect;
    void getCenter;
    void layerName;
    void isAnnotationInBox;
  }, [cyCompat, annotations, onBoxSelect, getCenter, layerName]);
}
