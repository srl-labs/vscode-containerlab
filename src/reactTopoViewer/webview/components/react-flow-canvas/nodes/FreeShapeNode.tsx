/**
 * FreeShapeNode - Custom React Flow node for free shape annotations
 */
import React, { memo, useMemo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { FreeShapeNodeData } from '../types';
import { SELECTION_COLOR } from '../types';

/**
 * Convert border style to SVG dash array
 */
function getStrokeDasharray(borderStyle: string): string | undefined {
  if (borderStyle === 'dashed') return '8,4';
  if (borderStyle === 'dotted') return '2,2';
  return undefined;
}

/**
 * Convert fill color with opacity
 */
function getBackgroundColor(fillColor: string, fillOpacity: number): string {
  if (fillColor.startsWith('rgba')) return fillColor;
  const opacityHex = Math.round(fillOpacity * 255).toString(16).padStart(2, '0');
  return `${fillColor}${opacityHex}`;
}

/**
 * Get border style for shapes
 */
function getShapeBorder(
  selected: boolean,
  borderWidth: number,
  borderStyle: string,
  borderColor: string
): string {
  if (selected) return `3px solid ${SELECTION_COLOR}`;
  return `${borderWidth}px ${borderStyle} ${borderColor}`;
}

/**
 * Rectangle shape component
 */
function RectangleShape({
  width,
  height,
  fillColor,
  fillOpacity,
  borderWidth,
  borderStyle,
  borderColor,
  cornerRadius,
  selected
}: {
  width: number;
  height: number;
  fillColor: string;
  fillOpacity: number;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  cornerRadius: number;
  selected: boolean;
}) {
  const style: React.CSSProperties = {
    width,
    height,
    backgroundColor: getBackgroundColor(fillColor, fillOpacity),
    border: getShapeBorder(selected, borderWidth, borderStyle, borderColor),
    borderRadius: cornerRadius,
    boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}33` : 'none',
    transition: 'border 0.15s ease, box-shadow 0.15s ease'
  };
  return <div style={style} className="free-shape-rectangle" />;
}

/**
 * Circle shape component
 */
function CircleShape({
  width,
  height,
  fillColor,
  fillOpacity,
  borderWidth,
  borderStyle,
  borderColor,
  selected
}: {
  width: number;
  height: number;
  fillColor: string;
  fillOpacity: number;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  selected: boolean;
}) {
  const size = Math.min(width, height);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    backgroundColor: getBackgroundColor(fillColor, fillOpacity),
    border: getShapeBorder(selected, borderWidth, borderStyle, borderColor),
    borderRadius: '50%',
    boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}33` : 'none',
    transition: 'border 0.15s ease, box-shadow 0.15s ease'
  };
  return <div style={style} className="free-shape-circle" />;
}

/**
 * Arrow marker for line shapes
 */
function ArrowMarker({
  id,
  size,
  reversed,
  color
}: {
  id: string;
  size: number;
  reversed: boolean;
  color: string;
}) {
  const points = reversed
    ? `${size},0 ${size},${size} 0,${size / 2}`
    : `0,0 ${size},${size / 2} 0,${size}`;

  return (
    <marker
      id={id}
      markerWidth={size}
      markerHeight={size}
      refX={reversed ? 0 : size}
      refY={size / 2}
      orient="auto"
    >
      <polygon points={points} fill={color} />
    </marker>
  );
}

/**
 * Line shape component
 */
function LineShape({
  width,
  endPosition,
  borderColor,
  borderWidth,
  borderStyle,
  lineStartArrow,
  lineEndArrow,
  lineArrowSize,
  selected
}: {
  width: number;
  endPosition?: { x: number; y: number };
  borderColor: string;
  borderWidth: number;
  borderStyle: string;
  lineStartArrow: boolean;
  lineEndArrow: boolean;
  lineArrowSize: number;
  selected: boolean;
}) {
  const x2 = endPosition?.x ?? width;
  const y2 = endPosition?.y ?? 0;
  const length = Math.sqrt(x2 * x2 + y2 * y2);
  const angle = Math.atan2(y2, x2) * (180 / Math.PI);
  const padding = lineArrowSize + 5;
  const svgWidth = length + padding * 2;
  const svgHeight = padding * 2;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{
        overflow: 'visible',
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'left center'
      }}
      className="free-shape-line"
    >
      <defs>
        {lineStartArrow && <ArrowMarker id="arrow-start" size={lineArrowSize} reversed color={borderColor} />}
        {lineEndArrow && <ArrowMarker id="arrow-end" size={lineArrowSize} reversed={false} color={borderColor} />}
      </defs>
      <line
        x1={padding}
        y1={svgHeight / 2}
        x2={padding + length}
        y2={svgHeight / 2}
        stroke={selected ? SELECTION_COLOR : borderColor}
        strokeWidth={selected ? borderWidth + 2 : borderWidth}
        strokeDasharray={getStrokeDasharray(borderStyle)}
        markerStart={lineStartArrow ? 'url(#arrow-start)' : undefined}
        markerEnd={lineEndArrow ? 'url(#arrow-end)' : undefined}
      />
    </svg>
  );
}

/**
 * FreeShapeNode component renders shape annotations (rectangle, circle, line)
 */
const FreeShapeNodeComponent: React.FC<NodeProps<FreeShapeNodeData>> = ({ data, selected }) => {
  const {
    shapeType,
    width = 100,
    height = 100,
    endPosition,
    fillColor = 'rgba(100, 100, 100, 0.2)',
    fillOpacity = 0.2,
    borderColor = '#666',
    borderWidth = 2,
    borderStyle = 'solid',
    rotation = 0,
    lineStartArrow = false,
    lineEndArrow = false,
    lineArrowSize = 10,
    cornerRadius = 0
  } = data;

  const containerStyle: React.CSSProperties = useMemo(() => ({
    position: 'relative',
    transform: rotation && shapeType !== 'line' ? `rotate(${rotation}deg)` : undefined,
    cursor: 'move'
  }), [rotation, shapeType]);

  const isSelected = selected ?? false;

  return (
    <div style={containerStyle} className="free-shape-node">
      {shapeType === 'rectangle' && (
        <RectangleShape
          width={width}
          height={height}
          fillColor={fillColor}
          fillOpacity={fillOpacity}
          borderWidth={borderWidth}
          borderStyle={borderStyle}
          borderColor={borderColor}
          cornerRadius={cornerRadius}
          selected={isSelected}
        />
      )}
      {shapeType === 'circle' && (
        <CircleShape
          width={width}
          height={height}
          fillColor={fillColor}
          fillOpacity={fillOpacity}
          borderWidth={borderWidth}
          borderStyle={borderStyle}
          borderColor={borderColor}
          selected={isSelected}
        />
      )}
      {shapeType === 'line' && (
        <LineShape
          width={width}
          endPosition={endPosition}
          borderColor={borderColor}
          borderWidth={borderWidth}
          borderStyle={borderStyle}
          lineStartArrow={lineStartArrow}
          lineEndArrow={lineEndArrow}
          lineArrowSize={lineArrowSize}
          selected={isSelected}
        />
      )}
    </div>
  );
};

export const FreeShapeNode = memo(FreeShapeNodeComponent);
