/**
 * Helper lines hook for node alignment during drag
 *
 * Provides visual alignment guides that appear when dragging nodes,
 * helping to align nodes horizontally and vertically with other nodes.
 */
import { useState, useCallback, useRef } from "react";
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

  // Track the closest alignments found
  let closestHorizontalDist = threshold + 1;
  let closestVerticalDist = threshold + 1;
  let snapX: number | null = null;
  let snapY: number | null = null;

  // Check alignment against all other nodes
  for (const node of allNodes) {
    // Skip the dragging node itself
    if (node.id === draggingNode.id) continue;
    // Skip hidden nodes
    if (node.hidden) continue;

    const targetEdges = getNodeEdges(node);

    // Check horizontal alignments (Y axis - top, center, bottom)
    const horizontalChecks = [
      { dragY: draggingEdges.top, targetY: targetEdges.top, label: "top-top" },
      { dragY: draggingEdges.top, targetY: targetEdges.centerY, label: "top-center" },
      { dragY: draggingEdges.top, targetY: targetEdges.bottom, label: "top-bottom" },
      { dragY: draggingEdges.centerY, targetY: targetEdges.top, label: "center-top" },
      { dragY: draggingEdges.centerY, targetY: targetEdges.centerY, label: "center-center" },
      { dragY: draggingEdges.centerY, targetY: targetEdges.bottom, label: "center-bottom" },
      { dragY: draggingEdges.bottom, targetY: targetEdges.top, label: "bottom-top" },
      { dragY: draggingEdges.bottom, targetY: targetEdges.centerY, label: "bottom-center" },
      { dragY: draggingEdges.bottom, targetY: targetEdges.bottom, label: "bottom-bottom" }
    ];

    for (const check of horizontalChecks) {
      const dist = Math.abs(check.dragY - check.targetY);
      if (dist < closestHorizontalDist) {
        closestHorizontalDist = dist;
        result.lines.horizontal = check.targetY;
        // Calculate snap position based on which edge aligned
        if (check.label.startsWith("top-")) {
          snapY = check.targetY;
        } else if (check.label.startsWith("center-")) {
          snapY = check.targetY - draggingDims.height / 2;
        } else {
          snapY = check.targetY - draggingDims.height;
        }
      }
    }

    // Check vertical alignments (X axis - left, center, right)
    const verticalChecks = [
      { dragX: draggingEdges.left, targetX: targetEdges.left, label: "left-left" },
      { dragX: draggingEdges.left, targetX: targetEdges.centerX, label: "left-center" },
      { dragX: draggingEdges.left, targetX: targetEdges.right, label: "left-right" },
      { dragX: draggingEdges.centerX, targetX: targetEdges.left, label: "center-left" },
      { dragX: draggingEdges.centerX, targetX: targetEdges.centerX, label: "center-center" },
      { dragX: draggingEdges.centerX, targetX: targetEdges.right, label: "center-right" },
      { dragX: draggingEdges.right, targetX: targetEdges.left, label: "right-left" },
      { dragX: draggingEdges.right, targetX: targetEdges.centerX, label: "right-center" },
      { dragX: draggingEdges.right, targetX: targetEdges.right, label: "right-right" }
    ];

    for (const check of verticalChecks) {
      const dist = Math.abs(check.dragX - check.targetX);
      if (dist < closestVerticalDist) {
        closestVerticalDist = dist;
        result.lines.vertical = check.targetX;
        // Calculate snap position based on which edge aligned
        if (check.label.startsWith("left-")) {
          snapX = check.targetX;
        } else if (check.label.startsWith("center-")) {
          snapX = check.targetX - draggingDims.width / 2;
        } else {
          snapX = check.targetX - draggingDims.width;
        }
      }
    }
  }

  // Clear lines if no alignment within threshold
  if (closestHorizontalDist > threshold) {
    result.lines.horizontal = null;
    snapY = null;
  }
  if (closestVerticalDist > threshold) {
    result.lines.vertical = null;
    snapX = null;
  }

  // Check midpoints between pairs of nodes
  // Collect visible nodes (excluding the dragging node)
  const otherNodes = allNodes.filter((n) => n.id !== draggingNode.id && !n.hidden);

  // Only check midpoints if we have at least 2 other nodes
  if (otherNodes.length >= 2) {
    let closestMidpointXDist = threshold + 1;
    let closestMidpointYDist = threshold + 1;
    let midpointSnapX: number | null = null;
    let midpointSnapY: number | null = null;

    // Check all pairs of nodes for midpoint alignment
    for (let i = 0; i < otherNodes.length; i++) {
      for (let j = i + 1; j < otherNodes.length; j++) {
        const nodeA = otherNodes[i];
        const nodeB = otherNodes[j];
        const edgesA = getNodeEdges(nodeA);
        const edgesB = getNodeEdges(nodeB);

        // Calculate midpoint between the two nodes' centers
        const midpointX = (edgesA.centerX + edgesB.centerX) / 2;
        const midpointY = (edgesA.centerY + edgesB.centerY) / 2;

        // Check if dragging node's center aligns with horizontal midpoint (Y axis)
        const midpointYDist = Math.abs(draggingEdges.centerY - midpointY);
        if (midpointYDist < closestMidpointYDist) {
          closestMidpointYDist = midpointYDist;
          result.lines.horizontalMidpoint = midpointY;
          midpointSnapY = midpointY - draggingDims.height / 2;
        }

        // Check if dragging node's center aligns with vertical midpoint (X axis)
        const midpointXDist = Math.abs(draggingEdges.centerX - midpointX);
        if (midpointXDist < closestMidpointXDist) {
          closestMidpointXDist = midpointXDist;
          result.lines.verticalMidpoint = midpointX;
          midpointSnapX = midpointX - draggingDims.width / 2;
        }
      }
    }

    // Clear midpoint lines if no alignment within threshold
    if (closestMidpointYDist > threshold) {
      result.lines.horizontalMidpoint = null;
      midpointSnapY = null;
    }
    if (closestMidpointXDist > threshold) {
      result.lines.verticalMidpoint = null;
      midpointSnapX = null;
    }

    // Update snap position with midpoint snaps (midpoint takes precedence if closer)
    if (midpointSnapX !== null && (snapX === null || closestMidpointXDist < closestVerticalDist)) {
      snapX = midpointSnapX;
    }
    if (
      midpointSnapY !== null &&
      (snapY === null || closestMidpointYDist < closestHorizontalDist)
    ) {
      snapY = midpointSnapY;
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
  const [helperLines, setHelperLines] = useState<HelperLinePositions>({
    horizontal: null,
    vertical: null,
    horizontalMidpoint: null,
    verticalMidpoint: null
  });

  // Track if we're currently showing lines (to avoid unnecessary state updates)
  const hasLinesRef = useRef(false);

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
        setHelperLines(lines);
        hasLinesRef.current = hasLines;
      }

      return enableSnap ? snappedPosition : null;
    },
    []
  );

  /** Clear helper lines (call on drag end) */
  const clearHelperLines = useCallback(() => {
    if (hasLinesRef.current) {
      setHelperLines({
        horizontal: null,
        vertical: null,
        horizontalMidpoint: null,
        verticalMidpoint: null
      });
      hasLinesRef.current = false;
    }
  }, []);

  return {
    helperLines,
    updateHelperLines,
    clearHelperLines
  };
}
