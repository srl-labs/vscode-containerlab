import { FreeShapeAnnotation } from '../../../shared/types/topoViewerGraph';

export const DEFAULT_SHAPE_WIDTH = 50;
export const DEFAULT_SHAPE_HEIGHT = 50;
export const DEFAULT_LINE_LENGTH = 150;
export const DEFAULT_FILL_COLOR = '#ffffff';
export const DEFAULT_FILL_OPACITY = 0;
export const DEFAULT_BORDER_COLOR = '#646464';
export const DEFAULT_BORDER_WIDTH = 2;
export const DEFAULT_BORDER_STYLE = 'solid';
export const DEFAULT_ARROW_SIZE = 10;
export const DEFAULT_CORNER_RADIUS = 0;
export const MIN_SHAPE_SIZE = 5;
export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SVG_STROKE_WIDTH_ATTR = 'stroke-width';
const SVG_STROKE_DASHARRAY_ATTR = 'stroke-dasharray';

export interface LineGeometry {
  dx: number;
  dy: number;
  minX: number;
  minY: number;
  width: number;
  height: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Utility class for creating SVG shapes and computing geometry for free shape annotations.
 */
export class FreeShapesSvgRenderer {
  /**
   * Compute geometry for a line annotation including bounding box and endpoints.
   */
  public computeLineGeometry(annotation: FreeShapeAnnotation): LineGeometry {
    const startX = annotation.position.x;
    const startY = annotation.position.y;
    const endX = annotation.endPosition?.x ?? (annotation.position.x + DEFAULT_LINE_LENGTH);
    const endY = annotation.endPosition?.y ?? annotation.position.y;
    const dx = endX - startX;
    const dy = endY - startY;

    const strokeWidth = annotation.borderWidth ?? DEFAULT_BORDER_WIDTH;
    const arrowSize = (annotation.lineStartArrow || annotation.lineEndArrow)
      ? (annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE)
      : 0;
    const padding = Math.max(strokeWidth, arrowSize) + 1;

    const halfDx = dx / 2;
    const halfDy = dy / 2;
    const startCenterX = -halfDx;
    const startCenterY = -halfDy;
    const endCenterX = halfDx;
    const endCenterY = halfDy;

    const minX = Math.min(startCenterX, endCenterX) - padding;
    const maxX = Math.max(startCenterX, endCenterX) + padding;
    const minY = Math.min(startCenterY, endCenterY) - padding;
    const maxY = Math.max(startCenterY, endCenterY) + padding;

    const width = Math.max(MIN_SHAPE_SIZE, maxX - minX);
    const height = Math.max(MIN_SHAPE_SIZE, maxY - minY);

    const start = { x: startCenterX - minX, y: startCenterY - minY };
    const end = { x: endCenterX - minX, y: endCenterY - minY };

    return { dx, dy, minX, minY, width, height, start, end };
  }

  /**
   * Get the center point of a line annotation.
   */
  public getLineCenter(annotation: FreeShapeAnnotation): { x: number; y: number } {
    const endX = annotation.endPosition?.x ?? annotation.position.x;
    const endY = annotation.endPosition?.y ?? annotation.position.y;
    return {
      x: (annotation.position.x + endX) / 2,
      y: (annotation.position.y + endY) / 2
    };
  }

  /**
   * Create an SVG rectangle element for a shape annotation.
   */
  public createRectangleShape(annotation: FreeShapeAnnotation): SVGRectElement {
    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    const width = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const height = annotation.height ?? DEFAULT_SHAPE_HEIGHT;
    const cornerRadius = annotation.cornerRadius ?? 0;

    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', String(cornerRadius));
    rect.setAttribute('ry', String(cornerRadius));
    rect.setAttribute('fill', this.applyAlphaToColor(
      annotation.fillColor ?? DEFAULT_FILL_COLOR,
      annotation.fillOpacity ?? DEFAULT_FILL_OPACITY
    ));
    rect.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    rect.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    rect.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    return rect;
  }

  /**
   * Create an SVG ellipse element for a circle shape annotation.
   */
  public createCircleShape(annotation: FreeShapeAnnotation): SVGEllipseElement {
    const ellipse = document.createElementNS(SVG_NAMESPACE, 'ellipse');
    const width = annotation.width ?? DEFAULT_SHAPE_WIDTH;
    const height = annotation.height ?? DEFAULT_SHAPE_HEIGHT;

    ellipse.setAttribute('cx', String(width / 2));
    ellipse.setAttribute('cy', String(height / 2));
    ellipse.setAttribute('rx', String(width / 2));
    ellipse.setAttribute('ry', String(height / 2));
    ellipse.setAttribute('fill', this.applyAlphaToColor(
      annotation.fillColor ?? DEFAULT_FILL_COLOR,
      annotation.fillOpacity ?? DEFAULT_FILL_OPACITY
    ));
    ellipse.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    ellipse.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    ellipse.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    return ellipse;
  }

  /**
   * Create an SVG group containing a line and optional arrows.
   */
  public createLineShape(annotation: FreeShapeAnnotation): SVGGElement {
    const g = document.createElementNS(SVG_NAMESPACE, 'g');
    const line = document.createElementNS(SVG_NAMESPACE, 'line');

    const geometry = this.computeLineGeometry(annotation);
    const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;

    // Calculate line endpoints, shortened if arrows are present
    let lineStartX = geometry.start.x;
    let lineStartY = geometry.start.y;
    let lineEndX = geometry.end.x;
    let lineEndY = geometry.end.y;

    // Calculate line direction and length
    const dx = geometry.end.x - geometry.start.x;
    const dy = geometry.end.y - geometry.start.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength > 0) {
      // Unit vector along the line
      const ux = dx / lineLength;
      const uy = dy / lineLength;

      // Shorten line at start if there's a start arrow
      if (annotation.lineStartArrow) {
        lineStartX += ux * arrowSize * 0.7;
        lineStartY += uy * arrowSize * 0.7;
      }

      // Shorten line at end if there's an end arrow
      if (annotation.lineEndArrow) {
        lineEndX -= ux * arrowSize * 0.7;
        lineEndY -= uy * arrowSize * 0.7;
      }
    }

    line.setAttribute('x1', String(lineStartX));
    line.setAttribute('y1', String(lineStartY));
    line.setAttribute('x2', String(lineEndX));
    line.setAttribute('y2', String(lineEndY));
    line.setAttribute('stroke', annotation.borderColor ?? DEFAULT_BORDER_COLOR);
    line.setAttribute(SVG_STROKE_WIDTH_ATTR, String(annotation.borderWidth ?? DEFAULT_BORDER_WIDTH));
    line.setAttribute(SVG_STROKE_DASHARRAY_ATTR, this.getBorderDashArray(annotation.borderStyle));

    g.appendChild(line);

    if (annotation.lineStartArrow) {
      g.appendChild(this.createArrow(geometry.start.x, geometry.start.y, geometry.end.x, geometry.end.y, annotation));
    }
    if (annotation.lineEndArrow) {
      g.appendChild(this.createArrow(geometry.end.x, geometry.end.y, geometry.start.x, geometry.start.y, annotation));
    }

    return g;
  }

  /**
   * Create an SVG arrow polygon pointing from one point toward another.
   */
  public createArrow(
    x: number,
    y: number,
    fromX: number,
    fromY: number,
    annotation: FreeShapeAnnotation
  ): SVGPolygonElement {
    const arrow = document.createElementNS(SVG_NAMESPACE, 'polygon');
    const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;

    const angle = Math.atan2(y - fromY, x - fromX);
    const arrowAngle = Math.PI / 6;

    const p1x = x - arrowSize * Math.cos(angle - arrowAngle);
    const p1y = y - arrowSize * Math.sin(angle - arrowAngle);
    const p2x = x;
    const p2y = y;
    const p3x = x - arrowSize * Math.cos(angle + arrowAngle);
    const p3y = y - arrowSize * Math.sin(angle + arrowAngle);

    arrow.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
    arrow.setAttribute('fill', annotation.borderColor ?? DEFAULT_BORDER_COLOR);

    return arrow;
  }

  /**
   * Get the SVG stroke-dasharray value for a border style.
   */
  public getBorderDashArray(style?: 'solid' | 'dashed' | 'dotted'): string {
    switch (style) {
      case 'dashed':
        return '10,5';
      case 'dotted':
        return '2,2';
      default:
        return '';
    }
  }

  /**
   * Apply alpha transparency to a hex color, returning an rgba string.
   */
  public applyAlphaToColor(color: string, alpha: number): string {
    const normalizedAlpha = Math.min(1, Math.max(0, alpha));
    const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);

    if (hexMatch) {
      const r = parseInt(hexMatch[1].slice(0, 2), 16);
      const g = parseInt(hexMatch[1].slice(2, 4), 16);
      const b = parseInt(hexMatch[1].slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
    }

    return color;
  }

  /**
   * Create the appropriate SVG shape element based on annotation type.
   */
  public createShapeElement(annotation: FreeShapeAnnotation): SVGElement {
    if (annotation.shapeType === 'rectangle') {
      return this.createRectangleShape(annotation);
    } else if (annotation.shapeType === 'circle') {
      return this.createCircleShape(annotation);
    } else {
      return this.createLineShape(annotation);
    }
  }
}
