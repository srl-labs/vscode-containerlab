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
    borderRadius: 4,
  };
}

interface TextStyleOptions {
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  fontWeight: React.CSSProperties["fontWeight"];
  fontStyle: React.CSSProperties["fontStyle"];
  textDecoration: React.CSSProperties["textDecoration"];
  textAlign: React.CSSProperties["textAlign"];
  fontFamily: string;
  roundedBackground: boolean;
}

function hasFixedHeight(height: unknown): boolean {
  return typeof height === "number" && Number.isFinite(height);
}

/** Build text style for free text content */
function getTextLayoutStyle(
  data: FreeTextNodeData,
  isMediaOnly: boolean
): Pick<React.CSSProperties, "height" | "overflow"> {
  if (!hasFixedHeight(data.height)) {
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

function resolveTextStyleOptions(data: FreeTextNodeData): TextStyleOptions {
  return {
    fontSize: data.fontSize ?? 14,
    fontColor: data.fontColor ?? "#333",
    backgroundColor: data.backgroundColor,
    fontWeight: data.fontWeight ?? "normal",
    fontStyle: data.fontStyle ?? "normal",
    textDecoration: data.textDecoration ?? "none",
    textAlign: data.textAlign ?? "left",
    fontFamily: data.fontFamily ?? "inherit",
    roundedBackground: data.roundedBackground ?? true,
  };
}

function getTextPadding(
  backgroundColor: string | undefined,
  isMediaOnly: boolean,
  hasFixedContentHeight: boolean
): string {
  if (isMediaOnly && hasFixedContentHeight) {
    return "0";
  }
  if (backgroundColor !== undefined && backgroundColor.length > 0) {
    return "4px 8px";
  }
  return "4px";
}

function getTextBorderRadius(
  roundedBackground: boolean,
  backgroundColor: string | undefined
): number {
  if (!roundedBackground || backgroundColor === undefined || backgroundColor.length === 0) {
    return 0;
  }
  return 4;
}

function buildTextStyle(data: FreeTextNodeData, isMediaOnly: boolean): React.CSSProperties {
  const styleOptions = resolveTextStyleOptions(data);
  const layoutStyle = getTextLayoutStyle(data, isMediaOnly);
  const fixedHeight = hasFixedHeight(data.height);
  const padding = getTextPadding(styleOptions.backgroundColor, isMediaOnly, fixedHeight);

  return {
    fontSize: `${styleOptions.fontSize}px`,
    color: styleOptions.fontColor,
    fontWeight: styleOptions.fontWeight,
    fontStyle: styleOptions.fontStyle,
    textDecoration: styleOptions.textDecoration,
    textAlign: styleOptions.textAlign,
    fontFamily: styleOptions.fontFamily,
    backgroundColor: styleOptions.backgroundColor ?? undefined,
    padding,
    borderRadius: getTextBorderRadius(styleOptions.roundedBackground, styleOptions.backgroundColor),
    width: "100%",
    height: layoutStyle.height,
    outline: "none",
    overflow: layoutStyle.overflow,
  };
}

/** Prevent wheel events from propagating (prevents zoom while scrolling content) */
function handleWheelEvent(e: React.WheelEvent): void {
  const target = e.currentTarget;
  if (target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth) {
    e.stopPropagation();
  }
}

function toFreeTextNodeData(data: NodeProps["data"]): FreeTextNodeData {
  return {
    ...data,
    text: typeof data.text === "string" ? data.text : "",
  };
}

function domNodeToReactNode(node: ChildNode, key: string): React.ReactNode | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (!(node instanceof Element)) {
    return null;
  }

  const props: Record<string, unknown> = { key };
  for (const attr of Array.from(node.attributes)) {
    if (attr.name === "class") {
      props.className = attr.value;
    } else if (attr.name !== "style" && !attr.name.startsWith("on")) {
      props[attr.name] = attr.value;
    }
  }

  const children = Array.from(node.childNodes)
    .map((child, index) => domNodeToReactNode(child, `${key}:${index}`))
    .filter((child): child is React.ReactNode => child !== null);

  return React.createElement(node.tagName.toLowerCase(), props, ...children);
}

function renderHtmlToReactNodes(html: string): React.ReactNode {
  if (html.length === 0) {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!(root instanceof Element)) {
    return null;
  }

  return Array.from(root.childNodes)
    .map((child, index) => domNodeToReactNode(child, `root:${index}`))
    .filter((child): child is React.ReactNode => child !== null);
}

/**
 * FreeTextNode component renders free text annotations on the canvas
 * with markdown support
 */
const FreeTextNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = toFreeTextNodeData(data);
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
      annotationHandlers?.onUpdateFreeTextSize(id, params.width, params.height);
    },
    [id, annotationHandlers]
  );

  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateFreeTextSize(id, params.width, params.height);
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

  const renderedHtml = useMemo(() => renderMarkdown(nodeData.text), [nodeData.text]);
  const renderedContent = useMemo(() => renderHtmlToReactNodes(renderedHtml), [renderedHtml]);
  const isMediaOnly = useMemo(() => isStandaloneMarkdownImage(nodeData.text), [nodeData.text]);
  const hasFixedContentSize =
    typeof nodeData.height === "number" && Number.isFinite(nodeData.height);
  const isSelected = selected;
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
          currentRotation={nodeData.rotation ?? 0}
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
        onWheel={handleWheelEvent}
      >
        {renderedContent}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const FreeTextNode = memo(FreeTextNodeComponent);
