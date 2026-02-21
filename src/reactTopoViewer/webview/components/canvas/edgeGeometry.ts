import type { XYPosition } from "@xyflow/react";

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate the intersection point of a line from center to target with a rectangle
 */
export function getNodeIntersection(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  targetX: number,
  targetY: number
): XYPosition {
  const w = nodeWidth / 2;
  const h = nodeHeight / 2;
  const dx = targetX - nodeX;
  const dy = targetY - nodeY;

  if (dx === 0 && dy === 0) {
    return { x: nodeX, y: nodeY };
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx * h > absDy * w) {
    const sign = dx > 0 ? 1 : -1;
    return {
      x: nodeX + sign * w,
      y: nodeY + (dy * w) / absDx,
    };
  }

  const sign = dy > 0 ? 1 : -1;
  return {
    x: nodeX + (dx * h) / absDy,
    y: nodeY + sign * h,
  };
}

/**
 * Get edge connection points between two nodes (between source and target nodes)
 */
export function getEdgePoints(sourceNode: NodeRect, targetNode: NodeRect) {
  const sourceCenter = {
    x: sourceNode.x + sourceNode.width / 2,
    y: sourceNode.y + sourceNode.height / 2,
  };
  const targetCenter = {
    x: targetNode.x + targetNode.width / 2,
    y: targetNode.y + targetNode.height / 2,
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
    ty: targetPoint.y,
  };
}

/**
 * Calculate label position along the edge (supports curved paths)
 */
export function getLabelPosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  offset: number,
  controlPoint?: { x: number; y: number }
): XYPosition {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: startX, y: startY };

  const baseRatio = Math.min(offset / length, 0.4);
  const ratio = controlPoint ? Math.max(baseRatio, 0.15) : baseRatio;

  if (controlPoint) {
    const t = ratio;
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * controlPoint.x + t * t * endX,
      y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * controlPoint.y + t * t * endY,
    };
  }

  return {
    x: startX + dx * ratio,
    y: startY + dy * ratio,
  };
}

/**
 * Calculate the bezier control point for a curved edge.
 */
export function calculateControlPoint(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  edgeIndex: number,
  totalEdges: number,
  isCanonicalDirection: boolean,
  stepSize: number
): XYPosition | null {
  if (totalEdges <= 1) return null;

  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;

  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  const normalX = -dy / length;
  const normalY = dx / length;

  let offset = (edgeIndex - (totalEdges - 1) / 2) * stepSize;
  if (!isCanonicalDirection) {
    offset = -offset;
  }

  return {
    x: midX + normalX * offset,
    y: midY + normalY * offset,
  };
}
