/**
 * HelperLines component - Visual alignment guides for node positioning
 *
 * Renders horizontal and vertical lines across the canvas when nodes
 * align during drag operations.
 */
import React from "react";
import { useStore } from "@xyflow/react";
import type { HelperLinePositions } from "../../hooks/canvas/useHelperLines";

interface HelperLinesProps {
  /** Line positions to render */
  lines: HelperLinePositions;
}

/** Style for the helper line color */
const HELPER_LINE_COLOR = "#ff6b6b";
const HELPER_LINE_WIDTH = 1;

/** Style for midpoint helper lines (center between two nodes) */
const MIDPOINT_LINE_COLOR = "#4ecdc4";
const MIDPOINT_LINE_WIDTH = 1;

/**
 * HelperLines component
 *
 * Renders SVG lines that span the visible viewport to indicate
 * node alignment positions during drag.
 */
export const HelperLines: React.FC<HelperLinesProps> = React.memo(({ lines }) => {
  // Get viewport transform from React Flow store
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  const { horizontal, vertical, horizontalMidpoint, verticalMidpoint } = lines;

  // Don't render if no lines
  if (
    horizontal === null &&
    vertical === null &&
    horizontalMidpoint === null &&
    verticalMidpoint === null
  ) {
    return null;
  }

  const [tx, ty, zoom] = transform;

  // Calculate line positions in screen coordinates
  // React Flow uses: screenX = flowX * zoom + tx
  const horizontalScreenY = horizontal !== null ? horizontal * zoom + ty : null;
  const verticalScreenX = vertical !== null ? vertical * zoom + tx : null;
  const horizontalMidpointScreenY =
    horizontalMidpoint !== null ? horizontalMidpoint * zoom + ty : null;
  const verticalMidpointScreenX = verticalMidpoint !== null ? verticalMidpoint * zoom + tx : null;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1000,
        overflow: "visible"
      }}
    >
      {/* Horizontal helper line */}
      {horizontalScreenY !== null && (
        <line
          x1={0}
          y1={horizontalScreenY}
          x2={width}
          y2={horizontalScreenY}
          stroke={HELPER_LINE_COLOR}
          strokeWidth={HELPER_LINE_WIDTH}
          strokeDasharray="4 2"
        />
      )}

      {/* Vertical helper line */}
      {verticalScreenX !== null && (
        <line
          x1={verticalScreenX}
          y1={0}
          x2={verticalScreenX}
          y2={height}
          stroke={HELPER_LINE_COLOR}
          strokeWidth={HELPER_LINE_WIDTH}
          strokeDasharray="4 2"
        />
      )}

      {/* Horizontal midpoint helper line (center between two nodes) */}
      {horizontalMidpointScreenY !== null && (
        <line
          x1={0}
          y1={horizontalMidpointScreenY}
          x2={width}
          y2={horizontalMidpointScreenY}
          stroke={MIDPOINT_LINE_COLOR}
          strokeWidth={MIDPOINT_LINE_WIDTH}
          strokeDasharray="6 3"
        />
      )}

      {/* Vertical midpoint helper line (center between two nodes) */}
      {verticalMidpointScreenX !== null && (
        <line
          x1={verticalMidpointScreenX}
          y1={0}
          x2={verticalMidpointScreenX}
          y2={height}
          stroke={MIDPOINT_LINE_COLOR}
          strokeWidth={MIDPOINT_LINE_WIDTH}
          strokeDasharray="6 3"
        />
      )}
    </svg>
  );
});

HelperLines.displayName = "HelperLines";
