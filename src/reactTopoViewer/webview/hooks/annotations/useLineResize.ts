/**
 * useLineResize - Hook for resizing line annotations by dragging endpoints
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';
import type { FreeShapeAnnotation } from '../../../shared/types/topology';
import { MIN_SHAPE_SIZE, DEFAULT_LINE_LENGTH } from './freeShapeHelpers';

/**
 * Hook for handling line endpoint resize drag operations
 */
export function useLineResizeDrag(
  cy: CyCore,
  annotation: FreeShapeAnnotation,
  isLocked: boolean,
  onEndPositionChange: (pos: { x: number; y: number }) => void
) {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startDx: number;
    startDy: number;
    rotationRad: number;
  } | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const zoom = cy.zoom();
      const dxClient = e.clientX - dragRef.current.startClientX;
      const dyClient = e.clientY - dragRef.current.startClientY;

      const rotatedDx = (dxClient * Math.cos(-dragRef.current.rotationRad) - dyClient * Math.sin(-dragRef.current.rotationRad)) / zoom;
      const rotatedDy = (dxClient * Math.sin(-dragRef.current.rotationRad) + dyClient * Math.cos(-dragRef.current.rotationRad)) / zoom;

      let newDx = dragRef.current.startDx + rotatedDx;
      let newDy = dragRef.current.startDy + rotatedDy;
      const length = Math.hypot(newDx, newDy);
      if (length > 0 && length < MIN_SHAPE_SIZE) {
        const scale = MIN_SHAPE_SIZE / length;
        newDx *= scale;
        newDy *= scale;
      }

      onEndPositionChange({
        x: annotation.position.x + newDx,
        y: annotation.position.y + newDy
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      dragRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, cy, annotation.position.x, annotation.position.y, onEndPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const end = annotation.endPosition ?? {
      x: annotation.position.x + DEFAULT_LINE_LENGTH,
      y: annotation.position.y
    };
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDx: end.x - annotation.position.x,
      startDy: end.y - annotation.position.y,
      rotationRad: ((annotation.rotation ?? 0) * Math.PI) / 180
    };
    setIsResizing(true);
  }, [isLocked, annotation]);

  return { isResizing, handleMouseDown };
}
