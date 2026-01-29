/**
 * TopologyNode - Custom React Flow node for network devices (router, switch, etc.)
 * Performance optimized: CSS hover, reduced handles, memoized styles
 */
import React, { useMemo, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR, ROLE_SVG_MAP } from "../types";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import {
  useLinkCreationContext,
  useNodeRenderConfig,
  useEasterEggGlow
} from "../../../stores/canvasStore";
import { useCustomIcons } from "../../../stores/topoViewerStore";

import { buildNodeLabelStyle, HIDDEN_HANDLE_STYLE } from "./nodeStyles";

/**
 * Map role to SVG node type (for built-in icons only)
 */
function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (mapped) return mapped as NodeType;
  return "pe"; // Default to PE router icon
}

const LABEL_STYLE = buildNodeLabelStyle({ marginTop: -2, fontSize: "0.7rem" });

// Icon style constants
const ICON_SIZE = 40;

// Constant styles extracted outside component to avoid recreation on every render
const CONTAINER_STYLE_BASE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "relative",
  width: ICON_SIZE,
  height: ICON_SIZE,
  overflow: "visible"
};

const CONTAINER_STYLE_LINK_TARGET: React.CSSProperties = {
  ...CONTAINER_STYLE_BASE,
  cursor: "crosshair"
};

const ICON_STYLE_BASE: React.CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  flexShrink: 0,
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
  const easterEggGlow = useEasterEggGlow();
  const customIcons = useCustomIcons();

  // Check if this node is a valid link target (in link creation mode)
  const isLinkTarget = linkSourceNode !== null;

  // Build custom icon map for efficient lookup
  const customIconMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ci of customIcons) {
      map.set(ci.name, ci.dataUri);
    }
    return map;
  }, [customIcons]);

  // Generate the icon URL - check custom icons first, then built-in
  const iconUrl = useMemo(() => {
    // Check if role matches a custom icon
    const customDataUri = customIconMap.get(role);
    if (customDataUri) {
      return customDataUri;
    }
    // Fall back to built-in SVG icons
    const svgType = getRoleSvgType(role);
    const color = iconColor || DEFAULT_ICON_COLOR;
    return generateEncodedSVG(svgType, color);
  }, [role, iconColor, customIconMap]);

  // Build icon style with dynamic properties
  const iconStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      ...ICON_STYLE_BASE,
      backgroundImage: `url(${iconUrl})`,
      borderRadius: iconCornerRadius ? `${iconCornerRadius}px` : 4,
      // Use outline for selection - doesn't affect layout
      outline: selected ? SELECTED_OUTLINE : "none",
      outlineOffset: 1
    };

    // Apply easter egg glow effect if active
    if (easterEggGlow) {
      const { color, intensity } = easterEggGlow;
      const glowRadius = Math.round(8 + intensity * 12);
      const glowAlpha = (0.4 + intensity * 0.4).toFixed(2);
      style.boxShadow = `0 0 ${glowRadius}px rgba(${color.r}, ${color.g}, ${color.b}, ${glowAlpha})`;
    }

    return style;
  }, [iconUrl, iconCornerRadius, selected, easterEggGlow]);

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
