// Real-time traffic chart for link endpoints.
import React, { useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";

import type { InterfaceStatsPayload, EndpointStatsHistory } from "../../../shared/types/topology";

const MAX_GRAPH_POINTS = 60;

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
    txPps: []
  };
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
        position: { vertical: "bottom" as const, horizontal: "center" as const }
      }
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
          gap: 0.25
        },
        "& .MuiChartsLegend-mark": {
          fontSize: markSize
        }
      }
    }
  };
}

// Global history store per endpoint key
const historyStore = new Map<string, EndpointStatsHistory>();

export const TrafficChart: React.FC<TrafficChartProps> = ({
  stats,
  endpointKey,
  height,
  compact = false,
  showLegend = !compact,
  scale = 1,
  emptyMessage = "No traffic data available"
}) => {
  const resolvedHeight = height ?? (compact ? "100%" : 240);
  // Track last-seen stats to avoid double-push in Strict Mode
  const lastStatsRef = useRef<InterfaceStatsPayload | undefined>(undefined);

  const { xData, rxBpsData, txBpsData, rxPpsData, txPpsData, unitLabel } = useMemo(() => {
    let history = historyStore.get(endpointKey);
    if (!history) {
      history = createEmptyHistory();
      historyStore.set(endpointKey, history);
    }

    // Only push new data if stats actually changed (reference check)
    if (stats && stats !== lastStatsRef.current) {
      lastStatsRef.current = stats;

      history.timestamps.push(Date.now() / 1000);
      history.rxBps.push(stats.rxBps ?? 0);
      history.txBps.push(stats.txBps ?? 0);
      history.rxPps.push(stats.rxPps ?? 0);
      history.txPps.push(stats.txPps ?? 0);

      // Trim to max points
      while (history.timestamps.length > MAX_GRAPH_POINTS) {
        history.timestamps.shift();
        history.rxBps.shift();
        history.txBps.shift();
        history.rxPps.shift();
        history.txPps.shift();
      }
    }

    // Determine unit scaling
    const maxBps = Math.max(...history.rxBps, ...history.txBps, 1);
    const unit = determineBpsUnit(maxBps);
    const { divisor } = unit;

    // Scale BPS values
    const rxScaled = history.rxBps.map((v) => v / divisor);
    const txScaled = history.txBps.map((v) => v / divisor);

    // Convert epoch seconds to Date objects for the time axis
    const x = history.timestamps.map((ts) => new Date(ts * 1000));

    return {
      xData: x,
      rxBpsData: rxScaled,
      txBpsData: txScaled,
      rxPpsData: [...history.rxPps],
      txPpsData: [...history.txPps],
      unitLabel: unit.label
    };
  }, [stats, endpointKey]);
  const margin = resolveChartMargin(compact, showLegend, scale);
  const legendSlotProps = resolveLegendSlotProps(compact, showLegend, scale);

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
        xAxis={[
          {
            data: xData,
            scaleType: "time",
            disableLine: true,
            disableTicks: true,
            valueFormatter: (v: Date) => v.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            ...(compact
              ? { position: "none" as const, height: 0 }
              : { tickLabelStyle: { fontSize: 10, fill: "#cccccc" }, height: 20 })
          }
        ]}
        yAxis={[
          {
            id: "bps",
            ...(compact
              ? {
                  position: "left" as const,
                  disableTicks: true,
                  tickLabelStyle: { fontSize: Math.round(8 * scale), fill: "#9aa0a6" },
                  valueFormatter: (v: number) => `${v} ${unitLabel}`
                }
              : { label: unitLabel, labelStyle: { fontSize: 11 }, tickLabelStyle: { fontSize: 10, fill: "#cccccc" } })
          },
          {
            id: "pps",
            ...(compact
              ? { position: "none" as const, width: 0 }
              : { label: "PPS", labelStyle: { fontSize: 11 }, tickLabelStyle: { fontSize: 10, fill: "#cccccc" } })
          }
        ]}
        series={[
          {
            data: rxBpsData,
            label: compact && !showLegend ? undefined : `RX ${unitLabel}`,
            color: "#4ec9b0",
            showMark: false,
            curve: "linear",
            yAxisId: "bps"
          },
          {
            data: txBpsData,
            label: compact && !showLegend ? undefined : `TX ${unitLabel}`,
            color: "#569cd6",
            showMark: false,
            curve: "linear",
            yAxisId: "bps"
          },
          {
            data: rxPpsData,
            label: compact && !showLegend ? undefined : "RX PPS",
            color: "#b5cea8",
            showMark: false,
            curve: "linear",
            yAxisId: "pps"
          },
          {
            data: txPpsData,
            label: compact && !showLegend ? undefined : "TX PPS",
            color: "#9cdcfe",
            showMark: false,
            curve: "linear",
            yAxisId: "pps"
          }
        ]}
        grid={{ horizontal: true }}
        margin={margin}
        slotProps={legendSlotProps}
        sx={{
          "& .MuiChartsGrid-line": { stroke: "#3e3e42" },
          ...(compact ? {
            "& .MuiChartsAxis-line": { stroke: "#3e3e42" }
          } : {
            "& .MuiChartsAxis-line": { stroke: "#cccccc" },
            "& .MuiChartsAxis-tick": { stroke: "#3e3e42" },
            "& .MuiChartsAxisHighlight-root": { stroke: "#cccccc" },
            "& .MuiChartsAxis-label": { fill: "#cccccc" }
          })
        }}
      />
    </Box>
  );
};
