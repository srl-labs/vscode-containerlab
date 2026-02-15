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

// Global history store per endpoint key
const historyStore = new Map<string, EndpointStatsHistory>();

export const TrafficChart: React.FC<TrafficChartProps> = ({ stats, endpointKey }) => {
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

  if (xData.length === 0) {
    return (
      <Typography
        variant="body2"
        sx={{ textAlign: "center", color: "text.secondary", fontSize: "0.875rem", mt: 1 }}
      >
        No traffic data available
      </Typography>
    );
  }

  return (
    <Box sx={{ width: "100%", height: 240 }}>
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
            label: unitLabel,
            labelStyle: { fontSize: 11 },
            tickLabelStyle: { fontSize: 10, fill: "#cccccc" }
          },
          {
            id: "pps",
            label: "PPS",
            labelStyle: { fontSize: 11 },
            tickLabelStyle: { fontSize: 10, fill: "#cccccc" }
          }
        ]}
        series={[
          {
            data: rxBpsData,
            label: `RX ${unitLabel}`,
            color: "#4ec9b0",
            showMark: false,
            curve: "linear",
            yAxisId: "bps"
          },
          {
            data: txBpsData,
            label: `TX ${unitLabel}`,
            color: "#569cd6",
            showMark: false,
            curve: "linear",
            yAxisId: "bps"
          },
          {
            data: rxPpsData,
            label: "RX PPS",
            color: "#b5cea8",
            showMark: false,
            curve: "linear",
            yAxisId: "pps"
          },
          {
            data: txPpsData,
            label: "TX PPS",
            color: "#9cdcfe",
            showMark: false,
            curve: "linear",
            yAxisId: "pps"
          }
        ]}
        grid={{ horizontal: true }}
        margin={{ top: 8, right: 48, bottom: 4, left: 48 }}
        slotProps={{
          legend: {
            direction: "horizontal",
            position: { vertical: "bottom", horizontal: "center" }
          }
        }}
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
