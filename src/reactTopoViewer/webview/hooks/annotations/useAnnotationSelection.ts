/**
 * useAnnotationSelection - Consolidated hooks for annotation click handling and box selection
 */
import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import type { Core as CyCore } from "cytoscape";

import { log } from "../../utils/logger";

import { renderedToModel } from "./freeText";

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
 * @param cy - Cytoscape core instance
 * @param onCanvasClick - Handler for canvas click with model coordinates
 * @param layerName - Name of the layer for logging
 */
export function useLayerClickHandler(
  cy: CyCore | null,
  onCanvasClick: (pos: { x: number; y: number }) => void,
  layerName: string = "Layer"
) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (!cy) return;
      const container = cy.container();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const modelPos = renderedToModel(cy, e.clientX - rect.left, e.clientY - rect.top);
      onCanvasClick(modelPos);
      log.info(`[${layerName}] Canvas clicked at model (${modelPos.x}, ${modelPos.y})`);
    },
    [cy, onCanvasClick, layerName]
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
 * @param cy - Cytoscape core instance
 * @param annotations - Array of annotations
 * @param onBoxSelect - Handler called with selected annotation IDs
 * @param getCenter - Optional function to get the center position for selection calculation
 * @param layerName - Name of the layer for logging
 */
export function useAnnotationBoxSelection<T extends AnnotationWithPosition>(
  cy: CyCore | null,
  annotations: T[],
  onBoxSelect?: (ids: string[]) => void,
  getCenter?: (a: T) => { x: number; y: number },
  layerName: string = "Layer"
) {
  const boxStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!cy || !onBoxSelect) return;

    const handleBoxStart = (event: { position: { x: number; y: number } }) => {
      boxStartRef.current = { x: event.position.x, y: event.position.y };
    };

    const handleBoxEnd = (event: { position: { x: number; y: number } }) => {
      if (!boxStartRef.current) return;
      const box = {
        x1: boxStartRef.current.x,
        y1: boxStartRef.current.y,
        x2: event.position.x,
        y2: event.position.y
      };

      const selectedIds = annotations
        .filter((a) => isAnnotationInBox(a, box, getCenter))
        .map((a) => a.id);
      if (selectedIds.length > 0) {
        log.info(`[${layerName}] Box selected ${selectedIds.length} annotations`);
        onBoxSelect(selectedIds);
      }
      boxStartRef.current = null;
    };

    cy.on("boxstart", handleBoxStart);
    cy.on("boxend", handleBoxEnd);
    return () => {
      cy.off("boxstart", handleBoxStart);
      cy.off("boxend", handleBoxEnd);
    };
  }, [cy, annotations, onBoxSelect, getCenter, layerName]);
}
