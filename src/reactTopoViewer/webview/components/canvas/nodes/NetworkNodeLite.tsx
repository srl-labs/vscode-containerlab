/**
 * NetworkNodeLite - Lightweight renderer for network endpoint nodes
 */
import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";

import { SELECTION_COLOR } from "../types";

import { ICON_SIZE, LiteNodeShell } from "./NodeLiteBase";
import { getNodeDirectionRotation } from "./nodeStyles";
import { getNetworkNodeTypeColor, toNetworkNodeData } from "./networkNodeShared";

const NetworkNodeLiteComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = toNetworkNodeData(data);
  const color = getNetworkNodeTypeColor(nodeData.nodeType);
  const rotation = getNodeDirectionRotation(nodeData.direction);

  const iconStyle: React.CSSProperties = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    backgroundColor: color,
    borderRadius: 4,
    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1,
  };

  return <LiteNodeShell className="network-node-lite" iconStyle={iconStyle} />;
};

function areNetworkNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const NetworkNodeLite = memo(NetworkNodeLiteComponent, areNetworkNodeLitePropsEqual);
