/**
 * Hook for group resize interaction
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { GroupStyleAnnotation } from '../../../shared/types/topology';

/** Corner type alias for resize handles */
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
  corner: ResizeCorner;
  startX: number;
  startY: number;
  width: number;
  height: number;
  posX: number;
  posY: number;
}

export interface UseGroupResizeReturn {
  isResizing: boolean;
  handleResizeMouseDown: (e: React.MouseEvent, corner: ResizeCorner) => void;
}

function calcResizedDimensions(ref: ResizeState, dx: number, dy: number): { w: number; h: number } {
  const isEast = ref.corner === 'se' || ref.corner === 'ne';
  const isSouth = ref.corner === 'se' || ref.corner === 'sw';
  // Allow any size down to 20px minimum (just to prevent collapse)
  const w = Math.max(20, ref.width + dx * (isEast ? 1 : -1));
  const h = Math.max(20, ref.height + dy * (isSouth ? 1 : -1));
  return { w, h };
}

function calcResizedPosition(ref: ResizeState, w: number, h: number): { x: number; y: number } {
  const dw = (w - ref.width) / 2;
  const dh = (h - ref.height) / 2;
  const xMult = ref.corner.includes('e') ? 1 : -1;
  const yMult = ref.corner.includes('s') ? 1 : -1;
  return { x: ref.posX + dw * xMult, y: ref.posY + dh * yMult };
}

/**
 * Hook for resize event handlers
 */
function useGroupResizeEvents(
  isResizing: boolean,
  cy: CyCore,
  groupId: string,
  dragRef: React.RefObject<ResizeState | null>,
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>,
  onSizeChange: (id: string, width: number, height: number) => void,
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void
): void {
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;

      const { w, h } = calcResizedDimensions(dragRef.current, dx, dy);
      const pos = calcResizedPosition(dragRef.current, w, h);
      onSizeChange(groupId, w, h);
      onPositionChange(groupId, pos, { dx: 0, dy: 0 });
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
  }, [isResizing, cy, groupId, dragRef, setIsResizing, onSizeChange, onPositionChange]);
}

export function useGroupResize(
  cy: CyCore,
  group: GroupStyleAnnotation,
  groupId: string,
  isLocked: boolean,
  onSizeChange: (id: string, width: number, height: number) => void,
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void
): UseGroupResizeReturn {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<ResizeState | null>(null);

  useGroupResizeEvents(isResizing, cy, groupId, dragRef, setIsResizing, onSizeChange, onPositionChange);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, corner: ResizeCorner) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      width: group.width,
      height: group.height,
      posX: group.position.x,
      posY: group.position.y
    };
    setIsResizing(true);
  }, [isLocked, group]);

  return { isResizing, handleResizeMouseDown };
}
