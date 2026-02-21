import type React from "react";

export const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  width: 1,
  height: 1
};

const LABEL_STYLE_BASE: React.CSSProperties = {
  fontWeight: 500,
  color: "#F5F5F5",
  textAlign: "center",
  textShadow: "0 0 3px #3C3E41",
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  padding: "1px 4px",
  borderRadius: 3,
  flexShrink: 0,
  maxWidth: 80,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};

export type NodeLabelPosition = "top" | "right" | "bottom" | "left";
export type NodeDirection = "up" | "right" | "down" | "left";

const NODE_DIRECTION_ROTATION: Record<NodeDirection, number> = {
  right: 0,
  down: 90,
  left: 180,
  up: 270
};

export function normalizeNodeLabelPosition(value: unknown): NodeLabelPosition {
  switch (value) {
    case "top":
    case "right":
    case "left":
      return value;
    default:
      return "bottom";
  }
}

export function normalizeNodeDirection(value: unknown): NodeDirection {
  switch (value) {
    case "up":
    case "right":
    case "down":
    case "left":
      return value;
    default:
      return "right";
  }
}

export function getNodeDirectionRotation(value: unknown): number {
  return NODE_DIRECTION_ROTATION[normalizeNodeDirection(value)];
}

export function buildNodeLabelStyle(params: {
  position: unknown;
  direction?: unknown;
  backgroundColor?: unknown;
  iconSize: number;
  fontSize: string;
  maxWidth?: number;
  gap?: number;
}): React.CSSProperties {
  const gap = params.gap ?? 2;
  const normalizedDirection = normalizeNodeDirection(params.direction);
  const isVerticalText = normalizedDirection === "up" || normalizedDirection === "down";
  const verticalGap = gap + (isVerticalText ? 2 : 0);
  const sideOverlap = isVerticalText ? 2 : 6;
  const rotation = getNodeDirectionRotation(params.direction);
  const rotateTransform = rotation !== 0 ? ` rotate(${rotation}deg)` : "";
  const labelBgColor =
    typeof params.backgroundColor === "string" && params.backgroundColor.trim().length > 0
      ? params.backgroundColor.trim()
      : undefined;
  const baseStyle: React.CSSProperties = {
    ...LABEL_STYLE_BASE,
    position: "absolute",
    fontSize: params.fontSize,
    maxWidth: params.maxWidth ?? LABEL_STYLE_BASE.maxWidth,
    transformOrigin: "center center",
    ...(labelBgColor !== undefined && labelBgColor.length > 0
      ? { backgroundColor: labelBgColor }
      : {})
  };

  switch (normalizeNodeLabelPosition(params.position)) {
    case "top":
      return {
        ...baseStyle,
        bottom: params.iconSize + verticalGap,
        left: "50%",
        transform: `translateX(-50%)${rotateTransform}`
      };
    case "right":
      return {
        ...baseStyle,
        left: params.iconSize - sideOverlap,
        top: "50%",
        transform: `translateY(-50%)${rotateTransform}`
      };
    case "left":
      return {
        ...baseStyle,
        right: params.iconSize - sideOverlap,
        top: "50%",
        transform: `translateY(-50%)${rotateTransform}`
      };
    default:
      return {
        ...baseStyle,
        top: params.iconSize + verticalGap,
        left: "50%",
        transform: `translateX(-50%)${rotateTransform}`
      };
  }
}

export type NodeRuntimeBadgeState = "running" | "stopped" | "paused" | "undeployed";

export function getNodeRuntimeBadgeState(
  deploymentState: "deployed" | "undeployed" | "unknown",
  rawState: string | undefined
): NodeRuntimeBadgeState {
  if (deploymentState !== "deployed") {
    return "undeployed";
  }

  const state = rawState?.trim().toLowerCase() ?? "";
  if (state.includes("pause")) {
    return "paused";
  }
  if (state.includes("run") || state.includes("healthy")) {
    return "running";
  }
  return "stopped";
}
