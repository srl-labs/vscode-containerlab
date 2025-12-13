/**
 * Hooks for annotation rotation and resize handles
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
// [MIGRATION] Replace with ReactFlow types from @xyflow/react
type CyCore = { zoom: () => number; pan: () => { x: number; y: number }; container: () => HTMLElement | null };
import { RenderedPosition } from '../../components/annotations/freeTextLayerHelpers';

// ============================================================================
// Rotation Hook
// ============================================================================

interface UseRotationDragOptions {
  cy: CyCore;
  renderedPos: RenderedPosition;
  currentRotation: number;
  isLocked: boolean;
  onRotationChange: (rotation: number) => void;
}

interface UseRotationDragReturn {
  isRotating: boolean;
  handleRotationMouseDown: (e: React.MouseEvent) => void;
}

interface RotationDragStart {
  mouseX: number;
  mouseY: number;
  centerX: number;
  centerY: number;
  startAngle: number;
  currentRotation: number;
}

function calculateAngle(centerX: number, centerY: number, mouseX: number, mouseY: number): number {
  const deltaX = mouseX - centerX;
  const deltaY = mouseY - centerY;
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

export function useRotationDrag(options: UseRotationDragOptions): UseRotationDragReturn {
  const { cy, renderedPos, currentRotation, isLocked, onRotationChange } = options;

  const [isRotating, setIsRotating] = useState(false);
  const dragStartRef = useRef<RotationDragStart | null>(null);

  useEffect(() => {
    if (!isRotating) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { centerX, centerY, startAngle, currentRotation: startRotation } = dragStartRef.current;
      const currentAngle = calculateAngle(centerX, centerY, e.clientX, e.clientY);
      const angleDelta = currentAngle - startAngle;
      const newRotation = normalizeRotation(startRotation + angleDelta);

      // Snap to 15-degree increments if shift is held
      const snappedRotation = e.shiftKey ? Math.round(newRotation / 15) * 15 : Math.round(newRotation);
      onRotationChange(snappedRotation);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isRotating, onRotationChange]);

  const handleRotationMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Get the center of the annotation in screen coordinates
    const container = cy.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + renderedPos.x;
    const centerY = rect.top + renderedPos.y;

    const startAngle = calculateAngle(centerX, centerY, e.clientX, e.clientY);

    setIsRotating(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      centerX,
      centerY,
      startAngle,
      currentRotation
    };
  }, [cy, isLocked, renderedPos.x, renderedPos.y, currentRotation]);

  return { isRotating, handleRotationMouseDown };
}

// ============================================================================
// Resize Hook
// ============================================================================

/** Corner type alias for resize handles */
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface UseResizeDragOptions {
  renderedPos: RenderedPosition;
  currentWidth: number | undefined;
  currentHeight: number | undefined;
  contentRef: React.RefObject<HTMLDivElement | null>;
  isLocked: boolean;
  onSizeChange: (width: number, height: number) => void;
}

interface UseResizeDragReturn {
  isResizing: boolean;
  handleResizeMouseDown: (e: React.MouseEvent, corner: ResizeCorner) => void;
}

interface ResizeDragStart {
  mouseX: number;
  mouseY: number;
  startWidth: number;
  startHeight: number;
  corner: ResizeCorner;
}

const MIN_SIZE = 20;

/** Calculate new size based on corner and delta */
function calculateNewSize(
  corner: ResizeCorner,
  startWidth: number,
  startHeight: number,
  deltaX: number,
  deltaY: number
): { width: number; height: number } {
  const cornerMultipliers: Record<ResizeCorner, { x: number; y: number }> = {
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 }
  };
  const mult = cornerMultipliers[corner];
  return {
    width: Math.max(MIN_SIZE, startWidth + deltaX * mult.x),
    height: Math.max(MIN_SIZE, startHeight + deltaY * mult.y)
  };
}

/** Apply aspect ratio constraint if shift is held */
function applyAspectRatio(width: number, height: number, startWidth: number, startHeight: number): { width: number; height: number } {
  const aspectRatio = startWidth / startHeight;
  if (width / height > aspectRatio) {
    return { width: height * aspectRatio, height };
  }
  return { width, height: width / aspectRatio };
}

/** Hook for resize drag event handlers */
function useResizeDragHandlers(
  isResizing: boolean,
  dragStartRef: React.RefObject<ResizeDragStart | null>,
  zoom: number,
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>,
  onSizeChange: (width: number, height: number) => void
): void {
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { mouseX, mouseY, startWidth, startHeight, corner } = dragStartRef.current;
      const deltaX = (e.clientX - mouseX) / zoom;
      const deltaY = (e.clientY - mouseY) / zoom;

      let { width, height } = calculateNewSize(corner, startWidth, startHeight, deltaX, deltaY);

      if (e.shiftKey) {
        ({ width, height } = applyAspectRatio(width, height, startWidth, startHeight));
      }

      onSizeChange(Math.round(width), Math.round(height));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, dragStartRef, zoom, setIsResizing, onSizeChange]);
}

export function useResizeDrag(options: UseResizeDragOptions): UseResizeDragReturn {
  const { renderedPos, currentWidth, currentHeight, contentRef, isLocked, onSizeChange } = options;

  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<ResizeDragStart | null>(null);

  useResizeDragHandlers(isResizing, dragStartRef, renderedPos.zoom, setIsResizing, onSizeChange);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, corner: ResizeCorner) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    let startWidth = currentWidth || 100;
    let startHeight = currentHeight || 50;

    if (contentRef.current && !currentWidth && !currentHeight) {
      const rect = contentRef.current.getBoundingClientRect();
      startWidth = rect.width / renderedPos.zoom;
      startHeight = rect.height / renderedPos.zoom;
    }

    setIsResizing(true);
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, startWidth, startHeight, corner };
  }, [isLocked, currentWidth, currentHeight, contentRef, renderedPos.zoom]);

  return { isResizing, handleResizeMouseDown };
}
