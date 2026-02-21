// Annotation handles for rotation and line resize.
import React, { useCallback, useRef, useState, useEffect } from "react";
import { useReactFlow, useUpdateNodeInternals } from "@xyflow/react";

import { SELECTION_COLOR } from "../types";

// ============================================================================
// Global Line Handle Drag State
// ============================================================================

/**
 * Global state to track which line handle is being dragged.
 * Stored at module level to survive component remounts during drag.
 */
interface LineHandleDragState {
  nodeId: string;
  mode: "start" | "end";
  startClientX: number;
  startClientY: number;
  startHandleX: number;
  startHandleY: number;
  zoom: number;
}

let activeLineDrag: LineHandleDragState | null = null;

/** Check if a line handle drag is in progress */
export function isLineHandleActive(): boolean {
  return activeLineDrag !== null;
}

/** Get active drag state for a specific handle */
function getActiveLineDrag(nodeId: string, mode: "start" | "end"): LineHandleDragState | null {
  if (activeLineDrag && activeLineDrag.nodeId === nodeId && activeLineDrag.mode === mode) {
    return activeLineDrag;
  }
  return null;
}

/** Set the line handle drag state */
function setActiveLineDrag(state: LineHandleDragState | null): void {
  activeLineDrag = state;
}

// ============================================================================
// Constants
// ============================================================================

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;
const HANDLE_BOX_SHADOW = "0 2px 4px rgba(0,0,0,0.3)";
const CENTER_TRANSFORM = "translate(-50%, -50%)";

/** Custom rotation cursor (SVG data URL) - white with black outline for visibility */
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 3v5h-5' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23fff' stroke-width='2'/%3E%3Cpath d='M21 3v5h-5' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`;
const ROTATE_CURSOR_ACTIVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 3v5h-5' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%2300bfff' stroke-width='2'/%3E%3Cpath d='M21 3v5h-5' stroke='%2300bfff' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`;

// ============================================================================
// Rotation Handle
// ============================================================================

interface RotationHandleProps {
  readonly nodeId: string;
  readonly currentRotation: number;
  /** Called during rotation with live rotation value */
  readonly onRotationChange: (id: string, rotation: number) => void;
  /** Called when rotation starts (for undo/redo snapshot capture) */
  readonly onRotationStart?: () => void;
  /** Called when rotation ends (for undo/redo commit) */
  readonly onRotationEnd?: () => void;
}

/** Calculate angle from center to mouse position */
function calculateAngle(centerX: number, centerY: number, mouseX: number, mouseY: number): number {
  const deltaX = mouseX - centerX;
  const deltaY = mouseY - centerY;
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
}

/** Normalize rotation to 0-360 range */
function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/**
 * Returns a callback to sync node internals with React Flow.
 * Should be called AFTER rotation completes (on mouseup), not during drag,
 * to avoid interrupting the rotation interaction.
 */
function useRotationInternalsSync(nodeId: string): () => void {
  const updateNodeInternals = useUpdateNodeInternals();

  return useCallback(() => {
    // Refresh node internals so the selection box and resize handles keep in
    // sync with the rotated element, matching React Flow's rotatable example.
    updateNodeInternals(nodeId);
  }, [nodeId, updateNodeInternals]);
}

export const RotationHandle: React.FC<RotationHandleProps> = ({
  nodeId,
  currentRotation,
  onRotationChange,
  onRotationStart,
  onRotationEnd,
}) => {
  const [isRotating, setIsRotating] = useState(false);
  const lastEmittedRotationRef = useRef<number>(currentRotation);
  const dragStartRef = useRef<{
    startAngle: number;
    centerX: number;
    centerY: number;
    startRotation: number;
  } | null>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  // Get callback to sync node internals - only called after rotation completes
  const syncNodeInternals = useRotationInternalsSync(nodeId);

  useEffect(() => {
    if (!isRotating) {
      lastEmittedRotationRef.current = currentRotation;
    }
  }, [currentRotation, isRotating]);

  useEffect(() => {
    if (!isRotating) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const { centerX, centerY, startAngle, startRotation } = dragStartRef.current;
      const currentAngle = calculateAngle(centerX, centerY, e.clientX, e.clientY);
      const angleDelta = currentAngle - startAngle;
      let newRotation = normalizeRotation(startRotation + angleDelta);

      // Snap to 15-degree increments if shift is held
      if (e.shiftKey) {
        newRotation = Math.round(newRotation / 15) * 15;
      }

      const roundedRotation = Math.round(newRotation);
      if (roundedRotation === lastEmittedRotationRef.current) return;
      lastEmittedRotationRef.current = roundedRotation;
      onRotationChange(nodeId, roundedRotation);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      dragStartRef.current = null;
      // Sync node internals AFTER rotation completes to update selection box
      syncNodeInternals();
      // Notify parent that rotation ended (for undo/redo commit)
      onRotationEnd?.();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isRotating, nodeId, onRotationChange, onRotationEnd, syncNodeInternals]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = handleRef.current;
      if (!handle) return;

      // Calculate the rotation center from the parent node container.
      // This keeps rotation stable regardless of node size or handle offset.
      const parent = handle.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const centerX = parentRect.left + parentRect.width / 2;
      const centerY = parentRect.top + parentRect.height / 2;

      const startAngle = calculateAngle(centerX, centerY, e.clientX, e.clientY);

      setIsRotating(true);
      lastEmittedRotationRef.current = currentRotation;
      // Notify parent that rotation started (for undo/redo snapshot and keeping handles visible)
      onRotationStart?.();
      dragStartRef.current = {
        startAngle,
        centerX,
        centerY,
        startRotation: currentRotation,
      };
    },
    [currentRotation, onRotationStart]
  );

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  }, []);

  return (
    <>
      {/* Connecting line */}
      <div
        className="nodrag nopan"
        style={{
          position: "absolute",
          top: `-${ROTATION_HANDLE_OFFSET}px`,
          left: "50%",
          width: "2px",
          height: `${ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2}px`,
          backgroundColor: SELECTION_COLOR,
          transform: "translateX(-50%)",
          pointerEvents: "none",
          opacity: 0.6,
        }}
      />
      {/* Rotation handle */}
      <button
        type="button"
        aria-label="Rotate annotation"
        ref={handleRef}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        className="nodrag nopan nowheel"
        style={{
          appearance: "none",
          padding: 0,
          position: "absolute",
          top: `-${ROTATION_HANDLE_OFFSET}px`,
          left: "50%",
          width: `${HANDLE_SIZE + 8}px`,
          height: `${HANDLE_SIZE + 8}px`,
          backgroundColor: SELECTION_COLOR,
          border: "2px solid white",
          borderRadius: "50%",
          transform: CENTER_TRANSFORM,
          cursor: isRotating ? ROTATE_CURSOR_ACTIVE : ROTATE_CURSOR,
          boxShadow: HANDLE_BOX_SHADOW,
          zIndex: 1000,
          pointerEvents: "auto",
        }}
        title="Drag to rotate (Shift for 15° snap)"
      />
    </>
  );
};

// ============================================================================
// Line Resize Handle (for resizing lines)
// ============================================================================

const MIN_LINE_LENGTH = 20;

type LineHandleMode = "start" | "end";

interface LineResizeHandleProps {
  readonly nodeId: string;
  readonly startPosition: { x: number; y: number };
  readonly endPosition: { x: number; y: number };
  /** Offset of line start within the node (for bounding box positioning) */
  readonly lineStartOffset: { x: number; y: number };
  readonly mode: LineHandleMode;
  readonly onPositionChange: (id: string, position: { x: number; y: number }) => void;
  /** Called when drag ends - use to persist changes */
  readonly onDragEnd?: () => void;
}

function getHandleCursor(mode: LineHandleMode, isResizing: boolean): string {
  if (isResizing) return "grabbing";
  return mode === "end" ? "nwse-resize" : "nesw-resize";
}

export const LineResizeHandle: React.FC<LineResizeHandleProps> = ({
  nodeId,
  startPosition,
  endPosition,
  lineStartOffset,
  mode,
  onPositionChange,
  onDragEnd,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const reactFlow = useReactFlow();
  // Store callbacks in refs so document listeners always have the latest
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // Store current anchor position in ref for mousemove handler
  const anchorRef = useRef(mode === "end" ? startPosition : endPosition);
  anchorRef.current = mode === "end" ? startPosition : endPosition;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const viewport = reactFlow.getViewport();
      const origin = mode === "end" ? endPosition : startPosition;
      const zoom = viewport.zoom || 1;

      // Store drag state at module level
      setActiveLineDrag({
        nodeId,
        mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startHandleX: origin.x,
        startHandleY: origin.y,
        zoom,
      });

      setIsResizing(true);

      // Track pending position for throttled updates
      let pendingPosition: { x: number; y: number } | null = null;
      let rafId: number | null = null;

      // Process pending position update (throttled via requestAnimationFrame)
      const processPendingUpdate = () => {
        rafId = null;
        if (pendingPosition) {
          onPositionChangeRef.current(nodeId, pendingPosition);
          pendingPosition = null;
        }
      };

      // Set up document listeners directly - bypasses React effect lifecycle
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dragState = getActiveLineDrag(nodeId, mode);
        if (!dragState) return;

        const deltaClientX = moveEvent.clientX - dragState.startClientX;
        const deltaClientY = moveEvent.clientY - dragState.startClientY;
        const deltaX = deltaClientX / dragState.zoom;
        const deltaY = deltaClientY / dragState.zoom;

        let nextX = dragState.startHandleX + deltaX;
        let nextY = dragState.startHandleY + deltaY;

        // Ensure minimum line length using current anchor from ref
        const anchor = anchorRef.current;
        const dx = nextX - anchor.x;
        const dy = nextY - anchor.y;
        const length = Math.hypot(dx, dy);
        if (length < MIN_LINE_LENGTH && length > 0) {
          const scale = MIN_LINE_LENGTH / length;
          nextX = anchor.x + dx * scale;
          nextY = anchor.y + dy * scale;
        }

        // Throttle updates using requestAnimationFrame
        pendingPosition = { x: Math.round(nextX), y: Math.round(nextY) };
        rafId ??= window.requestAnimationFrame(processPendingUpdate);
      };

      const handleMouseUp = () => {
        // Cancel any pending animation frame
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
        // Apply final position if pending
        if (pendingPosition) {
          onPositionChangeRef.current(nodeId, pendingPosition);
        }
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        setIsResizing(false);
        setTimeout(() => setActiveLineDrag(null), 0);
        // Persist changes on drag end
        onDragEndRef.current?.();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [nodeId, endPosition, startPosition, reactFlow, mode]
  );

  const handleX =
    mode === "end" ? lineStartOffset.x + (endPosition.x - startPosition.x) : lineStartOffset.x;
  const handleY =
    mode === "end" ? lineStartOffset.y + (endPosition.y - startPosition.y) : lineStartOffset.y;

  return (
    <button
      type="button"
      aria-label={mode === "end" ? "Resize line end handle" : "Resize line start handle"}
      onMouseDown={handleMouseDown}
      className="nodrag nopan nowheel"
      style={{
        appearance: "none",
        padding: 0,
        position: "absolute",
        left: `${handleX}px`,
        top: `${handleY}px`,
        width: `${HANDLE_SIZE + 4}px`,
        height: `${HANDLE_SIZE + 4}px`,
        backgroundColor: "white",
        border: `2px solid ${SELECTION_COLOR}`,
        borderRadius: "2px",
        transform: CENTER_TRANSFORM,
        cursor: getHandleCursor(mode, isResizing),
        boxShadow: HANDLE_BOX_SHADOW,
        zIndex: 1000,
        pointerEvents: "auto",
      }}
      title="Drag to resize line"
    />
  );
};
