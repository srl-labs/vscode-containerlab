/**
 * TopologyNode - Custom React Flow node for network devices (router, switch, etc.)
 * Performance optimized: CSS hover, reduced handles, memoized styles
 */
import React, { useMemo, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR, ROLE_SVG_MAP } from "../types";
import { generateEncodedSVG, type NodeType } from "../../../utils/SvgGenerator";
import { useLinkCreationContext, useNodeRenderConfig } from "../../../stores/canvasStore";

/**
 * Map role to SVG node type
 */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe"; // Default to PE router icon
}

// Constant styles extracted outside component to avoid recreation on every render
const CONTAINER_STYLE_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "relative"
};

const CONTAINER_STYLE_LINK_TARGET: React.CSSProperties = {
  ...CONTAINER_STYLE_BASE,
  cursor: "crosshair"
};

const LABEL_STYLE: React.CSSProperties = {
  marginTop: -2,
  fontSize: "0.7rem",
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

// Hidden handle style - only need one source and one target handle
// The floating edge calculates its own connection points
const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1
};

// Icon style constants
const ICON_SIZE = 40;
const ICON_STYLE_BASE: React.CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat"
};

// Selection styles - use outline to avoid layout shift
const SELECTED_OUTLINE = `2px solid ${SELECTION_COLOR}`;
// Hover highlight for link creation uses CSS :hover (see topology-node-icon.link-target:hover in CSS)

/**
 * TopologyNode component renders network device nodes with SVG icons
 */
const TopologyNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as TopologyNodeData;
  const { label, role, iconColor, iconCornerRadius } = nodeData;
  const { linkSourceNode } = useLinkCreationContext();
  const { suppressLabels } = useNodeRenderConfig();

  // Check if this node is a valid link target (in link creation mode)
  const isLinkTarget = linkSourceNode !== null;

  // Generate the SVG icon URL (cached at module level in SvgGenerator)
  const svgUrl = useMemo(() => {
    const svgType = getRoleSvgType(role);
    const color = iconColor || DEFAULT_ICON_COLOR;
    return generateEncodedSVG(svgType, color);
  }, [role, iconColor]);

  // Build icon style with dynamic properties
  const iconStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      ...ICON_STYLE_BASE,
      backgroundImage: `url(${svgUrl})`,
      borderRadius: iconCornerRadius ? `${iconCornerRadius}px` : 0,
      // Use outline for selection - doesn't affect layout
      outline: selected ? SELECTED_OUTLINE : "none",
      outlineOffset: 1
    };

    return style;
  }, [svgUrl, iconCornerRadius, selected]);

  // Container style based on link target mode
  const containerStyle = isLinkTarget ? CONTAINER_STYLE_LINK_TARGET : CONTAINER_STYLE_BASE;

  // Build class names for CSS-based hover effects
  const iconClassName = isLinkTarget ? "topology-node-icon link-target" : "topology-node-icon";

  return (
    <div style={containerStyle} className="topology-node">
      {/* Single source and target handles for edge connections.
          The floating edge style calculates actual connection points dynamically,
          so we only need one handle per type. */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={HIDDEN_HANDLE_STYLE}
        isConnectable={false}
      />

      {/* Node icon - hover effect for link creation handled via CSS */}
      <div style={iconStyle} className={iconClassName} />

      {/* Node label */}
      {!suppressLabels && (
        <div style={LABEL_STYLE} className="topology-node-label">
          {label}
        </div>
      )}
    </div>
  );
};

function areTopologyNodePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

// Memoize to prevent unnecessary re-renders
export const TopologyNode = memo(TopologyNodeComponent, areTopologyNodePropsEqual);
