/**
 * Hook for group drag interaction
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

interface DragState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  modelX: number;
  modelY: number;
}

export interface UseGroupDragInteractionOptions {
  cy: CyCore;
  groupId: string;
  isLocked: boolean;
  position: { x: number; y: number };
  onDragStart?: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear?: (id: string) => void;
}

export interface UseGroupDragInteractionReturn {
  isDragging: boolean;
  dragPos: { x: number; y: number };
  handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook for drag events during group dragging
 */
function useGroupDragEvents(
  isDragging: boolean,
  cy: CyCore,
  groupId: string,
  dragRef: React.RefObject<DragState | null>,
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>,
  setDragPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
  onPositionChange: (id: string, position: { x: number; y: number }, delta: { dx: number; dy: number }) => void,
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void,
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void,
  onVisualPositionClear?: (id: string) => void
): void {
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const zoom = cy.zoom();

      const incrDx = (e.clientX - ref.lastX) / zoom;
      const incrDy = (e.clientY - ref.lastY) / zoom;
      const totalDx = (e.clientX - ref.startX) / zoom;
      const totalDy = (e.clientY - ref.startY) / zoom;

      ref.lastX = e.clientX;
      ref.lastY = e.clientY;

      const nextPos = { x: ref.modelX + totalDx, y: ref.modelY + totalDy };
      setDragPos(nextPos);
      onVisualPositionChange?.(groupId, nextPos);
      onDragMove?.(groupId, { dx: incrDx, dy: incrDy });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const ref = dragRef.current;
      if (!ref) return;
      const zoom = cy.zoom();
      const dx = (e.clientX - ref.startX) / zoom;
      const dy = (e.clientY - ref.startY) / zoom;
      onPositionChange(groupId, { x: ref.modelX + dx, y: ref.modelY + dy }, { dx, dy });
      setIsDragging(false);
      onVisualPositionClear?.(groupId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, cy, groupId, dragRef, setIsDragging, setDragPos, onPositionChange, onDragMove, onVisualPositionChange, onVisualPositionClear]);
}

export function useGroupDragInteraction(options: UseGroupDragInteractionOptions): UseGroupDragInteractionReturn {
  const {
    cy,
    groupId,
    isLocked,
    position,
    onDragStart,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(position);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!isDragging) setDragPos(position);
  }, [position, isDragging]);

  useGroupDragEvents(
    isDragging, cy, groupId, dragRef, setIsDragging, setDragPos,
    onPositionChange, onDragMove, onVisualPositionChange, onVisualPositionClear
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLocked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      modelX: position.x,
      modelY: position.y
    };
    onDragStart?.(groupId);
    setIsDragging(true);
  }, [isLocked, position.x, position.y, onDragStart, groupId]);

  return { isDragging, dragPos, handleMouseDown };
}
