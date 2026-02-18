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
  height?: number;
  compact?: boolean;
  showLegend?: boolean;
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

function resolveChartMargin(compact: boolean, showLegend: boolean) {
  if (!compact) {
    return { top: 8, right: 48, bottom: 4, left: 48 };
  }

  if (showLegend) {
    return { top: 4, right: 8, bottom: 22, left: 8 };
  }

  return { top: 4, right: 8, bottom: 0, left: 8 };
}

function resolveLegendSlotProps(compact: boolean, showLegend: boolean) {
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

  return {
    legend: {
      direction: "horizontal" as const,
      position: { vertical: "bottom" as const, horizontal: "start" as const },
      sx: {
        fontSize: "0.625rem",
        gap: 0.5,
        marginBlock: 0.25,
        marginInline: 0.25,
        "& .MuiChartsLegend-series": {
          gap: 0.5
        },
        "& .MuiChartsLegend-mark": {
          fontSize: "0.7em"
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
  height = 240,
  compact = false,
  showLegend = !compact,
  emptyMessage = "No traffic data available"
}) => {
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

    // Sequential x-axis indices
    const x = history.timestamps.map((_, i) => i);

    return {
      xData: x,
      rxBpsData: rxScaled,
      txBpsData: txScaled,
      rxPpsData: [...history.rxPps],
      txPpsData: [...history.txPps],
      unitLabel: unit.label
    };
  }, [stats, endpointKey]);
  const margin = resolveChartMargin(compact, showLegend);
  const legendSlotProps = resolveLegendSlotProps(compact, showLegend);

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
    <Box sx={{ width: "100%", height }}>
      <LineChart
        xAxis={[
          {
            data: xData,
            scaleType: "linear",
            disableLine: true,
            disableTicks: true,
            tickLabelStyle: { display: "none" }
          }
        ]}
        yAxis={[
          {
            id: "bps",
            label: compact ? undefined : unitLabel,
            labelStyle: compact ? { display: "none" } : { fontSize: 11 },
            tickLabelStyle: compact ? { display: "none" } : { fontSize: 10, fill: "#cccccc" }
          },
          {
            id: "pps",
            label: compact ? undefined : "PPS",
            labelStyle: compact ? { display: "none" } : { fontSize: 11 },
            tickLabelStyle: compact ? { display: "none" } : { fontSize: 10, fill: "#cccccc" }
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
          "& .MuiChartsAxis-line": { stroke: "#cccccc" },
          "& .MuiChartsAxis-tick": { stroke: "#3e3e42" },
          "& .MuiChartsAxisHighlight-root": { stroke: "#cccccc" },
          "& .MuiChartsAxis-label": { fill: "#cccccc" }
        }}
      />
    </Box>
  );
};
