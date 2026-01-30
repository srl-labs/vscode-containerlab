/**
 * Edge to SVG conversion utilities for export
 * Renders topology edges with bezier curves for parallel edges
 */
import type { Node, Edge } from "@xyflow/react";

import {
  getEdgePoints,
  calculateControlPoint,
  getLabelPosition
} from "../../canvas/edgeGeometry";

import {
  NODE_ICON_SIZE,
  EDGE_COLOR,
  EDGE_STYLE,
  EDGE_LABEL,
  CONTROL_POINT_STEP_SIZE
} from "./constants";

// ============================================================================
// Types
// ============================================================================

interface TopologyEdgeData {
  sourceEndpoint?: string;
  targetEndpoint?: string;
  linkStatus?: "up" | "down";
  [key: string]: unknown;
}

interface EdgeInfo {
  parallelInfo: Map<string, { index: number; total: number; isCanonicalDirection: boolean }>;
  loopInfo: Map<string, { loopIndex: number }>;
}

interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// Helpers
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Get stroke color based on link status
 */
function getEdgeColor(linkStatus: string | undefined): string {
  switch (linkStatus) {
    case "up":
      return EDGE_COLOR.up;
    case "down":
      return EDGE_COLOR.down;
    default:
      return EDGE_COLOR.default;
  }
}

/**
 * Create canonical edge key for grouping parallel edges
 * Ensures same key regardless of direction
 */
function getCanonicalEdgeKey(source: string, target: string): string {
  return source < target ? `${source}:${target}` : `${target}:${source}`;
}

// ============================================================================
// Edge Info Builder
// ============================================================================

/**
 * Build edge info for export (parallel edge grouping and loop detection)
 * Similar to useEdgeInfo hook but for static export
 */
export function buildEdgeInfoForExport(edges: Edge[]): EdgeInfo {
  const parallelInfo = new Map<string, { index: number; total: number; isCanonicalDirection: boolean }>();
  const loopInfo = new Map<string, { loopIndex: number }>();

  // Group edges by canonical key
  const edgeGroups = new Map<string, Edge[]>();
  const loopEdges = new Map<string, Edge[]>();

  for (const edge of edges) {
    if (edge.source === edge.target) {
      // Loop edge
      const existing = loopEdges.get(edge.source) ?? [];
      existing.push(edge);
      loopEdges.set(edge.source, existing);
    } else {
      // Regular or parallel edge
      const key = getCanonicalEdgeKey(edge.source, edge.target);
      const existing = edgeGroups.get(key) ?? [];
      existing.push(edge);
      edgeGroups.set(key, existing);
    }
  }

  // Process loop edges
  for (const [, nodeLoopEdges] of loopEdges) {
    for (let i = 0; i < nodeLoopEdges.length; i++) {
      loopInfo.set(nodeLoopEdges[i].id, { loopIndex: i });
    }
  }

  // Process parallel edges
  for (const [key, groupEdges] of edgeGroups) {
    const total = groupEdges.length;
    const [canonicalSource] = key.split(":");

    for (let i = 0; i < groupEdges.length; i++) {
      const edge = groupEdges[i];
      const isCanonicalDirection = edge.source === canonicalSource;
      parallelInfo.set(edge.id, { index: i, total, isCanonicalDirection });
    }
  }

  return { parallelInfo, loopInfo };
}

// ============================================================================
// Edge Label Builder
// ============================================================================

/**
 * Build SVG for edge endpoint label
 */
function buildEndpointLabelSvg(
  text: string,
  x: number,
  y: number
): string {
  if (!text) return "";

  // Estimate text dimensions
  const charWidth = EDGE_LABEL.fontSize * 0.6;
  const textWidth = text.length * charWidth;
  const bgWidth = textWidth + EDGE_LABEL.paddingX * 2 + 4;
  const bgHeight = EDGE_LABEL.fontSize + EDGE_LABEL.paddingY * 2 + 4;

  const bgX = x - bgWidth / 2;
  const bgY = y - bgHeight / 2;
  const textY = y + EDGE_LABEL.fontSize * 0.35;

  let svg = `<g class="edge-label">`;

  // Background
  svg += `<rect x="${bgX}" y="${bgY}" width="${bgWidth}" height="${bgHeight}" `;
  svg += `fill="${EDGE_LABEL.backgroundColor}" rx="${EDGE_LABEL.borderRadius}" ry="${EDGE_LABEL.borderRadius}"/>`;

  // Text (no stroke outline - matches canvas appearance)
  svg += `<text x="${x}" y="${textY}" `;
  svg += `font-size="${EDGE_LABEL.fontSize}" `;
  svg += `font-family='${EDGE_LABEL.fontFamily}' `;
  svg += `fill="${EDGE_LABEL.color}" text-anchor="middle">`;
  svg += escapeXml(text);
  svg += `</text>`;

  svg += `</g>`;
  return svg;
}

// ============================================================================
// Loop Edge Builder
// ============================================================================

const LOOP_EDGE_SIZE = 50;
const LOOP_EDGE_OFFSET = 10;

/**
 * Calculate loop edge geometry for self-referencing edges
 */
function buildLoopEdgePath(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  loopIndex: number
): { path: string; sourceLabelPos: { x: number; y: number }; targetLabelPos: { x: number; y: number } } {
  const centerX = nodeX + nodeWidth / 2;
  const centerY = nodeY + nodeHeight / 2;
  const size = LOOP_EDGE_SIZE + loopIndex * LOOP_EDGE_OFFSET;

  const startX = centerX + nodeWidth / 2;
  const startY = centerY - nodeHeight / 4;
  const endX = centerX + nodeWidth / 2;
  const endY = centerY + nodeHeight / 4;

  const cp1X = startX + size;
  const cp1Y = startY - size * 0.5;
  const cp2X = endX + size;
  const cp2Y = endY + size * 0.5;

  const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
  const labelX = centerX + nodeWidth / 2 + size * 0.8;

  return {
    path,
    sourceLabelPos: { x: labelX, y: centerY - 10 },
    targetLabelPos: { x: labelX, y: centerY + 10 }
  };
}

// ============================================================================
// Single Edge Builder
// ============================================================================

interface EdgeRenderContext {
  edgeId: string;
  strokeColor: string;
  edgeData: TopologyEdgeData | undefined;
  includeLabels: boolean;
}

/**
 * Build the edge labels SVG if enabled
 */
function buildEdgeLabels(
  ctx: EdgeRenderContext,
  sourceLabelPos: { x: number; y: number },
  targetLabelPos: { x: number; y: number }
): string {
  if (!ctx.includeLabels) return "";
  let svg = "";
  if (ctx.edgeData?.sourceEndpoint) {
    svg += buildEndpointLabelSvg(ctx.edgeData.sourceEndpoint, sourceLabelPos.x, sourceLabelPos.y);
  }
  if (ctx.edgeData?.targetEndpoint) {
    svg += buildEndpointLabelSvg(ctx.edgeData.targetEndpoint, targetLabelPos.x, targetLabelPos.y);
  }
  return svg;
}

/**
 * Render a loop edge (self-referencing) to SVG
 */
function renderLoopEdge(
  ctx: EdgeRenderContext,
  sourceNode: Node,
  loopIndex: number
): string {
  const nodeX = sourceNode.position.x;
  const nodeY = sourceNode.position.y;

  const { path, sourceLabelPos, targetLabelPos } = buildLoopEdgePath(
    nodeX,
    nodeY,
    NODE_ICON_SIZE,
    NODE_ICON_SIZE,
    loopIndex
  );

  let svg = `<g class="export-edge loop-edge" data-id="${escapeXml(ctx.edgeId)}">`;
  svg += `<path d="${path}" fill="none" stroke="${ctx.strokeColor}" `;
  svg += `stroke-width="${EDGE_STYLE.strokeWidth}" opacity="${EDGE_STYLE.opacity}"/>`;
  svg += buildEdgeLabels(ctx, sourceLabelPos, targetLabelPos);
  svg += `</g>`;
  return svg;
}

/**
 * Render a regular edge (between two different nodes) to SVG
 */
function renderRegularEdge(
  ctx: EdgeRenderContext,
  sourceNode: Node,
  targetNode: Node,
  parallelInfo: { index: number; total: number; isCanonicalDirection: boolean } | undefined
): string {
  const sourceRect: NodeRect = {
    x: sourceNode.position.x,
    y: sourceNode.position.y,
    width: NODE_ICON_SIZE,
    height: NODE_ICON_SIZE
  };
  const targetRect: NodeRect = {
    x: targetNode.position.x,
    y: targetNode.position.y,
    width: NODE_ICON_SIZE,
    height: NODE_ICON_SIZE
  };

  const points = getEdgePoints(sourceRect, targetRect);
  const index = parallelInfo?.index ?? 0;
  const total = parallelInfo?.total ?? 1;
  const isCanonical = parallelInfo?.isCanonicalDirection ?? true;

  const controlPoint = calculateControlPoint(
    points.sx, points.sy, points.tx, points.ty,
    index, total, isCanonical, CONTROL_POINT_STEP_SIZE
  );

  const path = controlPoint
    ? `M ${points.sx} ${points.sy} Q ${controlPoint.x} ${controlPoint.y} ${points.tx} ${points.ty}`
    : `M ${points.sx} ${points.sy} L ${points.tx} ${points.ty}`;

  let svg = `<g class="export-edge" data-id="${escapeXml(ctx.edgeId)}">`;
  svg += `<path d="${path}" fill="none" stroke="${ctx.strokeColor}" `;
  svg += `stroke-width="${EDGE_STYLE.strokeWidth}" opacity="${EDGE_STYLE.opacity}"/>`;

  if (ctx.includeLabels) {
    const sourceLabelPos = getLabelPosition(
      points.sx, points.sy, points.tx, points.ty,
      EDGE_LABEL.offset, controlPoint ?? undefined
    );
    const targetLabelPos = getLabelPosition(
      points.tx, points.ty, points.sx, points.sy,
      EDGE_LABEL.offset, controlPoint ?? undefined
    );
    svg += buildEdgeLabels(ctx, sourceLabelPos, targetLabelPos);
  }

  svg += `</g>`;
  return svg;
}

/**
 * Render a single edge to SVG
 */
export function edgeToSvg(
  edge: Edge,
  nodeMap: Map<string, Node>,
  edgeInfo: EdgeInfo,
  includeLabels: boolean
): string {
  const sourceNode = nodeMap.get(edge.source);
  if (!sourceNode) return "";

  const edgeData = edge.data as TopologyEdgeData | undefined;
  const ctx: EdgeRenderContext = {
    edgeId: edge.id,
    strokeColor: getEdgeColor(edgeData?.linkStatus),
    edgeData,
    includeLabels
  };

  // Handle loop edges (self-referencing)
  if (edge.source === edge.target) {
    const loopData = edgeInfo.loopInfo.get(edge.id);
    return renderLoopEdge(ctx, sourceNode, loopData?.loopIndex ?? 0);
  }

  // Handle regular edges
  const targetNode = nodeMap.get(edge.target);
  if (!targetNode) return "";

  return renderRegularEdge(ctx, sourceNode, targetNode, edgeInfo.parallelInfo.get(edge.id));
}

// ============================================================================
// Batch Renderer
// ============================================================================

/**
 * Render all edges to SVG
 * Filters out edges connected to annotation nodes
 */
export function renderEdgesToSvg(
  edges: Edge[],
  nodes: Node[],
  includeLabels: boolean,
  annotationNodeTypes?: Set<string>
): string {
  const skipTypes = annotationNodeTypes ?? new Set([
    "free-text-annotation",
    "free-shape-annotation",
    "group-annotation"
  ]);

  // Build node map for position lookup
  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Filter edges - exclude those connected to annotation nodes
  const validEdges = edges.filter((edge) => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode) return false;
    if (skipTypes.has(sourceNode.type ?? "")) return false;
    if (targetNode && skipTypes.has(targetNode.type ?? "")) return false;
    return true;
  });

  // Build edge info for parallel/loop detection
  const edgeInfo = buildEdgeInfoForExport(validEdges);

  let svg = "";
  for (const edge of validEdges) {
    svg += edgeToSvg(edge, nodeMap, edgeInfo, includeLabels);
  }

  return svg;
}
