/**
 * TopologyEdgeLite - Lightweight edge renderer for large/zoomed-out graphs
 */
import React, { memo } from "react";
import { getStraightPath, type EdgeProps } from "@xyflow/react";

import type { TopologyEdgeData } from "../types";
import { SELECTION_COLOR } from "../types";

const EDGE_COLOR_DEFAULT = "#969799";
const EDGE_COLOR_UP = "#00df2b";
const EDGE_COLOR_DOWN = "#df2b00";
const EDGE_WIDTH_NORMAL = 2;
const EDGE_WIDTH_SELECTED = 3;
const EDGE_OPACITY_NORMAL = 0.4;
const EDGE_OPACITY_SELECTED = 0.9;

function getStrokeColor(linkStatus: string | undefined, selected: boolean): string {
  if (selected) return SELECTION_COLOR;
  switch (linkStatus) {
    case "up":
      return EDGE_COLOR_UP;
    case "down":
      return EDGE_COLOR_DOWN;
    default:
      return EDGE_COLOR_DEFAULT;
  }
}

const TopologyEdgeLiteComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data
}) => {
  const edgeData = data as TopologyEdgeData | undefined;
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const stroke = getStrokeColor(edgeData?.linkStatus, selected ?? false);

  return (
    <path
      id={id}
      d={path}
      fill="none"
      style={{
        cursor: "pointer",
        opacity: selected ? EDGE_OPACITY_SELECTED : EDGE_OPACITY_NORMAL,
        strokeWidth: selected ? EDGE_WIDTH_SELECTED : EDGE_WIDTH_NORMAL,
        stroke
      }}
      className="react-flow__edge-path"
    />
  );
};

function areTopologyEdgeLitePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  return prev.selected === next.selected && prev.data === next.data;
}

export const TopologyEdgeLite = memo(TopologyEdgeLiteComponent, areTopologyEdgeLitePropsEqual);
