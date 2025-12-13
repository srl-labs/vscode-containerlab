/**
 * Hook for annotation drag functionality
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
// [MIGRATION] Replace with ReactFlow types from @xyflow/react
type CyCore = { zoom: () => number; pan: () => { x: number; y: number }; container: () => HTMLElement | null };
import { modelToRendered, RenderedPosition } from '../../components/annotations/freeTextLayerHelpers';

interface DragStart {
  mouseX: number;
  mouseY: number;
  modelX: number;
  modelY: number;
}

interface UseAnnotationDragOptions {
  cy: CyCore;
  modelPosition: { x: number; y: number };
  isLocked: boolean;
  onPositionChange: (position: { x: number; y: number }) => void;
}

interface UseAnnotationDragReturn {
  isDragging: boolean;
  renderedPos: RenderedPosition;
  handleMouseDown: (e: React.MouseEvent) => void;
}

// Helper to calculate delta from drag start
function calculateDelta(e: MouseEvent, dragStart: DragStart, zoom: number): { deltaX: number; deltaY: number } {
  return {
    deltaX: (e.clientX - dragStart.mouseX) / zoom,
    deltaY: (e.clientY - dragStart.mouseY) / zoom
  };
}

// Hook for viewport position synchronization
function useViewportSync(
  cy: CyCore,
  modelX: number,
  modelY: number,
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>
): void {
  useEffect(() => {
    const updatePosition = () => {
      const rendered = modelToRendered(cy, modelX, modelY);
      setRenderedPos({ x: rendered.x, y: rendered.y, zoom: cy.zoom() });
    };
    updatePosition();
    cy.on('pan zoom', updatePosition);
    return () => { cy.off('pan zoom', updatePosition); };
  }, [cy, modelX, modelY, setRenderedPos]);
}

// Hook for drag event handlers
function useDragHandlers(
  cy: CyCore,
  isDragging: boolean,
  modelPosition: { x: number; y: number },
  dragStartRef: { current: DragStart | null },
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>,
  setRenderedPos: React.Dispatch<React.SetStateAction<RenderedPosition>>,
  onPositionChange: (position: { x: number; y: number }) => void
): void {
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { deltaX, deltaY } = calculateDelta(e, dragStartRef.current, cy.zoom());
      const newModelX = dragStartRef.current.modelX + deltaX;
      const newModelY = dragStartRef.current.modelY + deltaY;
      const rendered = modelToRendered(cy, newModelX, newModelY);
      setRenderedPos(prev => ({ ...prev, x: rendered.x, y: rendered.y }));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      setIsDragging(false);
      const { deltaX, deltaY } = calculateDelta(e, dragStartRef.current, cy.zoom());
      const newModelX = Math.round(dragStartRef.current.modelX + deltaX);
      const newModelY = Math.round(dragStartRef.current.modelY + deltaY);
      const positionChanged = newModelX !== modelPosition.x || newModelY !== modelPosition.y;
      if (positionChanged) {
        onPositionChange({ x: newModelX, y: newModelY });
      }
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, cy, modelPosition.x, modelPosition.y, dragStartRef, setIsDragging, setRenderedPos, onPositionChange]);
}

export function useAnnotationDrag(options: UseAnnotationDragOptions): UseAnnotationDragReturn {
  const { cy, modelPosition, isLocked, onPositionChange } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [renderedPos, setRenderedPos] = useState<RenderedPosition>({ x: 0, y: 0, zoom: 1 });
  const dragStartRef = useRef<DragStart | null>(null);

  useViewportSync(cy, modelPosition.x, modelPosition.y, setRenderedPos);
  useDragHandlers(cy, isDragging, modelPosition, dragStartRef, setIsDragging, setRenderedPos, onPositionChange);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      modelX: modelPosition.x,
      modelY: modelPosition.y
    };
  }, [isLocked, modelPosition.x, modelPosition.y]);

  return { isDragging, renderedPos, handleMouseDown };
}
