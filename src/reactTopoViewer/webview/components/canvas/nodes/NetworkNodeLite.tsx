/**
 * NetworkNodeLite - Lightweight renderer for network endpoint nodes
 */
import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NetworkNodeData } from "../types";
import { SELECTION_COLOR } from "../types";

import { HIDDEN_HANDLE_STYLE } from "./nodeStyles";

const ICON_SIZE = 40;

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

const CONTAINER_STYLE: React.CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const NetworkNodeLiteComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as NetworkNodeData;
  const color = getNodeTypeColor(nodeData.nodeType);

  const iconStyle: React.CSSProperties = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    backgroundColor: color,
    borderRadius: 4,
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };

  return (
    <div style={CONTAINER_STYLE} className="network-node-lite">
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

function areNetworkNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const NetworkNodeLite = memo(NetworkNodeLiteComponent, areNetworkNodeLitePropsEqual);
