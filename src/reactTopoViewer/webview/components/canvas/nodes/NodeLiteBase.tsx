/**
 * Shared lightweight node shell for large/zoomed-out graphs.
 */
import React from "react";
import { Handle, Position } from "@xyflow/react";

import { HIDDEN_HANDLE_STYLE } from "./nodeStyles";

export const ICON_SIZE = 40;

const CONTAINER_STYLE_BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

interface LiteNodeShellProps {
  className: string;
  iconStyle: React.CSSProperties;
  size?: number;
}

export const LiteNodeShell: React.FC<LiteNodeShellProps> = ({
  className,
  iconStyle,
  size = ICON_SIZE
}) => {
  const containerStyle: React.CSSProperties = {
    ...CONTAINER_STYLE_BASE,
    width: size,
    height: size
  };
  return (
    <div style={containerStyle} className={className}>
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
      <div style={iconStyle} />
    </div>
  );
};
