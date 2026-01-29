/**
 * TopologyNodeLite - Lightweight node renderer for large/zoomed-out graphs
 */
import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR } from "../types";

import { HIDDEN_HANDLE_STYLE } from "./nodeStyles";

const ICON_SIZE = 40;

const CONTAINER_STYLE: React.CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const TopologyNodeLiteComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as TopologyNodeData;
  const color = nodeData.iconColor || DEFAULT_ICON_COLOR;
  const corner = nodeData.iconCornerRadius ?? 4;

  const iconStyle: React.CSSProperties = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    backgroundColor: color,
    borderRadius: corner,
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };

  return (
    <div style={CONTAINER_STYLE} className="topology-node-lite">
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

function areTopologyNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const TopologyNodeLite = memo(TopologyNodeLiteComponent, areTopologyNodeLitePropsEqual);
