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

export function buildNodeLabelStyle(params: {
  marginTop: number;
  fontSize: string;
}): React.CSSProperties {
  return {
    ...LABEL_STYLE_BASE,
    marginTop: params.marginTop,
    fontSize: params.fontSize
  };
}
