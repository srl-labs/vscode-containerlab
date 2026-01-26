/**
 * Helper utilities for free shape SVG rendering (JSX helpers).
 */
import type { ReactElement } from "react";

import type { FreeShapeAnnotation } from "../../../shared/types/topology";
import {
  DEFAULT_LINE_LENGTH,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_ARROW_SIZE,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_STYLE,
  MIN_SHAPE_SIZE,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY
} from "./constants";

import { applyAlphaToColor } from "../color";

export interface LineGeometry {
  dx: number;
  dy: number;
  width: number;
  height: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export function getBorderDashArray(style?: FreeShapeAnnotation["borderStyle"]): string {
  switch (style) {
    case "dashed":
      return "10,5";
    case "dotted":
      return "2,2";
    default:
      return "";
  }
}

export function computeLineGeometry(annotation: FreeShapeAnnotation): LineGeometry {
  const startX = annotation.position.x;
  const startY = annotation.position.y;
  const endX = annotation.endPosition?.x ?? annotation.position.x + DEFAULT_LINE_LENGTH;
  const endY = annotation.endPosition?.y ?? annotation.position.y;
  const dx = endX - startX;
  const dy = endY - startY;

  const strokeWidth = annotation.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const arrowSize =
    annotation.lineStartArrow || annotation.lineEndArrow
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

  return { dx, dy, width, height, start, end };
}

interface ShapeSvgResult {
  svg: ReactElement;
  width: number;
  height: number;
  endHandlePos?: { x: number; y: number };
}

function getSharedStyle(annotation: FreeShapeAnnotation) {
  const fillColor = applyAlphaToColor(
    annotation.fillColor ?? DEFAULT_FILL_COLOR,
    annotation.fillOpacity ?? DEFAULT_FILL_OPACITY
  );
  const strokeColor = annotation.borderColor ?? DEFAULT_BORDER_COLOR;
  const strokeWidth = annotation.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const dashArray = getBorderDashArray(annotation.borderStyle ?? DEFAULT_BORDER_STYLE);
  return { fillColor, strokeColor, strokeWidth, dashArray };
}

function buildRectangleSvg(
  annotation: FreeShapeAnnotation,
  shared: ReturnType<typeof getSharedStyle>
): ShapeSvgResult {
  const width = annotation.width ?? 50;
  const height = annotation.height ?? 50;
  const cornerRadius = annotation.cornerRadius ?? 0;
  return {
    width,
    height,
    svg: (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <rect
          width={width}
          height={height}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={shared.fillColor}
          stroke={shared.strokeColor}
          strokeWidth={shared.strokeWidth}
          strokeDasharray={shared.dashArray || undefined}
        />
      </svg>
    )
  };
}

function buildCircleSvg(
  annotation: FreeShapeAnnotation,
  shared: ReturnType<typeof getSharedStyle>
): ShapeSvgResult {
  const width = annotation.width ?? 50;
  const height = annotation.height ?? 50;
  return {
    width,
    height,
    svg: (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={shared.fillColor}
          stroke={shared.strokeColor}
          strokeWidth={shared.strokeWidth}
          strokeDasharray={shared.dashArray || undefined}
        />
      </svg>
    )
  };
}

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
  const p2x = x;
  const p2y = y;
  const p3x = x - arrowSize * Math.cos(angle + arrowAngle);
  const p3y = y - arrowSize * Math.sin(angle + arrowAngle);
  return `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`;
}

function computeLineEndpoints(
  annotation: FreeShapeAnnotation,
  geometry: LineGeometry
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;
  let startX = geometry.start.x;
  let startY = geometry.start.y;
  let endX = geometry.end.x;
  let endY = geometry.end.y;

  const dx = geometry.end.x - geometry.start.x;
  const dy = geometry.end.y - geometry.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length > 0) {
    const ux = dx / length;
    const uy = dy / length;
    if (annotation.lineStartArrow) {
      startX += ux * arrowSize * 0.7;
      startY += uy * arrowSize * 0.7;
    }
    if (annotation.lineEndArrow) {
      endX -= ux * arrowSize * 0.7;
      endY -= uy * arrowSize * 0.7;
    }
  }

  return { start: { x: startX, y: startY }, end: { x: endX, y: endY } };
}

function buildLineSvg(
  annotation: FreeShapeAnnotation,
  shared: ReturnType<typeof getSharedStyle>
): ShapeSvgResult {
  const geometry = computeLineGeometry(annotation);
  const arrowSize = annotation.lineArrowSize ?? DEFAULT_ARROW_SIZE;
  const endpoints = computeLineEndpoints(annotation, geometry);

  return {
    width: geometry.width,
    height: geometry.height,
    endHandlePos: geometry.end,
    svg: (
      <svg width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
        <g>
          <line
            x1={endpoints.start.x}
            y1={endpoints.start.y}
            x2={endpoints.end.x}
            y2={endpoints.end.y}
            stroke={shared.strokeColor}
            strokeWidth={shared.strokeWidth}
            strokeDasharray={shared.dashArray || undefined}
          />
          {annotation.lineStartArrow && (
            <polygon
              points={makeArrowPoints(
                arrowSize,
                geometry.start.x,
                geometry.start.y,
                geometry.end.x,
                geometry.end.y
              )}
              fill={shared.strokeColor}
            />
          )}
          {annotation.lineEndArrow && (
            <polygon
              points={makeArrowPoints(
                arrowSize,
                geometry.end.x,
                geometry.end.y,
                geometry.start.x,
                geometry.start.y
              )}
              fill={shared.strokeColor}
            />
          )}
        </g>
      </svg>
    )
  };
}

export function buildShapeSvg(annotation: FreeShapeAnnotation): ShapeSvgResult {
  const shared = getSharedStyle(annotation);
  switch (annotation.shapeType) {
    case "rectangle":
      return buildRectangleSvg(annotation, shared);
    case "circle":
      return buildCircleSvg(annotation, shared);
    case "line":
    default:
      return buildLineSvg(annotation, shared);
  }
}
