/**
 * Utilities for converting annotations to SVG elements for export.
 * Used by SvgExportPanel to composite annotations into exported SVG.
 */
import type { FreeTextAnnotation, FreeShapeAnnotation, GroupStyleAnnotation } from '../../shared/types/topology';
import {
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_LINE_LENGTH
} from '../hooks/annotations/freeShape';
import { applyAlphaToColor } from '../components/annotations/shared/colorUtils';

import { renderMarkdown } from './markdownRenderer';

// ============================================================================
// Constants
// ============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_MIME_TYPE = 'image/svg+xml';
const ANNOTATION_GROUPS_LAYER = 'annotation-groups-layer';
const ANNOTATION_SHAPES_LAYER = 'annotation-shapes-layer';
const ANNOTATION_TEXT_LAYER = 'annotation-text-layer';
const DEFAULT_FONT_FAMILY = 'sans-serif';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBorderDashArray(style?: FreeShapeAnnotation['borderStyle']): string {
  switch (style) {
    case 'dashed': return '10,5';
    case 'dotted': return '2,2';
    default: return '';
  }
}

function getGroupBorderDashArray(style?: GroupStyleAnnotation['borderStyle']): string {
  switch (style) {
    case 'dashed': return '10,5';
    case 'dotted': return '2,2';
    case 'double': return ''; // Double style not directly supported in SVG dash, render as solid
    default: return '';
  }
}

interface ShapeStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  dashArray: string;
}

function getShapeStyle(shape: FreeShapeAnnotation, scale: number): ShapeStyle {
  return {
    fillColor: applyAlphaToColor(
      shape.fillColor ?? DEFAULT_FILL_COLOR,
      shape.fillOpacity ?? DEFAULT_FILL_OPACITY
    ),
    strokeColor: shape.borderColor ?? DEFAULT_BORDER_COLOR,
    strokeWidth: (shape.borderWidth ?? DEFAULT_BORDER_WIDTH) * scale,
    dashArray: getBorderDashArray(shape.borderStyle ?? DEFAULT_BORDER_STYLE)
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
 */
function calculateLabelPosition(
  rect: GroupRect,
  labelPosition: string,
  labelFontSize: number,
  labelPadding: number
): LabelPosition {
  const { x, y, width, height } = rect;

  const positions: Record<string, LabelPosition> = {
    'top-center': { x: x + width / 2, y: y - labelPadding, textAnchor: 'middle' },
    'top-right': { x: x + width - labelPadding, y: y - labelPadding, textAnchor: 'end' },
    'bottom-left': { x: x + labelPadding, y: y + height + labelFontSize + labelPadding, textAnchor: 'start' },
    'bottom-center': { x: x + width / 2, y: y + height + labelFontSize + labelPadding, textAnchor: 'middle' },
    'bottom-right': { x: x + width - labelPadding, y: y + height + labelFontSize + labelPadding, textAnchor: 'end' },
    'top-left': { x: x + labelPadding, y: y - labelPadding, textAnchor: 'start' }
  };

  return positions[labelPosition] ?? positions['top-left'];
}

/**
 * Calculate label background X position based on text anchor.
 */
function calculateLabelBgX(labelX: number, textAnchor: string, labelWidth: number, bgPadding: number): number {
  if (textAnchor === 'middle') return labelX - labelWidth / 2;
  if (textAnchor === 'end') return labelX - labelWidth;
  return labelX - bgPadding;
}

/**
 * Build SVG for group label with background.
 */
function buildGroupLabelSvg(
  name: string,
  labelPos: LabelPosition,
  labelColor: string,
  labelFontSize: number,
  labelPadding: number,
  labelBgPadding: number,
  scale: number
): string {
  const estimatedLabelWidth = name.length * labelFontSize * 0.6 + labelBgPadding * 2;
  const labelBgHeight = labelFontSize + labelPadding * 2;
  const bgX = calculateLabelBgX(labelPos.x, labelPos.textAnchor, estimatedLabelWidth, labelBgPadding);
  const bgY = labelPos.y - labelFontSize - labelPadding / 2;

  let svg = `<rect x="${bgX}" y="${bgY}" width="${estimatedLabelWidth}" height="${labelBgHeight}" `;
  svg += `fill="rgba(0,0,0,0.4)" rx="${2 * scale}" ry="${2 * scale}" />`;
  svg += `<text x="${labelPos.x}" y="${labelPos.y}" `;
  svg += `fill="${labelColor}" font-size="${labelFontSize}" font-weight="500" `;
  svg += `font-family="${DEFAULT_FONT_FAMILY}" text-anchor="${labelPos.textAnchor}">`;
  svg += escapeXml(name);
  svg += `</text>`;

  return svg;
}

/**
 * Convert a GroupStyleAnnotation to an SVG string.
 * Groups are rendered as rectangles with optional label.
 * NOTE: Group position represents the CENTER of the group (same as canvas rendering).
 */
export function groupToSvgString(group: GroupStyleAnnotation, scale: number): string {
  const width = group.width * scale;
  const height = group.height * scale;
  const x = (group.position.x - group.width / 2) * scale;
  const y = (group.position.y - group.height / 2) * scale;

  const bgColor = group.backgroundColor ?? '#d9d9d9';
  const bgOpacity = (group.backgroundOpacity ?? 20) / 100;
  const fillColor = bgColor === 'transparent' ? 'none' : applyAlphaToColor(bgColor, bgOpacity);

  const borderColor = group.borderColor ?? '#dddddd';
  const borderWidth = (group.borderWidth ?? 0.5) * scale;
  const borderRadius = (group.borderRadius ?? 0) * scale;
  const dashArray = getGroupBorderDashArray(group.borderStyle);

  let svg = `<g class="annotation-group" data-id="${escapeXml(group.id)}">`;
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" `;
  svg += `fill="${fillColor}" stroke="${borderColor}" stroke-width="${borderWidth}" `;
  if (borderRadius > 0) svg += `rx="${borderRadius}" ry="${borderRadius}" `;
  if (dashArray) svg += `stroke-dasharray="${dashArray}" `;
  svg += `/>`;

  if (group.name) {
    const labelFontSize = 9 * scale;
    const labelPadding = 2 * scale;
    const labelBgPadding = 6 * scale;
    const labelPos = calculateLabelPosition(
      { x, y, width, height },
      group.labelPosition ?? 'top-left',
      labelFontSize,
      labelPadding
    );
    svg += buildGroupLabelSvg(
      group.name,
      labelPos,
      group.labelColor ?? '#ebecf0',
      labelFontSize,
      labelPadding,
      labelBgPadding,
      scale
    );
  }

  svg += `</g>`;
  return svg;
}

// ============================================================================
// Shape to SVG - Subcomponents
// ============================================================================

function makeArrowPoints(arrowSize: number, x: number, y: number, fromX: number, fromY: number): string {
  const angle = Math.atan2(y - fromY, x - fromX);
  const arrowAngle = Math.PI / 6;
  const p1x = x - arrowSize * Math.cos(angle - arrowAngle);
  const p1y = y - arrowSize * Math.sin(angle - arrowAngle);
  const p3x = x - arrowSize * Math.cos(angle + arrowAngle);
  const p3y = y - arrowSize * Math.sin(angle + arrowAngle);
  return `${p1x},${p1y} ${x},${y} ${p3x},${p3y}`;
}

function buildRectangleSvg(shape: FreeShapeAnnotation, scale: number): string {
  const style = getShapeStyle(shape, scale);
  const width = (shape.width ?? 50) * scale;
  const height = (shape.height ?? 50) * scale;
  // Shape position is CENTER-based on canvas (uses translate(-50%, -50%))
  // Convert to top-left corner for SVG
  const unscaledWidth = shape.width ?? 50;
  const unscaledHeight = shape.height ?? 50;
  const x = (shape.position.x - unscaledWidth / 2) * scale;
  const y = (shape.position.y - unscaledHeight / 2) * scale;
  const cornerRadius = (shape.cornerRadius ?? 0) * scale;
  const rotation = shape.rotation ?? 0;
  // Center point for rotation
  const cx = shape.position.x * scale;
  const cy = shape.position.y * scale;

  let svg = `<g class="annotation-shape" data-id="${escapeXml(shape.id)}"`;
  if (rotation !== 0) svg += ` transform="rotate(${rotation}, ${cx}, ${cy})"`;
  svg += `>`;
  svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${buildRectAttrs(style, cornerRadius)}/>`;
  svg += `</g>`;
  return svg;
}

function buildCircleSvg(shape: FreeShapeAnnotation, scale: number): string {
  const style = getShapeStyle(shape, scale);
  const width = (shape.width ?? 50) * scale;
  const height = (shape.height ?? 50) * scale;
  // Shape position is CENTER-based on canvas (uses translate(-50%, -50%))
  // For ellipse, cx/cy are the center coordinates, which is exactly the position
  const cx = shape.position.x * scale;
  const cy = shape.position.y * scale;
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

function buildLineSvg(shape: FreeShapeAnnotation, scale: number): string {
  const style = getShapeStyle(shape, scale);
  const startX = shape.position.x * scale;
  const startY = shape.position.y * scale;
  const endX = (shape.endPosition?.x ?? (shape.position.x + DEFAULT_LINE_LENGTH)) * scale;
  const endY = (shape.endPosition?.y ?? shape.position.y) * scale;
  const arrowSize = (shape.lineArrowSize ?? DEFAULT_ARROW_SIZE) * scale;

  // Shorten line ends if arrows are present
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  let lineStartX = startX, lineStartY = startY, lineEndX = endX, lineEndY = endY;

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    if (shape.lineStartArrow) {
      lineStartX += ux * arrowSize * 0.7;
      lineStartY += uy * arrowSize * 0.7;
    }
    if (shape.lineEndArrow) {
      lineEndX -= ux * arrowSize * 0.7;
      lineEndY -= uy * arrowSize * 0.7;
    }
  }

  let svg = `<g class="annotation-shape" data-id="${escapeXml(shape.id)}">`;
  svg += `<line x1="${lineStartX}" y1="${lineStartY}" x2="${lineEndX}" y2="${lineEndY}" ${buildStrokeAttrs(style)}/>`;

  if (shape.lineStartArrow) {
    svg += `<polygon points="${makeArrowPoints(arrowSize, startX, startY, endX, endY)}" fill="${style.strokeColor}" />`;
  }
  if (shape.lineEndArrow) {
    svg += `<polygon points="${makeArrowPoints(arrowSize, endX, endY, startX, startY)}" fill="${style.strokeColor}" />`;
  }

  svg += `</g>`;
  return svg;
}

/**
 * Convert a FreeShapeAnnotation to an SVG string.
 */
export function shapeToSvgString(shape: FreeShapeAnnotation, scale: number): string {
  switch (shape.shapeType) {
    case 'rectangle': return buildRectangleSvg(shape, scale);
    case 'circle': return buildCircleSvg(shape, scale);
    case 'line':
    default:
      return buildLineSvg(shape, scale);
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

function getTextStyle(text: FreeTextAnnotation, scale: number): TextStyle {
  return {
    fontSize: (text.fontSize ?? 14) * scale,
    fontColor: text.fontColor ?? '#000000',
    fontWeight: text.fontWeight ?? 'normal',
    fontStyle: text.fontStyle ?? 'normal',
    textDecoration: text.textDecoration ?? 'none',
    textAlign: text.textAlign ?? 'left',
    fontFamily: text.fontFamily ?? DEFAULT_FONT_FAMILY,
    backgroundColor: text.backgroundColor ?? 'transparent',
    borderRadius: text.roundedBackground ? 4 * scale : 0,
    padding: 4 * scale
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
  const lines = textContent.split('\n');
  const lineCount = Math.max(1, lines.length);

  // Find the longest line
  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');

  // Character width multiplier based on font family
  // Monospace fonts have consistent width, proportional fonts vary
  const isMonospace = fontFamily.toLowerCase().includes('mono');
  const charWidthRatio = isMonospace ? 0.6 : 0.55;

  // Bold text is slightly wider
  const boldMultiplier = fontWeight === 'bold' ? 1.1 : 1.0;

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
 * NOTE: Text position represents the CENTER of the annotation (same as canvas rendering).
 */
export function textToSvgString(text: FreeTextAnnotation, scale: number): string {
  // Use explicit dimensions if provided, otherwise estimate from content
  let unscaledWidth: number;
  let unscaledHeight: number;

  if (text.width !== undefined && text.height !== undefined) {
    unscaledWidth = text.width;
    unscaledHeight = text.height;
  } else {
    const estimated = estimateTextDimensions(
      text.text || '',
      text.fontSize ?? 14,
      text.fontFamily ?? DEFAULT_FONT_FAMILY,
      text.fontWeight ?? 'normal'
    );
    unscaledWidth = text.width ?? estimated.width;
    unscaledHeight = text.height ?? estimated.height;
  }

  const width = unscaledWidth * scale;
  const height = unscaledHeight * scale;

  // Text position is CENTER-based on canvas (uses translate(-50%, -50%))
  // Convert to top-left corner for SVG foreignObject
  const x = (text.position.x - unscaledWidth / 2) * scale;
  const y = (text.position.y - unscaledHeight / 2) * scale;

  const rotation = text.rotation ?? 0;
  // Center point for rotation (the original position)
  const cx = text.position.x * scale;
  const cy = text.position.y * scale;

  const style = getTextStyle(text, scale);
  const styleStr = buildTextStyleString(style);
  const htmlContent = renderMarkdown(text.text || '');

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

  const viewBox = svgEl.getAttribute('viewBox');
  let x = 0, y = 0, width = 0, height = 0;

  if (viewBox) {
    [x, y, width, height] = viewBox.split(' ').map(parseFloat);
  } else {
    // Fall back to width/height attributes
    width = parseFloat(svgEl.getAttribute('width') || '0');
    height = parseFloat(svgEl.getAttribute('height') || '0');
    if (width === 0 || height === 0) return svgContent;
  }

  const rect = doc.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', x.toString());
  rect.setAttribute('y', y.toString());
  rect.setAttribute('width', width.toString());
  rect.setAttribute('height', height.toString());
  rect.setAttribute('fill', color);

  svgEl.insertBefore(rect, svgEl.firstChild);

  return new XMLSerializer().serializeToString(svgEl);
}

function parseAndImportElement(doc: Document, parser: DOMParser, svgStr: string): Element | null {
  const tempDoc = parser.parseFromString(`<svg xmlns="${SVG_NS}">${svgStr}</svg>`, SVG_MIME_TYPE);
  const element = tempDoc.documentElement.firstChild;
  return element ? doc.importNode(element, true) as Element : null;
}

/**
 * Extract transform values from a cytoscape SVG's main group.
 * Returns { translateX, translateY, scaleX, scaleY }
 */
function extractCytoscapeTransform(svgEl: Element): { tx: number; ty: number; sx: number; sy: number } {
  // Find the main content group with transform
  const mainGroup = svgEl.querySelector('g[transform]');
  if (!mainGroup) {
    return { tx: 0, ty: 0, sx: 1, sy: 1 };
  }

  const transform = mainGroup.getAttribute('transform') || '';

  // Parse translate(x,y)
  const translateMatch = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(transform);
  const tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
  const ty = translateMatch ? parseFloat(translateMatch[2]) : 0;

  // Parse scale(x,y) or scale(x)
  const scaleMatch = /scale\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)/.exec(transform);
  const sx = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
  const sy = scaleMatch ? parseFloat(scaleMatch[2] ?? scaleMatch[1]) : sx;

  return { tx, ty, sx, sy };
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

/** Calculate bounds for a center-based rect */
function getCenterBasedBounds(cx: number, cy: number, w: number, h: number, scale: number) {
  const halfW = w / 2;
  const halfH = h / 2;
  return {
    x1: (cx - halfW) * scale,
    y1: (cy - halfH) * scale,
    x2: (cx + halfW) * scale,
    y2: (cy + halfH) * scale
  };
}

function addGroupBounds(bounds: BoundingBox, groups: GroupStyleAnnotation[], scale: number): void {
  for (const group of groups) {
    const b = getCenterBasedBounds(group.position.x, group.position.y, group.width, group.height, scale);
    mergeBounds(bounds, b.x1, b.y1, b.x2, b.y2);
  }
}

function addShapeBounds(bounds: BoundingBox, shapes: FreeShapeAnnotation[], scale: number): void {
  for (const shape of shapes) {
    if (shape.shapeType === 'line') {
      const x1 = shape.position.x * scale;
      const y1 = shape.position.y * scale;
      const x2 = (shape.endPosition?.x ?? shape.position.x) * scale;
      const y2 = (shape.endPosition?.y ?? shape.position.y) * scale;
      mergeBounds(bounds, Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
    } else {
      const b = getCenterBasedBounds(
        shape.position.x, shape.position.y,
        shape.width ?? 50, shape.height ?? 50,
        scale
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
    text.text || '',
    text.fontSize ?? 14,
    text.fontFamily ?? 'sans-serif',
    text.fontWeight ?? 'normal'
  );
  return { w: text.width ?? estimated.width, h: text.height ?? estimated.height };
}

function addTextBounds(bounds: BoundingBox, texts: FreeTextAnnotation[], scale: number): void {
  for (const text of texts) {
    const { w, h } = getTextDimensions(text);
    const b = getCenterBasedBounds(text.position.x, text.position.y, w, h, scale);
    mergeBounds(bounds, b.x1, b.y1, b.x2, b.y2);
  }
}

/**
 * Calculate bounding box for all annotations (in scaled coordinates).
 * NOTE: All annotation positions are CENTER-based on canvas.
 */
function calculateAnnotationsBounds(annotations: AnnotationData, scale: number): BoundingBox {
  const bounds: BoundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  addGroupBounds(bounds, annotations.groups, scale);
  addShapeBounds(bounds, annotations.shapeAnnotations, scale);
  addTextBounds(bounds, annotations.textAnnotations, scale);
  return bounds;
}

interface ExpandedBounds {
  newMinX: number;
  newMinY: number;
  newWidth: number;
  newHeight: number;
  needsExpansion: boolean;
}

function calculateExpandedBounds(
  currentWidth: number,
  currentHeight: number,
  annotationBounds: BoundingBox,
  tx: number,
  ty: number
): ExpandedBounds {
  // Add margin to ensure content at edges is fully visible
  const margin = 20;

  // Annotation bounds in SVG coordinate space
  const annMinX = annotationBounds.minX + tx - margin;
  const annMinY = annotationBounds.minY + ty - margin;
  const annMaxX = annotationBounds.maxX + tx + margin;
  const annMaxY = annotationBounds.maxY + ty + margin;

  // Combined bounds
  const newMinX = Math.min(0, annMinX);
  const newMinY = Math.min(0, annMinY);
  const newMaxX = Math.max(currentWidth, annMaxX);
  const newMaxY = Math.max(currentHeight, annMaxY);

  const newWidth = newMaxX - newMinX;
  const newHeight = newMaxY - newMinY;
  const needsExpansion = newMinX < 0 || newMinY < 0 || newWidth > currentWidth || newHeight > currentHeight;

  return { newMinX, newMinY, newWidth, newHeight, needsExpansion };
}

function shiftGroupTransforms(svgEl: Element, shiftX: number, shiftY: number): void {
  const children = svgEl.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName === 'g') {
      const existingTransform = child.getAttribute('transform') || '';
      const newTransform = existingTransform
        ? `translate(${shiftX}, ${shiftY}) ${existingTransform}`
        : `translate(${shiftX}, ${shiftY})`;
      child.setAttribute('transform', newTransform);
    }
  }
}

function shiftBackgroundRect(svgEl: Element, shiftX: number, shiftY: number, newWidth: number, newHeight: number): void {
  const bgRect = svgEl.querySelector('rect');
  if (bgRect && !bgRect.closest('g')) {
    const rectX = parseFloat(bgRect.getAttribute('x') || '0');
    const rectY = parseFloat(bgRect.getAttribute('y') || '0');
    bgRect.setAttribute('x', (rectX + shiftX).toString());
    bgRect.setAttribute('y', (rectY + shiftY).toString());
    bgRect.setAttribute('width', newWidth.toString());
    bgRect.setAttribute('height', newHeight.toString());
  }
}

/**
 * Expand SVG dimensions to include annotation bounds.
 */
function expandSvgBounds(svgEl: Element, annotationBounds: BoundingBox, tx: number, ty: number): void {
  const currentWidth = parseFloat(svgEl.getAttribute('width') || '0');
  const currentHeight = parseFloat(svgEl.getAttribute('height') || '0');

  const bounds = calculateExpandedBounds(currentWidth, currentHeight, annotationBounds, tx, ty);

  if (!bounds.needsExpansion) return;

  svgEl.setAttribute('width', bounds.newWidth.toString());
  svgEl.setAttribute('height', bounds.newHeight.toString());

  // If we expanded to negative coordinates, shift all content
  if (bounds.newMinX < 0 || bounds.newMinY < 0) {
    const shiftX = bounds.newMinX < 0 ? -bounds.newMinX : 0;
    const shiftY = bounds.newMinY < 0 ? -bounds.newMinY : 0;

    shiftGroupTransforms(svgEl, shiftX, shiftY);
    shiftBackgroundRect(svgEl, shiftX, shiftY, bounds.newWidth, bounds.newHeight);
  }
}

/**
 * Composite annotations into an existing Cytoscape SVG.
 * Annotations are inserted in z-order: groups (background), shapes, text (foreground).
 * The cytoscape transform is extracted and applied to annotation layers.
 */
export function compositeAnnotationsIntoSvg(
  cytoscapeSvg: string,
  annotations: AnnotationData,
  scale: number
): string {
  const { groups, textAnnotations, shapeAnnotations } = annotations;

  // Skip if no annotations
  if (groups.length === 0 && textAnnotations.length === 0 && shapeAnnotations.length === 0) {
    return cytoscapeSvg;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cytoscapeSvg, SVG_MIME_TYPE);
  const svgEl = doc.documentElement;

  // Extract transform from cytoscape content to match annotation positioning
  const { tx, ty } = extractCytoscapeTransform(svgEl);

  // Create annotation layer groups with same transform as cytoscape content
  const transformAttr = `translate(${tx}, ${ty})`;

  const groupsLayer = doc.createElementNS(SVG_NS, 'g');
  groupsLayer.setAttribute('class', ANNOTATION_GROUPS_LAYER);
  groupsLayer.setAttribute('transform', transformAttr);

  const shapesLayer = doc.createElementNS(SVG_NS, 'g');
  shapesLayer.setAttribute('class', ANNOTATION_SHAPES_LAYER);
  shapesLayer.setAttribute('transform', transformAttr);

  const textLayer = doc.createElementNS(SVG_NS, 'g');
  textLayer.setAttribute('class', ANNOTATION_TEXT_LAYER);
  textLayer.setAttribute('transform', transformAttr);

  // Sort by zIndex
  const sortedGroups = [...groups].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const sortedShapes = [...shapeAnnotations].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const sortedText = [...textAnnotations].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Render groups
  for (const group of sortedGroups) {
    const element = parseAndImportElement(doc, parser, groupToSvgString(group, scale));
    if (element) groupsLayer.appendChild(element);
  }

  // Render shapes
  for (const shape of sortedShapes) {
    const element = parseAndImportElement(doc, parser, shapeToSvgString(shape, scale));
    if (element) shapesLayer.appendChild(element);
  }

  // Render text annotations
  for (const text of sortedText) {
    const element = parseAndImportElement(doc, parser, textToSvgString(text, scale));
    if (element) textLayer.appendChild(element);
  }

  // Insert layers in z-order
  // Groups go at the beginning (behind cytoscape content)
  svgEl.insertBefore(groupsLayer, svgEl.firstChild);
  // Shapes and text go at the end (in front of cytoscape content)
  svgEl.appendChild(shapesLayer);
  svgEl.appendChild(textLayer);

  // Calculate annotation bounds and expand SVG if needed
  const annotationBounds = calculateAnnotationsBounds(annotations, scale);
  if (annotationBounds.minX !== Infinity) {
    expandSvgBounds(svgEl, annotationBounds, tx, ty);
  }

  return new XMLSerializer().serializeToString(svgEl);
}
