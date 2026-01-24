/**
 * Shared annotation handles for rotation and line resize
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';

import { SELECTION_COLOR } from '../types';

// ============================================================================
// Global Line Handle Drag State
// ============================================================================

/**
 * Global flag to track when a line handle is being dragged.
 * Used by onNodeDragStop to skip position updates during handle resize.
 */
let isLineHandleDragging = false;

/** Check if a line handle drag is in progress */
export function isLineHandleActive(): boolean {
  return isLineHandleDragging;
}

/** Set the line handle drag state */
function setLineHandleDragging(dragging: boolean): void {
  isLineHandleDragging = dragging;
}

/** Create a mouseup handler for line handle drag end */
function createLineHandleMouseUpHandler(
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>,
  dragStartRef: { current: unknown }
): () => void {
  return () => {
    setIsResizing(false);
    dragStartRef.current = null;
    // Delay clearing the flag to ensure onNodeDragStop checks it first
    // This prevents the position update from overriding the handle's change
    setTimeout(() => setLineHandleDragging(false), 0);
  };
}

// ============================================================================
// Constants
// ============================================================================

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;
const HANDLE_BOX_SHADOW = '0 2px 4px rgba(0,0,0,0.3)';
const CENTER_TRANSFORM = 'translate(-50%, -50%)';

/** Custom rotation cursor (SVG data URL) - white with black outline for visibility */
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 3v5h-5' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23fff' stroke-width='2'/%3E%3Cpath d='M21 3v5h-5' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`;
const ROTATE_CURSOR_ACTIVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 3v5h-5' stroke='%23000' stroke-width='3'/%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' stroke='%2300bfff' stroke-width='2'/%3E%3Cpath d='M21 3v5h-5' stroke='%2300bfff' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`;

// ============================================================================
// Rotation Handle
// ============================================================================

interface RotationHandleProps {
  readonly nodeId: string;
  readonly currentRotation: number;
  readonly onRotationChange: (id: string, rotation: number) => void;
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

function useSyncRotationInternals(nodeId: string, rotation: number): void {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    // Refresh node internals so the selection box and resize handles keep in
    // sync with the rotated element, matching React Flow's rotatable example.
    updateNodeInternals(nodeId);
  }, [nodeId, rotation, updateNodeInternals]);
}

export const RotationHandle: React.FC<RotationHandleProps> = ({
  nodeId,
  currentRotation,
  onRotationChange
}) => {
  const [isRotating, setIsRotating] = useState(false);
  const dragStartRef = useRef<{
    startAngle: number;
    centerX: number;
    centerY: number;
    startRotation: number;
  } | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useSyncRotationInternals(nodeId, currentRotation);

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

      onRotationChange(nodeId, Math.round(newRotation));
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
  }, [isRotating, nodeId, onRotationChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
    dragStartRef.current = {
      startAngle,
      centerX,
      centerY,
      startRotation: currentRotation
    };
  }, [currentRotation]);

  return (
    <>
      {/* Connecting line */}
      <div
        className="nodrag nopan"
        style={{
          position: 'absolute',
          top: `-${ROTATION_HANDLE_OFFSET}px`,
          left: '50%',
          width: '2px',
          height: `${ROTATION_HANDLE_OFFSET - HANDLE_SIZE / 2}px`,
          backgroundColor: SELECTION_COLOR,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          opacity: 0.6
        }}
      />
      {/* Rotation handle */}
      <div
        ref={handleRef}
        onMouseDown={handleMouseDown}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onPointerDown={(e) => { e.stopPropagation(); }}
        className="nodrag nopan nowheel"
        style={{
          position: 'absolute',
          top: `-${ROTATION_HANDLE_OFFSET}px`,
          left: '50%',
          width: `${HANDLE_SIZE + 8}px`,
          height: `${HANDLE_SIZE + 8}px`,
          backgroundColor: SELECTION_COLOR,
          border: '2px solid white',
          borderRadius: '50%',
          transform: CENTER_TRANSFORM,
          cursor: isRotating ? ROTATE_CURSOR_ACTIVE : ROTATE_CURSOR,
          boxShadow: HANDLE_BOX_SHADOW,
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
        title="Drag to rotate (Shift for 15° snap)"
      />
    </>
  );
};

// ============================================================================
// Line End Handle (for resizing lines)
// ============================================================================

interface LineEndHandleProps {
  readonly nodeId: string;
  readonly startPosition: { x: number; y: number };
  readonly endPosition: { x: number; y: number };
  /** Offset of line start within the node (for bounding box positioning) */
  readonly lineStartOffset: { x: number; y: number };
  /** Current node rotation in degrees (applied to the node wrapper) */
  readonly rotation?: number;
  readonly onEndPositionChange: (id: string, endPosition: { x: number; y: number }) => void;
}

const MIN_LINE_LENGTH = 20;

export const LineEndHandle: React.FC<LineEndHandleProps> = ({
  nodeId,
  startPosition,
  endPosition,
  lineStartOffset,
  rotation = 0,
  onEndPositionChange
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const reactFlow = useReactFlow();
  const dragStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    startEndX: number;
    startEndY: number;
    rotationRad: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaClientX = e.clientX - dragStartRef.current.startClientX;
      const deltaClientY = e.clientY - dragStartRef.current.startClientY;

      const deltaX = deltaClientX / dragStartRef.current.zoom;
      const deltaY = deltaClientY / dragStartRef.current.zoom;

      // Convert screen delta into model-space delta for the unrotated line.
      const cos = Math.cos(-dragStartRef.current.rotationRad);
      const sin = Math.sin(-dragStartRef.current.rotationRad);
      const rotatedDx = deltaX * cos - deltaY * sin;
      const rotatedDy = deltaX * sin + deltaY * cos;

      let newEndX = dragStartRef.current.startEndX + rotatedDx;
      let newEndY = dragStartRef.current.startEndY + rotatedDy;

      // Ensure minimum line length
      const dx = newEndX - startPosition.x;
      const dy = newEndY - startPosition.y;
      const length = Math.hypot(dx, dy);

      if (length < MIN_LINE_LENGTH && length > 0) {
        const scale = MIN_LINE_LENGTH / length;
        newEndX = startPosition.x + dx * scale;
        newEndY = startPosition.y + dy * scale;
      }

      onEndPositionChange(nodeId, {
        x: Math.round(newEndX),
        y: Math.round(newEndY)
      });
    };

    const handleMouseUp = createLineHandleMouseUpHandler(setIsResizing, dragStartRef);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, nodeId, startPosition, onEndPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    setLineHandleDragging(true);
    const viewport = reactFlow.getViewport();
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startEndX: endPosition.x,
      startEndY: endPosition.y,
      rotationRad: (rotation * Math.PI) / 180,
      zoom: viewport.zoom || 1
    };
  }, [endPosition, reactFlow, rotation]);

  // Calculate the handle position relative to the node (line start offset + relative end)
  const handleX = lineStartOffset.x + (endPosition.x - startPosition.x);
  const handleY = lineStartOffset.y + (endPosition.y - startPosition.y);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="nodrag nopan nowheel"
      style={{
        position: 'absolute',
        left: `${handleX}px`,
        top: `${handleY}px`,
        width: `${HANDLE_SIZE + 4}px`,
        height: `${HANDLE_SIZE + 4}px`,
        backgroundColor: 'white',
        border: `2px solid ${SELECTION_COLOR}`,
        borderRadius: '2px',
        transform: CENTER_TRANSFORM,
        cursor: isResizing ? 'grabbing' : 'nwse-resize',
        boxShadow: HANDLE_BOX_SHADOW,
        zIndex: 1000,
        pointerEvents: 'auto'
      }}
      title="Drag to resize line"
    />
  );
};

// ============================================================================
// Line Start Handle (for resizing lines from the start point)
// ============================================================================

interface LineStartHandleProps {
  readonly nodeId: string;
  readonly startPosition: { x: number; y: number };
  readonly endPosition: { x: number; y: number };
  /** Offset of line start within the node (for bounding box positioning) */
  readonly lineStartOffset: { x: number; y: number };
  /** Current node rotation in degrees (applied to the node wrapper) */
  readonly rotation?: number;
  readonly onStartPositionChange: (id: string, startPosition: { x: number; y: number }) => void;
}

export const LineStartHandle: React.FC<LineStartHandleProps> = ({
  nodeId,
  startPosition,
  endPosition,
  lineStartOffset,
  rotation = 0,
  onStartPositionChange
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const reactFlow = useReactFlow();
  const dragStartRef = useRef<{
    startClientX: number;
    startClientY: number;
    startStartX: number;
    startStartY: number;
    rotationRad: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaClientX = e.clientX - dragStartRef.current.startClientX;
      const deltaClientY = e.clientY - dragStartRef.current.startClientY;

      const deltaX = deltaClientX / dragStartRef.current.zoom;
      const deltaY = deltaClientY / dragStartRef.current.zoom;

      // Convert screen delta into model-space delta for the unrotated line
      const cos = Math.cos(-dragStartRef.current.rotationRad);
      const sin = Math.sin(-dragStartRef.current.rotationRad);
      const rotatedDx = deltaX * cos - deltaY * sin;
      const rotatedDy = deltaX * sin + deltaY * cos;

      let newStartX = dragStartRef.current.startStartX + rotatedDx;
      let newStartY = dragStartRef.current.startStartY + rotatedDy;

      // Ensure minimum line length
      const dx = endPosition.x - newStartX;
      const dy = endPosition.y - newStartY;
      const length = Math.hypot(dx, dy);

      if (length < MIN_LINE_LENGTH && length > 0) {
        const scale = MIN_LINE_LENGTH / length;
        newStartX = endPosition.x - dx * scale;
        newStartY = endPosition.y - dy * scale;
      }

      onStartPositionChange(nodeId, {
        x: Math.round(newStartX),
        y: Math.round(newStartY)
      });
    };

    const handleMouseUp = createLineHandleMouseUpHandler(setIsResizing, dragStartRef);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, nodeId, endPosition, onStartPositionChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    setLineHandleDragging(true);
    const viewport = reactFlow.getViewport();
    dragStartRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startStartX: startPosition.x,
      startStartY: startPosition.y,
      rotationRad: (rotation * Math.PI) / 180,
      zoom: viewport.zoom || 1
    };
  }, [startPosition, reactFlow, rotation]);

  // Handle is at the line start offset position
  const handleX = lineStartOffset.x;
  const handleY = lineStartOffset.y;

  return (
    <div
      onMouseDown={handleMouseDown}
      className="nodrag nopan nowheel"
      style={{
        position: 'absolute',
        left: `${handleX}px`,
        top: `${handleY}px`,
        width: `${HANDLE_SIZE + 4}px`,
        height: `${HANDLE_SIZE + 4}px`,
        backgroundColor: 'white',
        border: `2px solid ${SELECTION_COLOR}`,
        borderRadius: '2px',
        transform: CENTER_TRANSFORM,
        cursor: isResizing ? 'grabbing' : 'nesw-resize',
        boxShadow: HANDLE_BOX_SHADOW,
        zIndex: 1000,
        pointerEvents: 'auto'
      }}
      title="Drag to resize line"
    />
  );
};
