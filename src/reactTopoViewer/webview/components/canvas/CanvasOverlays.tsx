import React from "react";
import { useStore } from "@xyflow/react";
import Box from "@mui/material/Box";

import type { HelperLinePositions } from "../../hooks/canvas/useHelperLines";

interface HelperLinesProps {
  lines: HelperLinePositions;
}

const HELPER_LINE_COLOR = "#ff6b6b";
const HELPER_LINE_WIDTH = 1;
const MIDPOINT_LINE_COLOR = "#4ecdc4";
const MIDPOINT_LINE_WIDTH = 1;

export const HelperLines: React.FC<HelperLinesProps> = React.memo(({ lines }) => {
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  const { horizontal, vertical, horizontalMidpoint, verticalMidpoint } = lines;

  if (
    horizontal === null &&
    vertical === null &&
    horizontalMidpoint === null &&
    verticalMidpoint === null
  ) {
    return null;
  }

  const [tx, ty, zoom] = transform;

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
        overflow: "visible",
      }}
    >
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

const OverlayIndicator: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    sx={{
      position: "absolute",
      top: 10,
      left: "50%",
      transform: "translateX(-50%)",
      border: 1,
      borderRadius: 1,
      px: 1.5,
      py: 0.75,
      fontSize: 12,
      zIndex: 1000,
      pointerEvents: "none",
    }}
  >
    {children}
  </Box>
);

export const AnnotationModeIndicator: React.FC<{ message: string }> = ({ message }) => (
  <OverlayIndicator>{message}</OverlayIndicator>
);

export const LinkCreationIndicator: React.FC<{ linkSourceNode: string }> = ({ linkSourceNode }) => (
  <OverlayIndicator>
    Creating link from <strong>{linkSourceNode}</strong> — Click on target node or press Escape to
    cancel
  </OverlayIndicator>
);
