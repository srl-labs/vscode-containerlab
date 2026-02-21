/**
 * TopologyNode - Custom React Flow node for network devices (router, switch, etc.)
 * Performance optimized: CSS hover, reduced handles, memoized styles
 */
import React, { useMemo, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR, ROLE_SVG_MAP } from "../types";
import { generateEncodedSVG, type NodeType } from "../../../icons/SvgGenerator";
import {
  useLinkCreationContext,
  useNodeRenderConfig,
  useEasterEggGlow
} from "../../../stores/canvasStore";
import { useCustomIcons, useDeploymentState } from "../../../stores/topoViewerStore";
import { getCustomIconMap } from "../../../utils/iconUtils";

import {
  buildNodeLabelStyle,
  HIDDEN_HANDLE_STYLE,
  getNodeDirectionRotation,
  getNodeRuntimeBadgeState,
  type NodeRuntimeBadgeState
} from "./nodeStyles";

/**
 * Map role to SVG node type (for built-in icons only)
 */
const NODE_TYPE_SET: ReadonlySet<string> = new Set([
  "pe",
  "dcgw",
  "leaf",
  "switch",
  "spine",
  "super-spine",
  "server",
  "pon",
  "controller",
  "rgw",
  "ue",
  "cloud",
  "client",
  "bridge"
]);

function isNodeType(value: string): value is NodeType {
  return NODE_TYPE_SET.has(value);
}

const FALLBACK_NODE_DATA: TopologyNodeData = {
  label: "",
  role: "default"
};

function isTopologyNodeData(value: unknown): value is TopologyNodeData {
  if (typeof value !== "object" || value === null) return false;
  const label: unknown = Reflect.get(value, "label");
  const role: unknown = Reflect.get(value, "role");
  return typeof label === "string" && typeof role === "string";
}

function getRoleSvgType(role: string): NodeType {
  const mapped = ROLE_SVG_MAP[role];
  if (isNodeType(mapped)) return mapped;
  return "pe"; // Default to PE router icon
}

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

const BADGE_STYLE_BASE: React.CSSProperties = {
  position: "absolute",
  right: -3,
  bottom: -3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 12,
  height: 12,
  lineHeight: 0,
  borderRadius: 999,
  pointerEvents: "none",
  zIndex: 4
};

function getRuntimeBadgeColors(state: NodeRuntimeBadgeState): {
  bg: string;
  border: string;
  icon: string;
} {
  switch (state) {
    case "running":
      return { bg: "#16A34A", border: "#14532D", icon: "#ECFDF5" };
    case "paused":
      return { bg: "#F59E0B", border: "#78350F", icon: "#FFFBEB" };
    case "undeployed":
      return { bg: "#64748B", border: "#334155", icon: "#F8FAFC" };
    default:
      return { bg: "#EF4444", border: "#7F1D1D", icon: "#FFF1F2" };
  }
}

function getRuntimeBadgeIcon(state: NodeRuntimeBadgeState, iconColor: string): React.ReactElement {
  switch (state) {
    case "running":
      return <PlayArrowRoundedIcon sx={{ fontSize: "0.52rem", color: iconColor }} />;
    case "paused":
      return <PauseRoundedIcon sx={{ fontSize: "0.52rem", color: iconColor }} />;
    case "undeployed":
      return <BlockRoundedIcon sx={{ fontSize: "0.52rem", color: iconColor }} />;
    default:
      return <StopRoundedIcon sx={{ fontSize: "0.52rem", color: iconColor }} />;
  }
}

// Selection styles - use outline to avoid layout shift
const SELECTED_OUTLINE = `2px solid ${SELECTION_COLOR}`;
// Hover highlight for link creation uses CSS :hover (see topology-node-icon.link-target:hover in CSS)

/**
 * TopologyNode component renders network device nodes with SVG icons
 */
const TopologyNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = isTopologyNodeData(data) ? data : FALLBACK_NODE_DATA;
  const {
    label,
    role,
    iconColor,
    iconCornerRadius,
    state,
    labelPosition,
    direction,
    labelBackgroundColor
  } = nodeData;
  const { linkSourceNode } = useLinkCreationContext();
  const { suppressLabels } = useNodeRenderConfig();
  const easterEggGlow = useEasterEggGlow();
  const customIcons = useCustomIcons();
  const deploymentState = useDeploymentState();
  const directionRotation = useMemo(() => getNodeDirectionRotation(direction), [direction]);

  // Check if this node is a valid link target (in link creation mode)
  const isLinkTarget = linkSourceNode !== null;

  // Build custom icon map for efficient lookup
  const customIconMap = useMemo(() => getCustomIconMap(customIcons), [customIcons]);

  // Generate the icon URL - check custom icons first, then built-in
  const iconUrl = useMemo(() => {
    // Check if role matches a custom icon
    const customDataUri = customIconMap.get(role);
    if (customDataUri !== undefined && customDataUri.length > 0) {
      return customDataUri;
    }
    // Fall back to built-in SVG icons
    const svgType = getRoleSvgType(role);
    const color = iconColor ?? DEFAULT_ICON_COLOR;
    return generateEncodedSVG(svgType, color);
  }, [role, iconColor, customIconMap]);

  // Build icon style with dynamic properties
  const iconStyle = useMemo((): React.CSSProperties => {
    const style: React.CSSProperties = {
      ...ICON_STYLE_BASE,
      backgroundImage: `url(${iconUrl})`,
      borderRadius: typeof iconCornerRadius === "number" ? `${iconCornerRadius}px` : 4,
      transform: directionRotation !== 0 ? `rotate(${directionRotation}deg)` : undefined,
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
  }, [iconUrl, iconCornerRadius, directionRotation, selected, easterEggGlow]);

  // Container style based on link target mode
  const containerStyle = isLinkTarget ? CONTAINER_STYLE_LINK_TARGET : CONTAINER_STYLE_BASE;

  // Build class names for CSS-based hover effects
  const iconClassName = isLinkTarget ? "topology-node-icon link-target" : "topology-node-icon";

  const runtimeBadgeState = useMemo(
    () => getNodeRuntimeBadgeState(deploymentState, state),
    [deploymentState, state]
  );
  const runtimeBadgeColors = useMemo(
    () => getRuntimeBadgeColors(runtimeBadgeState),
    [runtimeBadgeState]
  );
  const runtimeBadgeIcon = useMemo(
    () => getRuntimeBadgeIcon(runtimeBadgeState, runtimeBadgeColors.icon),
    [runtimeBadgeState, runtimeBadgeColors.icon]
  );
  const runtimeBadgeStyle = useMemo(
    () => ({
      ...BADGE_STYLE_BASE,
      backgroundColor: runtimeBadgeColors.bg,
      border: `1px solid ${runtimeBadgeColors.border}`
    }),
    [runtimeBadgeColors.bg, runtimeBadgeColors.border]
  );
  const labelStyle = useMemo(
    () =>
      buildNodeLabelStyle({
        position: labelPosition,
        direction,
        backgroundColor: labelBackgroundColor,
        iconSize: ICON_SIZE,
        fontSize: "0.7rem",
        maxWidth: 110
      }),
    [labelPosition, direction, labelBackgroundColor]
  );

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
      <div
        style={runtimeBadgeStyle}
        className={`react-flow__node-badge topology-node-runtime-badge state-${runtimeBadgeState}`}
      >
        {runtimeBadgeIcon}
      </div>

      {/* Node label */}
      {!suppressLabels && (
        <div style={labelStyle} className="topology-node-label">
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
