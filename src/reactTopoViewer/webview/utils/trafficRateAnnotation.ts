import type { Edge } from "@xyflow/react";

import type { TopologyEdgeData } from "../../shared/types/graph";
import type { InterfaceStatsPayload } from "../../shared/types/topology";

const TRAFFIC_STAT_KEYS: Array<keyof InterfaceStatsPayload> = [
  "rxBps",
  "txBps",
  "rxPps",
  "txPps",
  "rxBytes",
  "txBytes",
  "rxPackets",
  "txPackets"
];

interface EdgeDataWithStats extends Partial<TopologyEdgeData> {
  extraData?: Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toStatsPayload(value: unknown): InterfaceStatsPayload | undefined {
  if (!value || typeof value !== "object") return undefined;

  const source = value as Record<string, unknown>;
  const stats: InterfaceStatsPayload = {};

  for (const key of TRAFFIC_STAT_KEYS) {
    const raw = source[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      stats[key] = raw;
    }
  }

  return Object.keys(stats).length > 0 ? stats : undefined;
}

function addStats(
  acc: InterfaceStatsPayload | undefined,
  next: InterfaceStatsPayload | undefined
): InterfaceStatsPayload | undefined {
  if (!next) return acc;
  if (!acc) return { ...next };

  const merged: InterfaceStatsPayload = { ...acc };
  for (const key of TRAFFIC_STAT_KEYS) {
    const left = merged[key];
    const right = next[key];
    if (typeof right !== "number") continue;
    merged[key] = (typeof left === "number" ? left : 0) + right;
  }
  return merged;
}

function getEdgeData(edge: Edge): EdgeDataWithStats {
  return (edge.data ?? {}) as EdgeDataWithStats;
}

export interface TrafficMonitorOptions {
  nodeIds: string[];
  interfacesByNode: Map<string, string[]>;
}

/**
 * Build node/interface selection options from current graph edges.
 */
export function getTrafficMonitorOptions(edges: Edge[]): TrafficMonitorOptions {
  const interfacesByNode = new Map<string, Set<string>>();

  const ensureNode = (nodeId: string) => {
    if (!interfacesByNode.has(nodeId)) {
      interfacesByNode.set(nodeId, new Set<string>());
    }
    return interfacesByNode.get(nodeId)!;
  };

  for (const edge of edges) {
    const data = getEdgeData(edge);
    const sourceInterfaces = ensureNode(edge.source);
    const targetInterfaces = ensureNode(edge.target);

    if (isNonEmptyString(data.sourceEndpoint)) {
      sourceInterfaces.add(data.sourceEndpoint);
    }
    if (isNonEmptyString(data.targetEndpoint)) {
      targetInterfaces.add(data.targetEndpoint);
    }
  }

  const nodeIds = Array.from(interfacesByNode.keys()).sort((a, b) => a.localeCompare(b));
  const normalizedMap = new Map<string, string[]>();
  for (const [nodeId, interfaces] of interfacesByNode.entries()) {
    normalizedMap.set(nodeId, Array.from(interfaces).sort((a, b) => a.localeCompare(b)));
  }

  return {
    nodeIds,
    interfacesByNode: normalizedMap
  };
}

export interface TrafficRateResolution {
  stats: InterfaceStatsPayload | undefined;
  endpointCount: number;
  endpointKey: string;
}

/**
 * Resolve live interface stats for a selected node/interface pair.
 * If multiple edges match, stats are summed.
 */
export function resolveTrafficRateStats(
  edges: Edge[],
  nodeId: string | undefined,
  interfaceName: string | undefined
): TrafficRateResolution {
  if (!isNonEmptyString(nodeId) || !isNonEmptyString(interfaceName)) {
    return { stats: undefined, endpointCount: 0, endpointKey: "traffic-rate:unconfigured" };
  }

  let stats: InterfaceStatsPayload | undefined;
  const endpointIds: string[] = [];

  for (const edge of edges) {
    const data = getEdgeData(edge);
    const extra = data.extraData ?? {};

    if (edge.source === nodeId && data.sourceEndpoint === interfaceName) {
      endpointIds.push(`s:${edge.id}`);
      stats = addStats(stats, toStatsPayload(extra.clabSourceStats));
    }

    if (edge.target === nodeId && data.targetEndpoint === interfaceName) {
      endpointIds.push(`t:${edge.id}`);
      stats = addStats(stats, toStatsPayload(extra.clabTargetStats));
    }
  }

  endpointIds.sort((a, b) => a.localeCompare(b));
  const endpointKey =
    endpointIds.length > 0
      ? `traffic-rate:${nodeId}:${interfaceName}:${endpointIds.join("|")}`
      : `traffic-rate:${nodeId}:${interfaceName}:none`;

  return {
    stats,
    endpointCount: endpointIds.length,
    endpointKey
  };
}

function formatMetric(value: number | undefined, units: string[]): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }

  let scaled = value;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const digits = scaled >= 100 ? 0 : 1;
  return `${scaled.toFixed(digits)} ${units[unitIndex]}`;
}

/**
 * Format a bits-per-second metric with adaptive units.
 */
export function formatBitsPerSecond(value: number | undefined): string {
  return formatMetric(value, ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]);
}

/**
 * Format bits-per-second as Mbit/s (fixed unit).
 */
export function formatMegabitsPerSecond(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-- Mbit/s";
  }

  const valueInMbit = value / 1_000_000;
  let digits = 2;
  if (valueInMbit >= 100) {
    digits = 0;
  } else if (valueInMbit >= 10) {
    digits = 1;
  }
  return `${valueInMbit.toFixed(digits)} Mbit/s`;
}

/**
 * Format a packets-per-second metric with adaptive units.
 */
export function formatPacketsPerSecond(value: number | undefined): string {
  return formatMetric(value, ["pps", "Kpps", "Mpps", "Gpps"]);
}
