/**
 * TopologyEdge - Custom React Flow edge with endpoint labels
 * Uses floating/straight edge style for network topology visualization
 */
import React, { memo, useMemo, useCallback } from "react";
import { EdgeLabelRenderer, useStore, type EdgeProps } from "@xyflow/react";

import type { TopologyEdgeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { useEdgeInfo, useEdgeRenderConfig } from "../../../stores/canvasStore";
import { useEdges } from "../../../stores/graphStore";
import { calculateControlPoint, getEdgePoints, getLabelPosition } from "../edgeGeometry";
import { DEFAULT_ENDPOINT_LABEL_OFFSET } from "../../../annotations/endpointLabelOffset";

// Edge style constants
const EDGE_COLOR_DEFAULT = "#969799";
const EDGE_COLOR_UP = "#00df2b";
const EDGE_COLOR_DOWN = "#df2b00";
const EDGE_WIDTH_NORMAL = 2.5;
const EDGE_WIDTH_SELECTED = 4;
const EDGE_OPACITY_NORMAL = 0.5;
const EDGE_OPACITY_SELECTED = 1;

// Label style constants
const LABEL_FONT_SIZE = "10px";
const LABEL_BG_COLOR = "rgba(202, 203, 204, 0.5)";
const LABEL_TEXT_COLOR = "rgba(0, 0, 0, 0.7)";
const LABEL_OUTLINE_COLOR = "rgba(255, 255, 255, 0.7)";
const LABEL_PADDING = "0px 2px";
// Bezier curve constants for parallel edges
const CONTROL_POINT_STEP_SIZE = 40; // Spacing between parallel edges (more curvy for label space)

// Loop edge constants
const LOOP_EDGE_SIZE = 50; // Size of the loop curve
const LOOP_EDGE_OFFSET = 10; // Offset between multiple loop edges

// Node icon dimensions (edges connect to icon center, not the label)
const NODE_ICON_SIZE = 40;

interface NodeGeometry {
  position: { x: number; y: number };
  width: number;
  height: number;
}

function areNodeGeometriesEqual(left: NodeGeometry | null, right: NodeGeometry | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function useNodeGeometry(nodeId: string): NodeGeometry | null {
  return useStore(
    useCallback(
      (state) => {
        const node = state.nodeLookup.get(nodeId);
        if (!node) return null;
        const position = node.internals.positionAbsolute;
        return {
          position: { x: position.x, y: position.y },
          width: node.measured?.width ?? NODE_ICON_SIZE,
          height: node.measured?.height ?? NODE_ICON_SIZE
        };
      },
      [nodeId]
    ),
    areNodeGeometriesEqual
  );
}

/**
 * Get stroke color based on link status
 */
function getStrokeColor(linkStatus: string | undefined, selected: boolean): string {
  if (selected) return SELECTION_COLOR;
  switch (linkStatus) {
    case "up":
      return EDGE_COLOR_UP;
    case "down":
      return EDGE_COLOR_DOWN;
    default:
      return EDGE_COLOR_DEFAULT;
  }
}

// Parallel edge info is now provided via CanvasContext

/**
 * Calculate loop edge geometry for self-referencing edges
 * Creates a curved path that loops back to the same node
 */
interface LoopEdgeGeometry {
  path: string;
  sourceLabelPos: { x: number; y: number };
  targetLabelPos: { x: number; y: number };
}

function calculateLoopEdgeGeometry(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  loopIndex: number,
  labelOffset: number
): LoopEdgeGeometry {
  // Calculate node center
  const centerX = nodeX + nodeWidth / 2;
  const centerY = nodeY + nodeHeight / 2;

  // Loop starts from top-right corner and returns to right side
  // Size increases with each additional loop edge
  const size = LOOP_EDGE_SIZE + loopIndex * LOOP_EDGE_OFFSET;

  // Start point: right edge of node, slightly up
  const startX = centerX + nodeWidth / 2;
  const startY = centerY - nodeHeight / 4;

  // End point: right edge of node, slightly down
  const endX = centerX + nodeWidth / 2;
  const endY = centerY + nodeHeight / 4;

  // Control points for cubic bezier - creates a loop to the right
  const cp1X = startX + size;
  const cp1Y = startY - size * 0.5;
  const cp2X = endX + size;
  const cp2Y = endY + size * 0.5;

  // Create cubic bezier path
  const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

  // Label positions - at the rightmost point of the loop
  const labelX = centerX + nodeWidth / 2 + size * 0.8;
  const labelY = centerY;

  return {
    path,
    sourceLabelPos: { x: labelX, y: labelY - labelOffset },
    targetLabelPos: { x: labelX, y: labelY + labelOffset }
  };
}

// Loop edge info is now pre-computed in CanvasContext

// Constant label style (extracted for performance - avoids object creation per render)
const LABEL_STYLE_BASE: React.CSSProperties = {
  position: "absolute",
  fontSize: LABEL_FONT_SIZE,
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  color: LABEL_TEXT_COLOR,
  backgroundColor: LABEL_BG_COLOR,
  padding: LABEL_PADDING,
  borderRadius: 4,
  pointerEvents: "none",
  whiteSpace: "nowrap",
  textShadow: `0 0 2px ${LABEL_OUTLINE_COLOR}, 0 0 2px ${LABEL_OUTLINE_COLOR}, 0 0 3px ${LABEL_OUTLINE_COLOR}`,
  lineHeight: 1.2,
  zIndex: 1
};

/**
 * Label component for endpoint text
 * Uses CSS transform for positioning (only dynamic part)
 */
const EndpointLabel = memo(function EndpointLabel({
  text,
  x,
  y
}: Readonly<{ text: string; x: number; y: number }>) {
  // Only the transform is dynamic, base style is constant
  const style = useMemo(
    (): React.CSSProperties => ({
      ...LABEL_STYLE_BASE,
      transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`
    }),
    [x, y]
  );

  return (
    <div style={style} className="topology-edge-label nodrag nopan">
      {text}
    </div>
  );
});

/** Edge geometry result type */
interface EdgeGeometry {
  points: { sx: number; sy: number; tx: number; ty: number };
  path: string;
  controlPoint: { x: number; y: number } | null;
  sourceLabelPos: { x: number; y: number };
  targetLabelPos: { x: number; y: number };
}

/** Calculate loop edge geometry */
function computeLoopGeometry(
  sourcePos: { x: number; y: number },
  sourceNodeWidth: number,
  loopIndex: number,
  labelOffset: number
): EdgeGeometry {
  const loopGeometry = calculateLoopEdgeGeometry(
    sourcePos.x + (sourceNodeWidth - NODE_ICON_SIZE) / 2,
    sourcePos.y,
    NODE_ICON_SIZE,
    NODE_ICON_SIZE,
    loopIndex,
    labelOffset
  );
  return {
    points: { sx: 0, sy: 0, tx: 0, ty: 0 },
    path: loopGeometry.path,
    controlPoint: null,
    sourceLabelPos: loopGeometry.sourceLabelPos,
    targetLabelPos: loopGeometry.targetLabelPos
  };
}

/** Calculate regular edge geometry with parallel edge support */
function computeRegularGeometry(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceNodeWidth: number,
  targetNodeWidth: number,
  parallelInfo: { index: number; total: number; isCanonicalDirection: boolean } | null,
  labelOffset: number
): EdgeGeometry {
  const points = getEdgePoints(
    {
      x: sourcePos.x + (sourceNodeWidth - NODE_ICON_SIZE) / 2,
      y: sourcePos.y,
      width: NODE_ICON_SIZE,
      height: NODE_ICON_SIZE
    },
    {
      x: targetPos.x + (targetNodeWidth - NODE_ICON_SIZE) / 2,
      y: targetPos.y,
      width: NODE_ICON_SIZE,
      height: NODE_ICON_SIZE
    }
  );

  const index = parallelInfo?.index ?? 0;
  const total = parallelInfo?.total ?? 1;
  const isCanonicalDirection = parallelInfo?.isCanonicalDirection ?? true;

  const controlPoint = calculateControlPoint(
    points.sx,
    points.sy,
    points.tx,
    points.ty,
    index,
    total,
    isCanonicalDirection,
    CONTROL_POINT_STEP_SIZE
  );

  const path = controlPoint
    ? `M ${points.sx} ${points.sy} Q ${controlPoint.x} ${controlPoint.y} ${points.tx} ${points.ty}`
    : `M ${points.sx} ${points.sy} L ${points.tx} ${points.ty}`;

  return {
    points,
    path,
    controlPoint,
    sourceLabelPos: getLabelPosition(
      points.sx,
      points.sy,
      points.tx,
      points.ty,
      labelOffset,
      controlPoint ?? undefined
    ),
    targetLabelPos: getLabelPosition(
      points.tx,
      points.ty,
      points.sx,
      points.sy,
      labelOffset,
      controlPoint ?? undefined
    )
  };
}

/** Hook for calculating edge geometry with bezier curves for parallel edges */
function useEdgeGeometry(edgeId: string, source: string, target: string, labelOffset: number) {
  const sourceNode = useNodeGeometry(source);
  const targetNode = useNodeGeometry(target);
  const edges = useEdges();
  const { getParallelInfo, getLoopInfo } = useEdgeInfo(edges);

  const parallelInfo = getParallelInfo(edgeId);
  const loopInfo = getLoopInfo(edgeId);

  return useMemo((): EdgeGeometry | null => {
    if (!sourceNode) return null;

    const sourcePos = sourceNode.position;
    const sourceNodeWidth = sourceNode.width;

    // Handle loop edges (source === target)
    if (source === target && loopInfo) {
      return computeLoopGeometry(sourcePos, sourceNodeWidth, loopInfo.loopIndex, labelOffset);
    }

    if (!targetNode) return null;

    const targetPos = targetNode.position;
    const targetNodeWidth = targetNode.width;

    return computeRegularGeometry(
      sourcePos,
      targetPos,
      sourceNodeWidth,
      targetNodeWidth,
      parallelInfo,
      labelOffset
    );
  }, [sourceNode, targetNode, parallelInfo, loopInfo, source, target, labelOffset]);
}

/** Get stroke styling based on selection and link status */
function getStrokeStyle(linkStatus: string | undefined, selected: boolean) {
  return {
    color: getStrokeColor(linkStatus, selected),
    width: selected ? EDGE_WIDTH_SELECTED : EDGE_WIDTH_NORMAL,
    opacity: selected ? EDGE_OPACITY_SELECTED : EDGE_OPACITY_NORMAL
  };
}

function getEdgeLabelOffset(edgeData: TopologyEdgeData | undefined): number {
  const rawOffset =
    typeof edgeData?.endpointLabelOffset === "number"
      ? edgeData.endpointLabelOffset
      : DEFAULT_ENDPOINT_LABEL_OFFSET;
  return edgeData?.endpointLabelOffsetEnabled === false ? 0 : rawOffset;
}

function shouldRenderEdgeLabels(
  labelMode: "show-all" | "on-select" | "hide",
  suppressLabels: boolean,
  selected: boolean
): boolean {
  if (suppressLabels) return false;
  if (labelMode === "show-all") return true;
  return labelMode === "on-select" && selected;
}

/**
 * TopologyEdge - Floating edge that connects nodes between source and target nodes
 * Supports bezier curves for parallel edges between the same node pair
 */
const TopologyEdgeComponent: React.FC<EdgeProps> = ({ id, source, target, data, selected }) => {
  const edgeData = data as TopologyEdgeData | undefined;
  const labelOffset = getEdgeLabelOffset(edgeData);
  const geometry = useEdgeGeometry(id, source, target, labelOffset);
  const { labelMode, suppressLabels, suppressHitArea } = useEdgeRenderConfig();

  if (!geometry) return null;
  const shouldRenderLabels = shouldRenderEdgeLabels(labelMode, suppressLabels, !!selected);

  const stroke = getStrokeStyle(edgeData?.linkStatus, selected ?? false);

  return (
    <>
      {!suppressHitArea && (
        <path
          id={`${id}-interaction`}
          d={geometry.path}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ cursor: "pointer" }}
        />
      )}
      <path
        id={id}
        d={geometry.path}
        fill="none"
        style={{
          cursor: "pointer",
          opacity: stroke.opacity,
          strokeWidth: stroke.width,
          stroke: stroke.color
        }}
        className="react-flow__edge-path"
      />
      {shouldRenderLabels && (
        <EdgeLabelRenderer>
          {edgeData?.sourceEndpoint && (
            <EndpointLabel
              text={edgeData.sourceEndpoint}
              x={geometry.sourceLabelPos.x}
              y={geometry.sourceLabelPos.y}
            />
          )}
          {edgeData?.targetEndpoint && (
            <EndpointLabel
              text={edgeData.targetEndpoint}
              x={geometry.targetLabelPos.x}
              y={geometry.targetLabelPos.y}
            />
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export const TopologyEdge = memo(TopologyEdgeComponent);
