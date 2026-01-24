/**
 * GroupNode - Custom React Flow node for group containers
 */
import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';

import type { GroupNodeData } from '../types';
import { SELECTION_COLOR } from '../types';
import { useNodeRenderConfig } from '../../../context/NodeRenderConfigContext';

/**
 * GroupNode component renders group container nodes
 * Groups can contain other nodes via React Flow's parentId property
 */
const GroupNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as GroupNodeData;
  const {
    label,
    width,
    height,
    backgroundColor = 'rgba(200, 200, 200, 0.2)',
    backgroundOpacity = 0.2,
    borderColor = '#888',
    borderWidth = 2,
    borderStyle = 'dashed',
    borderRadius = 8,
    labelColor = '#333',
    labelPosition = 'top-left'
  } = nodeData;
  const { suppressLabels } = useNodeRenderConfig();

  // Container styles
  const containerStyle: React.CSSProperties = {
    width,
    height,
    backgroundColor: backgroundColor.startsWith('rgba')
      ? backgroundColor
      : `${backgroundColor}${Math.round(backgroundOpacity * 255).toString(16).padStart(2, '0')}`,
    border: selected
      ? `3px solid ${SELECTION_COLOR}`
      : `${borderWidth}px ${borderStyle} ${borderColor}`,
    borderRadius,
    position: 'relative',
    boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}33` : 'none',
    transition: 'border 0.15s ease, box-shadow 0.15s ease'
  };

  // Label position styles
  const getLabelPosition = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      fontSize: '0.75rem',
      fontWeight: 600,
      color: labelColor,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      padding: '2px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      zIndex: 1
    };

    switch (labelPosition) {
      case 'top-center':
        return { ...base, top: -12, left: '50%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { ...base, top: -12, right: 8 };
      case 'bottom-left':
        return { ...base, bottom: -12, left: 8 };
      case 'bottom-center':
        return { ...base, bottom: -12, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-right':
        return { ...base, bottom: -12, right: 8 };
      case 'top-left':
      default:
        return { ...base, top: -12, left: 8 };
    }
  };

  return (
    <div style={containerStyle} className="group-node">
      {/* Group label */}
      {!suppressLabels && (
        <div style={getLabelPosition()} className="group-node-label">
          {label}
        </div>
      )}
    </div>
  );
};

function areGroupNodePropsEqual(
  prev: NodeProps,
  next: NodeProps
): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

// Memoize to prevent unnecessary re-renders
export const GroupNode = memo(GroupNodeComponent, areGroupNodePropsEqual);
