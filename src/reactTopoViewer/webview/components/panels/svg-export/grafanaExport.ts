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
    hide: false
  },
  {
    datasource: "prometheus",
    expr: "interface_traffic_rate_out_bps",
    legendFormat: "{{source}}:{{interface_name}}:out",
    instant: false,
    range: true,
    hide: false
  },
  {
    datasource: "prometheus",
    expr: "interface_traffic_rate_in_bps",
    legendFormat: "{{source}}:{{interface_name}}:in",
    instant: false,
    range: true,
    hide: false
  }
];

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
    reverseTrafficCellId
  };
}

function isAnnotationNode(
  nodeId: string,
  nodeTypesById: Map<string, string>,
  annotationNodeTypes: Set<string>
): boolean {
  const nodeType = nodeTypesById.get(nodeId) ?? "";
  return annotationNodeTypes.has(nodeType);
}

export function collectGrafanaEdgeCellMappings(
  edges: Edge[],
  nodes: Node[],
  annotationNodeTypes: Set<string>
): GrafanaEdgeCellMapping[] {
  const nodeTypesById = new Map(nodes.map((node) => [node.id, node.type ?? ""]));
  const seenTraffic = new Set<string>();
  const seenOperstate = new Set<string>();
  const mappings: GrafanaEdgeCellMapping[] = [];

  for (const edge of edges) {
    if (isAnnotationNode(edge.source, nodeTypesById, annotationNodeTypes)) continue;
    if (isAnnotationNode(edge.target, nodeTypesById, annotationNodeTypes)) continue;

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

function setCellIdAttributes(element: Element, shortCellId: string): void {
  element.setAttribute("id", `${CELL_ID_PREAMBLE}${shortCellId}`);
  element.setAttribute("data-cell-id", shortCellId);
}

function parsePathStart(pathData: string | null): { x: number; y: number } | null {
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

function createFallbackOperstateMarker(doc: XMLDocument, sourceGroup: Element): SVGElement {
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

function createOperstateCellGroup(doc: XMLDocument, sourceGroup: Element, shortCellId: string): Element {
  const operstateGroup = doc.createElementNS(SVG_NS, "g");
  operstateGroup.setAttribute("class", "export-edge grafana-operstate-cell");
  setCellIdAttributes(operstateGroup, shortCellId);
  operstateGroup.appendChild(createFallbackOperstateMarker(doc, sourceGroup));

  return operstateGroup;
}

function resolveTrafficCellElement(edgeGroup: Element): Element {
  const directPath = Array.from(edgeGroup.children).find(
    (child) => child.tagName.toLowerCase() === "path"
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
    y: a.y + (b.y - a.y) * t
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
      y: oneMinusT * oneMinusT * sy + 2 * oneMinusT * t * cy + t * t * ty
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
        t * t * t * ty
    };
  }

  return null;
}

function splitPathIntoHalves(pathData: string): { first: string; second: string } | null {
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
      second: `M ${fmt(m.x)} ${fmt(m.y)} L ${fmt(p1.x)} ${fmt(p1.y)}`
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
      second: `M ${fmt(mid.x)} ${fmt(mid.y)} Q ${fmt(p12.x)} ${fmt(p12.y)} ${fmt(p2.x)} ${fmt(p2.y)}`
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
        `${fmt(p3.x)} ${fmt(p3.y)}`
    };
  }

  return null;
}

function createTrafficHalfCell(
  doc: XMLDocument,
  sourcePath: Element,
  halfPathData: string,
  shortCellId: string
): Element {
  const group = doc.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "grafana-traffic-half");
  setCellIdAttributes(group, shortCellId);

  const path = sourcePath.cloneNode(true) as Element;
  path.setAttribute("d", halfPathData);
  path.removeAttribute("id");
  path.removeAttribute("data-cell-id");
  group.appendChild(path);

  const mid = midpointForPath(halfPathData) ?? parsePathStart(halfPathData) ?? { x: 0, y: 0 };
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

function resolveOperstateCellElements(edgeGroup: Element): { source: Element | null; target: Element | null } {
  const labelRects = Array.from(edgeGroup.querySelectorAll("g.edge-label"))
    .map((labelGroup) => labelGroup.querySelector("circle,ellipse,rect,path,polygon,polyline"))
    .filter((shape): shape is Element => shape !== null);
  return {
    source: labelRects[0] ?? null,
    target: labelRects[1] ?? null
  };
}

export function applyGrafanaCellIdsToSvg(
  svgContent: string,
  mappings: GrafanaEdgeCellMapping[]
): string {
  if (mappings.length === 0) return svgContent;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const edgeGroupByDataId = new Map<string, Element>();

  for (const group of Array.from(doc.querySelectorAll("g.export-edge"))) {
    const edgeDataId = group.getAttribute("data-id");
    if (!edgeDataId || edgeGroupByDataId.has(edgeDataId)) continue;
    edgeGroupByDataId.set(edgeDataId, group);
  }

  for (const mapping of mappings) {
    const trafficGroup = edgeGroupByDataId.get(mapping.edgeId);
    if (!trafficGroup) continue;

    const trafficCellEl = resolveTrafficCellElement(trafficGroup);
    if (trafficCellEl.tagName.toLowerCase() === "path") {
      const d = trafficCellEl.getAttribute("d") ?? "";
      const split = splitPathIntoHalves(d);
      if (split && trafficCellEl.parentNode) {
        const firstHalf = createTrafficHalfCell(doc, trafficCellEl, split.first, mapping.trafficCellId);
        const secondHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          split.second,
          mapping.reverseTrafficCellId
        );
        trafficCellEl.parentNode.insertBefore(firstHalf, trafficCellEl);
        trafficCellEl.parentNode.insertBefore(secondHalf, trafficCellEl);
        trafficCellEl.remove();
      } else {
        const firstHalf = createTrafficHalfCell(doc, trafficCellEl, d, mapping.trafficCellId);
        const secondHalf = createTrafficHalfCell(
          doc,
          trafficCellEl,
          d,
          mapping.reverseTrafficCellId
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
      const operstateGroup = createOperstateCellGroup(doc, trafficGroup, mapping.operstateCellId);
      trafficGroup.parentNode?.insertBefore(operstateGroup, trafficGroup);
    }

    if (operstateCellEls.target) {
      setCellIdAttributes(operstateCellEls.target, mapping.targetOperstateCellId);
      operstateCellEls.target.classList.add("grafana-operstate-cell");
    }
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function sanitizeSvgForGrafana(svgContent: string): string {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return svgContent
      .replace(/\sfilter=(["'])url\(#text-shadow\)\1/gi, "")
      .replace(/<filter[^>]*id=(["'])text-shadow\1[\s\S]*?<\/filter>/gi, "");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");

  for (const textEl of Array.from(doc.querySelectorAll("text[filter]"))) {
    textEl.removeAttribute("filter");
  }

  for (const filterEl of Array.from(doc.querySelectorAll("defs filter#text-shadow"))) {
    filterEl.remove();
  }

  // Keep interface labels readable while minimally affecting operstate color.
  for (const edgeLabelBg of Array.from(doc.querySelectorAll("g.edge-label rect"))) {
    edgeLabelBg.setAttribute("fill", "rgba(0, 0, 0, 0.36)");
    edgeLabelBg.setAttribute("stroke", "none");
  }

  return new XMLSerializer().serializeToString(doc.documentElement);
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

export function buildGrafanaPanelYaml(mappings: GrafanaEdgeCellMapping[]): string {
  const lines: string[] = [
    "---",
    "anchors:",
    "  thresholds-operstate: &thresholds-operstate",
    "    - { color: \"red\", level: 0 }",
    "    - { color: \"green\", level: 1 }",
    "  thresholds-traffic: &thresholds-traffic",
    "    - { color: \"gray\", level: 0 }",
    "    - { color: \"green\", level: 199999 }",
    "    - { color: \"yellow\", level: 500000 }",
    "    - { color: \"orange\", level: 1000000 }",
    "    - { color: \"red\", level: 5000000 }",
    "  label-config: &label-config",
    "    separator: \"replace\"",
    "    units: \"bps\"",
    "    decimalPoints: 1",
    "    valueMappings:",
    "      - { valueMax: 199999, text: \"\\u200B\" }",
    "cellIdPreamble: \"cell-\"",
    "cells:"
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
    refId: String.fromCharCode("A".charCodeAt(0) + index)
  }));
}

export function buildGrafanaDashboardJson(
  panelConfigYaml: string,
  svgContent: string,
  dashboardTitle: string
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
          type: "dashboard"
        }
      ]
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
            timingsCtr: 0
          },
          highlighterEnabled: true,
          panZoomEnabled: true,
          panelConfig: panelConfigYaml,
          siteConfig: "",
          svg: svgContent,
          testDataEnabled: false,
          timeSliderEnabled: true
        },
        targets: buildDashboardTargets(),
        title,
        type: "andrewbmchugh-flow-panel"
      }
    ],
    refresh: "5s",
    schemaVersion: 38,
    tags: [],
    time: { from: "now-5m", to: "now" },
    timepicker: {},
    timezone: "",
    title,
    version: 6,
    weekStart: ""
  };

  return JSON.stringify(dashboard, null, 2);
}
