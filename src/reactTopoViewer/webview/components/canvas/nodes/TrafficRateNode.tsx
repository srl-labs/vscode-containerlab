import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, type NodeProps, type ResizeParams } from "@xyflow/react";

import type { TrafficRateNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { TrafficChart } from "../../panels/TrafficChart";
import { useAnnotationHandlers } from "../../../stores/canvasStore";
import { useGraphStore } from "../../../stores/graphStore";
import { useIsLocked } from "../../../stores/topoViewerStore";
import { resolveTrafficRateStats } from "../../../utils/trafficRateAnnotation";

const MIN_WIDTH = 180;
const MIN_HEIGHT = 120;
const REF_WIDTH = 260;
const REF_HEIGHT = 180;
const DEFAULT_BACKGROUND = "#1e1e1e";
const DEFAULT_BORDER_COLOR = "#3f3f46";
const DEFAULT_BORDER_WIDTH = 1;
const DEFAULT_BORDER_STYLE: NonNullable<TrafficRateNodeData["borderStyle"]> = "solid";
const DEFAULT_BORDER_RADIUS = 8;
const DEFAULT_TEXT_COLOR = "#9aa0a6";

/** Compute a scale factor from current dimensions relative to reference size. */
function computeScale(width: number, height: number): number {
  const sw = width / REF_WIDTH;
  const sh = height / REF_HEIGHT;
  return Math.max(0.65, Math.min(2.0, Math.sqrt(sw * sh)));
}

function getBackgroundWithOpacity(color: string, opacity?: number): string {
  if (opacity === undefined || !Number.isFinite(opacity)) return color;
  const clamped = Math.min(100, Math.max(0, opacity));
  if (color.startsWith("rgba")) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${clamped / 100})`;
    }
  }
  if (color.startsWith("#")) {
    const alpha = Math.round((clamped / 100) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${color}${alpha}`;
  }
  return color;
}

const TrafficRateNodeComponent: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as TrafficRateNodeData;
  const edges = useGraphStore((state) => state.edges);
  const isLocked = useIsLocked();
  const annotationHandlers = useAnnotationHandlers();
  const canEditAnnotations = !isLocked;
  const isSelected = selected ?? false;
  const showResizer = isSelected && canEditAnnotations;

  const resolution = useMemo(
    () => resolveTrafficRateStats(edges, nodeData.nodeId, nodeData.interfaceName),
    [edges, nodeData.nodeId, nodeData.interfaceName]
  );

  const handleResizeEnd = useCallback(
    (_event: unknown, params: ResizeParams) => {
      annotationHandlers?.onUpdateTrafficRateSize?.(id, params.width, params.height);
      annotationHandlers?.onPersistAnnotations?.();
    },
    [annotationHandlers, id]
  );

  const isConfigured = Boolean(nodeData.nodeId && nodeData.interfaceName);
  const subtitle = isConfigured
    ? `${nodeData.nodeId}:${nodeData.interfaceName}`
    : "Double-click to configure";
  const background = getBackgroundWithOpacity(
    nodeData.backgroundColor ?? DEFAULT_BACKGROUND,
    nodeData.backgroundOpacity
  );
  const borderColor = nodeData.borderColor ?? DEFAULT_BORDER_COLOR;
  const borderWidth = nodeData.borderWidth ?? DEFAULT_BORDER_WIDTH;
  const borderStyle = nodeData.borderStyle ?? DEFAULT_BORDER_STYLE;
  const borderRadius = nodeData.borderRadius ?? DEFAULT_BORDER_RADIUS;
  const showLegend = nodeData.showLegend !== false;
  const textColor = nodeData.textColor ?? DEFAULT_TEXT_COLOR;
  const hintColor = nodeData.textColor ?? "#8b949e";
  const nodeWidth = typeof nodeData.width === "number" ? nodeData.width : MIN_WIDTH;
  const nodeHeight = typeof nodeData.height === "number" ? nodeData.height : MIN_HEIGHT;
  const scale = computeScale(nodeWidth, nodeHeight);
  const subtitleFontSize = Math.round(11 * scale);
  const hintFontSize = Math.round(11 * scale);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        borderRadius,
        border: `${borderWidth}px ${borderStyle} ${borderColor}`,
        outline: isSelected ? `2px solid ${SELECTION_COLOR}` : "none",
        outlineOffset: 0,
        background,
        color: textColor,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        cursor: "move",
        overflow: "hidden"
      }}
    >
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        isVisible={showResizer}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeEnd={handleResizeEnd}
      />
      <div
        style={{
          fontSize: subtitleFontSize,
          lineHeight: 1.2,
          color: textColor,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flexShrink: 0,
          marginBottom: 4
        }}
      >
        {subtitle}
      </div>

      {!isConfigured ? (
        <div style={{ fontSize: Math.round(12 * scale), color: hintColor, marginTop: 4 }}>
          Select node and interface in the editor.
        </div>
      ) : (
        <>
          <div style={{ width: "100%", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <TrafficChart
              stats={resolution.stats}
              endpointKey={`${resolution.endpointKey}:${id}`}
              compact
              showLegend={showLegend}
              scale={scale}
              emptyMessage={null}
            />
          </div>
          {resolution.endpointCount === 0 && (
            <div style={{ fontSize: hintFontSize, color: hintColor, flexShrink: 0 }}>
              No live interface stats available yet.
            </div>
          )}
          {resolution.endpointCount > 1 && (
            <div style={{ fontSize: hintFontSize, color: hintColor, flexShrink: 0 }}>
              Aggregated from {resolution.endpointCount} matching endpoints.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const TrafficRateNode = memo(TrafficRateNodeComponent);
