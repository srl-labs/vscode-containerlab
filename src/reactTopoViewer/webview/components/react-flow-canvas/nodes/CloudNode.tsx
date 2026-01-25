/**
 * CloudNode - Custom React Flow node for cloud/external endpoint nodes
 */
import React, { useMemo, memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { CloudNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { generateEncodedSVG } from "../../../utils/SvgGenerator";
import { useLinkCreationContext } from "../../../context/LinkCreationContext";
import { useNodeRenderConfig } from "../../../context/NodeRenderConfigContext";

/**
 * Get icon color based on node type
 */
function getNodeTypeColor(nodeType: string): string {
  switch (nodeType) {
    case "host":
      return "#6B7280"; // Gray
    case "mgmt-net":
      return "#3B82F6"; // Blue
    case "macvlan":
      return "#10B981"; // Green
    case "vxlan":
      return "#8B5CF6"; // Purple
    case "bridge":
      return "#F59E0B"; // Amber
    default:
      return "#6B7280"; // Gray
  }
}

/**
 * CloudNode component renders external endpoint nodes (host, mgmt-net, etc.)
 */
const CloudNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as CloudNodeData;
  const { label, nodeType } = nodeData;
  const { linkSourceNode } = useLinkCreationContext();
  const { suppressLabels } = useNodeRenderConfig();
  const [isHovered, setIsHovered] = useState(false);

  // Check if this node is a valid link target (in link creation mode and not the source node)
  // Cloud nodes do not support loop/self-referencing links
  const isLinkTarget = linkSourceNode !== null && linkSourceNode !== id;
  const showLinkTargetHighlight = isLinkTarget && isHovered;

  // Generate the SVG icon URL (cloud icon for all external nodes)
  const svgUrl = useMemo(() => {
    const color = getNodeTypeColor(nodeType);
    return generateEncodedSVG("cloud", color);
  }, [nodeType]);

  // Node container styles
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
    cursor: isLinkTarget ? "crosshair" : undefined
  };

  // Determine outline based on state - use outline to avoid layout shift
  const getOutlineStyle = (): React.CSSProperties => {
    if (showLinkTargetHighlight) {
      return {
        outline: `2px solid ${SELECTION_COLOR}`,
        outlineOffset: 1,
        boxShadow: `0 0 12px 4px ${SELECTION_COLOR}88`
      };
    }
    if (selected) {
      return {
        outline: `2px solid ${SELECTION_COLOR}`,
        outlineOffset: 1
      };
    }
    return {
      outline: "none"
    };
  };

  // Icon styles
  const iconStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    backgroundImage: `url(${svgUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    border: "1px solid #969799",
    ...getOutlineStyle()
  };

  // Label styles
  const labelStyle: React.CSSProperties = {
    marginTop: 4,
    fontSize: "0.65rem",
    fontWeight: 500,
    color: "#F5F5F5",
    textAlign: "center",
    textShadow: "0 0 3px #3C3E41",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: "1px 4px",
    borderRadius: 3,
    maxWidth: 80,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  };

  // Hidden handle style - needed for edge connections but not interactive
  const hiddenHandleStyle: React.CSSProperties = {
    opacity: 0,
    pointerEvents: "none",
    width: 1,
    height: 1
  };

  return (
    <div
      style={containerStyle}
      className="cloud-node"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden handles for edge connections - not interactive */}
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        style={hiddenHandleStyle}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={hiddenHandleStyle}
        isConnectable={false}
      />

      {/* Node icon */}
      <div style={iconStyle} className="cloud-node-icon" />

      {/* Node label */}
      {!suppressLabels && (
        <div style={labelStyle} className="cloud-node-label">
          {label}
        </div>
      )}
    </div>
  );
};

function areCloudNodePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

// Memoize to prevent unnecessary re-renders
export const CloudNode = memo(CloudNodeComponent, areCloudNodePropsEqual);
