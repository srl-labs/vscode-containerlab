/**
 * FreeShapeNode - Custom React Flow node for free shape annotations
 * Supports rectangle, circle, and line shapes with resize and rotation handles
 */
import React, { memo, useCallback } from "react";
import { type NodeProps, NodeResizer, type ResizeParams } from "@xyflow/react";

import type { FreeShapeNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { DEFAULT_LINE_LENGTH } from "../../../annotations/constants";
import { useIsLocked } from "../../../stores/topoViewerStore";
import { useAnnotationHandlers } from "../../../stores/canvasStore";

import { LineResizeHandle, RotationHandle } from "./AnnotationHandles";

// ============================================================================
// Constants
// ============================================================================

const MIN_WIDTH = 20;
const MIN_HEIGHT = 20;

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert border style to SVG dash array */
function getStrokeDasharray(borderStyle: string): string | undefined {
  if (borderStyle === "dashed") return "8,4";
  if (borderStyle === "dotted") return "2,2";
  return undefined;
}

/** Convert fill color with opacity */
function getBackgroundColor(fillColor: string, fillOpacity: number): string {
  if (fillColor.startsWith("rgba")) return fillColor;
  const opacityHex = Math.round(fillOpacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `${fillColor}${opacityHex}`;
}

/** Get border style for shapes - consistent width regardless of selection */
function getShapeBorder(borderWidth: number, borderStyle: string, borderColor: string): string {
  return `${borderWidth}px ${borderStyle} ${borderColor}`;
}

// ============================================================================
// Shape Components
// ============================================================================

interface RectangleProps {
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly borderWidth: number;
  readonly borderStyle: string;
  readonly borderColor: string;
  readonly cornerRadius: number;
  readonly selected: boolean;
}

function RectangleShape(props: RectangleProps): React.ReactElement {
  const { fillColor, fillOpacity, borderWidth, borderStyle, borderColor, cornerRadius, selected } =
    props;
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor: getBackgroundColor(fillColor, fillOpacity),
    border: getShapeBorder(borderWidth, borderStyle, borderColor),
    borderRadius: cornerRadius,
    // Use outline for selection - doesn't affect layout
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };
  return <div style={style} className="free-shape-rectangle" />;
}

interface CircleProps {
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly borderWidth: number;
  readonly borderStyle: string;
  readonly borderColor: string;
  readonly selected: boolean;
}

function CircleShape(props: CircleProps): React.ReactElement {
  const { fillColor, fillOpacity, borderWidth, borderStyle, borderColor, selected } = props;
  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor: getBackgroundColor(fillColor, fillOpacity),
    border: getShapeBorder(borderWidth, borderStyle, borderColor),
    borderRadius: "50%",
    // Use outline for selection - doesn't affect layout
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };
  return <div style={style} className="free-shape-circle" />;
}

// ============================================================================
// Arrow Marker Component
// ============================================================================

interface ArrowMarkerProps {
  readonly id: string;
  readonly size: number;
  readonly reversed: boolean;
  readonly color: string;
}

function ArrowMarker({ id, size, reversed, color }: ArrowMarkerProps): React.ReactElement {
  // Arrow pointing right (for end marker): tip at (size, size/2)
  // Arrow pointing left (for start marker): tip at (0, size/2)
  const points = reversed
    ? `${size},0 ${size},${size} 0,${size / 2}`
    : `0,0 ${size},${size / 2} 0,${size}`;

  // refX/refY specify which point of the marker aligns with the line endpoint
  // Since we shorten the line by arrow size, place marker at line end and extend outward
  return (
    <marker
      id={id}
      markerWidth={size}
      markerHeight={size}
      refX={reversed ? size : 0}
      refY={size / 2}
      orient="auto"
    >
      <polygon points={points} fill={color} />
    </marker>
  );
}

// ============================================================================
// Line Shape Component
// ============================================================================

interface LineShapeProps {
  /** Line start position within node bounds */
  readonly startX: number;
  readonly startY: number;
  /** Relative end position (end - start) */
  readonly relativeEndX: number;
  readonly relativeEndY: number;
  readonly borderColor: string;
  readonly borderWidth: number;
  readonly borderStyle: string;
  readonly lineStartArrow: boolean;
  readonly lineEndArrow: boolean;
  readonly lineArrowSize: number;
  readonly selected: boolean;
  readonly nodeId: string;
}

function LineShape(props: LineShapeProps): React.ReactElement {
  const {
    startX,
    startY,
    relativeEndX,
    relativeEndY,
    borderColor,
    borderWidth,
    borderStyle,
    lineStartArrow,
    lineEndArrow,
    lineArrowSize,
    selected,
    nodeId
  } = props;

  // Calculate line endpoints within SVG
  // Shorten line at each end where there's an arrow so the tip is at the endpoint
  const dx = relativeEndX;
  const dy = relativeEndY;
  const length = Math.hypot(dx, dy);

  // Calculate unit vector
  const ux = length > 0 ? dx / length : 0;
  const uy = length > 0 ? dy / length : 0;

  // Shorten line by arrow size at each end
  const startOffset = lineStartArrow ? lineArrowSize : 0;
  const endOffset = lineEndArrow ? lineArrowSize : 0;

  const x1 = startX + ux * startOffset;
  const y1 = startY + uy * startOffset;
  const x2 = startX + relativeEndX - ux * endOffset;
  const y2 = startY + relativeEndY - uy * endOffset;

  // Unique marker IDs for this node
  const startMarkerId = `arrow-start-${nodeId}`;
  const endMarkerId = `arrow-end-${nodeId}`;

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible"
      }}
      className="free-shape-line"
    >
      <defs>
        {lineStartArrow && (
          <ArrowMarker id={startMarkerId} size={lineArrowSize} reversed color={borderColor} />
        )}
        {lineEndArrow && (
          <ArrowMarker id={endMarkerId} size={lineArrowSize} reversed={false} color={borderColor} />
        )}
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={selected ? SELECTION_COLOR : borderColor}
        strokeWidth={selected ? borderWidth + 2 : borderWidth}
        strokeDasharray={getStrokeDasharray(borderStyle)}
        markerStart={lineStartArrow ? `url(#${startMarkerId})` : undefined}
        markerEnd={lineEndArrow ? `url(#${endMarkerId})` : undefined}
        style={{ pointerEvents: "stroke", cursor: "move" }}
      />
    </svg>
  );
}

// ============================================================================
// Container Style Builders
// ============================================================================

/** Build wrapper style for rectangle/circle */
function buildBoxWrapperStyle(rotation: number): React.CSSProperties {
  return {
    position: "relative",
    width: "100%",
    height: "100%",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    cursor: "move",
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    transformOrigin: "center center"
  };
}

/** Build container style for line - uses 100% to fill the bounding box */
function buildLineContainerStyle(): React.CSSProperties {
  return {
    position: "relative",
    cursor: "move",
    width: "100%",
    height: "100%"
  };
}

// ============================================================================
// Line Node Component
// ============================================================================

interface LineNodeProps {
  readonly id: string;
  readonly data: FreeShapeNodeData;
  readonly isSelected: boolean;
  readonly showHandles: boolean;
  readonly annotationHandlers: ReturnType<typeof useAnnotationHandlers>;
}

/** Line padding constant (must match annotationNodeConverters.ts) */
const LINE_PADDING = 20;

/** Extract line positions from data with defaults */
function getLinePositions(data: FreeShapeNodeData): {
  relativeEnd: { x: number; y: number };
  startPosition: { x: number; y: number };
  endPosition: { x: number; y: number };
  lineStartInNode: { x: number; y: number };
} {
  const startPosition = data.startPosition ?? { x: 0, y: 0 };
  const endPosition = data.endPosition ?? {
    x: startPosition.x + DEFAULT_LINE_LENGTH,
    y: startPosition.y
  };
  const relativeEnd = data.relativeEndPosition ?? {
    x: endPosition.x - startPosition.x,
    y: endPosition.y - startPosition.y
  };
  // Line start within the node's bounding box (with padding)
  const lineStartInNode =
    data.lineStartInNode ?? computeLineStartInNode(startPosition, endPosition);
  return { relativeEnd, startPosition, endPosition, lineStartInNode };
}

function computeLineStartInNode(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } {
  const minX = Math.min(start.x, end.x) - LINE_PADDING;
  const minY = Math.min(start.y, end.y) - LINE_PADDING;
  return { x: start.x - minX, y: start.y - minY };
}

/** Extract line style props from data with defaults */
function getLineStyleProps(data: FreeShapeNodeData): {
  borderColor: string;
  borderWidth: number;
  borderStyle: string;
  lineStartArrow: boolean;
  lineEndArrow: boolean;
  lineArrowSize: number;
} {
  return {
    borderColor: data.borderColor ?? "var(--vscode-editor-foreground)",
    borderWidth: data.borderWidth ?? 2,
    borderStyle: data.borderStyle ?? "solid",
    lineStartArrow: data.lineStartArrow ?? false,
    lineEndArrow: data.lineEndArrow ?? true,
    lineArrowSize: data.lineArrowSize ?? 10
  };
}

function LineNode({
  id,
  data,
  isSelected,
  showHandles,
  annotationHandlers
}: LineNodeProps): React.ReactElement {
  const { relativeEnd, startPosition, endPosition, lineStartInNode } = getLinePositions(data);
  const styleProps = getLineStyleProps(data);

  return (
    <div style={buildLineContainerStyle()} className="free-shape-node free-shape-line-node">
      <LineShape
        startX={lineStartInNode.x}
        startY={lineStartInNode.y}
        relativeEndX={relativeEnd.x}
        relativeEndY={relativeEnd.y}
        {...styleProps}
        selected={isSelected}
        nodeId={id}
      />
      {showHandles && annotationHandlers?.onUpdateFreeShapeStartPosition && (
        <LineResizeHandle
          nodeId={id}
          startPosition={startPosition}
          endPosition={endPosition}
          lineStartOffset={lineStartInNode}
          mode="start"
          onPositionChange={annotationHandlers.onUpdateFreeShapeStartPosition}
          onDragEnd={annotationHandlers.onPersistAnnotations}
        />
      )}
      {showHandles && annotationHandlers?.onUpdateFreeShapeEndPosition && (
        <LineResizeHandle
          nodeId={id}
          startPosition={startPosition}
          endPosition={endPosition}
          lineStartOffset={lineStartInNode}
          mode="end"
          onPositionChange={annotationHandlers.onUpdateFreeShapeEndPosition}
          onDragEnd={annotationHandlers.onPersistAnnotations}
        />
      )}
    </div>
  );
}

// ============================================================================
// Box Node Component (Rectangle/Circle)
// ============================================================================

interface BoxNodeProps {
  readonly id: string;
  readonly data: FreeShapeNodeData;
  readonly isSelected: boolean;
  readonly showHandles: boolean;
  readonly annotationHandlers: ReturnType<typeof useAnnotationHandlers>;
  readonly onResizeEnd: (_event: unknown, params: ResizeParams) => void;
  readonly onRotationStart: () => void;
  readonly onRotationEnd: () => void;
}

function BoxNode({
  id,
  data,
  isSelected,
  showHandles,
  annotationHandlers,
  onResizeEnd,
  onRotationStart,
  onRotationEnd
}: BoxNodeProps): React.ReactElement {
  const rotation = data.rotation ?? 0;
  const wrapperStyle = buildBoxWrapperStyle(rotation);

  const shapeProps = {
    fillColor: data.fillColor ?? "rgba(100, 100, 100, 0.2)",
    fillOpacity: data.fillOpacity ?? 0.2,
    borderWidth: data.borderWidth ?? 2,
    borderStyle: data.borderStyle ?? "solid",
    borderColor: data.borderColor ?? "var(--vscode-editor-foreground)",
    selected: isSelected
  };

  return (
    <div style={wrapperStyle} className="free-shape-node">
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={showHandles}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        keepAspectRatio={data.shapeType === "circle"}
        onResizeEnd={onResizeEnd}
      />
      {showHandles && annotationHandlers?.onUpdateFreeShapeRotation && (
        <RotationHandle
          nodeId={id}
          currentRotation={data.rotation ?? 0}
          onRotationChange={annotationHandlers.onUpdateFreeShapeRotation}
          onRotationStart={onRotationStart}
          onRotationEnd={onRotationEnd}
        />
      )}
      {data.shapeType === "rectangle" ? (
        <RectangleShape {...shapeProps} cornerRadius={data.cornerRadius ?? 0} />
      ) : (
        <CircleShape {...shapeProps} />
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const FreeShapeNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as FreeShapeNodeData;
  const isLocked = useIsLocked();
  const annotationHandlers = useAnnotationHandlers();
  const canEditAnnotations = !isLocked;
  const isSelected = selected ?? false;

  // Track rotation state to keep handles visible during rotation
  const [isRotating, setIsRotating] = React.useState(false);

  // Rotation handlers
  const handleRotationStart = useCallback(() => {
    setIsRotating(true);
    annotationHandlers?.onFreeShapeRotationStart?.(id);
  }, [id, annotationHandlers]);

  const handleRotationEnd = useCallback(() => {
    setIsRotating(false);
    annotationHandlers?.onFreeShapeRotationEnd?.(id);
  }, [id, annotationHandlers]);

  // Show handles when selected in edit mode, or when actively rotating
  const showHandles = (isSelected || isRotating) && canEditAnnotations;

  // Only save at end of resize to avoid creating undo entries for each pixel
  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateFreeShapeSize?.(id, params.width, params.height);
    },
    [id, annotationHandlers]
  );

  if (nodeData.shapeType === "line") {
    return (
      <LineNode
        id={id}
        data={nodeData}
        isSelected={isSelected}
        showHandles={showHandles}
        annotationHandlers={annotationHandlers}
      />
    );
  }

  return (
    <BoxNode
      id={id}
      data={nodeData}
      isSelected={isSelected}
      showHandles={showHandles}
      annotationHandlers={annotationHandlers}
      onResizeEnd={handleResizeEnd}
      onRotationStart={handleRotationStart}
      onRotationEnd={handleRotationEnd}
    />
  );
};

export const FreeShapeNode = memo(FreeShapeNodeComponent);
