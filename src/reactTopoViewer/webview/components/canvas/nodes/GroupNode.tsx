/**
 * GroupNode - Custom React Flow node for group annotations
 * Renders groups as transparent containers with dashed borders
 */
import React, { memo, useCallback } from "react";
import { type NodeProps, NodeResizer, type ResizeParams } from "@xyflow/react";

import { SELECTION_COLOR } from "../types";
import { useIsLocked } from "../../../stores/topoViewerStore";
import { useAnnotationHandlers } from "../../../stores/canvasStore";

// ============================================================================
// Types
// ============================================================================

export interface GroupNodeData {
  name: string;
  label?: string;
  level?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderRadius?: number;
  labelColor?: string;
  labelPosition?: string;
  members?: string[];
  parentId?: string;
  groupId?: string;
  zIndex?: number;
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_WIDTH = 100;
const MIN_HEIGHT = 80;
const DEFAULT_BACKGROUND = "rgba(100, 100, 255, 0.1)";
const DEFAULT_BORDER_COLOR = "#666";
const DEFAULT_BORDER_WIDTH = 2;
const DEFAULT_BORDER_STYLE = "dashed";
const DEFAULT_BORDER_RADIUS = 8;
const DEFAULT_LABEL_COLOR = "#666";

// ============================================================================
// Helper Functions
// ============================================================================

/** Get background color with opacity applied */
function getBackgroundWithOpacity(color: string, opacity?: number): string {
  if (opacity === undefined) return color;
  // If already rgba, modify the alpha
  if (color.startsWith("rgba")) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity / 100})`;
    }
  }
  // For hex colors, append opacity
  if (color.startsWith("#")) {
    const opacityValue = opacity / 100;
    return `${color}${Math.round(opacityValue * 255)
      .toString(16)
      .padStart(2, "0")}`;
  }
  return color;
}

/** Get label position CSS */
function getLabelPositionStyle(position: string | undefined): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
    padding: "2px 6px"
  };

  switch (position) {
    case "top-left":
      return { ...baseStyle, top: -20, left: 8 };
    case "top-center":
      return { ...baseStyle, top: -20, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { ...baseStyle, top: -20, right: 8 };
    case "bottom-left":
      return { ...baseStyle, bottom: -20, left: 8 };
    case "bottom-center":
      return { ...baseStyle, bottom: -20, left: "50%", transform: "translateX(-50%)" };
    case "bottom-right":
      return { ...baseStyle, bottom: -20, right: 8 };
    default:
      return { ...baseStyle, top: -20, left: 8 };
  }
}

// ============================================================================
// Main Component
// ============================================================================

const GroupNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as GroupNodeData;
  const isLocked = useIsLocked();
  const annotationHandlers = useAnnotationHandlers();
  const canEditAnnotations = !isLocked;
  const isSelected = selected ?? false;
  const showResizer = isSelected && canEditAnnotations;

  // Only save at end of resize to avoid creating undo entries for each pixel
  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateGroupSize?.(id, params.width, params.height);
    },
    [id, annotationHandlers]
  );

  const backgroundColor = getBackgroundWithOpacity(
    nodeData.backgroundColor ?? DEFAULT_BACKGROUND,
    nodeData.backgroundOpacity
  );
  const borderColor = nodeData.borderColor ?? DEFAULT_BORDER_COLOR;
  const borderWidth = nodeData.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const borderStyle = nodeData.borderStyle ?? DEFAULT_BORDER_STYLE;
  const borderRadius = nodeData.borderRadius ?? DEFAULT_BORDER_RADIUS;
  const labelColor = nodeData.labelColor ?? DEFAULT_LABEL_COLOR;
  const labelPosition = nodeData.labelPosition;

  // Use 100% dimensions - React Flow controls actual size via node's width/height props
  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor,
    borderRadius,
    border: `${borderWidth}px ${borderStyle} ${borderColor}`,
    position: "relative",
    // Use outline for selection - doesn't affect layout
    outline: isSelected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1,
    cursor: "move"
  };

  const labelStyle: React.CSSProperties = {
    ...getLabelPositionStyle(labelPosition),
    color: labelColor
  };

  const displayLabel = nodeData.label || nodeData.name;

  return (
    <div style={containerStyle} className="group-node" data-testid={`group-node-${id}`}>
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={showResizer}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeEnd={handleResizeEnd}
      />
      {displayLabel && (
        <div style={labelStyle} className="group-node-label" data-testid={`group-label-${id}`}>
          {displayLabel}
        </div>
      )}
    </div>
  );
};

export const GroupNode = memo(GroupNodeComponent);
