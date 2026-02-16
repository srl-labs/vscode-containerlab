/**
 * FreeTextNode - Custom React Flow node for free text annotations
 * Supports markdown rendering via markdown-it
 */
import React, { memo, useMemo, useCallback, useState } from "react";
import { type NodeProps, NodeResizer, type ResizeParams } from "@xyflow/react";

import type { FreeTextNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { useIsLocked } from "../../../stores/topoViewerStore";
import { useAnnotationHandlers } from "../../../stores/canvasStore";
import { renderMarkdown } from "../../../utils/markdownRenderer";

import { RotationHandle } from "./AnnotationHandles";
import "./FreeTextNode.css";

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
function getTextLayoutStyle(
  data: FreeTextNodeData,
  isMediaOnly: boolean
): Pick<React.CSSProperties, "height" | "overflow"> {
  const hasFixedHeight = typeof data.height === "number" && Number.isFinite(data.height);
  if (!hasFixedHeight) {
    return { height: "auto", overflow: "visible" };
  }
  if (isMediaOnly) {
    return { height: "100%", overflow: "hidden" };
  }
  return { height: "100%", overflow: "auto" };
}

function isStandaloneMarkdownImage(value: string): boolean {
  return /^\s*!\[[^\]]*\]\([^)]+\)\s*$/u.test(value);
}

function buildTextStyle(data: FreeTextNodeData, isMediaOnly: boolean): React.CSSProperties {
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
  const hasFixedHeight = typeof data.height === "number" && Number.isFinite(data.height);
  const layoutStyle = getTextLayoutStyle(data, isMediaOnly);
  let padding: React.CSSProperties["padding"] = "4px";
  if (backgroundColor) {
    padding = "4px 8px";
  }
  if (isMediaOnly && hasFixedHeight) {
    padding = 0;
  }

  return {
    fontSize: `${fontSize}px`,
    color: fontColor,
    fontWeight,
    fontStyle,
    textDecoration,
    textAlign,
    fontFamily,
    backgroundColor: backgroundColor || undefined,
    padding,
    borderRadius: roundedBackground && backgroundColor ? 4 : undefined,
    width: "100%",
    height: layoutStyle.height,
    outline: "none",
    overflow: layoutStyle.overflow
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
  const isLocked = useIsLocked();
  const annotationHandlers = useAnnotationHandlers();
  const canEditAnnotations = !isLocked;
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
      // Persist once at resize end to avoid stale snapshot re-apply jitter.
      annotationHandlers?.onPersistAnnotations?.();
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
  const isMediaOnly = useMemo(() => isStandaloneMarkdownImage(nodeData.text || ""), [nodeData.text]);
  const hasFixedContentSize =
    typeof nodeData.height === "number" && Number.isFinite(nodeData.height);
  const isSelected = selected ?? false;
  // Show selection border when selected OR when actively resizing/rotating
  const showSelectionBorder = isSelected || isResizing || isRotating;
  const wrapperStyle = useMemo(
    () => buildWrapperStyle(rotation, showSelectionBorder),
    [rotation, showSelectionBorder]
  );
  const textStyle = useMemo(() => buildTextStyle(nodeData, isMediaOnly), [nodeData, isMediaOnly]);
  // Show handles when selected in edit mode, or when actively resizing/rotating
  const showHandles = (isSelected || isResizing || isRotating) && canEditAnnotations;

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
        className={`free-text-content free-text-markdown nowheel ${
          hasFixedContentSize ? "free-text-content--fixed" : "free-text-content--auto"
        } ${isMediaOnly ? "free-text-content--media" : ""}`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
        onWheel={handleWheelEvent}
      />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const FreeTextNode = memo(FreeTextNodeComponent);
