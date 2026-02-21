import type { NodeProps } from "@xyflow/react";

import type { NetworkNodeData } from "../types";

export function getNetworkNodeTypeColor(nodeType: string): string {
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

export function toNetworkNodeData(data: NodeProps["data"]): NetworkNodeData {
  return {
    ...data,
    label: typeof data.label === "string" ? data.label : "",
    nodeType: typeof data.nodeType === "string" ? data.nodeType : "host"
  };
}
