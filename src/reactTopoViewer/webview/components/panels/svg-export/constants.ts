/**
 * SVG export style constants matching canvas rendering
 * These values are extracted from the React Flow node/edge components
 */

// ============================================================================
// Node Constants
// ============================================================================

/** Node icon size (matches TopologyNode.tsx ICON_SIZE) */
export const NODE_ICON_SIZE = 40;

/** Node icon corner radius */
export const NODE_ICON_RADIUS = 4;

/** Default icon color (matches graph.ts DEFAULT_ICON_COLOR) */
export const DEFAULT_ICON_COLOR = "#005aff";

// ============================================================================
// Node Label Constants (matches nodeStyles.ts LABEL_STYLE_BASE)
// ============================================================================

export const NODE_LABEL = {
  fontWeight: 500,
  color: "#FFFFFF",
  textShadowColor: "#3C3E41",
  textShadowBlur: 3,
  backgroundColor: "rgba(0, 0, 0, 0.85)",
  textStrokeColor: "rgba(0, 0, 0, 0.95)",
  textStrokeWidth: 0.8,
  paddingX: 4,
  paddingY: 1,
  borderRadius: 3,
  maxWidth: 80,
  fontSize: 11, // 0.7rem ≈ 11px
  /** Gap between icon and label */
  marginTop: 2,
} as const;

// ============================================================================
// Edge Constants (matches TopologyEdge.tsx)
// ============================================================================

export const EDGE_COLOR = {
  default: "#969799",
  up: "#00df2b",
  down: "#df2b00",
} as const;

export const EDGE_STYLE = {
  strokeWidth: 2.5,
  opacity: 0.5,
} as const;

/** Control point step size for parallel edge bezier curves */
export const CONTROL_POINT_STEP_SIZE = 40;

// ============================================================================
// Edge Label Constants (matches TopologyEdge.tsx LABEL_STYLE_BASE)
// ============================================================================

export const EDGE_LABEL = {
  fontSize: 9,
  fontFamily: "Helvetica, Arial, sans-serif",
  color: "#FFFFFF",
  backgroundColor: "#bec8d2",
  textStrokeColor: "rgba(0, 0, 0, 0.95)",
  textStrokeWidth: 0.6,
  outlineColor: "rgba(0, 0, 0, 0.25)",
  paddingX: 3,
  paddingY: 1,
  borderRadius: 4,
  /** Pixels from node edge for label positioning */
  offset: 18,
} as const;

// ============================================================================
// Network Node Type Colors (matches NetworkNode.tsx getNodeTypeColor)
// ============================================================================

export const NETWORK_TYPE_COLOR: Record<string, string> = {
  host: "#6B7280",
  "mgmt-net": "#3B82F6",
  macvlan: "#10B981",
  vxlan: "#8B5CF6",
  bridge: "#F59E0B",
  "ovs-bridge": "#F59E0B",
  default: "#6B7280",
} as const;

/** Get network node icon color by type */
export function getNetworkTypeColor(nodeType: string): string {
  return NETWORK_TYPE_COLOR[nodeType] ?? NETWORK_TYPE_COLOR.default;
}

// ============================================================================
// Role to SVG Type Mapping (matches graph.ts ROLE_SVG_MAP)
// ============================================================================

/** Map node role names to icon types */
export const ROLE_SVG_MAP: Record<string, string> = {
  router: "pe",
  "Provider Edge Router": "pe",
  "provider edge router": "pe",
  dcgw: "dcgw",
  "dcgw-evpn": "dcgw",
  leaf: "leaf",
  switch: "switch",
  bridge: "bridge",
  spine: "spine",
  "super-spine": "super-spine",
  server: "server",
  pon: "pon",
  controller: "controller",
  rgw: "rgw",
  ue: "ue",
  cloud: "cloud",
  client: "client",
} as const;

/** Get SVG node type from role string */
export function getRoleSvgType(role: string): string {
  return ROLE_SVG_MAP[role] ?? "pe";
}

// ============================================================================
// SVG Filter Definitions
// ============================================================================

/**
 * SVG filter for text shadow effect (matches nodeStyles.ts textShadow)
 */
export const TEXT_SHADOW_FILTER = `
<filter id="text-shadow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur"/>
  <feFlood flood-color="${NODE_LABEL.textShadowColor}" result="color"/>
  <feComposite in="color" in2="blur" operator="in" result="shadow"/>
  <feMerge>
    <feMergeNode in="shadow"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
`;

/**
 * Generate SVG defs section with all needed filters
 */
export function buildSvgDefs(): string {
  return `<defs>${TEXT_SHADOW_FILTER}</defs>`;
}

// ============================================================================
// XML Utilities
// ============================================================================

/**
 * Escape special XML characters for safe embedding in SVG
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
