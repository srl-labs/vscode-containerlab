/**
 * TopologyNodeLite - Lightweight node renderer for large/zoomed-out graphs
 */
import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR } from "../types";

import { ICON_SIZE, LiteNodeShell } from "./NodeLiteBase";

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

  return <LiteNodeShell className="topology-node-lite" iconStyle={iconStyle} />;
};

function areTopologyNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const TopologyNodeLite = memo(TopologyNodeLiteComponent, areTopologyNodeLitePropsEqual);
