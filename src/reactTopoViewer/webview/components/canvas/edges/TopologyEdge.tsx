/**
 * TopologyEdge - Custom React Flow edge with endpoint labels
 * Uses floating/straight edge style for network topology visualization
 */
import React, { memo, useMemo, useCallback } from "react";
import { EdgeLabelRenderer, useStore, type EdgeProps, type Edge, type Node } from "@xyflow/react";

import { SELECTION_COLOR, type EdgeLabelMode } from "../types";
import { useEdgeInfo, useEdgeRenderConfig } from "../../../stores/canvasStore";
import { useEdges, useGraphStore } from "../../../stores/graphStore";
import { useGrafanaLabelSettings, useMode } from "../../../stores/topoViewerStore";
import {
  calculateControlPoint,
  getEdgePoints,
  getLabelPosition,
  getNodeIntersection
} from "../edgeGeometry";
import { DEFAULT_ENDPOINT_LABEL_OFFSET } from "../../../annotations/endpointLabelOffset";
import {
  clampGrafanaInterfaceSizePercent,
  clampGrafanaNodeSizePx,
  resolveGrafanaInterfaceLabel
} from "../../../utils/grafanaInterfaceLabels";

// Edge style constants
const EDGE_COLOR_DEFAULT = "#969799";
const EDGE_COLOR_UP = "#00df2b";
const EDGE_COLOR_DOWN = "#df2b00";
const EDGE_WIDTH_NORMAL = 4;
const EDGE_WIDTH_SELECTED = 5.5;
const EDGE_OPACITY_NORMAL = 0.5;
const EDGE_OPACITY_SELECTED = 1;

// Label style constants
const LABEL_FONT_SIZE = "10px";
const LABEL_BG_COLOR = "var(--topoviewer-edge-label-background)";
const LABEL_TEXT_COLOR = "var(--topoviewer-edge-label-foreground)";
const LABEL_OUTLINE_COLOR = "var(--topoviewer-edge-label-outline)";
const LABEL_PADDING = "0px 2px";
const LABEL_FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const GRAFANA_LABEL_FONT_FAMILY = "Helvetica, Arial, sans-serif";

const GRAFANA_LABEL_FONT_SIZE_PX = 10;
const GRAFANA_LABEL_TEXT_COLOR = "#FFFFFF";
const GRAFANA_LABEL_BG_COLOR = "#bec8d2";
const GRAFANA_LABEL_STROKE_COLOR = "rgba(0, 0, 0, 0.95)";
const GRAFANA_LABEL_BORDER_COLOR = "rgba(0, 0, 0, 0.25)";
const GRAFANA_LABEL_TEXT_STROKE_WIDTH_PX = 0.6;
const GRAFANA_LABEL_MIN_RADIUS_PX = 7;
const GRAFANA_LABEL_HORIZONTAL_PADDING_PX = 2;
const GRAFANA_LABEL_CHAR_WIDTH_RATIO = 0.58;
const GRAFANA_LABEL_OFFSET_PADDING_PX = 1;
const GRAFANA_LOOP_LABEL_OFFSET = 10;
const GRAFANA_INTERFACE_UP_BG_COLOR = EDGE_COLOR_UP;
const GRAFANA_INTERFACE_DOWN_BG_COLOR = EDGE_COLOR_DOWN;
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

interface EdgeDataLike {
  sourceEndpoint?: string;
  targetEndpoint?: string;
  linkStatus?: string;
  sourceInterfaceState?: string;
  targetInterfaceState?: string;
  endpointLabelOffsetEnabled?: boolean;
  endpointLabelOffset?: number;
}

type EdgeLabelVariant = "default" | "grafana";

interface EdgeLabelOffsets {
  source: number;
  target: number;
  loop: number;
}

type InterfaceSide = "top" | "right" | "bottom" | "left";

interface InterfaceAnchor {
  x: number;
  y: number;
}

interface EndpointVector {
  dx: number;
  dy: number;
  samples: number;
}

interface EndpointAssignment {
  endpoint: string;
  sortKey: number;
  radius: number;
}

type NodeInterfaceAnchorMap = Map<string, Map<string, InterfaceAnchor>>;

interface GrafanaLabelRenderConfig {
  nodeIconSize: number;
  interfaceScale: number;
  globalInterfaceOverrideSelection: string;
  interfaceLabelOverrides: Record<string, string>;
}

const EMPTY_GRAPH_NODES: Node[] = [];
const HORIZONTAL_SLOPE_THRESHOLD = 0.25;

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function getStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function getNumberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function toEdgeData(value: unknown): EdgeDataLike {
  const record = asObjectRecord(value);
  if (!record) return {};
  const extraDataRecord = asObjectRecord(record.extraData);
  return {
    sourceEndpoint: getStringField(record, "sourceEndpoint"),
    targetEndpoint: getStringField(record, "targetEndpoint"),
    linkStatus: getStringField(record, "linkStatus"),
    sourceInterfaceState: extraDataRecord
      ? getStringField(extraDataRecord, "clabSourceInterfaceState")
      : undefined,
    targetInterfaceState: extraDataRecord
      ? getStringField(extraDataRecord, "clabTargetInterfaceState")
      : undefined,
    endpointLabelOffsetEnabled: getBooleanField(record, "endpointLabelOffsetEnabled"),
    endpointLabelOffset: getNumberField(record, "endpointLabelOffset")
  };
}

function normalizeInterfaceState(value: unknown): "up" | "down" | "unknown" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "up") return "up";
  if (normalized === "down") return "down";
  if (normalized.length === 0 || normalized === "unknown") return "unknown";
  return "unknown";
}

function getGrafanaInterfaceBackgroundColor(
  interfaceState: "up" | "down" | "unknown" | undefined,
  colorByInterfaceState: boolean
): string {
  if (!colorByInterfaceState) return GRAFANA_LABEL_BG_COLOR;
  if (interfaceState === "up") return GRAFANA_INTERFACE_UP_BG_COLOR;
  if (interfaceState === "down") return GRAFANA_INTERFACE_DOWN_BG_COLOR;
  return GRAFANA_LABEL_BG_COLOR;
}

function normalizeEndpoint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNodeRect(
  node: Node,
  nodeIconSize: number
): { x: number; y: number; width: number; height: number } {
  const measuredNodeWidth = typeof node.width === "number" ? node.width : nodeIconSize;
  return {
    x: node.position.x + (measuredNodeWidth - nodeIconSize) / 2,
    y: node.position.y,
    width: nodeIconSize,
    height: nodeIconSize
  };
}

function getRectCenter(rect: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function getGrafanaLabelMetrics(
  labelText: string,
  interfaceScale = 1
): {
  text: string;
  radius: number;
  fontSize: number;
  textStrokeWidth: number;
} {
  const text = labelText.trim();
  const fontSize = GRAFANA_LABEL_FONT_SIZE_PX * interfaceScale;
  const textWidth = Math.max(
    fontSize * 0.8,
    text.length * fontSize * GRAFANA_LABEL_CHAR_WIDTH_RATIO
  );
  const radius = Math.max(
    GRAFANA_LABEL_MIN_RADIUS_PX * interfaceScale,
    textWidth / 2 + GRAFANA_LABEL_HORIZONTAL_PADDING_PX * interfaceScale
  );
  return {
    text,
    radius,
    fontSize,
    textStrokeWidth: GRAFANA_LABEL_TEXT_STROKE_WIDTH_PX * interfaceScale
  };
}

function sideBuckets(): Record<InterfaceSide, EndpointAssignment[]> {
  return { top: [], right: [], bottom: [], left: [] };
}

function classifyInterfaceSide(vector: EndpointVector | undefined): InterfaceSide {
  if (!vector || vector.samples <= 0) return "bottom";

  const dx = vector.dx / vector.samples;
  const dy = vector.dy / vector.samples;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

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
  rect: { x: number; y: number; width: number; height: number },
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

function sortEndpointAssignments(assignments: EndpointAssignment[]): void {
  assignments.sort((a, b) => {
    const bySort = a.sortKey - b.sortKey;
    if (bySort !== 0) return bySort;
    return a.endpoint.localeCompare(b.endpoint);
  });
}

function buildNodeSideAssignments(
  endpoints: Set<string>,
  nodeVectors: Map<string, EndpointVector> | undefined,
  grafanaConfig: GrafanaLabelRenderConfig
): Record<InterfaceSide, EndpointAssignment[]> {
  const buckets = sideBuckets();
  for (const endpoint of endpoints) {
    const vector = nodeVectors?.get(endpoint);
    const side = classifyInterfaceSide(vector);
    const sortKey = getInterfaceSortKey(side, vector);
    const labelText = resolveGrafanaInterfaceLabel(
      endpoint,
      grafanaConfig.globalInterfaceOverrideSelection,
      grafanaConfig.interfaceLabelOverrides
    );
    const { radius } = getGrafanaLabelMetrics(labelText, grafanaConfig.interfaceScale);
    buckets[side].push({ endpoint, sortKey, radius });
  }
  return buckets;
}

function assignNodeAnchors(
  rect: { x: number; y: number; width: number; height: number },
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

function getOrCreateNodeVectors(
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
  const nodeVectors = getOrCreateNodeVectors(vectorsByNode, nodeId);
  const existing = nodeVectors.get(endpoint) ?? { dx: 0, dy: 0, samples: 0 };
  existing.dx += dx;
  existing.dy += dy;
  existing.samples += 1;
  nodeVectors.set(endpoint, existing);
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
  vectorsByNode: Map<string, Map<string, EndpointVector>>,
  nodeIconSize: number
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

function buildInterfaceAnchorMap(
  edges: Edge[],
  nodes: Node[],
  grafanaConfig: GrafanaLabelRenderConfig
): NodeInterfaceAnchorMap {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const endpointsByNode = new Map<string, Set<string>>();
  const vectorsByNode = new Map<string, Map<string, EndpointVector>>();

  for (const edge of edges) {
    const edgeData = toEdgeData(edge.data);
    const sourceEndpoint = normalizeEndpoint(edgeData.sourceEndpoint);
    const targetEndpoint = normalizeEndpoint(edgeData.targetEndpoint);
    trackNodeEndpoint(endpointsByNode, edge.source, sourceEndpoint);
    trackNodeEndpoint(endpointsByNode, edge.target, targetEndpoint);
    collectEdgeEndpointVectors(
      edge,
      sourceEndpoint,
      targetEndpoint,
      nodeMap,
      vectorsByNode,
      grafanaConfig.nodeIconSize
    );
  }

  const anchorsByNode: NodeInterfaceAnchorMap = new Map();
  for (const [nodeId, endpoints] of endpointsByNode) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const buckets = buildNodeSideAssignments(endpoints, vectorsByNode.get(nodeId), grafanaConfig);
    const endpointAnchors = assignNodeAnchors(
      getNodeRect(node, grafanaConfig.nodeIconSize),
      buckets
    );
    anchorsByNode.set(nodeId, endpointAnchors);
  }

  return anchorsByNode;
}

let interfaceAnchorMapCache: {
  edgesRef: Edge[] | null;
  nodesRef: Node[] | null;
  nodeIconSize: number | null;
  interfaceScale: number | null;
  globalInterfaceOverrideSelection: string | null;
  interfaceLabelOverridesRef: Record<string, string> | null;
  anchorsByNode: NodeInterfaceAnchorMap | null;
} = {
  edgesRef: null,
  nodesRef: null,
  nodeIconSize: null,
  interfaceScale: null,
  globalInterfaceOverrideSelection: null,
  interfaceLabelOverridesRef: null,
  anchorsByNode: null
};

function getCachedInterfaceAnchorMap(
  edges: Edge[],
  nodes: Node[],
  grafanaConfig: GrafanaLabelRenderConfig
): NodeInterfaceAnchorMap {
  if (
    interfaceAnchorMapCache.edgesRef === edges &&
    interfaceAnchorMapCache.nodesRef === nodes &&
    interfaceAnchorMapCache.nodeIconSize === grafanaConfig.nodeIconSize &&
    interfaceAnchorMapCache.interfaceScale === grafanaConfig.interfaceScale &&
    interfaceAnchorMapCache.globalInterfaceOverrideSelection ===
      grafanaConfig.globalInterfaceOverrideSelection &&
    interfaceAnchorMapCache.interfaceLabelOverridesRef === grafanaConfig.interfaceLabelOverrides &&
    interfaceAnchorMapCache.anchorsByNode
  ) {
    return interfaceAnchorMapCache.anchorsByNode;
  }

  const anchorsByNode = buildInterfaceAnchorMap(edges, nodes, grafanaConfig);
  interfaceAnchorMapCache = {
    edgesRef: edges,
    nodesRef: nodes,
    nodeIconSize: grafanaConfig.nodeIconSize,
    interfaceScale: grafanaConfig.interfaceScale,
    globalInterfaceOverrideSelection: grafanaConfig.globalInterfaceOverrideSelection,
    interfaceLabelOverridesRef: grafanaConfig.interfaceLabelOverrides,
    anchorsByNode
  };
  return anchorsByNode;
}

function resolveEdgeLabelOffsets(
  edgeData: EdgeDataLike | undefined,
  labelMode: EdgeLabelMode,
  interfaceScale = 1,
  sourceLabel?: string,
  targetLabel?: string
): EdgeLabelOffsets {
  if (edgeData?.endpointLabelOffsetEnabled === false) {
    return { source: 0, target: 0, loop: 0 };
  }

  if (labelMode === "grafana") {
    const hasSourceLabel = typeof sourceLabel === "string" && sourceLabel.length > 0;
    const hasTargetLabel = typeof targetLabel === "string" && targetLabel.length > 0;
    const sourceOffset = hasSourceLabel
      ? getGrafanaLabelMetrics(sourceLabel, interfaceScale).radius +
        GRAFANA_LABEL_OFFSET_PADDING_PX * interfaceScale
      : DEFAULT_ENDPOINT_LABEL_OFFSET;
    const targetOffset = hasTargetLabel
      ? getGrafanaLabelMetrics(targetLabel, interfaceScale).radius +
        GRAFANA_LABEL_OFFSET_PADDING_PX * interfaceScale
      : DEFAULT_ENDPOINT_LABEL_OFFSET;
    return {
      source: sourceOffset,
      target: targetOffset,
      loop: GRAFANA_LOOP_LABEL_OFFSET * interfaceScale
    };
  }

  const defaultOffset =
    typeof edgeData?.endpointLabelOffset === "number"
      ? edgeData.endpointLabelOffset
      : DEFAULT_ENDPOINT_LABEL_OFFSET;
  return {
    source: defaultOffset,
    target: defaultOffset,
    loop: defaultOffset
  };
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

function useNodeGeometry(nodeId: string, defaultNodeWidth: number): NodeGeometry | null {
  return useStore(
    useCallback(
      (state) => {
        const node = state.nodeLookup.get(nodeId);
        if (!node) return null;
        const position = node.internals.positionAbsolute;
        return {
          position: { x: position.x, y: position.y },
          width: node.measured.width ?? defaultNodeWidth,
          height: node.measured.height ?? defaultNodeWidth
        };
      },
      [nodeId, defaultNodeWidth]
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
  fontFamily: LABEL_FONT_FAMILY,
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

const GRAFANA_LABEL_STYLE_BASE: React.CSSProperties = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: GRAFANA_LABEL_FONT_FAMILY,
  fontWeight: 600,
  color: GRAFANA_LABEL_TEXT_COLOR,
  backgroundColor: GRAFANA_LABEL_BG_COLOR,
  borderRadius: "999px",
  border: `0.7px solid ${GRAFANA_LABEL_BORDER_COLOR}`,
  boxSizing: "border-box",
  pointerEvents: "none",
  whiteSpace: "nowrap",
  lineHeight: 1,
  zIndex: 1
};

/**
 * Label component for endpoint text
 * Uses CSS transform for positioning (only dynamic part)
 */
const EndpointLabel = memo(function EndpointLabel({
  text,
  x,
  y,
  variant,
  interfaceState,
  colorByInterfaceState,
  grafanaInterfaceScale
}: Readonly<{
  text: string;
  x: number;
  y: number;
  variant: EdgeLabelVariant;
  interfaceState?: "up" | "down" | "unknown";
  colorByInterfaceState: boolean;
  grafanaInterfaceScale: number;
}>) {
  const grafanaMetrics = useMemo(
    () => (variant === "grafana" ? getGrafanaLabelMetrics(text, grafanaInterfaceScale) : null),
    [text, variant, grafanaInterfaceScale]
  );
  const grafanaBackgroundColor = useMemo(
    () => getGrafanaInterfaceBackgroundColor(interfaceState, colorByInterfaceState),
    [interfaceState, colorByInterfaceState]
  );

  const renderedText = grafanaMetrics?.text ?? text;
  const style = useMemo((): React.CSSProperties => {
    if (variant === "grafana" && grafanaMetrics) {
      const diameter = grafanaMetrics.radius * 2;
      return {
        ...GRAFANA_LABEL_STYLE_BASE,
        backgroundColor: grafanaBackgroundColor,
        width: `${diameter}px`,
        minWidth: `${diameter}px`,
        height: `${diameter}px`,
        fontSize: `${grafanaMetrics.fontSize}px`,
        textShadow: `0 0 ${grafanaMetrics.textStrokeWidth}px ${GRAFANA_LABEL_STROKE_COLOR}, 0 0 ${grafanaMetrics.textStrokeWidth}px ${GRAFANA_LABEL_STROKE_COLOR}`,
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`
      };
    }
    return {
      ...LABEL_STYLE_BASE,
      transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`
    };
  }, [variant, grafanaMetrics, grafanaBackgroundColor, x, y]);

  if (renderedText.length === 0) {
    return null;
  }

  return (
    <div style={style} className="topology-edge-label nodrag nopan">
      {renderedText}
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
  labelOffset: number,
  nodeIconSize: number
): EdgeGeometry {
  const loopGeometry = calculateLoopEdgeGeometry(
    sourcePos.x + (sourceNodeWidth - nodeIconSize) / 2,
    sourcePos.y,
    nodeIconSize,
    nodeIconSize,
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

function resolveEdgePointsWithInterfaceAnchors(
  sourceRect: { x: number; y: number; width: number; height: number },
  targetRect: { x: number; y: number; width: number; height: number },
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

function getRegularEdgeLabelPositions(params: {
  points: { sx: number; sy: number; tx: number; ty: number };
  controlPoint: { x: number; y: number } | null;
  labelOffsets: Pick<EdgeLabelOffsets, "source" | "target">;
  nodeProximateLabels: boolean;
  sourceAnchor?: InterfaceAnchor;
  targetAnchor?: InterfaceAnchor;
}): { sourceLabelPos: { x: number; y: number }; targetLabelPos: { x: number; y: number } } {
  const { points, controlPoint, labelOffsets, nodeProximateLabels, sourceAnchor, targetAnchor } =
    params;
  if (nodeProximateLabels && sourceAnchor && targetAnchor) {
    return {
      sourceLabelPos: sourceAnchor,
      targetLabelPos: targetAnchor
    };
  }

  return {
    sourceLabelPos: getLabelPosition(
      points.sx,
      points.sy,
      points.tx,
      points.ty,
      labelOffsets.source,
      controlPoint ?? undefined
    ),
    targetLabelPos: getLabelPosition(
      points.tx,
      points.ty,
      points.sx,
      points.sy,
      labelOffsets.target,
      controlPoint ?? undefined
    )
  };
}

/** Calculate regular edge geometry with parallel edge support */
function computeRegularGeometry(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceNodeWidth: number,
  targetNodeWidth: number,
  nodeIconSize: number,
  parallelInfo: { index: number; total: number; isCanonicalDirection: boolean } | null,
  labelOffsets: Pick<EdgeLabelOffsets, "source" | "target">,
  sourceAnchor?: InterfaceAnchor,
  targetAnchor?: InterfaceAnchor,
  nodeProximateLabels = false
): EdgeGeometry {
  const sourceRect = {
    x: sourcePos.x + (sourceNodeWidth - nodeIconSize) / 2,
    y: sourcePos.y,
    width: nodeIconSize,
    height: nodeIconSize
  };
  const targetRect = {
    x: targetPos.x + (targetNodeWidth - nodeIconSize) / 2,
    y: targetPos.y,
    width: nodeIconSize,
    height: nodeIconSize
  };

  const points = resolveEdgePointsWithInterfaceAnchors(
    sourceRect,
    targetRect,
    sourceAnchor,
    targetAnchor
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
  const { sourceLabelPos, targetLabelPos } = getRegularEdgeLabelPositions({
    points,
    controlPoint,
    labelOffsets,
    nodeProximateLabels,
    sourceAnchor,
    targetAnchor
  });

  return {
    points,
    path,
    controlPoint,
    sourceLabelPos,
    targetLabelPos
  };
}

/** Hook for calculating edge geometry with bezier curves for parallel edges */
function useEdgeGeometry(
  edgeId: string,
  source: string,
  target: string,
  labelOffsets: EdgeLabelOffsets,
  edgeData: EdgeDataLike | undefined,
  labelMode: EdgeLabelMode,
  grafanaConfig: GrafanaLabelRenderConfig | null
) {
  const nodeIconSize =
    labelMode === "grafana" ? (grafanaConfig?.nodeIconSize ?? NODE_ICON_SIZE) : NODE_ICON_SIZE;
  const sourceNode = useNodeGeometry(source, nodeIconSize);
  const targetNode = useNodeGeometry(target, nodeIconSize);
  const edges = useEdges();
  const nodeListForAnchors = useGraphStore(
    useCallback((state) => (labelMode === "grafana" ? state.nodes : EMPTY_GRAPH_NODES), [labelMode])
  );
  const { getParallelInfo, getLoopInfo } = useEdgeInfo(edges);
  const interfaceAnchorMap = useMemo(
    () =>
      labelMode === "grafana" && grafanaConfig
        ? getCachedInterfaceAnchorMap(edges, nodeListForAnchors, grafanaConfig)
        : undefined,
    [labelMode, edges, nodeListForAnchors, grafanaConfig]
  );

  const parallelInfo = getParallelInfo(edgeId);
  const loopInfo = getLoopInfo(edgeId);

  return useMemo((): EdgeGeometry | null => {
    if (!sourceNode) return null;

    const sourcePos = sourceNode.position;
    const sourceNodeWidth = sourceNode.width;

    // Handle loop edges (source === target)
    if (source === target && loopInfo) {
      return computeLoopGeometry(
        sourcePos,
        sourceNodeWidth,
        loopInfo.loopIndex,
        labelOffsets.loop,
        nodeIconSize
      );
    }

    if (!targetNode) return null;

    const targetPos = targetNode.position;
    const targetNodeWidth = targetNode.width;
    const sourceEndpoint = normalizeEndpoint(edgeData?.sourceEndpoint);
    const targetEndpoint = normalizeEndpoint(edgeData?.targetEndpoint);
    const sourceAnchor =
      sourceEndpoint !== null ? interfaceAnchorMap?.get(source)?.get(sourceEndpoint) : undefined;
    const targetAnchor =
      targetEndpoint !== null ? interfaceAnchorMap?.get(target)?.get(targetEndpoint) : undefined;

    return computeRegularGeometry(
      sourcePos,
      targetPos,
      sourceNodeWidth,
      targetNodeWidth,
      nodeIconSize,
      parallelInfo,
      { source: labelOffsets.source, target: labelOffsets.target },
      sourceAnchor,
      targetAnchor,
      labelMode === "grafana"
    );
  }, [
    sourceNode,
    targetNode,
    parallelInfo,
    loopInfo,
    source,
    target,
    labelOffsets.source,
    labelOffsets.target,
    labelOffsets.loop,
    edgeData?.sourceEndpoint,
    edgeData?.targetEndpoint,
    interfaceAnchorMap,
    labelMode,
    nodeIconSize
  ]);
}

/** Get stroke styling based on selection and link status */
function getStrokeStyle(
  linkStatus: string | undefined,
  selected: boolean,
  useLinkStatusColor = true
) {
  const resolvedLinkStatus = useLinkStatusColor ? linkStatus : undefined;
  return {
    color: getStrokeColor(resolvedLinkStatus, selected),
    width: selected ? EDGE_WIDTH_SELECTED : EDGE_WIDTH_NORMAL,
    opacity: selected ? EDGE_OPACITY_SELECTED : EDGE_OPACITY_NORMAL
  };
}

function shouldRenderEdgeLabels(
  labelMode: EdgeLabelMode,
  suppressLabels: boolean,
  selected: boolean
): boolean {
  if (suppressLabels) return false;
  if (labelMode === "hide") return false;
  if (labelMode === "on-select") return selected;
  return true;
}

/**
 * TopologyEdge - Floating edge that connects nodes between source and target nodes
 * Supports bezier curves for parallel edges between the same node pair
 */
const TopologyEdgeComponent: React.FC<EdgeProps> = ({ id, source, target, data, selected }) => {
  const mode = useMode();
  const grafanaLabelSettings = useGrafanaLabelSettings();
  const edgeData = useMemo(() => toEdgeData(data), [data]);
  const { labelMode, suppressLabels, suppressHitArea } = useEdgeRenderConfig();
  const grafanaConfig = useMemo<GrafanaLabelRenderConfig>(
    () => ({
      nodeIconSize: clampGrafanaNodeSizePx(grafanaLabelSettings.nodeSizePx),
      interfaceScale:
        clampGrafanaInterfaceSizePercent(grafanaLabelSettings.interfaceSizePercent) / 100,
      globalInterfaceOverrideSelection: grafanaLabelSettings.globalInterfaceOverrideSelection,
      interfaceLabelOverrides: grafanaLabelSettings.interfaceLabelOverrides
    }),
    [
      grafanaLabelSettings.nodeSizePx,
      grafanaLabelSettings.interfaceSizePercent,
      grafanaLabelSettings.globalInterfaceOverrideSelection,
      grafanaLabelSettings.interfaceLabelOverrides
    ]
  );
  const sourceEndpoint = normalizeEndpoint(edgeData.sourceEndpoint);
  const targetEndpoint = normalizeEndpoint(edgeData.targetEndpoint);
  const sourceRenderedLabel = useMemo(() => {
    if (sourceEndpoint === null) return null;
    if (labelMode !== "grafana") return sourceEndpoint;
    return resolveGrafanaInterfaceLabel(
      sourceEndpoint,
      grafanaConfig.globalInterfaceOverrideSelection,
      grafanaConfig.interfaceLabelOverrides
    );
  }, [
    sourceEndpoint,
    labelMode,
    grafanaConfig.globalInterfaceOverrideSelection,
    grafanaConfig.interfaceLabelOverrides
  ]);
  const targetRenderedLabel = useMemo(() => {
    if (targetEndpoint === null) return null;
    if (labelMode !== "grafana") return targetEndpoint;
    return resolveGrafanaInterfaceLabel(
      targetEndpoint,
      grafanaConfig.globalInterfaceOverrideSelection,
      grafanaConfig.interfaceLabelOverrides
    );
  }, [
    targetEndpoint,
    labelMode,
    grafanaConfig.globalInterfaceOverrideSelection,
    grafanaConfig.interfaceLabelOverrides
  ]);
  const labelOffsets = useMemo(
    () =>
      resolveEdgeLabelOffsets(
        edgeData,
        labelMode,
        grafanaConfig.interfaceScale,
        sourceRenderedLabel ?? undefined,
        targetRenderedLabel ?? undefined
      ),
    [edgeData, labelMode, grafanaConfig.interfaceScale, sourceRenderedLabel, targetRenderedLabel]
  );
  const geometry = useEdgeGeometry(
    id,
    source,
    target,
    labelOffsets,
    edgeData,
    labelMode,
    grafanaConfig
  );

  if (!geometry) return null;
  const shouldRenderLabels = shouldRenderEdgeLabels(labelMode, suppressLabels, selected === true);
  const labelVariant: EdgeLabelVariant = labelMode === "grafana" ? "grafana" : "default";
  const colorInterfacesByState = labelMode === "grafana" && mode === "view";

  const stroke = getStrokeStyle(edgeData.linkStatus, selected === true, !colorInterfacesByState);
  const sourceInterfaceState = normalizeInterfaceState(edgeData.sourceInterfaceState);
  const targetInterfaceState = normalizeInterfaceState(edgeData.targetInterfaceState);

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
          {sourceRenderedLabel !== null && sourceRenderedLabel.length > 0 && (
            <EndpointLabel
              text={sourceRenderedLabel}
              x={geometry.sourceLabelPos.x}
              y={geometry.sourceLabelPos.y}
              variant={labelVariant}
              interfaceState={sourceInterfaceState}
              colorByInterfaceState={colorInterfacesByState}
              grafanaInterfaceScale={grafanaConfig.interfaceScale}
            />
          )}
          {targetRenderedLabel !== null && targetRenderedLabel.length > 0 && (
            <EndpointLabel
              text={targetRenderedLabel}
              x={geometry.targetLabelPos.x}
              y={geometry.targetLabelPos.y}
              variant={labelVariant}
              interfaceState={targetInterfaceState}
              colorByInterfaceState={colorInterfacesByState}
              grafanaInterfaceScale={grafanaConfig.interfaceScale}
            />
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
};

function areTopologyEdgePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  return (
    prev.id === next.id &&
    prev.source === next.source &&
    prev.target === next.target &&
    prev.selected === next.selected &&
    prev.data === next.data
  );
}

export const TopologyEdge = memo(TopologyEdgeComponent, areTopologyEdgePropsEqual);
