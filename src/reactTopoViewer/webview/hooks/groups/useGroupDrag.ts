/**
 * Hook for group drag and resize interactions
 */
import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";

import type { CyCompatCore } from "../useCytoCompatInstance";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import { addMouseMoveUpListeners } from "../shared/dragHelpers";

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
    setDragPositions((prev) => ({ ...prev, [groupId]: position }));
  }, []);

  const clearDragPosition = useCallback((groupId: string) => {
    setDragPositions((prev) => {
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
  cy: CyCompatCore;
  groupId: string;
  isLocked: boolean;
  position: { x: number; y: number };
  onDragStart?: (id: string) => void;
  onPositionChange: (
    id: string,
    position: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
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
interface GroupDragEventsOptions {
  isDragging: boolean;
  cy: CyCompatCore;
  groupId: string;
  dragRef: React.RefObject<DragState | null>;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setDragPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onPositionChange: (
    id: string,
    position: { x: number; y: number },
    delta: { dx: number; dy: number }
  ) => void;
  onDragMove?: (id: string, delta: { dx: number; dy: number }) => void;
  onVisualPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onVisualPositionClear?: (id: string) => void;
  onDragEnd?: (id: string, finalPosition: { x: number; y: number }) => void;
}

function useGroupDragEvents(options: GroupDragEventsOptions): void {
  const {
    isDragging,
    cy,
    groupId,
    dragRef,
    setIsDragging,
    setDragPos,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear,
    onDragEnd
  } = options;
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
      const movedPx = Math.hypot(e.clientX - ref.startX, e.clientY - ref.startY);
      // Treat a click (no meaningful movement) as NOT a drag.
      // Without this guard, a click on the draggable border can trigger unintended reparenting.
      if (movedPx >= 3) {
        const zoom = cy.zoom();
        const dx = (e.clientX - ref.startX) / zoom;
        const dy = (e.clientY - ref.startY) / zoom;
        const finalPosition = { x: ref.modelX + dx, y: ref.modelY + dy };
        onPositionChange(groupId, finalPosition, { dx, dy });
        // Call onDragEnd to allow parent to detect drop target for reparenting
        onDragEnd?.(groupId, finalPosition);
      }
      setIsDragging(false);
      onVisualPositionClear?.(groupId);
      dragRef.current = null;
    };

    return addMouseMoveUpListeners(handleMouseMove, handleMouseUp);
  }, [
    isDragging,
    cy,
    groupId,
    dragRef,
    setIsDragging,
    setDragPos,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear,
    onDragEnd
  ]);
}

export function useGroupDragInteraction(
  options: UseGroupDragInteractionOptions
): UseGroupDragInteractionReturn {
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

  useGroupDragEvents({
    isDragging,
    cy,
    groupId,
    dragRef,
    setIsDragging,
    setDragPos,
    onPositionChange,
    onDragMove,
    onVisualPositionChange,
    onVisualPositionClear,
    onDragEnd
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [isLocked, position.x, position.y, onDragStart, groupId]
  );

  return { isDragging, dragPos, handleMouseDown };
}

// ============================================================================
// Group Resize
// ============================================================================

/** Corner type alias for resize handles */
export type ResizeCorner = "nw" | "ne" | "sw" | "se";

interface ResizeState {
  corner: ResizeCorner;
  startX: number;
  startY: number;
  width: number;
  height: number;
  posX: number;
  posY: number;
  minWidth: number;
  minHeight: number;
}

export interface UseGroupResizeReturn {
  isResizing: boolean;
  handleResizeMouseDown: (e: React.MouseEvent, corner: ResizeCorner) => void;
}

function calcResizedDimensions(ref: ResizeState, dx: number, dy: number): { w: number; h: number } {
  const isEast = ref.corner === "se" || ref.corner === "ne";
  const isSouth = ref.corner === "se" || ref.corner === "sw";
  // Use dynamic minimum based on contained objects (calculated at resize start)
  const w = Math.max(ref.minWidth, ref.width + dx * (isEast ? 1 : -1));
  const h = Math.max(ref.minHeight, ref.height + dy * (isSouth ? 1 : -1));
  return { w, h };
}

function calcResizedPosition(ref: ResizeState, w: number, h: number): { x: number; y: number } {
  const dw = (w - ref.width) / 2;
  const dh = (h - ref.height) / 2;
  const xMult = ref.corner.includes("e") ? 1 : -1;
  const yMult = ref.corner.includes("s") ? 1 : -1;
  return { x: ref.posX + dw * xMult, y: ref.posY + dh * yMult };
}

/** Compute resize dimensions and position from mouse event */
function computeResizeFromEvent(
  e: MouseEvent,
  ref: ResizeState,
  zoom: number
): { w: number; h: number; pos: { x: number; y: number } } {
  const dx = (e.clientX - ref.startX) / zoom;
  const dy = (e.clientY - ref.startY) / zoom;
  const { w, h } = calcResizedDimensions(ref, dx, dy);
  const pos = calcResizedPosition(ref, w, h);
  return { w, h, pos };
}

/**
 * Hook for resize event handlers.
 * Uses dedicated resize handlers to avoid undo spam during resize.
 */
function useGroupResizeEvents(
  isResizing: boolean,
  cy: CyCompatCore,
  groupId: string,
  dragRef: React.RefObject<ResizeState | null>,
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>,
  onResizeMove: (
    id: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void,
  onResizeEnd: (
    id: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void
): void {
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { w, h, pos } = computeResizeFromEvent(e, dragRef.current, cy.zoom());
      // Use onResizeMove for visual updates (no undo recording)
      onResizeMove(groupId, w, h, pos);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragRef.current) {
        const { w, h, pos } = computeResizeFromEvent(e, dragRef.current, cy.zoom());
        // Use onResizeEnd to record the undo action and final save
        onResizeEnd(groupId, w, h, pos);
      }
      setIsResizing(false);
      dragRef.current = null;
    };

    return addMouseMoveUpListeners(handleMouseMove, handleMouseUp);
  }, [isResizing, cy, groupId, dragRef, setIsResizing, onResizeMove, onResizeEnd]);
}

export function useGroupResize(
  cy: CyCompatCore,
  group: GroupStyleAnnotation,
  groupId: string,
  isLocked: boolean,
  onResizeStart: (id: string) => void,
  onResizeMove: (
    id: string,
    width: number,
    height: number,
    position: { x: number; y: number }
  ) => void,
  onResizeEnd: (
    id: string,
    finalWidth: number,
    finalHeight: number,
    finalPosition: { x: number; y: number }
  ) => void,
  getMinimumBounds: (groupId: string) => { minWidth: number; minHeight: number }
): UseGroupResizeReturn {
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<ResizeState | null>(null);

  useGroupResizeEvents(isResizing, cy, groupId, dragRef, setIsResizing, onResizeMove, onResizeEnd);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, corner: ResizeCorner) => {
      if (isLocked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      // Calculate minimum bounds at resize start (based on contained objects)
      const { minWidth, minHeight } = getMinimumBounds(groupId);
      dragRef.current = {
        corner,
        startX: e.clientX,
        startY: e.clientY,
        width: group.width,
        height: group.height,
        posX: group.position.x,
        posY: group.position.y,
        minWidth,
        minHeight
      };
      // Notify resize start to capture initial state for undo
      onResizeStart(groupId);
      setIsResizing(true);
    },
    [isLocked, group, groupId, onResizeStart, getMinimumBounds]
  );

  return { isResizing, handleResizeMouseDown };
}
