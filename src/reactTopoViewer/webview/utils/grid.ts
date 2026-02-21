import type { XYPosition } from "@xyflow/react";

// Grid size for snapping
export const GRID_SIZE = 20;

// Snap position to grid
export function snapToGrid(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE,
  };
}
