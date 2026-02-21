// Real-time traffic chart for link endpoints.
import React, { useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { LineChart } from "@mui/x-charts/LineChart";

import type { InterfaceStatsPayload, EndpointStatsHistory } from "../../../shared/types/topology";

const MAX_GRAPH_POINTS = 60;
const MIN_TIMESTAMP_STEP_SECONDS = 0.001;
const DELAY_FALLBACK_MULTIPLIER = 3;

interface BpsUnit {
  divisor: number;
  label: string;
}

interface TrafficChartProps {
  stats: InterfaceStatsPayload | undefined;
  endpointKey: string;
  height?: number | "100%";
  compact?: boolean;
  showLegend?: boolean;
  /** Scale factor for compact legend sizing (1 = default). */
  scale?: number;
  emptyMessage?: string | null;
}

/**
 * Determine the appropriate unit for BPS display based on max value
 */
function determineBpsUnit(maxBps: number): BpsUnit {
  if (maxBps >= 1_000_000_000) {
    return { divisor: 1_000_000_000, label: "Gbps" };
  } else if (maxBps >= 1_000_000) {
    return { divisor: 1_000_000, label: "Mbps" };
  } else if (maxBps >= 1_000) {
    return { divisor: 1_000, label: "Kbps" };
  }
  return { divisor: 1, label: "bps" };
}

/**
 * Create initial empty history
 */
function createEmptyHistory(): EndpointStatsHistory {
  return {
    timestamps: [],
    rxBps: [],
    txBps: [],
    rxPps: [],
    txPps: [],
  };
}

function resolveValidIntervalSeconds(stats: InterfaceStatsPayload | undefined): number | undefined {
  const interval = stats?.statsIntervalSeconds;
  if (typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0) {
    return undefined;
  }
  return interval;
}

function resolveNextTimestampSeconds(
  history: EndpointStatsHistory,
  stats: InterfaceStatsPayload | undefined,
  nowSeconds: number
): number {
  const prev = history.timestamps[history.timestamps.length - 1];
  if (typeof prev !== "number" || !Number.isFinite(prev)) {
    return nowSeconds;
  }

  const interval = resolveValidIntervalSeconds(stats);
  if (interval === undefined) {
    return Math.max(nowSeconds, prev + MIN_TIMESTAMP_STEP_SECONDS);
  }

  const expected = prev + interval;
  if (nowSeconds - expected > interval * DELAY_FALLBACK_MULTIPLIER) {
    return nowSeconds;
  }

  return expected;
}

function resolveChartMargin(compact: boolean, showLegend: boolean, scale: number) {
  if (!compact) {
    return { top: 8, right: 48, bottom: 24, left: 48 };
  }

  // The legend is rendered inside the SVG bottom margin.
  const legendHeight = showLegend ? Math.round(14 * scale) : 0;
  return { top: 6, right: 2, bottom: legendHeight, left: 0 };
}

function resolveLegendSlotProps(compact: boolean, showLegend: boolean, scale: number) {
  if (!showLegend) {
    return undefined;
  }

  if (!compact) {
    return {
      legend: {
        direction: "horizontal" as const,
        position: { vertical: "bottom" as const, horizontal: "center" as const },
      },
    };
  }

  const fontSize = `${(0.6 * scale).toFixed(3)}rem`;
  const markSize = `${(0.65 * scale).toFixed(2)}em`;

  return {
    legend: {
      direction: "horizontal" as const,
      position: { vertical: "bottom" as const, horizontal: "center" as const },
      sx: {
        fontSize,
        lineHeight: 1,
        padding: 0,
        gap: 0.25,
        "& .MuiChartsLegend-series": {
          gap: 0.25,
        },
        "& .MuiChartsLegend-mark": {
          fontSize: markSize,
        },
      },
    },
  };
}

// Global history store per endpoint key
const historyStore = new Map<string, EndpointStatsHistory>();

function getOrCreateHistory(endpointKey: string): EndpointStatsHistory {
  let history = historyStore.get(endpointKey);
  if (!history) {
    history = createEmptyHistory();
    historyStore.set(endpointKey, history);
  }
  return history;
}

function trimHistory(history: EndpointStatsHistory): void {
  while (history.timestamps.length > MAX_GRAPH_POINTS) {
    history.timestamps.shift();
    history.rxBps.shift();
    history.txBps.shift();
    history.rxPps.shift();
    history.txPps.shift();
  }
}

function appendStatsSample(
  history: EndpointStatsHistory,
  stats: InterfaceStatsPayload | undefined,
  lastStatsRef: { current: InterfaceStatsPayload | undefined }
): void {
  if (!stats || stats === lastStatsRef.current) {
    return;
  }

  lastStatsRef.current = stats;
  history.timestamps.push(resolveNextTimestampSeconds(history, stats, Date.now() / 1000));
  history.rxBps.push(stats.rxBps ?? 0);
  history.txBps.push(stats.txBps ?? 0);
  history.rxPps.push(stats.rxPps ?? 0);
  history.txPps.push(stats.txPps ?? 0);
  trimHistory(history);
}

function resolveWindowIntervalSeconds(
  history: EndpointStatsHistory,
  stats: InterfaceStatsPayload | undefined
): number {
  const configuredInterval = resolveValidIntervalSeconds(stats);
  if (configuredInterval !== undefined) {
    return configuredInterval;
  }

  if (history.timestamps.length < 2) {
    return 1;
  }

  const nextToLast = history.timestamps[history.timestamps.length - 2];
  const last = history.timestamps[history.timestamps.length - 1];
  return Math.max(last - nextToLast, MIN_TIMESTAMP_STEP_SECONDS);
}

function resolveXAxisWindow(
  history: EndpointStatsHistory,
  stats: InterfaceStatsPayload | undefined
): { xMin: Date | undefined; xMax: Date | undefined } {
  const lastTimestamp = history.timestamps[history.timestamps.length - 1];
  if (typeof lastTimestamp !== "number" || !Number.isFinite(lastTimestamp)) {
    return { xMin: undefined, xMax: undefined };
  }

  const intervalSeconds = resolveWindowIntervalSeconds(history, stats);
  const visiblePointSpan = Math.max(
    1,
    Math.min(history.timestamps.length - 1, MAX_GRAPH_POINTS - 1)
  );
  const windowSeconds = intervalSeconds * visiblePointSpan;
  return {
    xMin: new Date((lastTimestamp - windowSeconds) * 1000),
    xMax: new Date(lastTimestamp * 1000),
  };
}

function buildChartData(
  history: EndpointStatsHistory,
  stats: InterfaceStatsPayload | undefined
): {
  xData: Date[];
  rxBpsData: number[];
  txBpsData: number[];
  rxPpsData: number[];
  txPpsData: number[];
  unitLabel: string;
  xMin: Date | undefined;
  xMax: Date | undefined;
} {
  const maxBps = Math.max(...history.rxBps, ...history.txBps, 1);
  const unit = determineBpsUnit(maxBps);
  const divisor = unit.divisor;
  const xData = history.timestamps.map((ts) => new Date(ts * 1000));
  const { xMin, xMax } = resolveXAxisWindow(history, stats);
  return {
    xData,
    rxBpsData: history.rxBps.map((v) => v / divisor),
    txBpsData: history.txBps.map((v) => v / divisor),
    rxPpsData: [...history.rxPps],
    txPpsData: [...history.txPps],
    unitLabel: unit.label,
    xMin,
    xMax,
  };
}

function buildXAxis(
  compact: boolean,
  xData: Date[],
  xMin: Date | undefined,
  xMax: Date | undefined
) {
  const baseAxis = {
    data: xData,
    scaleType: "time" as const,
    min: xMin,
    max: xMax,
    disableLine: true,
    disableTicks: true,
    valueFormatter: (value: Date) =>
      value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
  if (compact) {
    return [{ ...baseAxis, position: "none" as const, height: 0 }];
  }
  return [{ ...baseAxis, tickLabelStyle: { fontSize: 10, fill: "#cccccc" }, height: 20 }];
}

function buildYAxis(compact: boolean, scale: number, unitLabel: string) {
  if (compact) {
    return [
      {
        id: "bps",
        position: "left" as const,
        disableTicks: true,
        tickLabelStyle: { fontSize: Math.round(8 * scale), fill: "#9aa0a6" },
        valueFormatter: (value: number) => `${value} ${unitLabel}`,
      },
      {
        id: "pps",
        position: "none" as const,
        width: 0,
      },
    ];
  }

  return [
    {
      id: "bps",
      label: unitLabel,
      labelStyle: { fontSize: 11 },
      tickLabelStyle: { fontSize: 10, fill: "#cccccc" },
    },
    {
      id: "pps",
      label: "PPS",
      labelStyle: { fontSize: 11 },
      tickLabelStyle: { fontSize: 10, fill: "#cccccc" },
    },
  ];
}

function resolveSeriesLabel(
  compact: boolean,
  showLegend: boolean,
  label: string
): string | undefined {
  return compact && !showLegend ? undefined : label;
}

function buildSeries(params: {
  compact: boolean;
  showLegend: boolean;
  unitLabel: string;
  rxBpsData: number[];
  txBpsData: number[];
  rxPpsData: number[];
  txPpsData: number[];
}) {
  return [
    {
      data: params.rxBpsData,
      label: resolveSeriesLabel(params.compact, params.showLegend, `RX ${params.unitLabel}`),
      color: "#4ec9b0",
      showMark: false,
      curve: "linear" as const,
      yAxisId: "bps",
    },
    {
      data: params.txBpsData,
      label: resolveSeriesLabel(params.compact, params.showLegend, `TX ${params.unitLabel}`),
      color: "#569cd6",
      showMark: false,
      curve: "linear" as const,
      yAxisId: "bps",
    },
    {
      data: params.rxPpsData,
      label: resolveSeriesLabel(params.compact, params.showLegend, "RX PPS"),
      color: "#b5cea8",
      showMark: false,
      curve: "linear" as const,
      yAxisId: "pps",
    },
    {
      data: params.txPpsData,
      label: resolveSeriesLabel(params.compact, params.showLegend, "TX PPS"),
      color: "#9cdcfe",
      showMark: false,
      curve: "linear" as const,
      yAxisId: "pps",
    },
  ];
}

export const TrafficChart: React.FC<TrafficChartProps> = ({
  stats,
  endpointKey,
  height,
  compact = false,
  showLegend = !compact,
  scale = 1,
  emptyMessage = "No traffic data available",
}) => {
  const resolvedHeight = height ?? (compact ? "100%" : 240);
  // Track last-seen stats to avoid double-push in Strict Mode
  const lastStatsRef = useRef<InterfaceStatsPayload | undefined>(undefined);

  const { xData, rxBpsData, txBpsData, rxPpsData, txPpsData, unitLabel, xMin, xMax } =
    useMemo(() => {
      const history = getOrCreateHistory(endpointKey);
      appendStatsSample(history, stats, lastStatsRef);
      return buildChartData(history, stats);
    }, [stats, endpointKey]);
  const margin = resolveChartMargin(compact, showLegend, scale);
  const legendSlotProps = resolveLegendSlotProps(compact, showLegend, scale);
  const xAxis = buildXAxis(compact, xData, xMin, xMax);
  const yAxis = buildYAxis(compact, scale, unitLabel);
  const series = buildSeries({
    compact,
    showLegend,
    unitLabel,
    rxBpsData,
    txBpsData,
    rxPpsData,
    txPpsData,
  });
  const chartSx: SxProps<Theme> = compact
    ? {
        "& .MuiChartsGrid-line": { stroke: "#3e3e42" },
        "& .MuiChartsAxis-line": { stroke: "#3e3e42" },
      }
    : {
        "& .MuiChartsGrid-line": { stroke: "#3e3e42" },
        "& .MuiChartsAxis-line": { stroke: "#cccccc" },
        "& .MuiChartsAxis-tick": { stroke: "#3e3e42" },
        "& .MuiChartsAxisHighlight-root": { stroke: "#cccccc" },
        "& .MuiChartsAxis-label": { fill: "#cccccc" },
      };

  if (xData.length === 0) {
    if (emptyMessage === null) return null;
    return (
      <Typography
        variant="body2"
        sx={{ textAlign: "center", color: "text.secondary", fontSize: "0.875rem", mt: 1 }}
      >
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Box sx={{ width: "100%", height: resolvedHeight }}>
      <LineChart
        xAxis={xAxis}
        yAxis={yAxis}
        series={series}
        grid={{ horizontal: true }}
        margin={margin}
        slotProps={legendSlotProps}
        sx={chartSx}
      />
    </Box>
  );
};
