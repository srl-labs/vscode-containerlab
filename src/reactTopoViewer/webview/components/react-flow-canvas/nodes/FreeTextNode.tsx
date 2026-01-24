/**
 * FreeTextNode - Custom React Flow node for free text annotations
 * Supports markdown rendering via markdown-it
 */
import React, { memo, useMemo, useCallback } from "react";
import { type NodeProps, NodeResizer, type ResizeParams } from "@xyflow/react";

import type { FreeTextNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { useTopoViewer } from "../../../context/TopoViewerContext";
import { useAnnotationHandlers } from "../../../context/AnnotationHandlersContext";
import { renderMarkdown } from "../../../utils/markdownRenderer";

import { RotationHandle } from "./AnnotationHandles";

/** Minimum dimensions for resize */
const MIN_WIDTH = 40;
const MIN_HEIGHT = 20;

/** Build wrapper style for the node */
function buildWrapperStyle(
  width: number | undefined,
  height: number | undefined,
  rotation: number
): React.CSSProperties {
  return {
    position: "relative",
    width: width ? `${width}px` : "auto",
    height: height ? `${height}px` : "auto",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    cursor: "move",
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center center"
  };
}

/** Build text style for free text content */
function buildTextStyle(
  data: FreeTextNodeData,
  selected: boolean | undefined
): React.CSSProperties {
  const {
    fontSize = 14,
    fontColor = "#333",
    backgroundColor,
    fontWeight = "normal",
    fontStyle = "normal",
    textDecoration = "none",
    textAlign = "left",
    fontFamily = "inherit",
    roundedBackground = true
  } = data;

  return {
    fontSize: `${fontSize}px`,
    color: fontColor,
    fontWeight,
    fontStyle,
    textDecoration,
    textAlign,
    fontFamily,
    backgroundColor: backgroundColor || undefined,
    padding: backgroundColor ? "4px 8px" : "4px",
    borderRadius: roundedBackground && backgroundColor ? 4 : undefined,
    border: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    boxShadow: selected ? `0 0 0 2px ${SELECTION_COLOR}33` : "none",
    width: "100%",
    height: "100%",
    transition: "border 0.15s ease, box-shadow 0.15s ease",
    outline: "none",
    overflow: "auto"
  };
}

/** Prevent wheel events from propagating (prevents zoom while scrolling content) */
function handleWheelEvent(e: React.WheelEvent): void {
  const target = e.currentTarget;
  if (target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth) {
    e.stopPropagation();
  }
}

/**
 * FreeTextNode component renders free text annotations on the canvas
 * with markdown support
 */
const FreeTextNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as FreeTextNodeData;
  const { state } = useTopoViewer();
  const annotationHandlers = useAnnotationHandlers();
  const isEditMode = state.mode === "edit" && !state.isLocked;
  const rotation = nodeData.rotation ?? 0;

  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateFreeTextSize?.(id, params.width, params.height);
    },
    [id, annotationHandlers]
  );

  const renderedHtml = useMemo(() => renderMarkdown(nodeData.text || ""), [nodeData.text]);
  const wrapperStyle = useMemo(
    () => buildWrapperStyle(nodeData.width, nodeData.height, rotation),
    [nodeData.width, nodeData.height, rotation]
  );
  const textStyle = useMemo(() => buildTextStyle(nodeData, selected), [nodeData, selected]);
  const showHandles = selected && isEditMode;

  return (
    <div style={wrapperStyle} className="free-text-node">
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={showHandles}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeEnd={handleResizeEnd}
      />
      {showHandles && annotationHandlers?.onUpdateFreeTextRotation && (
        <RotationHandle
          nodeId={id}
          currentRotation={nodeData.rotation || 0}
          onRotationChange={annotationHandlers.onUpdateFreeTextRotation}
        />
      )}
      <div
        style={textStyle}
        className="free-text-content free-text-markdown nowheel"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
        onWheel={handleWheelEvent}
      />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const FreeTextNode = memo(FreeTextNodeComponent);
