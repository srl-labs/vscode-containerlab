// Grafana Flow-panel export helpers.
import type { Edge, Node } from "@xyflow/react";

import type { TopologyEdgeData } from "../../../../shared/types/graph";

const SVG_NS = "http://www.w3.org/2000/svg";
const CELL_ID_PREAMBLE = "cell-";

export interface GrafanaEdgeCellMapping {
  edgeId: string;
  source: string;
  sourceEndpoint: string;
  target: string;
  targetEndpoint: string;
  operstateCellId: string;
  targetOperstateCellId: string;
  trafficCellId: string;
  reverseTrafficCellId: string;
}

export interface GrafanaTrafficThresholds {
  green: number;
  yellow: number;
  orange: number;
  red: number;
}

export interface GrafanaPanelYamlOptions {
  trafficThresholds?: GrafanaTrafficThresholds;
}

export const DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS: GrafanaTrafficThresholds = {
  green: 199999,
  yellow: 500000,
  orange: 1000000,
  red: 5000000,
};

interface GrafanaDashboardTargetConfig {
  datasource: string;
  expr: string;
  legendFormat: string;
  instant: boolean;
  range: boolean;
  hide?: boolean;
}

const DEFAULT_GRAFANA_TARGETS: GrafanaDashboardTargetConfig[] = [
  {
    datasource: "prometheus",
    expr: "interface_oper_state",
    legendFormat: "oper-state:{{source}}:{{interface_name}}",
    instant: false,
    range: true,
    hide: false,
  },
  {
    datasource: "prometheus",
    expr: "interface_traffic_rate_out_bps",
    legendFormat: "{{source}}:{{interface_name}}:out",
    instant: false,
    range: true,
    hide: false,
  },
  {
    datasource: "prometheus",
    expr: "interface_traffic_rate_in_bps",
    legendFormat: "{{source}}:{{interface_name}}:in",
    instant: false,
    range: true,
    hide: false,
  },
];

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toCellMapping(edge: Edge): GrafanaEdgeCellMapping | null {
  const data = (edge.data ?? {}) as TopologyEdgeData;
  const sourceEndpoint = asString(data.sourceEndpoint);
  const targetEndpoint = asString(data.targetEndpoint);
  if (!sourceEndpoint || !targetEndpoint) return null;

  const operstateCellId = `${edge.source}:${sourceEndpoint}`;
  const targetOperstateCellId = `${edge.target}:${targetEndpoint}`;
  const trafficCellId = `link_id:${edge.source}:${sourceEndpoint}:${edge.target}:${targetEndpoint}`;
  const reverseTrafficCellId = `link_id:${edge.target}:${targetEndpoint}:${edge.source}:${sourceEndpoint}`;

  return {
    edgeId: edge.id,
    source: edge.source,
    sourceEndpoint,
    target: edge.target,
    targetEndpoint,
    operstateCellId,
    targetOperstateCellId,
    trafficCellId,
    reverseTrafficCellId,
  };
}

function isAnnotationNode(
  nodeId: string,
  nodeTypesById: Map<string, string>,
  annotationNodeTypes: Set<string>,
): boolean {
  const nodeType = nodeTypesById.get(nodeId) ?? "";
  return annotationNodeTypes.has(nodeType);
}

export function collectGrafanaEdgeCellMappings(
  edges: Edge[],
  nodes: Node[],
  annotationNodeTypes: Set<string>,
): GrafanaEdgeCellMapping[] {
  const nodeTypesById = new Map(
    nodes.map((node) => [node.id, node.type ?? ""]),
  );
  const seenTraffic = new Set<string>();
  const seenOperstate = new Set<string>();
  const mappings: GrafanaEdgeCellMapping[] = [];

  for (const edge of edges) {
    if (isAnnotationNode(edge.source, nodeTypesById, annotationNodeTypes))
      continue;
    if (isAnnotationNode(edge.target, nodeTypesById, annotationNodeTypes))
      continue;

    const mapping = toCellMapping(edge);
    if (!mapping) continue;
    if (
      seenTraffic.has(mapping.trafficCellId) ||
      seenTraffic.has(mapping.reverseTrafficCellId) ||
      seenOperstate.has(mapping.operstateCellId) ||
      seenOperstate.has(mapping.targetOperstateCellId)
    ) {
      continue;
    }

    seenTraffic.add(mapping.trafficCellId);
    seenTraffic.add(mapping.reverseTrafficCellId);
    seenOperstate.add(mapping.operstateCellId);
    seenOperstate.add(mapping.targetOperstateCellId);
    mappings.push(mapping);
  }

  return mappings;
}

export function collectLinkedNodeIds(
  edges: Edge[],
  nodes: Node[],
  annotationNodeTypes: Set<string>,
): Set<string> {
  const nodeTypesById = new Map(
    nodes.map((node) => [node.id, node.type ?? ""]),
  );
  const linkedNodeIds = new Set<string>();

  for (const edge of edges) {
    if (!nodeTypesById.has(edge.source) || !nodeTypesById.has(edge.target))
      continue;
    if (isAnnotationNode(edge.source, nodeTypesById, annotationNodeTypes))
      continue;
    if (isAnnotationNode(edge.target, nodeTypesById, annotationNodeTypes))
      continue;

    linkedNodeIds.add(edge.source);
    linkedNodeIds.add(edge.target);
  }

  return linkedNodeIds;
}

interface GraphTransform {
  tx: number;
  ty: number;
  scale: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function createBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function includeBoundsPoint(bounds: Bounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function includeBoundsRect(
  bounds: Bounds,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  includeBoundsPoint(bounds, x, y);
  includeBoundsPoint(bounds, x + width, y + height);
}

function hasBounds(bounds: Bounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    bounds.maxX > bounds.minX &&
    bounds.maxY > bounds.minY
  );
}

function applyGraphTransform(
  transform: GraphTransform,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: x * transform.scale + transform.tx,
    y: y * transform.scale + transform.ty,
  };
}

function parseNumericAttr(el: Element, attrName: string): number | null {
  const raw = el.getAttribute(attrName);
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGraphTransform(svgEl: Element): GraphTransform {
  const transformedRoot = Array.from(svgEl.children).find(
    (child) =>
      child.tagName.toLowerCase() === "g" && child.hasAttribute("transform"),
  );
  const transformAttr = transformedRoot?.getAttribute("transform") ?? "";

  const translateMatch =
    /translate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(?:[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?\s*\)/i.exec(
      transformAttr,
    );
  const scaleMatch =
    /scale\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*(?:[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?))?\s*\)/i.exec(
      transformAttr,
    );

  const tx = translateMatch ? Number.parseFloat(translateMatch[1]) : 0;
  const ty =
    translateMatch && translateMatch[2]
      ? Number.parseFloat(translateMatch[2])
      : 0;
  const scale = scaleMatch ? Number.parseFloat(scaleMatch[1]) : 1;

  return {
    tx: Number.isFinite(tx) ? tx : 0,
    ty: Number.isFinite(ty) ? ty : 0,
    scale: Number.isFinite(scale) && scale !== 0 ? scale : 1,
  };
}

function includePathBounds(
  bounds: Bounds,
  transform: GraphTransform,
  pathData: string,
): void {
  const numberMatches = pathData.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  if (numberMatches.length < 2) return;
  const points = numberMatches
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));

  for (let i = 0; i + 1 < points.length; i += 2) {
    const p = applyGraphTransform(transform, points[i], points[i + 1]);
    includeBoundsPoint(bounds, p.x, p.y);
  }
}

export function trimGrafanaSvgToTopologyContent(
  svgContent: string,
  padding = 12,
): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svgContent;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.documentElement;
  const transform = parseGraphTransform(svgEl);
  const bounds = createBounds();

  for (const rect of Array.from(
    doc.querySelectorAll("g.export-node rect[x][y][width][height]"),
  )) {
    const x = parseNumericAttr(rect, "x");
    const y = parseNumericAttr(rect, "y");
    const width = parseNumericAttr(rect, "width");
    const height = parseNumericAttr(rect, "height");
    if (x === null || y === null || width === null || height === null) continue;

    const p = applyGraphTransform(transform, x, y);
    includeBoundsRect(
      bounds,
      p.x,
      p.y,
      width * transform.scale,
      height * transform.scale,
    );
  }

  for (const circle of Array.from(
    doc.querySelectorAll("g.export-edge circle[cx][cy][r]"),
  )) {
    const cx = parseNumericAttr(circle, "cx");
    const cy = parseNumericAttr(circle, "cy");
    const r = parseNumericAttr(circle, "r");
    if (cx === null || cy === null || r === null) continue;

    const p = applyGraphTransform(transform, cx, cy);
    const radius = Math.abs(r * transform.scale);
    includeBoundsRect(
      bounds,
      p.x - radius,
      p.y - radius,
      radius * 2,
      radius * 2,
    );
  }

  for (const edgePath of Array.from(
    doc.querySelectorAll("g.export-edge path[d]"),
  )) {
    const pathData = edgePath.getAttribute("d");
    if (!pathData) continue;
    includePathBounds(bounds, transform, pathData);
  }

  if (!hasBounds(bounds)) return svgContent;

  const safePadding = Math.max(0, padding);
  const minX = bounds.minX - safePadding;
  const minY = bounds.minY - safePadding;
  const width = Math.max(1, bounds.maxX - bounds.minX + safePadding * 2);
  const height = Math.max(1, bounds.maxY - bounds.minY + safePadding * 2);

  svgEl.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  svgEl.setAttribute("width", Number(width.toFixed(3)).toString());
  svgEl.setAttribute("height", Number(height.toFixed(3)).toString());

  return new XMLSerializer().serializeToString(svgEl);
}

function formatTrafficMbps(valueBps: number): string {
  const mbps = Math.max(0, valueBps) / 1_000_000;
  if (mbps === 0) return "0";

  const precision = mbps < 1 ? 2 : 1;
  return mbps
    .toFixed(precision)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function createLegendTextRows(
  thresholds: GrafanaTrafficThresholds,
): Array<{ color: string; text: string }> {
  const green = formatTrafficMbps(thresholds.green);
  const yellow = formatTrafficMbps(thresholds.yellow);
  const orange = formatTrafficMbps(thresholds.orange);
  const red = formatTrafficMbps(thresholds.red);

  return [
    { color: "#b8c4d3", text: `0 - ${green} Mbps` },
    { color: "#5fe15c", text: `${green} - ${yellow} Mbps` },
    { color: "#ffe24a", text: `${yellow} - ${orange} Mbps` },
    { color: "#ff9f1a", text: `${orange} - ${red} Mbps` },
    { color: "#ff4f6b", text: `${red}+ Mbps` },
  ];
}

function parseViewBox(svgEl: Element): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const viewBoxAttr = svgEl.getAttribute("viewBox");
  if (viewBoxAttr) {
    const parts = viewBoxAttr
      .split(/[ ,]+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    if (parts.length === 4) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }

  const width = Number.parseFloat(svgEl.getAttribute("width") ?? "1");
  const height = Number.parseFloat(svgEl.getAttribute("height") ?? "1");
  return {
    x: 0,
    y: 0,
    width: Number.isFinite(width) && width > 0 ? width : 1,
    height: Number.isFinite(height) && height > 0 ? height : 1,
  };
}

export function addGrafanaTrafficLegend(
  svgContent: string,
  trafficThresholds: GrafanaTrafficThresholds,
): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svgContent;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.documentElement;
  const legendRows = createLegendTextRows(trafficThresholds);
  const viewBox = parseViewBox(svgEl);
  const transform = parseGraphTransform(svgEl);
  const legendScale = Math.max(0.1, Math.abs(transform.scale));

  const legendGroup = doc.createElementNS(SVG_NS, "g");
  legendGroup.setAttribute("class", "grafana-traffic-legend");
  legendGroup.setAttribute("opacity", "0.95");

  const startX = viewBox.x + 12 * legendScale;
  let topNodeY = Number.POSITIVE_INFINITY;
  for (const rect of Array.from(
    doc.querySelectorAll("g.export-node > g > rect[x][y][width][height]"),
  )) {
    const x = parseNumericAttr(rect, "x");
    const y = parseNumericAttr(rect, "y");
    if (x === null || y === null) continue;
    const transformed = applyGraphTransform(transform, x, y);
    topNodeY = Math.min(topNodeY, transformed.y);
  }
  const startY = Number.isFinite(topNodeY)
    ? topNodeY + 4 * legendScale
    : viewBox.y + 18 * legendScale;
  const rowHeight = 16 * legendScale;

  for (let i = 0; i < legendRows.length; i++) {
    const row = legendRows[i];
    const rowGroup = doc.createElementNS(SVG_NS, "g");
    rowGroup.setAttribute(
      "transform",
      `translate(${startX} ${startY + i * rowHeight})`,
    );

    const bullet = doc.createElementNS(SVG_NS, "circle");
    bullet.setAttribute("cx", "0");
    bullet.setAttribute("cy", "0");
    bullet.setAttribute("r", `${4 * legendScale}`);
    bullet.setAttribute("fill", row.color);
    rowGroup.appendChild(bullet);

    const text = doc.createElementNS(SVG_NS, "text");
    text.setAttribute("x", `${10 * legendScale}`);
    text.setAttribute("y", "0");
    text.setAttribute("dy", "0.35em");
    text.setAttribute("font-size", `${11 * legendScale}`);
    text.setAttribute("font-family", "Helvetica, Arial, sans-serif");
    text.setAttribute("font-weight", "500");
    text.setAttribute("fill", "#e7edf7");
    text.setAttribute("stroke", "rgba(0, 0, 0, 0.65)");
    text.setAttribute("stroke-width", `${0.45 * legendScale}`);
    text.setAttribute("paint-order", "stroke");
    text.textContent = row.text;
    rowGroup.appendChild(text);

    legendGroup.appendChild(rowGroup);
  }

  svgEl.appendChild(legendGroup);
  return new XMLSerializer().serializeToString(svgEl);
}

export function makeGrafanaSvgResponsive(svgContent: string): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svgContent;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.documentElement;

  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");
  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

  return new XMLSerializer().serializeToString(svgEl);
}

function setCellIdAttributes(element: Element, shortCellId: string): void {
  element.setAttribute("id", `${CELL_ID_PREAMBLE}${shortCellId}`);
  element.setAttribute("data-cell-id", shortCellId);
}

function parsePathStart(
  pathData: string | null,
): { x: number; y: number } | null {
  if (!pathData) return null;
  const trimmed = pathData.trim();
  if (trimmed.length === 0) return null;
  const command = trimmed[0];
  if (command !== "M" && command !== "m") return null;

  const remainder = trimmed.slice(1).replaceAll(",", " ").trim();
  const parts = remainder.split(" ").filter((part) => part.length > 0);
  if (parts.length < 2) return null;

  const x = Number.parseFloat(parts[0]);
  const y = Number.parseFloat(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function createFallbackOperstateMarker(
  doc: XMLDocument,
  sourceGroup: Element,
): SVGElement {
  const firstPath = sourceGroup.querySelector("path");
  const startPoint = parsePathStart(firstPath?.getAttribute("d") ?? null);
  const marker = doc.createElementNS(SVG_NS, "rect");
  const markerX = startPoint ? startPoint.x - 3 : 0;
  const markerY = startPoint ? startPoint.y - 3 : 0;
  marker.setAttribute("x", markerX.toString());
  marker.setAttribute("y", markerY.toString());
  marker.setAttribute("width", "6");
  marker.setAttribute("height", "6");
  marker.setAttribute("rx", "1");
  marker.setAttribute("ry", "1");
  marker.setAttribute("fill", "transparent");
  marker.setAttribute("stroke", "none");
  return marker;
}

function createOperstateCellGroup(
  doc: XMLDocument,
  sourceGroup: Element,
  shortCellId: string,
): Element {
  const operstateGroup = doc.createElementNS(SVG_NS, "g");
  operstateGroup.setAttribute("class", "export-edge grafana-operstate-cell");
  setCellIdAttributes(operstateGroup, shortCellId);
  operstateGroup.appendChild(createFallbackOperstateMarker(doc, sourceGroup));

  return operstateGroup;
}

function resolveTrafficCellElement(edgeGroup: Element): Element {
  const directPath = Array.from(edgeGroup.children).find(
    (child) => child.tagName.toLowerCase() === "path",
  );
  if (directPath) return directPath;

  const nestedPath = edgeGroup.querySelector("path");
  if (nestedPath) return nestedPath;

  return edgeGroup;
}

interface Point {
  x: number;
  y: number;
}

function lerp(a: Point, b: Point, t = 0.5): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

function midpointForPath(pathData: string): Point | null {
  const tokens = pathData.match(/[A-Za-z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens || tokens.length < 6) return null;

  const cmd0 = tokens[0]?.toUpperCase();
  if (cmd0 !== "M") return null;

  const sx = Number.parseFloat(tokens[1]);
  const sy = Number.parseFloat(tokens[2]);
  const cmd1 = tokens[3]?.toUpperCase();
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !cmd1) return null;

  if (cmd1 === "L" && tokens.length >= 6) {
    const tx = Number.parseFloat(tokens[4]);
    const ty = Number.parseFloat(tokens[5]);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return lerp({ x: sx, y: sy }, { x: tx, y: ty }, 0.5);
  }

  if (cmd1 === "Q" && tokens.length >= 8) {
    const cx = Number.parseFloat(tokens[4]);
    const cy = Number.parseFloat(tokens[5]);
    const tx = Number.parseFloat(tokens[6]);
    const ty = Number.parseFloat(tokens[7]);
    if (![cx, cy, tx, ty].every(Number.isFinite)) return null;
    const t = 0.5;
    const oneMinusT = 1 - t;
    return {
      x: oneMinusT * oneMinusT * sx + 2 * oneMinusT * t * cx + t * t * tx,
      y: oneMinusT * oneMinusT * sy + 2 * oneMinusT * t * cy + t * t * ty,
    };
  }

  if (cmd1 === "C" && tokens.length >= 10) {
    const c1x = Number.parseFloat(tokens[4]);
    const c1y = Number.parseFloat(tokens[5]);
    const c2x = Number.parseFloat(tokens[6]);
    const c2y = Number.parseFloat(tokens[7]);
    const tx = Number.parseFloat(tokens[8]);
    const ty = Number.parseFloat(tokens[9]);
    if (![c1x, c1y, c2x, c2y, tx, ty].every(Number.isFinite)) return null;
    const t = 0.5;
    const oneMinusT = 1 - t;
    return {
      x:
        oneMinusT * oneMinusT * oneMinusT * sx +
        3 * oneMinusT * oneMinusT * t * c1x +
        3 * oneMinusT * t * t * c2x +
        t * t * t * tx,
      y:
        oneMinusT * oneMinusT * oneMinusT * sy +
        3 * oneMinusT * oneMinusT * t * c1y +
        3 * oneMinusT * t * t * c2y +
        t * t * t * ty,
    };
  }

  return null;
}

function splitPathIntoHalves(
  pathData: string,
): { first: string; second: string } | null {
  const tokens = pathData.match(/[A-Za-z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens || tokens.length < 6) return null;

  const cmd0 = tokens[0]?.toUpperCase();
  if (cmd0 !== "M") return null;

  const sx = Number.parseFloat(tokens[1]);
  const sy = Number.parseFloat(tokens[2]);
  const cmd1 = tokens[3]?.toUpperCase();
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !cmd1) return null;

  if (cmd1 === "L" && tokens.length >= 6) {
    const tx = Number.parseFloat(tokens[4]);
    const ty = Number.parseFloat(tokens[5]);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const p0 = { x: sx, y: sy };
    const p1 = { x: tx, y: ty };
    const m = lerp(p0, p1);
    return {
      first: `M ${fmt(p0.x)} ${fmt(p0.y)} L ${fmt(m.x)} ${fmt(m.y)}`,
      second: `M ${fmt(m.x)} ${fmt(m.y)} L ${fmt(p1.x)} ${fmt(p1.y)}`,
    };
  }

  if (cmd1 === "Q" && tokens.length >= 8) {
    const cx = Number.parseFloat(tokens[4]);
    const cy = Number.parseFloat(tokens[5]);
    const tx = Number.parseFloat(tokens[6]);
    const ty = Number.parseFloat(tokens[7]);
    if (![cx, cy, tx, ty].every(Number.isFinite)) return null;
    const p0 = { x: sx, y: sy };
    const p1 = { x: cx, y: cy };
    const p2 = { x: tx, y: ty };
    const p01 = lerp(p0, p1);
    const p12 = lerp(p1, p2);
    const mid = lerp(p01, p12);
    return {
      first: `M ${fmt(p0.x)} ${fmt(p0.y)} Q ${fmt(p01.x)} ${fmt(p01.y)} ${fmt(mid.x)} ${fmt(mid.y)}`,
      second: `M ${fmt(mid.x)} ${fmt(mid.y)} Q ${fmt(p12.x)} ${fmt(p12.y)} ${fmt(p2.x)} ${fmt(p2.y)}`,
    };
  }

  if (cmd1 === "C" && tokens.length >= 10) {
    const c1x = Number.parseFloat(tokens[4]);
    const c1y = Number.parseFloat(tokens[5]);
    const c2x = Number.parseFloat(tokens[6]);
    const c2y = Number.parseFloat(tokens[7]);
    const tx = Number.parseFloat(tokens[8]);
    const ty = Number.parseFloat(tokens[9]);
    if (![c1x, c1y, c2x, c2y, tx, ty].every(Number.isFinite)) return null;
    const p0 = { x: sx, y: sy };
    const p1 = { x: c1x, y: c1y };
    const p2 = { x: c2x, y: c2y };
    const p3 = { x: tx, y: ty };
    const p01 = lerp(p0, p1);
    const p12 = lerp(p1, p2);
    const p23 = lerp(p2, p3);
    const p012 = lerp(p01, p12);
    const p123 = lerp(p12, p23);
    const mid = lerp(p012, p123);
    return {
      first:
        `M ${fmt(p0.x)} ${fmt(p0.y)} C ${fmt(p01.x)} ${fmt(p01.y)} ${fmt(p012.x)} ${fmt(p012.y)} ` +
        `${fmt(mid.x)} ${fmt(mid.y)}`,
      second:
        `M ${fmt(mid.x)} ${fmt(mid.y)} C ${fmt(p123.x)} ${fmt(p123.y)} ${fmt(p23.x)} ${fmt(p23.y)} ` +
        `${fmt(p3.x)} ${fmt(p3.y)}`,
    };
  }

  return null;
}

function parsePathEndpoints(
  pathData: string,
): { start: Point; end: Point } | null {
  const tokens = pathData.match(/[A-Za-z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens || tokens.length < 6) return null;

  const cmd0 = tokens[0]?.toUpperCase();
  if (cmd0 !== "M") return null;

  const numbers = tokens
    .slice(1)
    .filter((token) => /^[+-]?\d*\.?\d+(?:e[+-]?\d+)?$/i.test(token))
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
  if (numbers.length < 4) return null;

  const start = { x: numbers[0], y: numbers[1] };
  const end = {
    x: numbers[numbers.length - 2],
    y: numbers[numbers.length - 1],
  };
  return { start, end };
}

function isLabelCollision(
  point: Point,
  occupiedPoints: Point[],
  minDx: number,
  minDy: number,
): boolean {
  return occupiedPoints.some((other) => {
    const dx = point.x - other.x;
    const dy = point.y - other.y;
    return Math.abs(dx) < minDx && Math.abs(dy) < minDy;
  });
}

function resolveTrafficLabelPoint(
  halfPathData: string,
  occupiedPoints: Point[],
  graphScale: number,
): Point {
  const base = midpointForPath(halfPathData) ??
    parsePathStart(halfPathData) ?? { x: 0, y: 0 };
  const endpoints = parsePathEndpoints(halfPathData);

  let tangent = { x: 1, y: 0 };
  let normal = { x: 0, y: 1 };
  if (endpoints) {
    const dx = endpoints.end.x - endpoints.start.x;
    const dy = endpoints.end.y - endpoints.start.y;
    const length = Math.hypot(dx, dy);
    if (length > 0.001) {
      tangent = { x: dx / length, y: dy / length };
      normal = { x: -dy / length, y: dx / length };
    }
  }

  const safeScale = Math.max(0.05, Math.abs(graphScale));
  const alongStep = 20 / safeScale;
  const normalStep = 8 / safeScale;
  // Keep enough space for typical throughput labels (e.g. "248.5 kb/s", "12.4 Mb/s").
  const minimumDx = 58 / safeScale;
  const minimumDy = 16 / safeScale;
  const alongOffsets = [
    0,
    alongStep,
    -alongStep,
    alongStep * 2,
    -alongStep * 2,
    alongStep * 3,
    -alongStep * 3,
    alongStep * 4,
    -alongStep * 4,
  ];

  for (const offset of alongOffsets) {
    const candidate = {
      x: base.x + tangent.x * offset,
      y: base.y + tangent.y * offset,
    };
    if (!isLabelCollision(candidate, occupiedPoints, minimumDx, minimumDy)) {
      occupiedPoints.push(candidate);
      return candidate;
    }
  }

  // Fallback: add slight off-line nudge only if all along-line slots are occupied.
  for (const offset of alongOffsets) {
    const candidate = {
      x: base.x + tangent.x * offset + normal.x * normalStep,
      y: base.y + tangent.y * offset + normal.y * normalStep,
    };
    if (!isLabelCollision(candidate, occupiedPoints, minimumDx, minimumDy)) {
      occupiedPoints.push(candidate);
      return candidate;
    }
  }

  occupiedPoints.push(base);
  return base;
}

function createTrafficHalfCell(
  doc: XMLDocument,
  sourcePath: Element,
  halfPathData: string,
  shortCellId: string,
  occupiedLabelPoints: Point[],
  graphScale: number,
): Element {
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "grafana-traffic-half");
  setCellIdAttributes(group, shortCellId);

  const path = sourcePath.cloneNode(true) as Element;
  path.setAttribute("d", halfPathData);
  path.removeAttribute("id");
  path.removeAttribute("data-cell-id");
  group.appendChild(path);

  const mid = resolveTrafficLabelPoint(
    halfPathData,
    occupiedLabelPoints,
    graphScale,
  );
  const text = doc.createElementNS(SVG_NS, "text");
  text.setAttribute("x", fmt(mid.x));
  text.setAttribute("y", fmt(mid.y));
  text.setAttribute("font-size", "10");
  text.setAttribute("font-family", "Helvetica, Arial, sans-serif");
  text.setAttribute("fill", "#FFFFFF");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("stroke", "rgba(0, 0, 0, 0.95)");
  text.setAttribute("stroke-width", "0.75");
  text.setAttribute("paint-order", "stroke");
  text.setAttribute("stroke-linejoin", "round");
  text.textContent = " ";
  group.appendChild(text);

  return group;
}

function resolveOperstateCellElements(edgeGroup: Element): {
  source: Element | null;
  target: Element | null;
} {
  const labelRects = Array.from(edgeGroup.querySelectorAll("g.edge-label"))
    .map((labelGroup) =>
      labelGroup.querySelector("circle,ellipse,rect,path,polygon,polyline"),
    )
    .filter((shape): shape is Element => shape !== null);
  return {
    source: labelRects[0] ?? null,
    target: labelRects[1] ?? null,
  };
}

export function applyGrafanaCellIdsToSvg(
  svgContent: string,
  mappings: GrafanaEdgeCellMapping[],
): string {
  if (mappings.length === 0) return svgContent;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const graphTransform = parseGraphTransform(doc.documentElement);
  const graphScale = Math.max(0.05, Math.abs(graphTransform.scale));
  const edgeGroupByDataId = new Map<string, Element>();

  for (const group of Array.from(doc.querySelectorAll("g.export-edge"))) {
    const edgeDataId = group.getAttribute("data-id");
    if (!edgeDataId || edgeGroupByDataId.has(edgeDataId)) continue;
    edgeGroupByDataId.set(edgeDataId, group);
  }

  const occupiedTrafficLabelPoints: Point[] = [];

  for (const mapping of mappings) {
    const trafficGroup = edgeGroupByDataId.get(mapping.edgeId);
    if (!trafficGroup) continue;

    const trafficCellEl = resolveTrafficCellElement(trafficGroup);
    if (trafficCellEl.tagName.toLowerCase() === "path") {
      const d = trafficCellEl.getAttribute("d") ?? "";
      const split = splitPathIntoHalves(d);
      if (split && trafficCellEl.parentNode) {
        const firstHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          split.first,
          mapping.trafficCellId,
          occupiedTrafficLabelPoints,
          graphScale,
        );
        const secondHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          split.second,
          mapping.reverseTrafficCellId,
          occupiedTrafficLabelPoints,
          graphScale,
        );
        trafficCellEl.parentNode.insertBefore(firstHalf, trafficCellEl);
        trafficCellEl.parentNode.insertBefore(secondHalf, trafficCellEl);
        trafficCellEl.remove();
      } else {
        const firstHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          d,
          mapping.trafficCellId,
          occupiedTrafficLabelPoints,
          graphScale,
        );
        const secondHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          d,
          mapping.reverseTrafficCellId,
          occupiedTrafficLabelPoints,
          graphScale,
        );
        trafficCellEl.parentNode?.insertBefore(firstHalf, trafficCellEl);
        trafficCellEl.parentNode?.insertBefore(secondHalf, trafficCellEl);
        trafficCellEl.remove();
      }
    } else {
      setCellIdAttributes(trafficCellEl, mapping.trafficCellId);
    }

    const operstateCellEls = resolveOperstateCellElements(trafficGroup);
    if (operstateCellEls.source) {
      setCellIdAttributes(operstateCellEls.source, mapping.operstateCellId);
      operstateCellEls.source.classList.add("grafana-operstate-cell");
    } else {
      const operstateGroup = createOperstateCellGroup(
        doc,
        trafficGroup,
        mapping.operstateCellId,
      );
      trafficGroup.parentNode?.insertBefore(operstateGroup, trafficGroup);
    }

    if (operstateCellEls.target) {
      setCellIdAttributes(
        operstateCellEls.target,
        mapping.targetOperstateCellId,
      );
      operstateCellEls.target.classList.add("grafana-operstate-cell");
    }
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function sanitizeSvgForGrafana(svgContent: string): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svgContent
      .replace(/\sfilter=(["'])url\(#text-shadow\)\1/gi, "")
      .replace(/<filter[^>]*id=(["'])text-shadow\1[\s\S]*?<\/filter>/gi, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  for (const textEl of Array.from(doc.querySelectorAll("text[filter]"))) {
    textEl.removeAttribute("filter");
  }

  for (const filterEl of Array.from(
    doc.querySelectorAll("defs filter#text-shadow"),
  )) {
    filterEl.remove();
  }

  // Keep interface labels readable while minimally affecting operstate color.
  for (const edgeLabelBg of Array.from(
    doc.querySelectorAll("g.edge-label rect"),
  )) {
    edgeLabelBg.setAttribute("fill", "rgba(0, 0, 0, 0.36)");
    edgeLabelBg.setAttribute("stroke", "none");
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function removeUnlinkedNodesFromSvg(
  svgContent: string,
  linkedNodeIds: Set<string>,
): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    return svgContent.replace(
      /<g\b[^>]*class=(["'])[^"']*\bexport-node\b[^"']*\1[^>]*data-id=(["'])([^"']+)\2[^>]*>[\s\S]*?<\/g>/gi,
      (match, _classQuote: string, _idQuote: string, nodeId: string) =>
        linkedNodeIds.has(nodeId) ? match : "",
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  for (const nodeEl of Array.from(
    doc.querySelectorAll("g.export-node[data-id]"),
  )) {
    const nodeId = nodeEl.getAttribute("data-id");
    if (!nodeId || linkedNodeIds.has(nodeId)) continue;
    nodeEl.remove();
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

function asValidYamlNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

export function buildGrafanaPanelYaml(
  mappings: GrafanaEdgeCellMapping[],
  options: GrafanaPanelYamlOptions = {},
): string {
  const trafficThresholds =
    options.trafficThresholds ?? DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS;
  const greenThreshold = asValidYamlNumber(
    trafficThresholds.green,
    DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS.green,
  );
  const yellowThreshold = asValidYamlNumber(
    trafficThresholds.yellow,
    DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS.yellow,
  );
  const orangeThreshold = asValidYamlNumber(
    trafficThresholds.orange,
    DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS.orange,
  );
  const redThreshold = asValidYamlNumber(
    trafficThresholds.red,
    DEFAULT_GRAFANA_TRAFFIC_THRESHOLDS.red,
  );
  const lines: string[] = [
    "---",
    "anchors:",
    "  thresholds-operstate: &thresholds-operstate",
    '    - { color: "red", level: 0 }',
    '    - { color: "green", level: 1 }',
    "  thresholds-traffic: &thresholds-traffic",
    '    - { color: "gray", level: 0 }',
    `    - { color: "green", level: ${greenThreshold} }`,
    `    - { color: "yellow", level: ${yellowThreshold} }`,
    `    - { color: "orange", level: ${orangeThreshold} }`,
    `    - { color: "red", level: ${redThreshold} }`,
    "  label-config: &label-config",
    '    separator: "replace"',
    '    units: "bps"',
    "    decimalPoints: 1",
    "    valueMappings:",
    `      - { valueMax: ${greenThreshold}, text: "\\u200B" }`,
    'cellIdPreamble: "cell-"',
    "cells:",
  ];

  if (mappings.length === 0) {
    lines.push("  {}");
    return `${lines.join("\n")}\n`;
  }

  for (const mapping of mappings) {
    const operstateDataRef = `oper-state:${mapping.source}:${mapping.sourceEndpoint}`;
    const targetOperstateDataRef = `oper-state:${mapping.target}:${mapping.targetEndpoint}`;
    const trafficDataRef = `${mapping.source}:${mapping.sourceEndpoint}:out`;
    const reverseTrafficDataRef = `${mapping.target}:${mapping.targetEndpoint}:out`;
    lines.push(`  ${quoteYaml(mapping.operstateCellId)}:`);
    lines.push(`    dataRef: ${quoteYaml(operstateDataRef)}`);
    lines.push("    fillColor:");
    lines.push("      thresholds: *thresholds-operstate");
    lines.push(`  ${quoteYaml(mapping.targetOperstateCellId)}:`);
    lines.push(`    dataRef: ${quoteYaml(targetOperstateDataRef)}`);
    lines.push("    fillColor:");
    lines.push("      thresholds: *thresholds-operstate");
    lines.push(`  ${quoteYaml(mapping.trafficCellId)}:`);
    lines.push(`    dataRef: ${quoteYaml(trafficDataRef)}`);
    lines.push("    label: *label-config");
    lines.push("    strokeColor:");
    lines.push("      thresholds: *thresholds-traffic");
    lines.push(`  ${quoteYaml(mapping.reverseTrafficCellId)}:`);
    lines.push(`    dataRef: ${quoteYaml(reverseTrafficDataRef)}`);
    lines.push("    label: *label-config");
    lines.push("    strokeColor:");
    lines.push("      thresholds: *thresholds-traffic");
  }

  return `${lines.join("\n")}\n`;
}

function buildDashboardTargets() {
  return DEFAULT_GRAFANA_TARGETS.map((target, index) => ({
    datasource: { type: target.datasource },
    editorMode: "code",
    expr: target.expr,
    hide: target.hide ?? false,
    instant: target.instant,
    legendFormat: target.legendFormat,
    range: target.range,
    refId: String.fromCharCode("A".charCodeAt(0) + index),
  }));
}

export function buildGrafanaDashboardJson(
  panelConfigYaml: string,
  svgContent: string,
  dashboardTitle: string,
): string {
  const title = dashboardTitle.trim() || "Network Telemetry";
  const dashboard = {
    annotations: {
      list: [
        {
          builtIn: 1,
          datasource: { type: "prometheus" },
          enable: true,
          hide: true,
          iconColor: "rgba(0, 211, 255, 1)",
          name: "Annotations & Alerts",
          type: "dashboard",
        },
      ],
    },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
    id: 3,
    links: [],
    liveNow: false,
    panels: [
      {
        datasource: { type: "prometheus" },
        gridPos: { h: 23, w: 13, x: 0, y: 0 },
        id: 1,
        options: {
          animationControlEnabled: true,
          animationsEnabled: true,
          debuggingCtr: {
            colorsCtr: 1,
            dataCtr: 0,
            displaySvgCtr: 0,
            mappingsCtr: 0,
            timingsCtr: 0,
          },
          highlighterEnabled: true,
          panZoomEnabled: true,
          panelConfig: panelConfigYaml,
          siteConfig: "",
          svg: svgContent,
          testDataEnabled: false,
          timeSliderEnabled: true,
        },
        targets: buildDashboardTargets(),
        title,
        type: "andrewbmchugh-flow-panel",
      },
    ],
    refresh: "5s",
    schemaVersion: 38,
    tags: [],
    time: { from: "now-5m", to: "now" },
    timepicker: {},
    timezone: "",
    title,
    version: 6,
    weekStart: "",
  };

  return JSON.stringify(dashboard, null, 2);
}
