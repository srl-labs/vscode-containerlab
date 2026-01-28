/**
 * CloudNode - Custom React Flow node for cloud/external endpoint nodes
 */
import React, { useMemo, memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { CloudNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { generateEncodedSVG } from "../../../icons/SvgGenerator";
import { useLinkCreationContext, useNodeRenderConfig } from "../../../stores/canvasStore";

import { buildNodeLabelStyle, HIDDEN_HANDLE_STYLE } from "./nodeStyles";

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

const ICON_SIZE = 40;

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
    width: ICON_SIZE,
    height: ICON_SIZE,
    overflow: "visible",
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
    width: ICON_SIZE,
    height: ICON_SIZE,
    flexShrink: 0,
    backgroundImage: `url(${svgUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    border: "1px solid #969799",
    ...getOutlineStyle()
  };

  const labelStyle = useMemo(() => buildNodeLabelStyle({ marginTop: 4, fontSize: "0.65rem" }), []);

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
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={HIDDEN_HANDLE_STYLE}
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
