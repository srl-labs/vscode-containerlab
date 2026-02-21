import { useEffect, useRef } from "react";
import type { Edge } from "@xyflow/react";

import type { InterfaceStatsPayload } from "../../../shared/types/topology";
import { useGraphStore } from "../../stores/graphStore";

const UPDATE_INTERVAL_MS = 1000;
const MIN_BPS = 20_000;
const MAX_BPS = 60_000_000;
const SMOOTHING_FACTOR = 0.4;

interface MockEndpointState {
  baseRxBps: number;
  baseTxBps: number;
  rxBps: number;
  txBps: number;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  avgPacketBits: number;
  phase: number;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    record[key] = entryValue;
  }
  return record;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function hashKey(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

function seededFraction(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

function resolveRateProfile(seed: number): {
  baseRxBps: number;
  baseTxBps: number;
  avgPacketBytes: number;
} {
  const profile = seed % 3;

  if (profile === 0) {
    return {
      baseRxBps: 80_000 + Math.round(seededFraction(seed + 1) * 900_000),
      baseTxBps: 60_000 + Math.round(seededFraction(seed + 2) * 700_000),
      avgPacketBytes: 350 + Math.round(seededFraction(seed + 3) * 500),
    };
  }

  if (profile === 1) {
    return {
      baseRxBps: 900_000 + Math.round(seededFraction(seed + 1) * 8_000_000),
      baseTxBps: 700_000 + Math.round(seededFraction(seed + 2) * 6_000_000),
      avgPacketBytes: 500 + Math.round(seededFraction(seed + 3) * 700),
    };
  }

  return {
    baseRxBps: 4_000_000 + Math.round(seededFraction(seed + 1) * 24_000_000),
    baseTxBps: 3_000_000 + Math.round(seededFraction(seed + 2) * 20_000_000),
    avgPacketBytes: 700 + Math.round(seededFraction(seed + 3) * 800),
  };
}

function createEndpointState(key: string): MockEndpointState {
  const seed = hashKey(key);
  const profile = resolveRateProfile(seed);
  const baseRxBps = profile.baseRxBps;
  const baseTxBps = profile.baseTxBps;
  const avgPacketBytes = profile.avgPacketBytes;

  return {
    baseRxBps,
    baseTxBps,
    rxBps: baseRxBps,
    txBps: baseTxBps,
    rxBytes: 0,
    txBytes: 0,
    rxPackets: 0,
    txPackets: 0,
    avgPacketBits: avgPacketBytes * 8,
    phase: seededFraction(seed + 4) * Math.PI * 2,
  };
}

function getPhaseDelta(phase: number): number {
  return 0.19 + 0.06 * (1 + Math.sin(phase * 0.27));
}

function getJitter(phase: number): number {
  return 1 + 0.11 * Math.sin(phase * 1.7 + 0.4) + 0.04 * Math.cos(phase * 0.55 - 1.1);
}

function getBurst(phase: number): number {
  return 1 + 0.32 * Math.max(0, Math.sin(phase * 0.4 - 0.9));
}

function buildMockStats(state: MockEndpointState, stepSeconds: number): InterfaceStatsPayload {
  state.phase += getPhaseDelta(state.phase);

  const rxWave = 1 + 0.35 * Math.sin(state.phase);
  const txWave = 1 + 0.3 * Math.cos(state.phase + 0.7);
  const jitter = getJitter(state.phase);
  const burst = getBurst(state.phase);

  const rxTarget = clamp(state.baseRxBps * rxWave * jitter * burst, MIN_BPS, MAX_BPS);
  const txTarget = clamp(state.baseTxBps * txWave * jitter, MIN_BPS, MAX_BPS);

  state.rxBps = Math.round(lerp(state.rxBps, rxTarget, SMOOTHING_FACTOR));
  state.txBps = Math.round(lerp(state.txBps, txTarget, SMOOTHING_FACTOR));

  const rxPps = Math.max(1, Math.round(state.rxBps / state.avgPacketBits));
  const txPps = Math.max(1, Math.round(state.txBps / state.avgPacketBits));

  state.rxPackets += Math.round(rxPps * stepSeconds);
  state.txPackets += Math.round(txPps * stepSeconds);
  state.rxBytes += Math.round((state.rxBps * stepSeconds) / 8);
  state.txBytes += Math.round((state.txBps * stepSeconds) / 8);

  return {
    rxBps: state.rxBps,
    txBps: state.txBps,
    rxPps,
    txPps,
    rxBytes: state.rxBytes,
    txBytes: state.txBytes,
    rxPackets: state.rxPackets,
    txPackets: state.txPackets,
    statsIntervalSeconds: stepSeconds,
  };
}

function applyMockStatsToEdge(
  edge: Edge,
  endpointStateByKey: Map<string, MockEndpointState>,
  stepSeconds: number
): Edge {
  const sourceKey = `source:${edge.id}`;
  const targetKey = `target:${edge.id}`;

  const sourceState = endpointStateByKey.get(sourceKey) ?? createEndpointState(sourceKey);
  const targetState = endpointStateByKey.get(targetKey) ?? createEndpointState(targetKey);
  endpointStateByKey.set(sourceKey, sourceState);
  endpointStateByKey.set(targetKey, targetState);

  const sourceStats = buildMockStats(sourceState, stepSeconds);
  const targetStats = buildMockStats(targetState, stepSeconds);

  const data = toRecord(edge.data);
  const extraData = toRecord(data.extraData);

  return {
    ...edge,
    data: {
      ...data,
      extraData: {
        ...extraData,
        clabSourceStats: sourceStats,
        clabTargetStats: targetStats,
      },
    },
  };
}

function pruneInactiveEndpointKeys(
  endpointStateByKey: Map<string, MockEndpointState>,
  activeKeys: Set<string>
): void {
  for (const key of Array.from(endpointStateByKey.keys())) {
    if (!activeKeys.has(key)) {
      endpointStateByKey.delete(key);
    }
  }
}

function updateEdgesWithMockStats(
  currentEdges: Edge[],
  endpointStateByKey: Map<string, MockEndpointState>,
  stepSeconds: number
): Edge[] {
  if (currentEdges.length === 0) {
    endpointStateByKey.clear();
    return currentEdges;
  }

  const activeKeys = new Set<string>();
  const updatedEdges = currentEdges.map((edge) => {
    activeKeys.add(`source:${edge.id}`);
    activeKeys.add(`target:${edge.id}`);
    return applyMockStatsToEdge(edge, endpointStateByKey, stepSeconds);
  });

  pruneInactiveEndpointKeys(endpointStateByKey, activeKeys);
  return updatedEdges;
}

function computeStepSeconds(lastTickRef: { current: number }): number {
  const now = Date.now();
  const elapsedMs = now - lastTickRef.current;
  lastTickRef.current = now;
  return Math.max(0.5, elapsedMs / 1000);
}

function runMockTrafficTick(
  endpointStateByKey: Map<string, MockEndpointState>,
  lastTickRef: { current: number }
): void {
  const stepSeconds = computeStepSeconds(lastTickRef);
  const { setEdges } = useGraphStore.getState();
  setEdges((currentEdges) =>
    updateEdgesWithMockStats(currentEdges, endpointStateByKey, stepSeconds)
  );
}

export function useDevMockTrafficStats(enabled: boolean): void {
  const endpointStateRef = useRef<Map<string, MockEndpointState>>(new Map());
  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled) {
      endpointStateRef.current.clear();
      return;
    }

    lastTickRef.current = Date.now();
    runMockTrafficTick(endpointStateRef.current, lastTickRef);
    const timer = window.setInterval(
      () => runMockTrafficTick(endpointStateRef.current, lastTickRef),
      UPDATE_INTERVAL_MS
    );

    return () => {
      window.clearInterval(timer);
      endpointStateRef.current.clear();
    };
  }, [enabled]);
}
