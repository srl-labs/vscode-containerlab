// Node-to-SVG conversion for export.
import type { Node } from "@xyflow/react";

import type { NodeType } from "../../../icons/SvgGenerator";
import { generateEncodedSVG } from "../../../icons/SvgGenerator";

import {
  NODE_ICON_SIZE,
  NODE_ICON_RADIUS,
  NODE_LABEL,
  DEFAULT_ICON_COLOR,
  getNetworkTypeColor,
  getRoleSvgType,
  escapeXml,
} from "./constants";

// ============================================================================
// Types
// ============================================================================

/** Custom icons map type (icon name -> data URI) */
export type CustomIconMap = Map<string, string>;

export interface NodeSvgRenderOptions {
  nodeIconSize?: number;
}

interface TopologyNodeData {
  label?: string;
  role?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  labelPosition?: string;
  direction?: string;
  labelBackgroundColor?: string;
  [key: string]: unknown;
}

interface NetworkNodeData {
  label?: string;
  nodeType?: string;
  labelPosition?: string;
  direction?: string;
  labelBackgroundColor?: string;
  [key: string]: unknown;
}

const NODE_TYPE_SET: ReadonlySet<string> = new Set([
  "pe",
  "dcgw",
  "leaf",
  "switch",
  "spine",
  "super-spine",
  "server",
  "pon",
  "controller",
  "rgw",
  "ue",
  "cloud",
  "client",
  "bridge",
]);

function isNodeType(value: string): value is NodeType {
  return NODE_TYPE_SET.has(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveNodeIconSize(nodeIconSize: number | undefined): number {
  if (typeof nodeIconSize !== "number" || !Number.isFinite(nodeIconSize)) return NODE_ICON_SIZE;
  return clamp(nodeIconSize, 12, 240);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Decode a data URI SVG and extract the inner content
 * Returns the SVG content ready for embedding
 */
function decodeSvgDataUri(dataUri: string): string {
  if (!dataUri.startsWith("data:image/svg+xml")) {
    return "";
  }
  const encoded = dataUri.replace(/^data:image\/svg\+xml[^,]*,/, "");
  return decodeURIComponent(encoded);
}

/**
 * Extract SVG inner content (everything inside the <svg> tags)
 * and transform it for embedding at a target size
 */
function extractSvgContent(svgString: string, targetSize: number): string {
  // Parse the SVG to get viewBox or size
  const viewBoxMatch = /viewBox="([^"]+)"/.exec(svgString);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 120 120";
  const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(parseFloat);

  // Calculate scale to fit targetSize
  const scaleX = targetSize / (vbWidth || 120);
  const scaleY = targetSize / (vbHeight || 120);
  const scale = Math.min(scaleX, scaleY);

  // Extract inner content (between <svg> and </svg>)
  const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(svgString);
  if (!innerMatch) return "";

  let inner = innerMatch[1];

  // Remove <style> tags and apply inline styles
  inner = inner.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Replace class="st0" with fill attribute (background rect)
  inner = inner.replace(/class="st0"/g, 'fill="currentColor"');

  // Replace class="st1" with white stroke styling
  inner = inner.replace(
    /class="st1"/g,
    'fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"'
  );

  // Replace class="st2" for filled elements
  inner = inner.replace(/class="st2"/g, 'fill="#FFFFFF" stroke="#FFFFFF" stroke-width="4"');

  return `<g transform="scale(${scale.toFixed(4)})">${inner}</g>`;
}

function normalizeNodeLabelPosition(value: unknown): "top" | "right" | "bottom" | "left" {
  switch (value) {
    case "top":
    case "right":
    case "left":
      return value;
    default:
      return "bottom";
  }
}

function getNodeDirectionRotation(value: unknown): number {
  switch (value) {
    case "up":
      return 270;
    case "right":
      return 0;
    case "down":
      return 90;
    case "left":
      return 180;
    default:
      return 0;
  }
}

// ============================================================================
// Node Label Builder
// ============================================================================

/**
 * Build SVG for node label with background and text shadow
 * Positioned around the icon.
 */
export function buildNodeLabelSvg(
  label: string,
  iconX: number,
  iconY: number,
  iconSize: number,
  position?: string,
  direction?: string,
  labelBackgroundColor?: string
): string {
  if (!label) return "";

  // Estimate text width (rough approximation)
  const charWidth = NODE_LABEL.fontSize * 0.6;
  const textWidth = Math.min(label.length * charWidth, NODE_LABEL.maxWidth);
  const bgWidth = textWidth + NODE_LABEL.paddingX * 2;
  const bgHeight = NODE_LABEL.fontSize + NODE_LABEL.paddingY * 2 + 2;
  const iconCenterX = iconX + iconSize / 2;
  const iconCenterY = iconY + iconSize / 2;
  const gap = NODE_LABEL.marginTop;
  const textRotation = getNodeDirectionRotation(direction);
  const isVerticalText = textRotation === 90 || textRotation === 270;
  const verticalGap = gap + (isVerticalText ? 2 : 0);
  const sideOverlap = isVerticalText ? 2 : 6;

  const resolvedPosition = normalizeNodeLabelPosition(position);

  let bgX = iconCenterX - bgWidth / 2;
  let bgY = iconY + iconSize + verticalGap;

  switch (resolvedPosition) {
    case "top":
      bgY = iconY - bgHeight - verticalGap;
      break;
    case "right":
      bgX = iconX + iconSize - sideOverlap;
      bgY = iconCenterY - bgHeight / 2;
      break;
    case "left":
      bgX = iconX - bgWidth + sideOverlap;
      bgY = iconCenterY - bgHeight / 2;
      break;
  }

  const textX = bgX + bgWidth / 2;
  const textY = bgY + NODE_LABEL.paddingY + NODE_LABEL.fontSize * 0.8;
  const textCenterY = bgY + bgHeight / 2;

  // Truncate label if too long
  let displayLabel = label;
  if (label.length * charWidth > NODE_LABEL.maxWidth) {
    const maxChars = Math.floor(NODE_LABEL.maxWidth / charWidth) - 1;
    displayLabel = label.slice(0, maxChars) + "…";
  }

  let svg = "";
  if (textRotation !== 0) {
    svg += `<g transform="rotate(${textRotation} ${textX} ${textCenterY})">`;
  }

  const bgColor =
    typeof labelBackgroundColor === "string" && labelBackgroundColor.trim().length > 0
      ? labelBackgroundColor.trim()
      : NODE_LABEL.backgroundColor;
  // Background rect
  svg += `<rect x="${bgX}" y="${bgY}" width="${bgWidth}" height="${bgHeight}" `;
  svg += `fill="${bgColor}" rx="${NODE_LABEL.borderRadius}" ry="${NODE_LABEL.borderRadius}"/>`;

  // Label text with shadow filter
  svg += `<text x="${textX}" y="${textY}" `;
  svg += `font-size="${NODE_LABEL.fontSize}" font-weight="${NODE_LABEL.fontWeight}" `;
  svg += `font-family="system-ui, -apple-system, sans-serif" `;
  svg += `fill="${NODE_LABEL.color}" text-anchor="middle" `;
  svg += `stroke="${NODE_LABEL.textStrokeColor}" stroke-width="${NODE_LABEL.textStrokeWidth}" `;
  svg += `paint-order="stroke" stroke-linejoin="round" `;
  svg += `filter="url(#text-shadow)">`;
  svg += escapeXml(displayLabel);
  svg += `</text>`;
  if (textRotation !== 0) {
    svg += `</g>`;
  }

  return svg;
}

// ============================================================================
// Topology Node Builder
// ============================================================================

/**
 * Render a topology node (router, switch, etc.) to SVG
 */
export function topologyNodeToSvg(
  node: Node,
  customIconMap?: CustomIconMap,
  nodeIconSize: number = NODE_ICON_SIZE
): string {
  const data = node.data as TopologyNodeData;
  const iconSize = resolveNodeIconSize(nodeIconSize);
  const x = node.position.x;
  const y = node.position.y;
  const label = data.label ?? node.id;
  const role = data.role ?? "pe";
  const iconColor = data.iconColor ?? DEFAULT_ICON_COLOR;
  const cornerRadius = data.iconCornerRadius ?? NODE_ICON_RADIUS;
  const labelPosition = data.labelPosition;
  const directionRotation = getNodeDirectionRotation(data.direction);

  // Check for custom icon first
  let iconSvgContent = "";
  const customDataUri = customIconMap?.get(role);

  if (customDataUri !== undefined && customDataUri.length > 0) {
    // Custom icon - decode and embed
    const svgString = decodeSvgDataUri(customDataUri);
    iconSvgContent = extractSvgContent(svgString, iconSize);
  } else {
    // Built-in icon
    const roleSvgType = getRoleSvgType(role);
    const svgType = isNodeType(roleSvgType) ? roleSvgType : "pe";
    const dataUri = generateEncodedSVG(svgType, iconColor);
    const svgString = decodeSvgDataUri(dataUri);
    iconSvgContent = extractSvgContent(svgString, iconSize);
  }

  let svg = `<g class="export-node topology-node" data-id="${escapeXml(node.id)}">`;
  const centerX = x + iconSize / 2;
  const centerY = y + iconSize / 2;
  svg += `<g transform="rotate(${directionRotation} ${centerX} ${centerY})">`;

  // Background rect with fill color (rendered by the icon's st0 class)
  svg += `<rect x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" `;
  svg += `rx="${cornerRadius}" ry="${cornerRadius}" fill="${iconColor}"/>`;

  // Icon content (transformed to fit)
  svg += `<g transform="translate(${x}, ${y})" style="color: ${iconColor}">`;
  svg += iconSvgContent;
  svg += `</g>`;
  svg += `</g>`;

  // Label
  svg += buildNodeLabelSvg(
    label,
    x,
    y,
    iconSize,
    labelPosition,
    data.direction,
    data.labelBackgroundColor
  );

  svg += `</g>`;
  return svg;
}

// ============================================================================
// Network Node Builder
// ============================================================================

/**
 * Render a network node (host, mgmt-net, etc.) to SVG
 * Network nodes use the cloud icon with type-based colors
 */
export function networkNodeToSvg(node: Node, nodeIconSize: number = NODE_ICON_SIZE): string {
  const data = node.data as NetworkNodeData;
  const iconSize = resolveNodeIconSize(nodeIconSize);
  const x = node.position.x;
  const y = node.position.y;
  const label = data.label ?? node.id;
  const nodeType = data.nodeType ?? "host";
  const iconColor = getNetworkTypeColor(nodeType);
  const labelPosition = data.labelPosition;
  const directionRotation = getNodeDirectionRotation(data.direction);

  // Generate cloud icon
  const dataUri = generateEncodedSVG("cloud", iconColor);
  const svgString = decodeSvgDataUri(dataUri);
  const iconSvgContent = extractSvgContent(svgString, iconSize);

  let svg = `<g class="export-node network-node" data-id="${escapeXml(node.id)}">`;
  const centerX = x + iconSize / 2;
  const centerY = y + iconSize / 2;
  svg += `<g transform="rotate(${directionRotation} ${centerX} ${centerY})">`;

  // Background rect
  svg += `<rect x="${x}" y="${y}" width="${iconSize}" height="${iconSize}" `;
  svg += `rx="${NODE_ICON_RADIUS}" ry="${NODE_ICON_RADIUS}" fill="${iconColor}"/>`;

  // Icon content
  svg += `<g transform="translate(${x}, ${y})" style="color: ${iconColor}">`;
  svg += iconSvgContent;
  svg += `</g>`;
  svg += `</g>`;

  // Label (network nodes use slightly smaller font)
  svg += buildNodeLabelSvg(
    label,
    x,
    y,
    iconSize,
    labelPosition,
    data.direction,
    data.labelBackgroundColor
  );

  svg += `</g>`;
  return svg;
}

// ============================================================================
// Batch Renderer
// ============================================================================

/**
 * Render all nodes to SVG
 * Filters out annotation nodes and returns combined SVG string
 */
export function renderNodesToSvg(
  nodes: Node[],
  customIconMap?: CustomIconMap,
  annotationNodeTypes?: Set<string>,
  renderOptions?: NodeSvgRenderOptions
): string {
  const nodeIconSize = resolveNodeIconSize(renderOptions?.nodeIconSize);
  const skipTypes =
    annotationNodeTypes ??
    new Set(["free-text-annotation", "free-shape-annotation", "group-annotation"]);

  let svg = "";

  for (const node of nodes) {
    const nodeType = node.type ?? "";

    // Skip annotation nodes
    if (skipTypes.has(nodeType)) continue;

    // Render based on node type
    if (nodeType === "network-node") {
      svg += networkNodeToSvg(node, nodeIconSize);
    } else {
      svg += topologyNodeToSvg(node, customIconMap, nodeIconSize);
    }
  }

  return svg;
}
