import React, { memo, useCallback, useMemo } from "react";
import { NodeResizer, type NodeProps, type ResizeParams } from "@xyflow/react";

import type { TrafficRateNodeData } from "../types";
import { SELECTION_COLOR } from "../types";
import { TrafficChart } from "../../panels/TrafficChart";
import { useAnnotationHandlers } from "../../../stores/canvasStore";
import { useGraphStore } from "../../../stores/graphStore";
import { useIsLocked } from "../../../stores/topoViewerStore";
import { formatMegabitsPerSecond, resolveTrafficRateStats } from "../../../utils/trafficRateAnnotation";

const CHART_MIN_WIDTH = 180;
const CHART_MIN_HEIGHT = 120;
const TEXT_MIN_WIDTH = 1;
const TEXT_MIN_HEIGHT = 1;
const REF_WIDTH = 260;
const REF_HEIGHT = 180;
const TEXT_REF_WIDTH = 112;
const TEXT_REF_HEIGHT = 36;
const DEFAULT_BACKGROUND = "#1e1e1e";
const DEFAULT_BORDER_COLOR = "#3f3f46";
const DEFAULT_BORDER_WIDTH = 1;
const DEFAULT_BORDER_STYLE: NonNullable<TrafficRateNodeData["borderStyle"]> = "solid";
const DEFAULT_BORDER_RADIUS = 8;
const DEFAULT_TEXT_COLOR = "#9aa0a6";

/** Compute a scale factor from current dimensions relative to reference size. */
function computeScale(width: number, height: number, minScale = 0.65, maxScale = 2.0): number {
  const sw = width / REF_WIDTH;
  const sh = height / REF_HEIGHT;
  return Math.max(minScale, Math.min(maxScale, Math.sqrt(sw * sh)));
}

function computeTextScale(width: number, height: number): number {
  const widthScale = width / TEXT_REF_WIDTH;
  const heightScale = height / TEXT_REF_HEIGHT;
  const rawScale = Math.min(widthScale, heightScale);
  return Math.max(0.01, Math.min(2.0, rawScale));
}

function computeFittedTextFontSize(text: string, width: number, height: number, baseSize: number): number {
  // Keep text fully visible by constraining font size to both width and height.
  const safeText = text.length > 0 ? text : " ";
  const horizontalPadding = 6; // left+right padding for text mode container
  const verticalPadding = 2; // top+bottom padding for text mode container
  const maxWidth = Math.max(1, width - horizontalPadding);
  const maxHeight = Math.max(1, height - verticalPadding);
  const approxCharWidthFactor = 0.62; // good approximation for numeric/status text
  const widthBound = maxWidth / (safeText.length * approxCharWidthFactor);
  const heightBound = maxHeight / 1.1;
  return Math.max(0.5, Math.min(baseSize, widthBound, heightBound));
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
  const mode = nodeData.mode === "text" ? "text" : "chart";
  const borderRadius = nodeData.borderRadius ?? (mode === "text" ? 4 : DEFAULT_BORDER_RADIUS);
  const showLegend = nodeData.showLegend !== false;
  const textMetric =
    nodeData.textMetric === "rx" || nodeData.textMetric === "tx" ? nodeData.textMetric : "combined";
  const textColor = nodeData.textColor ?? DEFAULT_TEXT_COLOR;
  const hintColor = nodeData.textColor ?? "#8b949e";
  const minWidth = mode === "text" ? TEXT_MIN_WIDTH : CHART_MIN_WIDTH;
  const minHeight = mode === "text" ? TEXT_MIN_HEIGHT : CHART_MIN_HEIGHT;
  const defaultWidth = mode === "text" ? TEXT_REF_WIDTH : REF_WIDTH;
  const defaultHeight = mode === "text" ? TEXT_REF_HEIGHT : REF_HEIGHT;
  const nodeWidth = typeof nodeData.width === "number" ? nodeData.width : defaultWidth;
  const nodeHeight = typeof nodeData.height === "number" ? nodeData.height : defaultHeight;
  const scale = mode === "text" ? computeTextScale(nodeWidth, nodeHeight) : computeScale(nodeWidth, nodeHeight);
  const subtitleFontSize = Math.round(11 * scale);
  const hintFontSize = Math.round(11 * scale);
  const rxBps = resolution.stats?.rxBps;
  const txBps = resolution.stats?.txBps;
  const hasRx = typeof rxBps === "number";
  const hasTx = typeof txBps === "number";
  let textModeRateBps: number | undefined;
  if (textMetric === "rx") {
    textModeRateBps = hasRx ? rxBps : undefined;
  } else if (textMetric === "tx") {
    textModeRateBps = hasTx ? txBps : undefined;
  } else if (hasRx || hasTx) {
    textModeRateBps = (hasRx ? rxBps : 0) + (hasTx ? txBps : 0);
  }
  const textModeRate = formatMegabitsPerSecond(textModeRateBps);
  const textModeFontSize = computeFittedTextFontSize(textModeRate, nodeWidth, nodeHeight, 26 * scale);
  const showSubtitle = !isConfigured || mode === "chart";
  let body: React.ReactNode;

  if (!isConfigured) {
    body = (
      <div style={{ fontSize: Math.round(12 * scale), color: hintColor, marginTop: 4 }}>
        Select node and interface in the editor.
      </div>
    );
  } else if (mode === "text") {
    body = (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: `${textModeFontSize}px`,
          lineHeight: 1.1,
          fontWeight: 600,
          color: textColor,
          width: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden"
        }}
      >
        {textModeRate}
      </div>
    );
  } else {
    body = (
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
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minWidth,
        minHeight,
        borderRadius,
        border: `${borderWidth}px ${borderStyle} ${borderColor}`,
        outline: isSelected ? `2px solid ${SELECTION_COLOR}` : "none",
        outlineOffset: 0,
        background,
        color: textColor,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
        padding: mode === "text" ? "1px 3px" : "6px 8px",
        display: "flex",
        flexDirection: "column",
        cursor: "move",
        overflow: "hidden"
      }}
    >
      <NodeResizer
        minWidth={minWidth}
        minHeight={minHeight}
        isVisible={showResizer}
        lineClassName="nodrag"
        handleClassName="nodrag"
        color={SELECTION_COLOR}
        onResizeEnd={handleResizeEnd}
      />
      {showSubtitle && (
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
      )}
      {body}
    </div>
  );
};

export const TrafficRateNode = memo(TrafficRateNodeComponent);
