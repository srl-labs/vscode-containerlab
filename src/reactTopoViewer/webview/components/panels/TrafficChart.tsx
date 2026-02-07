/**
 * Traffic Chart Component
 * uPlot-based real-time traffic visualization for link endpoints
 */
import React, { useRef, useEffect, useCallback } from "react";
import Typography from "@mui/material/Typography";
import uPlot from "uplot";

import "uplot/dist/uPlot.min.css";
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

/**
 * Calculate scale range with padding
 */
function calculateScaleRange(
  _self: uPlot,
  dataMin: number | undefined,
  dataMax: number | undefined
): [number, number] {
  const min = Math.min(0, dataMin ?? 0);
  const max = Math.max(1, dataMax ?? 1);
  const padding = (max - min) * 0.1;
  return [min, max + padding];
}

/**
 * Create uPlot series configuration
 */
function createGraphSeries(unitLabel: string): uPlot.Series[] {
  const formatValue = (_self: uPlot, rawValue: number | null): string => {
    return rawValue == null ? "-" : rawValue.toFixed(2);
  };

  return [
    {},
    {
      label: `RX ${unitLabel}`,
      stroke: "#4ec9b0",
      width: 2,
      scale: "bps",
      value: formatValue
    },
    {
      label: `TX ${unitLabel}`,
      stroke: "#569cd6",
      width: 2,
      scale: "bps",
      value: formatValue
    },
    {
      label: "RX PPS",
      stroke: "#b5cea8",
      width: 2,
      scale: "pps",
      value: formatValue
    },
    {
      label: "TX PPS",
      stroke: "#9cdcfe",
      width: 2,
      scale: "pps",
      value: formatValue
    }
  ];
}

/**
 * Create uPlot options
 */
function createGraphOptions(width: number, height: number, unitLabel: string): uPlot.Options {
  return {
    width,
    height,
    padding: [12, 12, 12, 0],
    cursor: {
      show: true,
      x: false,
      y: false,
      points: { show: false }
    },
    series: createGraphSeries(unitLabel),
    axes: [
      {
        scale: "x",
        show: false
      },
      {
        scale: "bps",
        side: 3,
        label: unitLabel,
        labelSize: 20,
        labelFont: "12px sans-serif",
        size: 60,
        stroke: "#cccccc",
        grid: {
          show: true,
          stroke: "#3e3e42",
          width: 1
        },
        ticks: {
          show: true,
          stroke: "#3e3e42",
          width: 1
        },
        values: (_self, ticks) => ticks.map((v) => v.toFixed(1))
      },
      {
        scale: "pps",
        side: 1,
        label: "PPS",
        labelSize: 20,
        labelFont: "12px sans-serif",
        size: 60,
        stroke: "#cccccc",
        grid: { show: false },
        ticks: {
          show: true,
          stroke: "#3e3e42",
          width: 1
        },
        values: (_self, ticks) => ticks.map((v) => v.toFixed(1))
      }
    ],
    scales: {
      x: {},
      bps: {
        auto: true,
        range: calculateScaleRange
      },
      pps: {
        auto: true,
        range: calculateScaleRange
      }
    },
    legend: {
      show: true,
      live: true
    }
  };
}

// Global history store per endpoint key
const historyStore = new Map<string, EndpointStatsHistory>();

export const TrafficChart: React.FC<TrafficChartProps> = ({ stats, endpointKey }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const unitRef = useRef<BpsUnit>({ divisor: 1000, label: "Kbps" });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  /**
   * Update stats history and return prepared graph data
   */
  const updateHistory = useCallback(
    (key: string, newStats: InterfaceStatsPayload | undefined): number[][] => {
      let history = historyStore.get(key);
      if (!history) {
        history = createEmptyHistory();
        historyStore.set(key, history);
      }

      if (newStats) {
        const now = Date.now() / 1000;
        history.timestamps.push(now);
        history.rxBps.push(newStats.rxBps ?? 0);
        history.txBps.push(newStats.txBps ?? 0);
        history.rxPps.push(newStats.rxPps ?? 0);
        history.txPps.push(newStats.txPps ?? 0);

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
      unitRef.current = determineBpsUnit(maxBps);
      const { divisor } = unitRef.current;

      // Scale BPS values
      const rxScaled = history.rxBps.map((v) => v / divisor);
      const txScaled = history.txBps.map((v) => v / divisor);

      return [history.timestamps, rxScaled, txScaled, history.rxPps, history.txPps];
    },
    []
  );

  /**
   * Update axis labels after unit change
   */
  const updateAxisLabels = useCallback((_chart: uPlot, unitLabel: string) => {
    const container = containerRef.current;
    if (!container) return;

    // Update axis label
    const axisLabel = container.querySelector(".u-axis.u-off1 .u-label") as HTMLElement | null;
    if (axisLabel) {
      axisLabel.textContent = unitLabel;
    }

    // Update legend labels
    const legendLabels = container.querySelectorAll(".u-legend .u-series td.u-label");
    legendLabels.forEach((label, index) => {
      if (index === 1) {
        (label as HTMLElement).textContent = `RX ${unitLabel}`;
      } else if (index === 2) {
        (label as HTMLElement).textContent = `TX ${unitLabel}`;
      }
    });
  }, []);

  /**
   * Initialize or update chart
   */
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const width = rect.width || 300;
    const height = Math.max((rect.height || 200) - 60, 100);

    // Create chart if not exists
    if (!chartRef.current) {
      const opts = createGraphOptions(width, height, unitRef.current.label);
      const emptyData: uPlot.AlignedData = [[], [], [], [], []] as unknown as uPlot.AlignedData;
      chartRef.current = new uPlot(opts, emptyData, container);

      // Setup resize observer
      resizeObserverRef.current = new ResizeObserver(() => {
        const newRect = container.getBoundingClientRect();
        const newWidth = newRect.width;
        const newHeight = Math.max(newRect.height - 60, 100);
        if (newWidth > 0 && newHeight > 0 && chartRef.current) {
          chartRef.current.setSize({ width: newWidth, height: newHeight });
        }
      });
      resizeObserverRef.current.observe(container);
    }

    // Update data
    const data = updateHistory(endpointKey, stats);
    chartRef.current?.setData(data as uPlot.AlignedData);
    updateAxisLabels(chartRef.current!, unitRef.current.label);

    // Cleanup
    return () => {
      // Don't destroy chart on every render, only on unmount
    };
  }, [stats, endpointKey, updateHistory, updateAxisLabels]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  /**
   * Clear history when endpoint changes
   */
  useEffect(() => {
    // When endpoint changes, we keep using same chart but history is per-endpoint
    // This handles tab switching
  }, [endpointKey]);

  return (
    <div className="traffic-chart-container" style={{ overflow: "hidden" }}>
      <div
        ref={containerRef}
        className="traffic-chart"
        style={{
          width: "100%",
          height: "200px",
          minHeight: "150px",
          overflow: "hidden"
        }}
      />
      {!stats && (
        <Typography
          variant="body2"
          sx={{ textAlign: "center", color: "text.secondary", fontSize: "0.875rem", mt: 1 }}
        >
          No traffic data available
        </Typography>
      )}
    </div>
  );
};
