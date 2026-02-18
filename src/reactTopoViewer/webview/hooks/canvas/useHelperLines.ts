/**
 * Helper lines hook for node alignment during drag
 *
 * Provides visual alignment guides that appear when dragging nodes,
 * helping to align nodes horizontally and vertically with other nodes.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import type { Node, XYPosition } from "@xyflow/react";

/** Distance threshold in pixels for triggering alignment snap */
const SNAP_THRESHOLD = 5;

/** Types of alignment detected */
export interface HelperLinePositions {
  /** Horizontal line Y position (when node centers align horizontally) */
  horizontal: number | null;
  /** Vertical line X position (when node centers align vertically) */
  vertical: number | null;
  /** Horizontal midpoint line Y position (when node is centered between two nodes vertically) */
  horizontalMidpoint: number | null;
  /** Vertical midpoint line X position (when node is centered between two nodes horizontally) */
  verticalMidpoint: number | null;
}

/** Alignment result with optional snapped position */
export interface AlignmentResult {
  /** Helper line positions to display */
  lines: HelperLinePositions;
  /** Snapped position if alignment detected, null otherwise */
  snappedPosition: XYPosition | null;
}

const EMPTY_HELPER_LINES: HelperLinePositions = {
  horizontal: null,
  vertical: null,
  horizontalMidpoint: null,
  verticalMidpoint: null
};

function areHelperLinesEqual(left: HelperLinePositions, right: HelperLinePositions): boolean {
  return (
    left.horizontal === right.horizontal &&
    left.vertical === right.vertical &&
    left.horizontalMidpoint === right.horizontalMidpoint &&
    left.verticalMidpoint === right.verticalMidpoint
  );
}

/** Get node dimensions with defaults */
function getNodeDimensions(node: Node): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 40,
    height: node.measured?.height ?? node.height ?? 40
  };
}

/** Get node edges (top, right, bottom, left) */
function getNodeEdges(node: Node) {
  const { width, height } = getNodeDimensions(node);
  return {
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
    left: node.position.x,
    centerX: node.position.x + width / 2,
    centerY: node.position.y + height / 2
  };
}

type AxisAlignmentResult = {
  line: number | null;
  snap: number | null;
  distance: number;
};

function findClosestAxisAlignment(
  dragPositions: Array<{ value: number; snapOffset: number }>,
  targetPositions: number[],
  threshold: number
): AxisAlignmentResult {
  let bestDistance = threshold + 1;
  let bestLine: number | null = null;
  let bestSnap: number | null = null;

  for (const drag of dragPositions) {
    for (const target of targetPositions) {
      const dist = Math.abs(drag.value - target);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestLine = target;
        bestSnap = target + drag.snapOffset;
      }
    }
  }

  return {
    line: bestDistance <= threshold ? bestLine : null,
    snap: bestDistance <= threshold ? bestSnap : null,
    distance: bestDistance
  };
}

type MidpointAlignmentResult = {
  horizontalMidpoint: number | null;
  verticalMidpoint: number | null;
  snapX: number | null;
  snapY: number | null;
  distanceX: number;
  distanceY: number;
};

function computeMidpointAlignments(
  draggingEdges: ReturnType<typeof getNodeEdges>,
  draggingDims: { width: number; height: number },
  otherNodes: Node[],
  threshold: number
): MidpointAlignmentResult {
  let closestMidpointXDist = threshold + 1;
  let closestMidpointYDist = threshold + 1;
  let midpointSnapX: number | null = null;
  let midpointSnapY: number | null = null;
  let horizontalMidpoint: number | null = null;
  let verticalMidpoint: number | null = null;

  for (let i = 0; i < otherNodes.length; i++) {
    const edgesA = getNodeEdges(otherNodes[i]);
    for (let j = i + 1; j < otherNodes.length; j++) {
      const edgesB = getNodeEdges(otherNodes[j]);
      const midpointX = (edgesA.centerX + edgesB.centerX) / 2;
      const midpointY = (edgesA.centerY + edgesB.centerY) / 2;

      const midpointYDist = Math.abs(draggingEdges.centerY - midpointY);
      if (midpointYDist < closestMidpointYDist) {
        closestMidpointYDist = midpointYDist;
        horizontalMidpoint = midpointY;
        midpointSnapY = midpointY - draggingDims.height / 2;
      }

      const midpointXDist = Math.abs(draggingEdges.centerX - midpointX);
      if (midpointXDist < closestMidpointXDist) {
        closestMidpointXDist = midpointXDist;
        verticalMidpoint = midpointX;
        midpointSnapX = midpointX - draggingDims.width / 2;
      }
    }
  }

  return {
    horizontalMidpoint: closestMidpointYDist <= threshold ? horizontalMidpoint : null,
    verticalMidpoint: closestMidpointXDist <= threshold ? verticalMidpoint : null,
    snapX: closestMidpointXDist <= threshold ? midpointSnapX : null,
    snapY: closestMidpointYDist <= threshold ? midpointSnapY : null,
    distanceX: closestMidpointXDist,
    distanceY: closestMidpointYDist
  };
}

/**
 * Calculate alignment helper lines and snap position for a dragged node
 *
 * @param draggingNode - The node being dragged (with current drag position)
 * @param allNodes - All nodes in the graph
 * @param threshold - Pixel threshold for snapping
 * @returns Alignment result with helper line positions and optional snap position
 */
export function calculateAlignments(
  draggingNode: Node,
  allNodes: Node[],
  threshold: number = SNAP_THRESHOLD
): AlignmentResult {
  const result: AlignmentResult = {
    lines: { horizontal: null, vertical: null, horizontalMidpoint: null, verticalMidpoint: null },
    snappedPosition: null
  };

  // Get dragging node dimensions and edges
  const draggingEdges = getNodeEdges(draggingNode);
  const draggingDims = getNodeDimensions(draggingNode);

  const otherNodes = allNodes.filter((n) => n.id !== draggingNode.id && !n.hidden);

  const dragYPositions = [
    { value: draggingEdges.top, snapOffset: 0 },
    { value: draggingEdges.centerY, snapOffset: -draggingDims.height / 2 },
    { value: draggingEdges.bottom, snapOffset: -draggingDims.height }
  ];
  const dragXPositions = [
    { value: draggingEdges.left, snapOffset: 0 },
    { value: draggingEdges.centerX, snapOffset: -draggingDims.width / 2 },
    { value: draggingEdges.right, snapOffset: -draggingDims.width }
  ];

  const targetYPositions = otherNodes.flatMap((node) => {
    const edges = getNodeEdges(node);
    return [edges.top, edges.centerY, edges.bottom];
  });
  const targetXPositions = otherNodes.flatMap((node) => {
    const edges = getNodeEdges(node);
    return [edges.left, edges.centerX, edges.right];
  });

  const horizontalResult = findClosestAxisAlignment(dragYPositions, targetYPositions, threshold);
  const verticalResult = findClosestAxisAlignment(dragXPositions, targetXPositions, threshold);

  result.lines.horizontal = horizontalResult.line;
  result.lines.vertical = verticalResult.line;

  let snapX = verticalResult.snap;
  let snapY = horizontalResult.snap;

  if (otherNodes.length >= 2) {
    const midpointResult = computeMidpointAlignments(
      draggingEdges,
      draggingDims,
      otherNodes,
      threshold
    );
    result.lines.horizontalMidpoint = midpointResult.horizontalMidpoint;
    result.lines.verticalMidpoint = midpointResult.verticalMidpoint;

    if (
      midpointResult.snapX !== null &&
      (snapX === null || midpointResult.distanceX < verticalResult.distance)
    ) {
      snapX = midpointResult.snapX;
    }
    if (
      midpointResult.snapY !== null &&
      (snapY === null || midpointResult.distanceY < horizontalResult.distance)
    ) {
      snapY = midpointResult.snapY;
    }
  }

  // Only provide snapped position if at least one alignment was found
  if (snapX !== null || snapY !== null) {
    result.snappedPosition = {
      x: snapX ?? draggingNode.position.x,
      y: snapY ?? draggingNode.position.y
    };
  }

  return result;
}

/**
 * Hook to manage helper lines state during node dragging
 */
export function useHelperLines() {
  const [helperLines, setHelperLines] = useState<HelperLinePositions>(EMPTY_HELPER_LINES);

  // Track if we're currently showing lines (to avoid unnecessary state updates)
  const hasLinesRef = useRef(false);
  const helperLinesRef = useRef<HelperLinePositions>(EMPTY_HELPER_LINES);
  const pendingLinesRef = useRef<HelperLinePositions | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const flushPendingLines = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingLinesRef.current;
    if (!pending) return;
    pendingLinesRef.current = null;
    if (areHelperLinesEqual(helperLinesRef.current, pending)) return;
    helperLinesRef.current = pending;
    setHelperLines(pending);
  }, []);

  const scheduleHelperLineUpdate = useCallback(
    (nextLines: HelperLinePositions) => {
      pendingLinesRef.current = nextLines;
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(flushPendingLines);
    },
    [flushPendingLines]
  );

  useEffect(
    () => () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    },
    []
  );

  /**
   * Update helper lines based on dragged node position
   * Returns the snapped position if alignment detected
   */
  const updateHelperLines = useCallback(
    (draggingNode: Node, allNodes: Node[], enableSnap: boolean = true): XYPosition | null => {
      const { lines, snappedPosition } = calculateAlignments(draggingNode, allNodes);

      const hasLines =
        lines.horizontal !== null ||
        lines.vertical !== null ||
        lines.horizontalMidpoint !== null ||
        lines.verticalMidpoint !== null;

      // Only update state if lines changed
      if (hasLines || hasLinesRef.current) {
        scheduleHelperLineUpdate(lines);
        hasLinesRef.current = hasLines;
      }

      return enableSnap ? snappedPosition : null;
    },
    [scheduleHelperLineUpdate]
  );

  /** Clear helper lines (call on drag end) */
  const clearHelperLines = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingLinesRef.current = null;

    if (!hasLinesRef.current && areHelperLinesEqual(helperLinesRef.current, EMPTY_HELPER_LINES)) {
      return;
    }

    helperLinesRef.current = EMPTY_HELPER_LINES;
    setHelperLines(EMPTY_HELPER_LINES);
    hasLinesRef.current = false;
  }, []);

  return {
    helperLines,
    updateHelperLines,
    clearHelperLines
  };
}
