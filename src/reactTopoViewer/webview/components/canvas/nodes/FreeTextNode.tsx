/**
 * FreeTextNode - Custom React Flow node for free text annotations
 * Supports markdown rendering via markdown-it
 */
import React, { memo, useMemo, useCallback, useState } from "react";
import { type NodeProps, NodeResizer, type ResizeParams } from "@xyflow/react";

import type { FreeTextNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { useIsLocked, useMode } from "../../../stores/topoViewerStore";
import { useAnnotationHandlers } from "../../../stores/canvasStore";
import { renderMarkdown } from "../../../utils/markdownRenderer";

import { RotationHandle } from "./AnnotationHandles";

/** Minimum dimensions for resize */
const MIN_WIDTH = 40;
const MIN_HEIGHT = 20;

/** Build wrapper style for the node */
function buildWrapperStyle(rotation: number, selected: boolean): React.CSSProperties {
  // Use 100% dimensions - React Flow controls actual size via node's width/height props
  return {
    position: "relative",
    width: "100%",
    height: "100%",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    cursor: "move",
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center center",
    // Use outline instead of border - doesn't affect layout/cause shifts
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 0,
    borderRadius: 4
  };
}

/** Build text style for free text content */
function buildTextStyle(data: FreeTextNodeData): React.CSSProperties {
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
    width: "100%",
    height: "100%",
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
  const mode = useMode();
  const isLocked = useIsLocked();
  const annotationHandlers = useAnnotationHandlers();
  const isEditMode = mode === "edit" && !isLocked;
  const rotation = nodeData.rotation ?? 0;

  // Track resize/rotate state to keep selection border and handles visible
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  // Resize handlers
  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleResize = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateFreeTextSize?.(id, params.width, params.height);
    },
    [id, annotationHandlers]
  );

  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateFreeTextSize?.(id, params.width, params.height);
      setIsResizing(false);
    },
    [id, annotationHandlers]
  );

  // Rotation handlers
  const handleRotationStart = useCallback(() => {
    setIsRotating(true);
    annotationHandlers?.onFreeTextRotationStart?.(id);
  }, [id, annotationHandlers]);

  const handleRotationEnd = useCallback(() => {
    setIsRotating(false);
    annotationHandlers?.onFreeTextRotationEnd?.(id);
  }, [id, annotationHandlers]);

  const renderedHtml = useMemo(() => renderMarkdown(nodeData.text || ""), [nodeData.text]);
  const isSelected = selected ?? false;
  // Show selection border when selected OR when actively resizing/rotating
  const showSelectionBorder = isSelected || isResizing || isRotating;
  const wrapperStyle = useMemo(
    () => buildWrapperStyle(rotation, showSelectionBorder),
    [rotation, showSelectionBorder]
  );
  const textStyle = useMemo(() => buildTextStyle(nodeData), [nodeData]);
  // Show handles when selected in edit mode, or when actively resizing/rotating
  const showHandles = (isSelected || isResizing || isRotating) && isEditMode;

  return (
    <div style={wrapperStyle} className="free-text-node">
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={showHandles}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      {showHandles && annotationHandlers?.onUpdateFreeTextRotation && (
        <RotationHandle
          nodeId={id}
          currentRotation={nodeData.rotation || 0}
          onRotationChange={annotationHandlers.onUpdateFreeTextRotation}
          onRotationStart={handleRotationStart}
          onRotationEnd={handleRotationEnd}
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
