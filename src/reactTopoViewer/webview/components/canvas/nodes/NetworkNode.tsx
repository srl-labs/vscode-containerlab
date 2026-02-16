/**
 * NetworkNode - Custom React Flow node for network endpoint nodes
 */
import React, { useMemo, memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NetworkNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { generateEncodedSVG } from "../../../icons/SvgGenerator";
import {
  useLinkCreationContext,
  useNodeRenderConfig,
  useEasterEggGlow
} from "../../../stores/canvasStore";

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
    case "ovs-bridge":
      return "#F59E0B"; // Amber
    default:
      return "#6B7280"; // Gray
  }
}

const ICON_SIZE = 40;

const HANDLE_POSITIONS = [
  { position: Position.Top, id: "top" },
  { position: Position.Right, id: "right" },
  { position: Position.Bottom, id: "bottom" },
  { position: Position.Left, id: "left" }
] as const;

/**
 * NetworkNode component renders network endpoint nodes (host, mgmt-net, etc.)
 */
const NetworkNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as NetworkNodeData;
  const { label, nodeType } = nodeData;
  const { linkSourceNode } = useLinkCreationContext();
  const { suppressLabels } = useNodeRenderConfig();
  const easterEggGlow = useEasterEggGlow();
  const [isHovered, setIsHovered] = useState(false);

  // Check if this node is a valid link target (in link creation mode and not the source node)
  // Network nodes do not support loop/self-referencing links
  const isLinkTarget = linkSourceNode !== null && linkSourceNode !== id;
  const showLinkTargetHighlight = isLinkTarget && isHovered;

  // Generate the SVG icon URL (cloud icon for all network nodes)
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
    // Easter egg glow takes priority
    if (easterEggGlow) {
      const { color, intensity } = easterEggGlow;
      const glowRadius = Math.round(8 + intensity * 12);
      const glowAlpha = (0.4 + intensity * 0.4).toFixed(2);
      return {
        outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
        outlineOffset: 1,
        boxShadow: `0 0 ${glowRadius}px rgba(${color.r}, ${color.g}, ${color.b}, ${glowAlpha})`
      };
    }
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
    backgroundColor: "var(--topoviewer-network-node-background)",
    borderRadius: 4,
    ...getOutlineStyle()
  };

  const labelStyle = useMemo(() => buildNodeLabelStyle({ marginTop: 4, fontSize: "0.65rem" }), []);

  return (
    <div
      style={containerStyle}
      className="network-node"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden handles for edge connections - not interactive */}
      {HANDLE_POSITIONS.map(({ position, id }) => (
        <React.Fragment key={id}>
          <Handle
            type="source"
            position={position}
            id={id}
            style={HIDDEN_HANDLE_STYLE}
            isConnectable={false}
          />
          <Handle
            type="target"
            position={position}
            id={`${id}-target`}
            style={HIDDEN_HANDLE_STYLE}
            isConnectable={false}
          />
        </React.Fragment>
      ))}

      {/* Node icon */}
      <div style={iconStyle} className="network-node-icon" />

      {/* Node label */}
      {!suppressLabels && (
        <div style={labelStyle} className="network-node-label">
          {label}
        </div>
      )}
    </div>
  );
};

function areNetworkNodePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

// Memoize to prevent unnecessary re-renders
export const NetworkNode = memo(NetworkNodeComponent, areNetworkNodePropsEqual);
