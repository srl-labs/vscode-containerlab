/**
 * FreeTextNode - Custom React Flow node for free text annotations
 * Supports markdown rendering via markdown-it
 */
import React, { memo, useMemo, useCallback } from 'react';
import { type NodeProps, NodeResizer, type ResizeParams } from '@xyflow/react';
import type { FreeTextNodeData } from '../types';
import { SELECTION_COLOR } from '../types';
import { useTopoViewer } from '../../../context/TopoViewerContext';
import { useAnnotationHandlers } from '../../../context/AnnotationHandlersContext';
import { renderMarkdown } from '../../../utils/markdownRenderer';

/** Minimum dimensions for resize */
const MIN_WIDTH = 40;
const MIN_HEIGHT = 20;

/** Build container style for free text node */
function buildContainerStyle(
  rotation: number,
  width: number | undefined,
  height: number | undefined
): React.CSSProperties {
  return {
    display: 'inline-block',
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    cursor: 'move',
    position: 'relative',
    width: width ? `${width}px` : 'auto',
    height: height ? `${height}px` : 'auto',
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT
  };
}

/** Build text style for free text content */
function buildTextStyle(
  data: FreeTextNodeData,
  selected: boolean | undefined
): React.CSSProperties {
  const {
    fontSize = 14,
    fontColor = '#333',
    backgroundColor,
    fontWeight = 'normal',
    fontStyle = 'normal',
    textDecoration = 'none',
    textAlign = 'left',
    fontFamily = 'inherit',
    roundedBackground = true
  } = data;

  return {
    fontSize: `${fontSize}px`,
    color: fontColor,
    fontWeight,
    fontStyle,
    textDecoration,
    textAlign,
    fontFamily,
    backgroundColor: backgroundColor || undefined,
    padding: backgroundColor ? '4px 8px' : '4px',
    borderRadius: roundedBackground && backgroundColor ? 4 : undefined,
    border: selected ? `2px solid ${SELECTION_COLOR}` : 'none',
    boxShadow: selected ? `0 0 0 2px ${SELECTION_COLOR}33` : 'none',
    width: '100%',
    height: '100%',
    transition: 'border 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    overflow: 'auto'
  };
}

/**
 * FreeTextNode component renders free text annotations on the canvas
 * with markdown support
 */
const FreeTextNodeComponent: React.FC<NodeProps<FreeTextNodeData>> = ({ id, data, selected }) => {
  const { state } = useTopoViewer();
  const annotationHandlers = useAnnotationHandlers();
  const isEditMode = state.mode === 'edit' && !state.isLocked;

  // Handle resize end - persist new size to annotation state
  const handleResizeEnd = useCallback((_event: unknown, params: ResizeParams) => {
    annotationHandlers?.onUpdateFreeTextSize?.(id, params.width, params.height);
  }, [id, annotationHandlers]);

  // Render markdown content
  const renderedHtml = useMemo(() => renderMarkdown(data.text || ''), [data.text]);
  const containerStyle = useMemo(() => buildContainerStyle(data.rotation || 0, data.width, data.height), [data.rotation, data.width, data.height]);
  const textStyle = useMemo(() => buildTextStyle(data, selected), [data, selected]);

  return (
    <div style={containerStyle} className="free-text-node">
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={selected && isEditMode}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeEnd={handleResizeEnd}
      />
      <div
        style={textStyle}
        className="free-text-content free-text-markdown"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const FreeTextNode = memo(FreeTextNodeComponent);
