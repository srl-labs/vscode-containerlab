/**
 * TopologyNodeLite - Lightweight node renderer for large/zoomed-out graphs
 */
import React, { memo, useMemo } from "react";
import type { NodeProps } from "@xyflow/react";

import type { TopologyNodeData } from "../types";
import { SELECTION_COLOR, DEFAULT_ICON_COLOR } from "../types";
import { useLinkLabelMode, useTopoViewerStore } from "../../../stores/topoViewerStore";
import { clampGrafanaNodeSizePx } from "../../../utils/grafanaInterfaceLabels";

import { ICON_SIZE, LiteNodeShell } from "./NodeLiteBase";
import { getNodeDirectionRotation } from "./nodeStyles";

function toTopologyNodeData(data: NodeProps["data"]): TopologyNodeData {
  return {
    ...data,
    label: typeof data.label === "string" ? data.label : "",
    role: typeof data.role === "string" ? data.role : ""
  };
}

const TopologyNodeLiteComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = toTopologyNodeData(data);
  const linkLabelMode = useLinkLabelMode();
  const grafanaNodeSizePx = useTopoViewerStore((state) => state.grafanaNodeSizePx);
  const iconSize = useMemo(
    () => (linkLabelMode === "grafana" ? clampGrafanaNodeSizePx(grafanaNodeSizePx) : ICON_SIZE),
    [linkLabelMode, grafanaNodeSizePx]
  );
  const color = nodeData.iconColor ?? DEFAULT_ICON_COLOR;
  const corner = nodeData.iconCornerRadius ?? 4;
  const rotation = getNodeDirectionRotation(nodeData.direction);

  const iconStyle: React.CSSProperties = {
    width: iconSize,
    height: iconSize,
    backgroundColor: color,
    borderRadius: corner,
    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
    outline: selected ? `2px solid ${SELECTION_COLOR}` : "none",
    outlineOffset: 1
  };

  return <LiteNodeShell className="topology-node-lite" iconStyle={iconStyle} size={iconSize} />;
};

function areTopologyNodeLitePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  return prev.data === next.data && prev.selected === next.selected;
}

export const TopologyNodeLite = memo(TopologyNodeLiteComponent, areTopologyNodeLitePropsEqual);
