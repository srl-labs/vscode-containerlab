/**
 * NetworkNodeLite - Lightweight renderer for network endpoint nodes
 */
import React, { memo } from "react";
import type { NodeProps } from "@xyflow/react";

import type { NetworkNodeData } from "../types";
import { SELECTION_COLOR } from "../types";

import { ICON_SIZE, LiteNodeShell } from "./NodeLiteBase";
import { getNodeDirectionRotation } from "./nodeStyles";

function getNodeTypeColor(nodeType: string): string {
  switch (nodeType) {
    case "host":
      return "#6B7280";
    case "mgmt-net":
      return "#3B82F6";
    case "macvlan":
      return "#10B981";
    case "vxlan":
      return "#8B5CF6";
    case "bridge":
    case "ovs-bridge":
      return "#F59E0B";
    default:
      return "#6B7280";
  }
}

function toNetworkNodeData(data: NodeProps["data"]): NetworkNodeData {
  return {
    ...data,
    label: typeof data.label === "string" ? data.label : "",
    nodeType: typeof data.nodeType === "string" ? data.nodeType : "host"
  };
}

const NetworkNodeLiteComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = toNetworkNodeData(data);
  const color = getNodeTypeColor(nodeData.nodeType);
  const rotation = getNodeDirectionRotation(nodeData.direction);

  const iconStyle: React.CSSProperties = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    backgroundColor: color,
    borderRadius: 4,
    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };

  return <LiteNodeShell className="network-node-lite" iconStyle={iconStyle} />;
};

function areNetworkNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const NetworkNodeLite = memo(NetworkNodeLiteComponent, areNetworkNodeLitePropsEqual);
