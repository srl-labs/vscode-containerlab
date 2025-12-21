/**
 * Hook for group drag and resize interactions
 */
import type React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { Core as CyCore } from 'cytoscape';

import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { addMouseMoveUpListeners } from '../shared/dragHelpers';

// ============================================================================
// useDragPositionOverrides - Manage drag position overrides during group dragging
// ============================================================================

export interface UseDragPositionOverridesReturn {
  dragPositions: Record<string, { x: number; y: number }>;
  setDragPosition: (groupId: string, position: { x: number; y: number }) => void;
  clearDragPosition: (groupId: string) => void;
}

/**
 * Hook for managing drag position overrides during group dragging
 */
export function useDragPositionOverrides(): UseDragPositionOverridesReturn {
  const [dragPositions, setDragPositions] = useState<Record<string, { x: number; y: number }>>({});

  const setDragPosition = useCallback((groupId: string, position: { x: number; y: number }) => {
    setDragPositions(prev => ({ ...prev, [groupId]: position }));
  }, []);

  const clearDragPosition = useCallback((groupId: string) => {
    setDragPositions(prev => {
      if (!(groupId in prev)) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  }, []);

  return { dragPositions, setDragPosition, clearDragPosition };
}

// ============================================================================
// useGroupDragInteraction - Main group drag interaction hook
// ============================================================================

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
  /** Called when drag ends, allowing parent to detect drop target for reparenting */
  onDragEnd?: (id: string, finalPosition: { x: number; y: number }) => void;
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
  onVisualPositionClear?: (id: string) => void,
  onDragEnd?: (id: string, finalPosition: { x: number; y: number }) => void
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
      const finalPosition = { x: ref.modelX + dx, y: ref.modelY + dy };
      onPositionChange(groupId, finalPosition, { dx, dy });
      setIsDragging(false);
      onVisualPositionClear?.(groupId);
      // Call onDragEnd to allow parent to detect drop target for reparenting
      onDragEnd?.(groupId, finalPosition);
    };

    return addMouseMoveUpListeners(handleMouseMove, handleMouseUp);
  }, [isDragging, cy, groupId, dragRef, setIsDragging, setDragPos, onPositionChange, onDragMove, onVisualPositionChange, onVisualPositionClear, onDragEnd]);
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
    onVisualPositionClear,
    onDragEnd
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(position);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!isDragging) setDragPos(position);
  }, [position, isDragging]);

  useGroupDragEvents(
    isDragging, cy, groupId, dragRef, setIsDragging, setDragPos,
    onPositionChange, onDragMove, onVisualPositionChange, onVisualPositionClear, onDragEnd
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

// ============================================================================
// Group Resize
// ============================================================================

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

    return addMouseMoveUpListeners(handleMouseMove, handleMouseUp);
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
