// Edge-to-SVG conversion for export.
import type { Node, Edge } from "@xyflow/react";

import {
  getEdgePoints,
  calculateControlPoint,
  getLabelPosition,
  getNodeIntersection
} from "../../canvas/edgeGeometry";

import {
  NODE_ICON_SIZE,
  EDGE_COLOR,
  EDGE_STYLE,
  EDGE_LABEL,
  CONTROL_POINT_STEP_SIZE,
  escapeXml
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

export interface EdgeSvgRenderOptions {
  nodeIconSize?: number;
  interfaceScale?: number;
  interfaceLabelOverrides?: Record<string, string>;
}

type InterfaceSide = "top" | "right" | "bottom" | "left";

interface EndpointVector {
  dx: number;
  dy: number;
  samples: number;
}

interface InterfaceAnchor {
  x: number;
  y: number;
}

type NodeInterfaceAnchorMap = Map<string, Map<string, InterfaceAnchor>>;

interface EndpointAssignment {
  endpoint: string;
  sortKey: number;
  radius: number;
}

interface ResolvedEdgeRenderOptions {
  nodeIconSize: number;
  interfaceScale: number;
  interfaceLabelOverrides: Record<string, string>;
}

// ============================================================================
// Helpers
// ============================================================================

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveEdgeRenderOptions(renderOptions?: EdgeSvgRenderOptions): ResolvedEdgeRenderOptions {
  const nodeIconSizeRaw = renderOptions?.nodeIconSize;
  const interfaceScaleRaw = renderOptions?.interfaceScale;
  const nodeIconSize =
    typeof nodeIconSizeRaw === "number" && Number.isFinite(nodeIconSizeRaw)
      ? clamp(nodeIconSizeRaw, 12, 240)
      : NODE_ICON_SIZE;
  const interfaceScale =
    typeof interfaceScaleRaw === "number" && Number.isFinite(interfaceScaleRaw)
      ? clamp(interfaceScaleRaw, 0.4, 4)
      : 1;
  const interfaceLabelOverrides =
    renderOptions?.interfaceLabelOverrides &&
    typeof renderOptions.interfaceLabelOverrides === "object"
      ? renderOptions.interfaceLabelOverrides
      : {};

  return { nodeIconSize, interfaceScale, interfaceLabelOverrides };
}

function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNodeRect(node: Node, nodeIconSize: number): NodeRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: nodeIconSize,
    height: nodeIconSize
  };
}

function getRectCenter(rect: NodeRect): { x: number; y: number } {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function sideBuckets(): Record<InterfaceSide, EndpointAssignment[]> {
  return { top: [], right: [], bottom: [], left: [] };
}

function getOrCreateNodeEndpointVectors(
  vectorsByNode: Map<string, Map<string, EndpointVector>>,
  nodeId: string
): Map<string, EndpointVector> {
  const existing = vectorsByNode.get(nodeId);
  if (existing) return existing;
  const created = new Map<string, EndpointVector>();
  vectorsByNode.set(nodeId, created);
  return created;
}

function addEndpointVector(
  vectorsByNode: Map<string, Map<string, EndpointVector>>,
  nodeId: string,
  endpoint: string,
  dx: number,
  dy: number
): void {
  const nodeVectors = getOrCreateNodeEndpointVectors(vectorsByNode, nodeId);
  const existing = nodeVectors.get(endpoint) ?? { dx: 0, dy: 0, samples: 0 };
  existing.dx += dx;
  existing.dy += dy;
  existing.samples += 1;
  nodeVectors.set(endpoint, existing);
}

function getOrCreateEndpointSet(
  endpointsByNode: Map<string, Set<string>>,
  nodeId: string
): Set<string> {
  const existing = endpointsByNode.get(nodeId);
  if (existing) return existing;
  const created = new Set<string>();
  endpointsByNode.set(nodeId, created);
  return created;
}

function trackNodeEndpoint(
  endpointsByNode: Map<string, Set<string>>,
  nodeId: string,
  endpoint: string | null
): void {
  if (endpoint === null) return;
  getOrCreateEndpointSet(endpointsByNode, nodeId).add(endpoint);
}

function collectEdgeEndpointVectors(
  edge: Edge,
  sourceEndpoint: string | null,
  targetEndpoint: string | null,
  nodeMap: Map<string, Node>,
  nodeIconSize: number,
  vectorsByNode: Map<string, Map<string, EndpointVector>>
): void {
  if (sourceEndpoint === null && targetEndpoint === null) return;
  if (edge.source === edge.target) return;

  const sourceNode = nodeMap.get(edge.source);
  const targetNode = nodeMap.get(edge.target);
  if (!sourceNode || !targetNode) return;

  const sourceCenter = getRectCenter(getNodeRect(sourceNode, nodeIconSize));
  const targetCenter = getRectCenter(getNodeRect(targetNode, nodeIconSize));
  const forwardDx = targetCenter.x - sourceCenter.x;
  const forwardDy = targetCenter.y - sourceCenter.y;

  if (sourceEndpoint !== null) {
    addEndpointVector(vectorsByNode, edge.source, sourceEndpoint, forwardDx, forwardDy);
  }
  if (targetEndpoint !== null) {
    addEndpointVector(vectorsByNode, edge.target, targetEndpoint, -forwardDx, -forwardDy);
  }
}

function collectInterfaceAnchorInputs(
  edges: Edge[],
  nodeMap: Map<string, Node>,
  nodeIconSize: number
): {
  endpointsByNode: Map<string, Set<string>>;
  vectorsByNode: Map<string, Map<string, EndpointVector>>;
} {
  const endpointsByNode = new Map<string, Set<string>>();
  const vectorsByNode = new Map<string, Map<string, EndpointVector>>();

  for (const edge of edges) {
    const data = edge.data as TopologyEdgeData | undefined;
    const sourceEndpoint = normalizeEndpoint(data?.sourceEndpoint);
    const targetEndpoint = normalizeEndpoint(data?.targetEndpoint);
    trackNodeEndpoint(endpointsByNode, edge.source, sourceEndpoint);
    trackNodeEndpoint(endpointsByNode, edge.target, targetEndpoint);
    collectEdgeEndpointVectors(
      edge,
      sourceEndpoint,
      targetEndpoint,
      nodeMap,
      nodeIconSize,
      vectorsByNode
    );
  }

  return { endpointsByNode, vectorsByNode };
}

const HORIZONTAL_SLOPE_THRESHOLD = 0.25;

function classifyInterfaceSide(vector: EndpointVector | undefined): InterfaceSide {
  if (!vector || vector.samples <= 0) return "bottom";

  const dx = vector.dx / vector.samples;
  const dy = vector.dy / vector.samples;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Keep anchors on top/bottom by default; use sides only for near-horizontal links.
  if (absDx > 0.001 && absDy <= absDx * HORIZONTAL_SLOPE_THRESHOLD) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}

function getInterfaceSortKey(side: InterfaceSide, vector: EndpointVector | undefined): number {
  if (!vector || vector.samples <= 0) return 0;
  const avgDx = vector.dx / vector.samples;
  const avgDy = vector.dy / vector.samples;
  return side === "top" || side === "bottom" ? avgDx : avgDy;
}

function positionInterfaceAnchor(
  rect: NodeRect,
  side: InterfaceSide,
  index: number,
  total: number,
  radius: number
): InterfaceAnchor {
  const slot = (index + 1) / (total + 1);
  const out = radius + 1;

  switch (side) {
    case "top":
      return { x: rect.x + rect.width * slot, y: rect.y - out };
    case "right":
      return { x: rect.x + rect.width + out, y: rect.y + rect.height * slot };
    case "bottom":
      return { x: rect.x + rect.width * slot, y: rect.y + rect.height + out };
    case "left":
      return { x: rect.x - out, y: rect.y + rect.height * slot };
  }
}

function buildNodeSideAssignments(
  endpoints: Set<string>,
  nodeVectors: Map<string, EndpointVector> | undefined,
  renderOptions: ResolvedEdgeRenderOptions
): Record<InterfaceSide, EndpointAssignment[]> {
  const buckets = sideBuckets();
  for (const endpoint of endpoints) {
    const vector = nodeVectors?.get(endpoint);
    const side = classifyInterfaceSide(vector);
    const sortKey = getInterfaceSortKey(side, vector);
    const { radius } = getEndpointLabelMetrics(
      endpoint,
      renderOptions.interfaceScale,
      renderOptions.interfaceLabelOverrides
    );
    buckets[side].push({ endpoint, sortKey, radius });
  }
  return buckets;
}

function sortEndpointAssignments(assignments: EndpointAssignment[]): void {
  assignments.sort((a, b) => {
    const bySort = a.sortKey - b.sortKey;
    if (bySort !== 0) return bySort;
    return a.endpoint.localeCompare(b.endpoint);
  });
}

function assignNodeAnchors(
  rect: NodeRect,
  buckets: Record<InterfaceSide, EndpointAssignment[]>
): Map<string, InterfaceAnchor> {
  const endpointAnchors = new Map<string, InterfaceAnchor>();
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const assignments = buckets[side];
    sortEndpointAssignments(assignments);
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      endpointAnchors.set(
        assignment.endpoint,
        positionInterfaceAnchor(rect, side, i, assignments.length, assignment.radius)
      );
    }
  }
  return endpointAnchors;
}

function buildInterfaceAnchorMap(
  edges: Edge[],
  nodeMap: Map<string, Node>,
  renderOptions: ResolvedEdgeRenderOptions
): NodeInterfaceAnchorMap {
  const { endpointsByNode, vectorsByNode } = collectInterfaceAnchorInputs(
    edges,
    nodeMap,
    renderOptions.nodeIconSize
  );
  const anchorsByNode: NodeInterfaceAnchorMap = new Map();
  for (const [nodeId, endpoints] of endpointsByNode) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const rect = getNodeRect(node, renderOptions.nodeIconSize);
    const nodeVectors = vectorsByNode.get(nodeId);
    const buckets = buildNodeSideAssignments(endpoints, nodeVectors, renderOptions);
    const endpointAnchors = assignNodeAnchors(rect, buckets);
    anchorsByNode.set(nodeId, endpointAnchors);
  }
  return anchorsByNode;
}

function resolveEdgePointsWithInterfaceAnchors(
  sourceRect: NodeRect,
  targetRect: NodeRect,
  sourceAnchor?: InterfaceAnchor,
  targetAnchor?: InterfaceAnchor
): { sx: number; sy: number; tx: number; ty: number } {
  if (sourceAnchor && targetAnchor) {
    return { sx: sourceAnchor.x, sy: sourceAnchor.y, tx: targetAnchor.x, ty: targetAnchor.y };
  }

  if (sourceAnchor) {
    const targetCenter = getRectCenter(targetRect);
    const targetPoint = getNodeIntersection(
      targetCenter.x,
      targetCenter.y,
      targetRect.width,
      targetRect.height,
      sourceAnchor.x,
      sourceAnchor.y
    );
    return { sx: sourceAnchor.x, sy: sourceAnchor.y, tx: targetPoint.x, ty: targetPoint.y };
  }

  if (targetAnchor) {
    const sourceCenter = getRectCenter(sourceRect);
    const sourcePoint = getNodeIntersection(
      sourceCenter.x,
      sourceCenter.y,
      sourceRect.width,
      sourceRect.height,
      targetAnchor.x,
      targetAnchor.y
    );
    return { sx: sourcePoint.x, sy: sourcePoint.y, tx: targetAnchor.x, ty: targetAnchor.y };
  }

  return getEdgePoints(sourceRect, targetRect);
}

// ============================================================================
// Edge Info Builder
// ============================================================================

/**
 * Build edge info for export (parallel edge grouping and loop detection)
 * Similar to useEdgeInfo hook but for static export
 */
export function buildEdgeInfoForExport(edges: Edge[]): EdgeInfo {
  const parallelInfo = new Map<
    string,
    { index: number; total: number; isCanonicalDirection: boolean }
  >();
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
  y: number,
  interfaceScale: number,
  interfaceLabelOverrides: Record<string, string>
): string {
  if (!text) return "";

  const { compact, radius, fontSize, bubbleStrokeWidth, textStrokeWidth } = getEndpointLabelMetrics(
    text,
    interfaceScale,
    interfaceLabelOverrides
  );
  const textY = y;

  let svg = `<g class="edge-label">`;

  svg += `<circle cx="${x}" cy="${y}" r="${radius}" `;
  svg += `fill="${EDGE_LABEL.backgroundColor}" stroke="${EDGE_LABEL.outlineColor}" `;
  svg += `stroke-width="${bubbleStrokeWidth}"/>`;

  svg += `<text x="${x}" y="${textY}" `;
  svg += `font-size="${fontSize}" `;
  svg += `font-family='${EDGE_LABEL.fontFamily}' `;
  svg += `dominant-baseline="middle" alignment-baseline="middle" `;
  svg += `fill="${EDGE_LABEL.color}" text-anchor="middle" `;
  svg += `stroke="${EDGE_LABEL.textStrokeColor}" stroke-width="${textStrokeWidth}" `;
  svg += `paint-order="stroke" stroke-linejoin="round">`;
  svg += escapeXml(compact);
  svg += `</text>`;

  svg += `</g>`;
  return svg;
}

function getAutoCompactInterfaceLabel(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return "";

  let end = trimmed.length - 1;
  while (end >= 0 && (trimmed[end] < "0" || trimmed[end] > "9")) {
    end -= 1;
  }
  if (end >= 0) {
    let start = end;
    while (start >= 0 && trimmed[start] >= "0" && trimmed[start] <= "9") {
      start -= 1;
    }
    return trimmed.slice(start + 1, end + 1);
  }

  const token =
    trimmed
      .split(/[:/.-]/)
      .filter((part) => part.length > 0)
      .pop() ?? trimmed;
  return token.length <= 3 ? token : token.slice(-3);
}

function getDisplayInterfaceLabel(
  endpoint: string,
  interfaceLabelOverrides: Record<string, string>
): string {
  const override = interfaceLabelOverrides[endpoint];
  if (typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  return getAutoCompactInterfaceLabel(endpoint);
}

function getEndpointLabelMetrics(
  endpoint: string,
  interfaceScale: number,
  interfaceLabelOverrides: Record<string, string>
): {
  compact: string;
  radius: number;
  fontSize: number;
  bubbleStrokeWidth: number;
  textStrokeWidth: number;
} {
  const compact = getDisplayInterfaceLabel(endpoint, interfaceLabelOverrides);
  const safeScale = clamp(interfaceScale, 0.4, 4);
  const fontSize = EDGE_LABEL.fontSize * safeScale;
  const charWidth = fontSize * 0.58;
  const textWidth = Math.max(fontSize * 0.8, compact.length * charWidth);
  const radius = Math.max(6 * safeScale, textWidth / 2 + 2 * safeScale);
  const bubbleStrokeWidth = 0.7 * Math.max(0.6, safeScale);
  const textStrokeWidth = EDGE_LABEL.textStrokeWidth * Math.max(0.6, safeScale);

  return { compact, radius, fontSize, bubbleStrokeWidth, textStrokeWidth };
}

function getLabelOffsetForEndpoint(
  endpoint: string | undefined,
  nodeProximateLabels: boolean,
  interfaceScale: number,
  interfaceLabelOverrides: Record<string, string>
): number {
  if (!nodeProximateLabels || endpoint === undefined || endpoint.length === 0) {
    return EDGE_LABEL.offset;
  }
  const { radius } = getEndpointLabelMetrics(endpoint, interfaceScale, interfaceLabelOverrides);
  return radius + 1;
}

function getRegularEdgeLabelPositions(
  ctx: EdgeRenderContext,
  points: { sx: number; sy: number; tx: number; ty: number },
  controlPoint: { x: number; y: number } | null,
  sourceAnchor?: InterfaceAnchor,
  targetAnchor?: InterfaceAnchor
): { sourceLabelPos: { x: number; y: number }; targetLabelPos: { x: number; y: number } } {
  if (ctx.nodeProximateLabels && sourceAnchor && targetAnchor) {
    return {
      sourceLabelPos: sourceAnchor,
      targetLabelPos: targetAnchor
    };
  }

  const sourceOffset = getLabelOffsetForEndpoint(
    ctx.edgeData?.sourceEndpoint,
    ctx.nodeProximateLabels,
    ctx.interfaceScale,
    ctx.interfaceLabelOverrides
  );
  const targetOffset = getLabelOffsetForEndpoint(
    ctx.edgeData?.targetEndpoint,
    ctx.nodeProximateLabels,
    ctx.interfaceScale,
    ctx.interfaceLabelOverrides
  );

  return {
    sourceLabelPos: getLabelPosition(
      points.sx,
      points.sy,
      points.tx,
      points.ty,
      sourceOffset,
      controlPoint ?? undefined
    ),
    targetLabelPos: getLabelPosition(
      points.tx,
      points.ty,
      points.sx,
      points.sy,
      targetOffset,
      controlPoint ?? undefined
    )
  };
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
): {
  path: string;
  sourceLabelPos: { x: number; y: number };
  targetLabelPos: { x: number; y: number };
} {
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
  nodeProximateLabels: boolean;
  nodeIconSize: number;
  interfaceScale: number;
  interfaceLabelOverrides: Record<string, string>;
  interfaceAnchors?: NodeInterfaceAnchorMap;
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
  const sourceEndpoint = normalizeEndpoint(ctx.edgeData?.sourceEndpoint);
  const targetEndpoint = normalizeEndpoint(ctx.edgeData?.targetEndpoint);
  let svg = "";
  if (sourceEndpoint !== null) {
    svg += buildEndpointLabelSvg(
      sourceEndpoint,
      sourceLabelPos.x,
      sourceLabelPos.y,
      ctx.interfaceScale,
      ctx.interfaceLabelOverrides
    );
  }
  if (targetEndpoint !== null) {
    svg += buildEndpointLabelSvg(
      targetEndpoint,
      targetLabelPos.x,
      targetLabelPos.y,
      ctx.interfaceScale,
      ctx.interfaceLabelOverrides
    );
  }
  return svg;
}

/**
 * Render a loop edge (self-referencing) to SVG
 */
function renderLoopEdge(ctx: EdgeRenderContext, sourceNode: Node, loopIndex: number): string {
  const nodeX = sourceNode.position.x;
  const nodeY = sourceNode.position.y;

  const { path, sourceLabelPos, targetLabelPos } = buildLoopEdgePath(
    nodeX,
    nodeY,
    ctx.nodeIconSize,
    ctx.nodeIconSize,
    loopIndex
  );

  let svg = `<g class="export-edge loop-edge" data-id="${escapeXml(ctx.edgeId)}">`;
  svg += `<path d="${path}" fill="none" stroke="${ctx.strokeColor}" `;
  svg += `stroke-width="${EDGE_STYLE.strokeWidth}" opacity="${EDGE_STYLE.opacity}"/>`;
  svg += buildEdgeLabels(ctx, sourceLabelPos, targetLabelPos);
  svg += `</g>`;
  return svg;
}

function resolveRegularEdgeAnchors(
  ctx: EdgeRenderContext,
  sourceNode: Node,
  targetNode: Node
): { sourceAnchor?: InterfaceAnchor; targetAnchor?: InterfaceAnchor } {
  const sourceEndpoint = normalizeEndpoint(ctx.edgeData?.sourceEndpoint);
  const targetEndpoint = normalizeEndpoint(ctx.edgeData?.targetEndpoint);
  return {
    sourceAnchor:
      sourceEndpoint !== null
        ? ctx.interfaceAnchors?.get(sourceNode.id)?.get(sourceEndpoint)
        : undefined,
    targetAnchor:
      targetEndpoint !== null
        ? ctx.interfaceAnchors?.get(targetNode.id)?.get(targetEndpoint)
        : undefined
  };
}

function buildRegularEdgePath(
  points: { sx: number; sy: number; tx: number; ty: number },
  parallelInfo: { index: number; total: number; isCanonicalDirection: boolean } | undefined
): { path: string; controlPoint: { x: number; y: number } | null } {
  const controlPoint = calculateControlPoint(
    points.sx,
    points.sy,
    points.tx,
    points.ty,
    parallelInfo?.index ?? 0,
    parallelInfo?.total ?? 1,
    parallelInfo?.isCanonicalDirection ?? true,
    CONTROL_POINT_STEP_SIZE
  );
  const path = controlPoint
    ? `M ${points.sx} ${points.sy} Q ${controlPoint.x} ${controlPoint.y} ${points.tx} ${points.ty}`
    : `M ${points.sx} ${points.sy} L ${points.tx} ${points.ty}`;
  return { path, controlPoint };
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
  const sourceRect = getNodeRect(sourceNode, ctx.nodeIconSize);
  const targetRect = getNodeRect(targetNode, ctx.nodeIconSize);
  const { sourceAnchor, targetAnchor } = resolveRegularEdgeAnchors(ctx, sourceNode, targetNode);
  const points = resolveEdgePointsWithInterfaceAnchors(
    sourceRect,
    targetRect,
    sourceAnchor,
    targetAnchor
  );
  const { path, controlPoint } = buildRegularEdgePath(points, parallelInfo);

  let svg = `<g class="export-edge" data-id="${escapeXml(ctx.edgeId)}">`;
  svg += `<path d="${path}" fill="none" stroke="${ctx.strokeColor}" `;
  svg += `stroke-width="${EDGE_STYLE.strokeWidth}" opacity="${EDGE_STYLE.opacity}"/>`;
  const { sourceLabelPos, targetLabelPos } = getRegularEdgeLabelPositions(
    ctx,
    points,
    controlPoint,
    sourceAnchor,
    targetAnchor
  );
  svg += buildEdgeLabels(ctx, sourceLabelPos, targetLabelPos);
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
  includeLabels: boolean,
  nodeProximateLabels = false,
  interfaceAnchors?: NodeInterfaceAnchorMap,
  renderOptions?: ResolvedEdgeRenderOptions
): string {
  const sourceNode = nodeMap.get(edge.source);
  if (!sourceNode) return "";

  const resolvedRenderOptions = renderOptions ?? resolveEdgeRenderOptions();
  const edgeData = edge.data as TopologyEdgeData | undefined;
  const ctx: EdgeRenderContext = {
    edgeId: edge.id,
    strokeColor: getEdgeColor(edgeData?.linkStatus),
    edgeData,
    includeLabels,
    nodeProximateLabels,
    nodeIconSize: resolvedRenderOptions.nodeIconSize,
    interfaceScale: resolvedRenderOptions.interfaceScale,
    interfaceLabelOverrides: resolvedRenderOptions.interfaceLabelOverrides,
    interfaceAnchors
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
  annotationNodeTypes?: Set<string>,
  nodeProximateLabels = false,
  renderOptions?: EdgeSvgRenderOptions
): string {
  const resolvedRenderOptions = resolveEdgeRenderOptions(renderOptions);
  const skipTypes =
    annotationNodeTypes ??
    new Set(["free-text-annotation", "free-shape-annotation", "group-annotation"]);

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
  const interfaceAnchors = nodeProximateLabels
    ? buildInterfaceAnchorMap(validEdges, nodeMap, resolvedRenderOptions)
    : undefined;

  let svg = "";
  for (const edge of validEdges) {
    svg += edgeToSvg(
      edge,
      nodeMap,
      edgeInfo,
      includeLabels,
      nodeProximateLabels,
      interfaceAnchors,
      resolvedRenderOptions
    );
  }

  return svg;
}
