/**
 * CloudNode - Custom React Flow node for cloud/external endpoint nodes
 */
import React, { useMemo, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CloudNodeData } from '../types';
import { SELECTION_COLOR } from '../types';
import { generateEncodedSVG } from '../../../utils/SvgGenerator';

/**
 * Get icon color based on node type
 */
function getNodeTypeColor(nodeType: string): string {
  switch (nodeType) {
    case 'host':
      return '#6B7280'; // Gray
    case 'mgmt-net':
      return '#3B82F6'; // Blue
    case 'macvlan':
      return '#10B981'; // Green
    case 'vxlan':
      return '#8B5CF6'; // Purple
    case 'bridge':
      return '#F59E0B'; // Amber
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * CloudNode component renders external endpoint nodes (host, mgmt-net, etc.)
 */
const CloudNodeComponent: React.FC<NodeProps<CloudNodeData>> = ({ data, selected }) => {
  const { label, nodeType } = data;

  // Generate the SVG icon URL (cloud icon for all external nodes)
  const svgUrl = useMemo(() => {
    const color = getNodeTypeColor(nodeType);
    return generateEncodedSVG('cloud', color);
  }, [nodeType]);

  // Node container styles
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative'
  };

  // Icon styles
  const iconStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    backgroundImage: `url(${svgUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#E8E8E8',
    borderRadius: 4,
    border: selected ? `3px solid ${SELECTION_COLOR}` : '1px solid #969799',
    boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}33` : 'none',
    transition: 'border 0.15s ease, box-shadow 0.15s ease'
  };

  // Label styles
  const labelStyle: React.CSSProperties = {
    marginTop: 4,
    fontSize: '0.65rem',
    fontWeight: 500,
    color: '#F5F5F5',
    textAlign: 'center',
    textShadow: '0 0 3px #3C3E41',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: '1px 4px',
    borderRadius: 3,
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  };

  // Handle styles
  const handleStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    backgroundColor: SELECTION_COLOR,
    border: '2px solid white',
    opacity: 0,
    transition: 'opacity 0.2s ease'
  };

  return (
    <div style={containerStyle} className="cloud-node">
      {/* Source handles */}
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        style={{ ...handleStyle, top: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{ ...handleStyle, right: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ ...handleStyle, bottom: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={{ ...handleStyle, left: -4 }}
        className="topology-node-handle"
      />

      {/* Target handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        style={{ ...handleStyle, top: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={{ ...handleStyle, right: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        style={{ ...handleStyle, bottom: -4 }}
        className="topology-node-handle"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={{ ...handleStyle, left: -4 }}
        className="topology-node-handle"
      />

      {/* Node icon */}
      <div style={iconStyle} className="cloud-node-icon" />

      {/* Node label */}
      <div style={labelStyle} className="cloud-node-label">
        {label}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const CloudNode = memo(CloudNodeComponent);
