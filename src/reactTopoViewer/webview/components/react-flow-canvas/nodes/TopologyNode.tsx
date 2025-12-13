/**
 * TopologyNode - Custom React Flow node for network devices (router, switch, etc.)
 */
import React, { useMemo, memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TopologyNodeData } from '../types';
import { SELECTION_COLOR, DEFAULT_ICON_COLOR } from '../types';
import { generateEncodedSVG, type NodeType } from '../../../utils/SvgGenerator';
import { ROLE_SVG_MAP } from '../conversion';
import { useLinkCreationContext } from '../../../context/LinkCreationContext';

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
const TopologyNodeComponent: React.FC<NodeProps<TopologyNodeData>> = ({ id, data, selected }) => {
  const { label, role, iconColor, iconCornerRadius } = data;
  const { linkSourceNode } = useLinkCreationContext();
  const [isHovered, setIsHovered] = useState(false);

  // Check if this node is a valid link target (in link creation mode)
  // Source node can also be a target for loop/self-referencing links
  const isLinkTarget = linkSourceNode !== null;
  const showLinkTargetHighlight = isLinkTarget && isHovered;

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
    position: 'relative',
    cursor: isLinkTarget ? 'crosshair' : undefined
  };

  // Determine border and shadow based on state
  const getBorderAndShadow = () => {
    if (showLinkTargetHighlight) {
      return {
        border: `3px solid ${SELECTION_COLOR}`,
        boxShadow: `0 0 12px 4px ${SELECTION_COLOR}88`
      };
    }
    if (selected) {
      return {
        border: `3px solid ${SELECTION_COLOR}`,
        boxShadow: `0 0 0 3px ${SELECTION_COLOR}33`
      };
    }
    return {
      border: 'none',
      boxShadow: 'none'
    };
  };

  const { border, boxShadow } = getBorderAndShadow();

  // Icon styles
  const iconStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    backgroundImage: `url(${svgUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderRadius: iconCornerRadius ? `${iconCornerRadius}px` : 0,
    border,
    boxShadow,
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

  // Hidden handle style - needed for edge connections but not interactive
  const hiddenHandleStyle: React.CSSProperties = {
    opacity: 0,
    pointerEvents: 'none',
    width: 1,
    height: 1
  };

  return (
    <div
      style={containerStyle}
      className="topology-node"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden handles for edge connections - not interactive */}
      <Handle type="source" position={Position.Top} id="top" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="right" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="source" position={Position.Left} id="left" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Top} id="top-target" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Right} id="right-target" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={hiddenHandleStyle} isConnectable={false} />
      <Handle type="target" position={Position.Left} id="left-target" style={hiddenHandleStyle} isConnectable={false} />

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
