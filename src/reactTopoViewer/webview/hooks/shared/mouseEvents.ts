/**
 * Shared utilities for mouse event handling in drag/resize operations
 */

/**
 * Add mouse move and mouse up event listeners and return cleanup function.
 * Commonly used pattern in drag and resize operations.
 */
export function addMouseMoveUpListeners(
  handleMouseMove: (e: MouseEvent) => void,
  handleMouseUp: (e: MouseEvent) => void
): () => void {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
}
