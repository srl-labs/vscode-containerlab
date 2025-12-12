/**
 * FreeTextNode - Custom React Flow node for free text annotations
 */
import React, { memo, useMemo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { FreeTextNodeData } from '../types';
import { SELECTION_COLOR } from '../types';

/**
 * FreeTextNode component renders free text annotations on the canvas
 */
const FreeTextNodeComponent: React.FC<NodeProps<FreeTextNodeData>> = ({ data, selected }) => {
  const {
    text,
    fontSize = 14,
    fontColor = '#333',
    backgroundColor,
    fontWeight = 'normal',
    fontStyle = 'normal',
    textDecoration = 'none',
    textAlign = 'left',
    fontFamily = 'inherit',
    rotation = 0,
    width,
    height,
    roundedBackground = true
  } = data;

  // Container styles
  const containerStyle: React.CSSProperties = useMemo(() => ({
    display: 'inline-block',
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    cursor: 'move',
    position: 'relative'
  }), [rotation]);

  // Text styles
  const textStyle: React.CSSProperties = useMemo(() => ({
    fontSize: `${fontSize}px`,
    color: fontColor,
    fontWeight,
    fontStyle,
    textDecoration,
    textAlign,
    fontFamily,
    backgroundColor: backgroundColor || undefined,
    padding: backgroundColor ? '4px 8px' : undefined,
    borderRadius: roundedBackground && backgroundColor ? 4 : undefined,
    border: selected ? `2px solid ${SELECTION_COLOR}` : 'none',
    boxShadow: selected ? `0 0 0 2px ${SELECTION_COLOR}33` : 'none',
    minWidth: width,
    minHeight: height,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    transition: 'border 0.15s ease, box-shadow 0.15s ease',
    outline: 'none'
  }), [
    fontSize, fontColor, fontWeight, fontStyle, textDecoration,
    textAlign, fontFamily, backgroundColor, roundedBackground,
    selected, width, height
  ]);

  return (
    <div style={containerStyle} className="free-text-node">
      <div style={textStyle} className="free-text-content">
        {text}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const FreeTextNode = memo(FreeTextNodeComponent);
