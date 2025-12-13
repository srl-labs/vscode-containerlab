/**
 * TopologyEdge - Custom React Flow edge with endpoint labels
 * Uses floating/straight edge style matching Cytoscape
 */
import React, { memo, useMemo } from 'react';
import {
  EdgeLabelRenderer,
  useInternalNode,
  useEdges,
  type EdgeProps
} from '@xyflow/react';
import type { TopologyEdgeData } from '../types';
import { SELECTION_COLOR } from '../types';

// Edge style constants matching Cytoscape
const EDGE_COLOR_DEFAULT = '#969799';
const EDGE_COLOR_UP = '#00df2b';
const EDGE_COLOR_DOWN = '#df2b00';
const EDGE_WIDTH_NORMAL = 2.5;
const EDGE_WIDTH_SELECTED = 4;
const EDGE_OPACITY_NORMAL = 0.5;
const EDGE_OPACITY_SELECTED = 1;

// Label style constants matching Cytoscape
const LABEL_FONT_SIZE = '10px';
const LABEL_BG_COLOR = 'rgba(202, 203, 204, 0.5)';
const LABEL_TEXT_COLOR = 'rgba(0, 0, 0, 0.7)';
const LABEL_OUTLINE_COLOR = 'rgba(255, 255, 255, 0.7)';
const LABEL_PADDING = '0px 2px';
const LABEL_OFFSET = 30; // Pixels from node edge

// Bezier curve constants for parallel edges
const CONTROL_POINT_STEP_SIZE = 40; // Spacing between parallel edges (more curvy for label space)

// Node icon dimensions (edges connect to icon center, not the label)
const NODE_ICON_SIZE = 40;

/**
 * Get stroke color based on link status
 */
function getStrokeColor(linkStatus: string | undefined, selected: boolean): string {
  if (selected) return SELECTION_COLOR;
  switch (linkStatus) {
    case 'up':
      return EDGE_COLOR_UP;
    case 'down':
      return EDGE_COLOR_DOWN;
    default:
      return EDGE_COLOR_DEFAULT;
  }
}

/**
 * Calculate the intersection point of a line from center to target with a rectangle
 */
function getNodeIntersection(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const w = nodeWidth / 2;
  const h = nodeHeight / 2;
  const dx = targetX - nodeX;
  const dy = targetY - nodeY;

  if (dx === 0 && dy === 0) {
    return { x: nodeX, y: nodeY };
  }

  // Calculate intersection with rectangle bounds
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Determine which edge of the rectangle the line intersects
  if (absDx * h > absDy * w) {
    // Intersects left or right edge
    const sign = dx > 0 ? 1 : -1;
    return {
      x: nodeX + sign * w,
      y: nodeY + (dy * w) / absDx
    };
  } else {
    // Intersects top or bottom edge
    const sign = dy > 0 ? 1 : -1;
    return {
      x: nodeX + (dx * h) / absDy,
      y: nodeY + sign * h
    };
  }
}

/**
 * Get edge connection points between two nodes (like Cytoscape)
 */
function getEdgePoints(
  sourceNode: { x: number; y: number; width: number; height: number },
  targetNode: { x: number; y: number; width: number; height: number }
): { sx: number; sy: number; tx: number; ty: number } {
  const sourceCenter = {
    x: sourceNode.x + sourceNode.width / 2,
    y: sourceNode.y + sourceNode.height / 2
  };
  const targetCenter = {
    x: targetNode.x + targetNode.width / 2,
    y: targetNode.y + targetNode.height / 2
  };

  const sourcePoint = getNodeIntersection(
    sourceCenter.x,
    sourceCenter.y,
    sourceNode.width,
    sourceNode.height,
    targetCenter.x,
    targetCenter.y
  );

  const targetPoint = getNodeIntersection(
    targetCenter.x,
    targetCenter.y,
    targetNode.width,
    targetNode.height,
    sourceCenter.x,
    sourceCenter.y
  );

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y
  };
}

/**
 * Calculate label position along the edge (supports curved paths)
 * For curved edges, labels are placed further along the curve where they've separated
 */
function getLabelPosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  offset: number,
  controlPoint?: { x: number; y: number }
): { x: number; y: number } {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: startX, y: startY };

  // For curved edges, use a larger t-value so labels are placed where curves have separated
  // This prevents overlapping labels on parallel horizontal edges
  const baseRatio = Math.min(offset / length, 0.4);
  const ratio = controlPoint ? Math.max(baseRatio, 0.15) : baseRatio;

  // For curved edges, calculate position along the quadratic bezier curve
  if (controlPoint) {
    const t = ratio;
    // Quadratic bezier: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlPoint.x + t * t * endX,
      y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlPoint.y + t * t * endY
    };
  }

  return {
    x: startX + dx * ratio,
    y: startY + dy * ratio
  };
}

/**
 * Get parallel edge info - finds all edges between the same node pair
 * and returns the current edge's index and total count
 */
interface ParallelEdgeInfo {
  index: number;
  total: number;
}

function getParallelEdgeInfo(
  edgeId: string,
  source: string,
  target: string,
  allEdges: { id: string; source: string; target: string }[]
): ParallelEdgeInfo {
  // Find all edges between the same node pair (in either direction)
  const parallelEdges = allEdges.filter(
    (e) =>
      (e.source === source && e.target === target) ||
      (e.source === target && e.target === source)
  );

  // Sort by ID for consistent ordering
  parallelEdges.sort((a, b) => a.id.localeCompare(b.id));

  const index = parallelEdges.findIndex((e) => e.id === edgeId);
  return {
    index: index === -1 ? 0 : index,
    total: parallelEdges.length
  };
}

/**
 * Calculate the bezier control point for a curved edge
 * Returns null for single edges (straight line)
 */
function calculateControlPoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  edgeIndex: number,
  totalEdges: number
): { x: number; y: number } | null {
  // Single edge - use straight line
  if (totalEdges <= 1) return null;

  // Calculate midpoint
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  // Calculate perpendicular direction
  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  // Perpendicular unit vector (rotated 90 degrees)
  const normalX = -dy / length;
  const normalY = dx / length;

  // Calculate offset: distribute edges evenly around the center
  // For 2 edges: offsets are -0.5 and +0.5 times step size
  // For 3 edges: offsets are -1, 0, +1 times step size
  const offset = (edgeIndex - (totalEdges - 1) / 2) * CONTROL_POINT_STEP_SIZE;

  return {
    x: midX + normalX * offset,
    y: midY + normalY * offset
  };
}

/**
 * Label component for endpoint text
 */
function EndpointLabel({ text, x, y }: Readonly<{ text: string; x: number; y: number }>) {
  const style: React.CSSProperties = {
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
    fontSize: LABEL_FONT_SIZE,
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    color: LABEL_TEXT_COLOR,
    backgroundColor: LABEL_BG_COLOR,
    padding: LABEL_PADDING,
    borderRadius: 4,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    textShadow: `
      0 0 2px ${LABEL_OUTLINE_COLOR},
      0 0 2px ${LABEL_OUTLINE_COLOR},
      0 0 3px ${LABEL_OUTLINE_COLOR}
    `,
    lineHeight: 1.2,
    zIndex: 1
  };

  return (
    <div style={style} className="topology-edge-label nodrag nopan">
      {text}
    </div>
  );
}

/** Hook for calculating edge geometry with bezier curves for parallel edges */
function useEdgeGeometry(edgeId: string, source: string, target: string) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const allEdges = useEdges();

  return useMemo(() => {
    if (!sourceNode || !targetNode) return null;

    const sourcePos = sourceNode.internals.positionAbsolute;
    const targetPos = targetNode.internals.positionAbsolute;

    // Calculate icon center position (icon is centered horizontally, at top of node)
    const sourceNodeWidth = sourceNode.measured?.width ?? NODE_ICON_SIZE;
    const targetNodeWidth = targetNode.measured?.width ?? NODE_ICON_SIZE;

    // Edge connects to icon center, not full node center
    // Icon is horizontally centered in node, and is NODE_ICON_SIZE x NODE_ICON_SIZE at the top
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

    // Get parallel edge info for this edge
    const parallelInfo = getParallelEdgeInfo(edgeId, source, target, allEdges);

    // Calculate control point for bezier curve (null for single edges)
    const controlPoint = calculateControlPoint(
      points.sx,
      points.sy,
      points.tx,
      points.ty,
      parallelInfo.index,
      parallelInfo.total
    );

    // Generate path: straight line for single edges, quadratic bezier for parallel edges
    const path = controlPoint
      ? `M ${points.sx} ${points.sy} Q ${controlPoint.x} ${controlPoint.y} ${points.tx} ${points.ty}`
      : `M ${points.sx} ${points.sy} L ${points.tx} ${points.ty}`;

    return {
      points,
      path,
      controlPoint,
      sourceLabelPos: getLabelPosition(points.sx, points.sy, points.tx, points.ty, LABEL_OFFSET, controlPoint ?? undefined),
      targetLabelPos: getLabelPosition(points.tx, points.ty, points.sx, points.sy, LABEL_OFFSET, controlPoint ?? undefined)
    };
  }, [sourceNode, targetNode, allEdges, edgeId, source, target]);
}

/** Get stroke styling based on selection and link status */
function getStrokeStyle(linkStatus: string | undefined, selected: boolean) {
  return {
    color: getStrokeColor(linkStatus, selected),
    width: selected ? EDGE_WIDTH_SELECTED : EDGE_WIDTH_NORMAL,
    opacity: selected ? EDGE_OPACITY_SELECTED : EDGE_OPACITY_NORMAL
  };
}

/**
 * TopologyEdge - Floating edge that connects nodes like Cytoscape
 * Supports bezier curves for parallel edges between the same node pair
 */
const TopologyEdgeComponent: React.FC<EdgeProps<TopologyEdgeData>> = ({ id, source, target, data, selected }) => {
  const geometry = useEdgeGeometry(id, source, target);
  if (!geometry) return null;

  const stroke = getStrokeStyle(data?.linkStatus, selected ?? false);

  return (
    <>
      <path id={`${id}-interaction`} d={geometry.path} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <path id={id} d={geometry.path} fill="none" style={{ cursor: 'pointer', opacity: stroke.opacity, strokeWidth: stroke.width, stroke: stroke.color }} className="react-flow__edge-path" />
      <EdgeLabelRenderer>
        {data?.sourceEndpoint && <EndpointLabel text={data.sourceEndpoint} x={geometry.sourceLabelPos.x} y={geometry.sourceLabelPos.y} />}
        {data?.targetEndpoint && <EndpointLabel text={data.targetEndpoint} x={geometry.targetLabelPos.x} y={geometry.targetLabelPos.y} />}
      </EdgeLabelRenderer>
    </>
  );
};

export const TopologyEdge = memo(TopologyEdgeComponent);
