// Annotation-to-SVG conversion for export.
import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
} from "../../../../shared/types/topology";
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_LINE_LENGTH,
} from "../../../annotations/constants";
import { applyAlphaToColor } from "../../../utils/color";
import { renderMarkdown } from "../../../utils/markdownRenderer";

// ============================================================================
// Constants
// ============================================================================

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_MIME_TYPE = "image/svg+xml";
const ANNOTATION_GROUPS_LAYER = "annotation-groups-layer";
const ANNOTATION_SHAPES_LAYER = "annotation-shapes-layer";
const ANNOTATION_TEXT_LAYER = "annotation-text-layer";
const DEFAULT_FONT_FAMILY = "sans-serif";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBorderDashArray(style?: FreeShapeAnnotation["borderStyle"]): string {
  switch (style) {
    case "dashed":
      return "8,4"; // Match FreeShapeNode.tsx getStrokeDasharray()
    case "dotted":
      return "2,2";
    default:
      return "";
  }
}

function getGroupBorderDashArray(style?: GroupStyleAnnotation["borderStyle"]): string {
  switch (style) {
    case "dashed":
      return "8,4"; // Match FreeShapeNode.tsx getStrokeDasharray()
    case "dotted":
      return "2,2";
    case "double":
      return ""; // Double style not directly supported in SVG dash, render as solid
    default:
      return "";
  }
}

interface ShapeStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  dashArray: string;
}

function getShapeStyle(shape: FreeShapeAnnotation): ShapeStyle {
  return {
    fillColor: applyAlphaToColor(
      shape.fillColor ?? DEFAULT_FILL_COLOR,
      shape.fillOpacity ?? DEFAULT_FILL_OPACITY
    ),
    strokeColor: shape.borderColor ?? DEFAULT_BORDER_COLOR,
    strokeWidth: shape.borderWidth ?? DEFAULT_BORDER_WIDTH,
    dashArray: getBorderDashArray(shape.borderStyle ?? DEFAULT_BORDER_STYLE),
  };
}

function buildRectAttrs(style: ShapeStyle, cornerRadius: number): string {
  let attrs = `fill="${style.fillColor}" stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" `;
  if (cornerRadius > 0) attrs += `rx="${cornerRadius}" ry="${cornerRadius}" `;
  if (style.dashArray) attrs += `stroke-dasharray="${style.dashArray}" `;
  return attrs;
}

function buildStrokeAttrs(style: ShapeStyle): string {
  let attrs = `stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" `;
  if (style.dashArray) attrs += `stroke-dasharray="${style.dashArray}" `;
  return attrs;
}

// ============================================================================
// Group to SVG
// ============================================================================

interface LabelPosition {
  x: number;
  y: number;
  textAnchor: string;
}

interface GroupRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate label position based on labelPosition property.
 * Matches GroupNode.tsx getLabelPositionStyle() CSS offsets:
 * - top positions: top: -20, left/right: 8
 * - bottom positions: bottom: -20, left/right: 8
 */
function calculateLabelPosition(
  rect: GroupRect,
  labelPosition: string,
  labelFontSize: number
): LabelPosition {
  const { x, y, width, height } = rect;
  // Match CSS offsets from GroupNode.tsx: top: -20, left: 8
  const topOffset = 20;
  const sideOffset = 8;

  const positions: Record<string, LabelPosition> = {
    "top-left": { x: x + sideOffset, y: y - topOffset + labelFontSize, textAnchor: "start" },
    "top-center": { x: x + width / 2, y: y - topOffset + labelFontSize, textAnchor: "middle" },
    "top-right": { x: x + width - sideOffset, y: y - topOffset + labelFontSize, textAnchor: "end" },
    "bottom-left": { x: x + sideOffset, y: y + height + topOffset, textAnchor: "start" },
    "bottom-center": { x: x + width / 2, y: y + height + topOffset, textAnchor: "middle" },
    "bottom-right": { x: x + width - sideOffset, y: y + height + topOffset, textAnchor: "end" },
  };

  return positions[labelPosition] ?? positions["top-left"];
}

/**
 * Build SVG for group label (no background - matches GroupNode.tsx).
 * Uses MODEL coordinates - the parent transform handles scaling.
 */
function buildGroupLabelSvg(
  name: string,
  labelPos: LabelPosition,
  labelColor: string,
  labelFontSize: number
): string {
  // No background rect - canvas GroupNode.tsx doesn't have one
  let svg = `<text x="${labelPos.x}" y="${labelPos.y}" `;
  svg += `fill="${labelColor}" font-size="${labelFontSize}" font-weight="500" `;
  svg += `font-family="${DEFAULT_FONT_FAMILY}" text-anchor="${labelPos.textAnchor}">`;
  svg += escapeXml(name);
  svg += `</text>`;

  return svg;
}

/**
 * Convert a GroupStyleAnnotation to an SVG string.
 * Groups are rendered as rectangles with optional label.
 * NOTE: Uses MODEL coordinates - the parent transform handles scaling.
 * Group position represents the CENTER of the group (same as canvas rendering).
 */
function groupToSvgString(group: GroupStyleAnnotation): string {
  const width = group.width;
  const height = group.height;
  // Group position is CENTER-based, convert to top-left for SVG rect
  const x = group.position.x - group.width / 2;
  const y = group.position.y - group.height / 2;

  const bgColor = group.backgroundColor ?? "#d9d9d9";
  const bgOpacity = (group.backgroundOpacity ?? 20) / 100;
  const fillColor = bgColor === "transparent" ? "none" : applyAlphaToColor(bgColor, bgOpacity);

  const borderColor = group.borderColor ?? "#dddddd";
  const borderWidth = group.borderWidth ?? 0.5;
  const borderRadius = group.borderRadius ?? 0;
  const dashArray = getGroupBorderDashArray(group.borderStyle);

  let svg = `<g class="annotation-group" data-id="${escapeXml(group.id)}">`;
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" `;
  svg += `fill="${fillColor}" stroke="${borderColor}" stroke-width="${borderWidth}" `;
  if (borderRadius > 0) svg += `rx="${borderRadius}" ry="${borderRadius}" `;
  if (dashArray) svg += `stroke-dasharray="${dashArray}" `;
  svg += `/>`;

  if (group.name) {
    // Match GroupNode.tsx: fontSize 12, fontWeight 500, no background
    const labelFontSize = 12;
    const labelPos = calculateLabelPosition(
      { x, y, width, height },
      group.labelPosition ?? "top-left",
      labelFontSize
    );
    // Use #666 as default label color (matches DEFAULT_LABEL_COLOR in GroupNode.tsx)
    svg += buildGroupLabelSvg(group.name, labelPos, group.labelColor ?? "#666", labelFontSize);
  }

  svg += `</g>`;
  return svg;
}

// ============================================================================
// Shape to SVG - Subcomponents
// ============================================================================

function makeArrowPoints(
  arrowSize: number,
  x: number,
  y: number,
  fromX: number,
  fromY: number
): string {
  const angle = Math.atan2(y - fromY, x - fromX);
  const arrowAngle = Math.PI / 6;
  const p1x = x - arrowSize * Math.cos(angle - arrowAngle);
  const p1y = y - arrowSize * Math.sin(angle - arrowAngle);
  const p3x = x - arrowSize * Math.cos(angle + arrowAngle);
  const p3y = y - arrowSize * Math.sin(angle + arrowAngle);
  return `${p1x},${p1y} ${x},${y} ${p3x},${p3y}`;
}

function buildRectangleSvg(shape: FreeShapeAnnotation): string {
  const style = getShapeStyle(shape);
  const width = shape.width ?? 50;
  const height = shape.height ?? 50;
  // Shape position is CENTER-based on canvas (uses translate(-50%, -50%))
  // Convert to top-left corner for SVG
  const x = shape.position.x - width / 2;
  const y = shape.position.y - height / 2;
  const cornerRadius = shape.cornerRadius ?? 0;
  const rotation = shape.rotation ?? 0;
  // Center point for rotation
  const cx = shape.position.x;
  const cy = shape.position.y;

  let svg = `<g class="annotation-shape" data-id="${escapeXml(shape.id)}"`;
  if (rotation !== 0) svg += ` transform="rotate(${rotation}, ${cx}, ${cy})"`;
  svg += `>`;
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${buildRectAttrs(style, cornerRadius)}/>`;
  svg += `</g>`;
  return svg;
}

function buildCircleSvg(shape: FreeShapeAnnotation): string {
  const style = getShapeStyle(shape);
  const width = shape.width ?? 50;
  const height = shape.height ?? 50;
  // Shape position is CENTER-based on canvas (uses translate(-50%, -50%))
  // For ellipse, cx/cy are the center coordinates, which is exactly the position
  const cx = shape.position.x;
  const cy = shape.position.y;
  const rx = width / 2;
  const ry = height / 2;
  const rotation = shape.rotation ?? 0;

  let svg = `<g class="annotation-shape" data-id="${escapeXml(shape.id)}"`;
  if (rotation !== 0) svg += ` transform="rotate(${rotation}, ${cx}, ${cy})"`;
  svg += `>`;
  svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${style.fillColor}" ${buildStrokeAttrs(style)}/>`;
  svg += `</g>`;
  return svg;
}

function buildLineSvg(shape: FreeShapeAnnotation): string {
  const style = getShapeStyle(shape);
  const startX = shape.position.x;
  const startY = shape.position.y;
  const endX = shape.endPosition?.x ?? shape.position.x + DEFAULT_LINE_LENGTH;
  const endY = shape.endPosition?.y ?? shape.position.y;
  const arrowSize = shape.lineArrowSize ?? DEFAULT_ARROW_SIZE;

  // Shorten line ends if arrows are present
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  let lineStartX = startX,
    lineStartY = startY,
    lineEndX = endX,
    lineEndY = endY;

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    if (shape.lineStartArrow === true) {
      lineStartX += ux * arrowSize * 0.7;
      lineStartY += uy * arrowSize * 0.7;
    }
    if (shape.lineEndArrow === true) {
      lineEndX -= ux * arrowSize * 0.7;
      lineEndY -= uy * arrowSize * 0.7;
    }
  }

  let svg = `<g class="annotation-shape" data-id="${escapeXml(shape.id)}">`;
  svg += `<line x1="${lineStartX}" y1="${lineStartY}" x2="${lineEndX}" y2="${lineEndY}" ${buildStrokeAttrs(style)}/>`;

  if (shape.lineStartArrow === true) {
    svg += `<polygon points="${makeArrowPoints(arrowSize, startX, startY, endX, endY)}" fill="${style.strokeColor}" />`;
  }
  if (shape.lineEndArrow === true) {
    svg += `<polygon points="${makeArrowPoints(arrowSize, endX, endY, startX, startY)}" fill="${style.strokeColor}" />`;
  }

  svg += `</g>`;
  return svg;
}

/**
 * Convert a FreeShapeAnnotation to an SVG string.
 * NOTE: Uses MODEL coordinates - the parent transform handles scaling.
 */
function shapeToSvgString(shape: FreeShapeAnnotation): string {
  switch (shape.shapeType) {
    case "rectangle":
      return buildRectangleSvg(shape);
    case "circle":
      return buildCircleSvg(shape);
    case "line":
    default:
      return buildLineSvg(shape);
  }
}

// ============================================================================
// Text to SVG
// ============================================================================

interface TextStyle {
  fontSize: number;
  fontColor: string;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  textAlign: string;
  fontFamily: string;
  backgroundColor: string;
  borderRadius: number;
  padding: number;
}

function getTextStyle(text: FreeTextAnnotation): TextStyle {
  // Match FreeTextNode.tsx buildTextStyle() defaults
  return {
    fontSize: text.fontSize ?? 14,
    fontColor: text.fontColor ?? "#333", // Match FreeTextNode default
    fontWeight: text.fontWeight ?? "normal",
    fontStyle: text.fontStyle ?? "normal",
    textDecoration: text.textDecoration ?? "none",
    textAlign: text.textAlign ?? "left",
    fontFamily: text.fontFamily ?? "inherit", // Match FreeTextNode default
    backgroundColor: text.backgroundColor ?? "transparent",
    borderRadius: text.roundedBackground === true ? 4 : 0,
    padding: 4, // Base padding; increases to 8px horizontal when backgroundColor set
  };
}

function buildTextStyleString(style: TextStyle): string {
  let css = `width: 100%; height: 100%; overflow: hidden; `;
  css += `font-size: ${style.fontSize}px; color: ${style.fontColor}; `;
  css += `font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; `;
  css += `text-decoration: ${style.textDecoration}; text-align: ${style.textAlign}; `;
  css += `font-family: ${style.fontFamily}; `;
  css += `background-color: ${style.backgroundColor}; `;
  if (style.borderRadius > 0) css += `border-radius: ${style.borderRadius}px; `;
  css += `box-sizing: border-box; padding: ${style.padding}px;`;
  return css;
}

/**
 * Estimate text dimensions based on content and font properties.
 * Returns { width, height } in unscaled coordinates.
 */
function estimateTextDimensions(
  textContent: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string
): { width: number; height: number } {
  // Split into lines for multi-line text
  const lines = textContent.split("\n");
  const lineCount = Math.max(1, lines.length);

  // Find the longest line
  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), "");

  // Character width multiplier based on font family
  // Monospace fonts have consistent width, proportional fonts vary
  const isMonospace = fontFamily.toLowerCase().includes("mono");
  const charWidthRatio = isMonospace ? 0.6 : 0.55;

  // Bold text is slightly wider
  const boldMultiplier = fontWeight === "bold" ? 1.1 : 1.0;

  // Calculate dimensions
  const charWidth = fontSize * charWidthRatio * boldMultiplier;
  const lineHeight = fontSize * 1.4; // Standard line height

  // Add padding (8px on each side = 16px total)
  const padding = 16;
  const width = Math.max(50, longestLine.length * charWidth + padding);
  const height = Math.max(fontSize + padding, lineCount * lineHeight + padding);

  return { width, height };
}

/**
 * Convert a FreeTextAnnotation to an SVG string using foreignObject.
 * This preserves markdown rendering and styling.
 * NOTE: Uses MODEL coordinates - the parent transform handles scaling.
 * Text position represents the TOP-LEFT of the annotation (React Flow convention).
 */
function textToSvgString(text: FreeTextAnnotation): string {
  // Use explicit dimensions if provided, otherwise estimate from content
  let width: number;
  let height: number;

  if (text.width !== undefined && text.height !== undefined) {
    width = text.width;
    height = text.height;
  } else {
    const estimated = estimateTextDimensions(
      text.text || "",
      text.fontSize ?? 14,
      text.fontFamily ?? "inherit",
      text.fontWeight ?? "normal"
    );
    width = text.width ?? estimated.width;
    height = text.height ?? estimated.height;
  }

  // Text position is TOP-LEFT based in React Flow
  // Use position directly for SVG foreignObject
  const x = text.position.x;
  const y = text.position.y;

  const rotation = text.rotation ?? 0;
  // Center point for rotation
  const cx = text.position.x + width / 2;
  const cy = text.position.y + height / 2;

  const style = getTextStyle(text);
  const styleStr = buildTextStyleString(style);
  const htmlContent = renderMarkdown(text.text || "");

  let svg = `<g class="annotation-text" data-id="${escapeXml(text.id)}"`;
  if (rotation !== 0) svg += ` transform="rotate(${rotation}, ${cx}, ${cy})"`;
  svg += `>`;

  svg += `<foreignObject x="${x}" y="${y}" width="${width}" height="${height}">`;
  svg += `<div xmlns="${XHTML_NS}" style="${styleStr}">`;
  svg += htmlContent;
  svg += `</div>`;
  svg += `</foreignObject>`;
  svg += `</g>`;

  return svg;
}

// ============================================================================
// Composite into SVG
// ============================================================================

export interface AnnotationData {
  groups: GroupStyleAnnotation[];
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
}

/**
 * Add a background rectangle to the SVG content.
 * Handles both SVGs with viewBox and those with only width/height.
 */
export function addBackgroundRect(svgContent: string, color: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, SVG_MIME_TYPE);
  const svgEl = doc.documentElement;

  const viewBox = svgEl.getAttribute("viewBox");
  let x = 0,
    y = 0,
    width = 0,
    height = 0;

  if (viewBox !== null && viewBox.length > 0) {
    [x, y, width, height] = viewBox.split(" ").map(parseFloat);
  } else {
    // Fall back to width/height attributes
    width = parseFloat(svgEl.getAttribute("width") ?? "0");
    height = parseFloat(svgEl.getAttribute("height") ?? "0");
    if (width === 0 || height === 0) return svgContent;
  }

  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", x.toString());
  rect.setAttribute("y", y.toString());
  rect.setAttribute("width", width.toString());
  rect.setAttribute("height", height.toString());
  rect.setAttribute("fill", color);

  svgEl.insertBefore(rect, svgEl.firstChild);

  return new XMLSerializer().serializeToString(svgEl);
}

function parseAndImportElement(doc: Document, parser: DOMParser, svgStr: string): Element | null {
  const tempDoc = parser.parseFromString(`<svg xmlns="${SVG_NS}">${svgStr}</svg>`, SVG_MIME_TYPE);
  const element = tempDoc.documentElement.firstChild;
  if (!(element instanceof Element)) return null;
  const imported = doc.importNode(element, true);
  return imported instanceof Element ? imported : null;
}

/**
 * Extract the full transform attribute from the SVG's main group.
 * Returns the complete transform string including all translates and scale.
 */
function extractGraphTransform(svgEl: Element): string {
  // Find the main content group with transform (should have scale for exports)
  const groups = svgEl.querySelectorAll("g[transform]");
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const transform = group.getAttribute("transform") ?? "";
    // Look for the main group which has scale in its transform
    if (transform.includes("scale(")) {
      return transform;
    }
  }

  // Fallback: find any group with a translate transform
  const firstGroup = svgEl.querySelector("g[transform]");
  return firstGroup?.getAttribute("transform") ?? "";
}

/**
 * Parse transform to extract scale value for bounds calculation.
 */
function extractScaleFromTransform(transform: string): number {
  const scaleMatch = /scale\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)/.exec(transform);
  return scaleMatch ? parseFloat(scaleMatch[1]) : 1;
}

/**
 * Parse transform to extract the total translate values for bounds calculation.
 * Sums all translate operations in the transform string.
 */
function extractTranslateFromTransform(transform: string): { tx: number; ty: number } {
  let totalTx = 0;
  let totalTy = 0;

  const translateRegex = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
  let match;
  while ((match = translateRegex.exec(transform)) !== null) {
    totalTx += parseFloat(match[1]);
    totalTy += parseFloat(match[2]);
  }

  return { tx: totalTx, ty: totalTy };
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Merge a rect (x1,y1,x2,y2) into bounds */
function mergeBounds(bounds: BoundingBox, x1: number, y1: number, x2: number, y2: number): void {
  bounds.minX = Math.min(bounds.minX, x1);
  bounds.minY = Math.min(bounds.minY, y1);
  bounds.maxX = Math.max(bounds.maxX, x2);
  bounds.maxY = Math.max(bounds.maxY, y2);
}

/** Calculate bounds for a center-based rect (in model coordinates) */
function getCenterBasedBounds(cx: number, cy: number, w: number, h: number) {
  const halfW = w / 2;
  const halfH = h / 2;
  return {
    x1: cx - halfW,
    y1: cy - halfH,
    x2: cx + halfW,
    y2: cy + halfH,
  };
}

function addGroupBounds(bounds: BoundingBox, groups: GroupStyleAnnotation[]): void {
  for (const group of groups) {
    const b = getCenterBasedBounds(group.position.x, group.position.y, group.width, group.height);
    mergeBounds(bounds, b.x1, b.y1, b.x2, b.y2);
  }
}

function addShapeBounds(bounds: BoundingBox, shapes: FreeShapeAnnotation[]): void {
  for (const shape of shapes) {
    if (shape.shapeType === "line") {
      const x1 = shape.position.x;
      const y1 = shape.position.y;
      const x2 = shape.endPosition?.x ?? shape.position.x;
      const y2 = shape.endPosition?.y ?? shape.position.y;
      mergeBounds(bounds, Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
    } else {
      const b = getCenterBasedBounds(
        shape.position.x,
        shape.position.y,
        shape.width ?? 50,
        shape.height ?? 50
      );
      mergeBounds(bounds, b.x1, b.y1, b.x2, b.y2);
    }
  }
}

function getTextDimensions(text: FreeTextAnnotation): { w: number; h: number } {
  if (text.width !== undefined && text.height !== undefined) {
    return { w: text.width, h: text.height };
  }
  const estimated = estimateTextDimensions(
    text.text || "",
    text.fontSize ?? 14,
    text.fontFamily ?? "sans-serif",
    text.fontWeight ?? "normal"
  );
  return { w: text.width ?? estimated.width, h: text.height ?? estimated.height };
}

function addTextBounds(bounds: BoundingBox, texts: FreeTextAnnotation[]): void {
  for (const text of texts) {
    const { w, h } = getTextDimensions(text);
    // Text position is TOP-LEFT based (React Flow convention)
    const x1 = text.position.x;
    const y1 = text.position.y;
    const x2 = text.position.x + w;
    const y2 = text.position.y + h;
    mergeBounds(bounds, x1, y1, x2, y2);
  }
}

/**
 * Calculate bounding box for all annotations (in MODEL coordinates).
 * NOTE: All annotation positions are CENTER-based on canvas.
 */
function calculateAnnotationsBounds(annotations: AnnotationData): BoundingBox {
  const bounds: BoundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  addGroupBounds(bounds, annotations.groups);
  addShapeBounds(bounds, annotations.shapeAnnotations);
  addTextBounds(bounds, annotations.textAnnotations);
  return bounds;
}

function shiftGroupTransforms(svgEl: Element, shiftX: number, shiftY: number): void {
  const children = svgEl.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName === "g") {
      const existingTransform = child.getAttribute("transform") ?? "";
      const newTransform = existingTransform
        ? `translate(${shiftX}, ${shiftY}) ${existingTransform}`
        : `translate(${shiftX}, ${shiftY})`;
      child.setAttribute("transform", newTransform);
    }
  }
}

function shiftBackgroundRect(
  svgEl: Element,
  shiftX: number,
  shiftY: number,
  newWidth: number,
  newHeight: number
): void {
  const bgRect = svgEl.querySelector("rect");
  if (bgRect && !bgRect.closest("g")) {
    const rectX = parseFloat(bgRect.getAttribute("x") ?? "0");
    const rectY = parseFloat(bgRect.getAttribute("y") ?? "0");
    bgRect.setAttribute("x", (rectX + shiftX).toString());
    bgRect.setAttribute("y", (rectY + shiftY).toString());
    bgRect.setAttribute("width", newWidth.toString());
    bgRect.setAttribute("height", newHeight.toString());
  }
}

/**
 * Expand SVG dimensions to include annotation bounds.
 * @param transform - The full transform string from the graph
 */
function expandSvgBounds(svgEl: Element, annotationBounds: BoundingBox, transform: string): void {
  const currentWidth = parseFloat(svgEl.getAttribute("width") ?? "0");
  const currentHeight = parseFloat(svgEl.getAttribute("height") ?? "0");

  // Extract translate and scale from the transform
  const { tx, ty } = extractTranslateFromTransform(transform);
  const scale = extractScaleFromTransform(transform);

  // Transform annotation bounds from model coordinates to SVG coordinates
  // The transform applies scale THEN translate, so:
  // SVG_x = model_x * scale + tx
  const margin = 20;
  const annMinX = annotationBounds.minX * scale + tx - margin;
  const annMinY = annotationBounds.minY * scale + ty - margin;
  const annMaxX = annotationBounds.maxX * scale + tx + margin;
  const annMaxY = annotationBounds.maxY * scale + ty + margin;

  // Combined bounds
  const newMinX = Math.min(0, annMinX);
  const newMinY = Math.min(0, annMinY);
  const newMaxX = Math.max(currentWidth, annMaxX);
  const newMaxY = Math.max(currentHeight, annMaxY);

  const newWidth = newMaxX - newMinX;
  const newHeight = newMaxY - newMinY;
  const needsExpansion =
    newMinX < 0 || newMinY < 0 || newWidth > currentWidth || newHeight > currentHeight;

  if (!needsExpansion) return;

  svgEl.setAttribute("width", newWidth.toString());
  svgEl.setAttribute("height", newHeight.toString());

  // If we expanded to negative coordinates, shift all content
  if (newMinX < 0 || newMinY < 0) {
    const shiftX = newMinX < 0 ? -newMinX : 0;
    const shiftY = newMinY < 0 ? -newMinY : 0;

    shiftGroupTransforms(svgEl, shiftX, shiftY);
    shiftBackgroundRect(svgEl, shiftX, shiftY, newWidth, newHeight);
  }
}

/**
 * Composite annotations into an existing graph SVG.
 * Annotations are inserted in z-order: groups (background), shapes, text (foreground).
 * The graph transform is extracted and applied to annotation layers so they
 * use the same coordinate system as the graph nodes (model coordinates).
 */
export function compositeAnnotationsIntoSvg(
  graphSvg: string,
  annotations: AnnotationData,
  _scale: number // Kept for API compatibility but not used - scale comes from transform
): string {
  const { groups, textAnnotations, shapeAnnotations } = annotations;

  // Skip if no annotations
  if (groups.length === 0 && textAnnotations.length === 0 && shapeAnnotations.length === 0) {
    return graphSvg;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(graphSvg, SVG_MIME_TYPE);
  const svgEl = doc.documentElement;

  // Extract the FULL transform from graph content (including all translates and scale)
  // This ensures annotations use the exact same coordinate system as graph nodes
  const transform = extractGraphTransform(svgEl);

  // Create annotation layer groups with the SAME transform as graph content
  const groupsLayer = doc.createElementNS(SVG_NS, "g");
  groupsLayer.setAttribute("class", ANNOTATION_GROUPS_LAYER);
  groupsLayer.setAttribute("transform", transform);

  const shapesLayer = doc.createElementNS(SVG_NS, "g");
  shapesLayer.setAttribute("class", ANNOTATION_SHAPES_LAYER);
  shapesLayer.setAttribute("transform", transform);

  const textLayer = doc.createElementNS(SVG_NS, "g");
  textLayer.setAttribute("class", ANNOTATION_TEXT_LAYER);
  textLayer.setAttribute("transform", transform);

  // Sort by zIndex
  const sortedGroups = [...groups].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const sortedShapes = [...shapeAnnotations].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const sortedText = [...textAnnotations].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Render groups (in model coordinates - the transform handles scaling)
  for (const group of sortedGroups) {
    const element = parseAndImportElement(doc, parser, groupToSvgString(group));
    if (element) groupsLayer.appendChild(element);
  }

  // Render shapes
  for (const shape of sortedShapes) {
    const element = parseAndImportElement(doc, parser, shapeToSvgString(shape));
    if (element) shapesLayer.appendChild(element);
  }

  // Render text annotations
  for (const text of sortedText) {
    const element = parseAndImportElement(doc, parser, textToSvgString(text));
    if (element) textLayer.appendChild(element);
  }

  // Insert layers in z-order
  // Groups go at the beginning (behind graph content)
  svgEl.insertBefore(groupsLayer, svgEl.firstChild);
  // Shapes and text go at the end (in front of graph content)
  svgEl.appendChild(shapesLayer);
  svgEl.appendChild(textLayer);

  // Calculate annotation bounds (in model coordinates) and expand SVG if needed
  const annotationBounds = calculateAnnotationsBounds(annotations);
  if (annotationBounds.minX !== Infinity) {
    expandSvgBounds(svgEl, annotationBounds, transform);
  }

  return new XMLSerializer().serializeToString(svgEl);
}
