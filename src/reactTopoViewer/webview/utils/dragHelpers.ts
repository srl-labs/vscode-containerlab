/**
 * Shared drag operation helpers
 */
import type React from "react";

import type { FreeShapeAnnotation } from "../../shared/types/topology";

/**
 * Handle common drag start logic:
 * - Check if operation is locked or not left mouse button
 * - Prevent default and stop propagation
 * - Capture before state for deferred undo if onDragStart callback exists
 *
 * @returns The captured before state, or null if not captured
 */
export function handleDragStart(
  e: React.MouseEvent,
  isLocked: boolean,
  beforeStateRef: React.RefObject<FreeShapeAnnotation | null>,
  onDragStart?: () => FreeShapeAnnotation | null
): boolean {
  if (isLocked || e.button !== 0) return false;
  e.preventDefault();
  e.stopPropagation();

  // Capture before state for deferred undo
  if (onDragStart) {
    beforeStateRef.current = onDragStart();
  }

  return true;
}

/**
 * Add mouse move and mouse up event listeners and return cleanup function.
 * Commonly used pattern in drag and resize operations.
 */
export function addMouseMoveUpListeners(
  handleMouseMove: (e: MouseEvent) => void,
  handleMouseUp: (e: MouseEvent) => void
): () => void {
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  return () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };
}
