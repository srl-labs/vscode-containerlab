/**
 * TopologyNode - Custom React Flow node for network devices (router, switch, etc.)
 */
import React, { useMemo, memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TopologyNodeData } from '../types';
import { SELECTION_COLOR, DEFAULT_ICON_COLOR } from '../types';
import { generateEncodedSVG, type NodeType } from '../../../utils/SvgGenerator';
import { ROLE_SVG_MAP } from '../conversion';

/**
 * Map role to SVG node type
 */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return 'pe'; // Default to PE router icon
}

/**
 * TopologyNode component renders network device nodes with SVG icons
 */
const TopologyNodeComponent: React.FC<NodeProps<TopologyNodeData>> = ({ data, selected }) => {
  const { label, role, iconColor, iconCornerRadius } = data;

  // Generate the SVG icon URL
  const svgUrl = useMemo(() => {
    const svgType = getRoleSvgType(role);
    const color = iconColor || DEFAULT_ICON_COLOR;
    return generateEncodedSVG(svgType, color);
  }, [role, iconColor]);

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
    borderRadius: iconCornerRadius ? `${iconCornerRadius}px` : 0,
    border: selected ? `3px solid ${SELECTION_COLOR}` : 'none',
    boxShadow: selected ? `0 0 0 3px ${SELECTION_COLOR}33` : 'none',
    transition: 'border 0.15s ease, box-shadow 0.15s ease'
  };

  // Label styles
  const labelStyle: React.CSSProperties = {
    marginTop: -2,
    fontSize: '0.7rem',
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

  // Handle styles (invisible by default, visible on hover)
  const handleStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    backgroundColor: SELECTION_COLOR,
    border: '2px solid white',
    opacity: 0,
    transition: 'opacity 0.2s ease'
  };

  return (
    <div style={containerStyle} className="topology-node">
      {/* Source handles (all sides for flexibility) */}
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

      {/* Target handles (all sides for flexibility) */}
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
      <div style={iconStyle} className="topology-node-icon" />

      {/* Node label */}
      <div style={labelStyle} className="topology-node-label">
        {label}
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const TopologyNode = memo(TopologyNodeComponent);
