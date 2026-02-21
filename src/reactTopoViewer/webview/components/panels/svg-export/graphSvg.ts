// Core graph SVG export helpers.
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";

import { buildSvgDefs } from "./constants";
import { renderEdgesToSvg, type EdgeSvgRenderOptions } from "./edgesToSvg";
import { renderNodesToSvg, type CustomIconMap, type NodeSvgRenderOptions } from "./nodesToSvg";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface GraphSvgResult {
  svg: string;
  transform: string;
  nodes: Node[];
  edges: Edge[];
}

export interface GraphSvgRenderOptions extends EdgeSvgRenderOptions, NodeSvgRenderOptions {}

export function getViewportSize(): ViewportSize | null {
  const container = document.querySelector(".react-flow");
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  return { width: rect.width, height: rect.height };
}

export function buildViewportTransform(
  viewport: { x: number; y: number; zoom: number },
  size: ViewportSize,
  zoomPercent: number
): { width: number; height: number; transform: string; scaleFactor: number } {
  const scaleFactor = Math.max(0.1, zoomPercent / 100);
  const width = Math.max(1, Math.round(size.width * scaleFactor));
  const height = Math.max(1, Math.round(size.height * scaleFactor));
  const transform = `translate(${viewport.x * scaleFactor}, ${viewport.y * scaleFactor}) scale(${viewport.zoom * scaleFactor})`;
  return { width, height, transform, scaleFactor };
}

export function buildGraphSvg(
  rfInstance: ReactFlowInstance,
  zoomPercent: number,
  customIcons?: CustomIconMap,
  includeEdgeLabels = true,
  annotationNodeTypes?: Set<string>,
  nodeProximateLabels = false,
  renderOptions?: GraphSvgRenderOptions
): GraphSvgResult | null {
  const viewport = rfInstance.getViewport();
  const size = getViewportSize();
  if (!size) return null;
  const { width, height, transform } = buildViewportTransform(viewport, size, zoomPercent);
  const nodes = rfInstance.getNodes();
  const edges = rfInstance.getEdges();

  const edgesSvg = renderEdgesToSvg(
    edges,
    nodes,
    includeEdgeLabels,
    annotationNodeTypes,
    nodeProximateLabels,
    renderOptions
  );
  const nodesSvg = renderNodesToSvg(nodes, customIcons, annotationNodeTypes, {
    nodeIconSize: renderOptions?.nodeIconSize,
  });

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += buildSvgDefs();
  svg += `<g transform="${transform}">`;
  svg += edgesSvg;
  svg += nodesSvg;
  svg += `</g></svg>`;

  return { svg, transform, nodes, edges };
}

export function applyPadding(svgContent: string, padding: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgEl = doc.documentElement;
  const width = parseFloat(svgEl.getAttribute("width") ?? "0");
  const height = parseFloat(svgEl.getAttribute("height") ?? "0");
  const newWidth = width + 2 * padding;
  const newHeight = height + 2 * padding;
  const viewBox = svgEl.getAttribute("viewBox") ?? `0 0 ${width} ${height}`;
  const [x, y, vWidth, vHeight] = viewBox.split(" ").map(parseFloat);
  const paddingX = padding * (vWidth / width);
  const paddingY = padding * (vHeight / height);

  svgEl.setAttribute(
    "viewBox",
    `${x - paddingX} ${y - paddingY} ${vWidth + 2 * paddingX} ${vHeight + 2 * paddingY}`
  );
  svgEl.setAttribute("width", newWidth.toString());
  svgEl.setAttribute("height", newHeight.toString());

  return new XMLSerializer().serializeToString(svgEl);
}
