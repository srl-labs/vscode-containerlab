/**
 * useGraphMessageSubscription - Message subscription hook for graph updates
 *
 * Handles extension messages related to graph state:
 * - topology-host:snapshot: Replace nodes/edges from host snapshot
 * - edge-stats-update: Update edge extraData (packet stats)
 */
import { useEffect } from "react";
import type { Edge } from "@xyflow/react";

import type { NetemState } from "../../../shared/parsing";
import type { TopologySnapshot } from "../../../shared/types/messages";
import {
  subscribeToWebviewMessages,
  type TypedMessageEvent
} from "../../messaging/webviewMessageBus";
import { useGraphStore } from "../../stores/graphStore";
import { applySnapshotToStores } from "../../services/topologyHostSync";
import {
  PENDING_NETEM_KEY,
  type PendingNetemOverride,
  areNetemEquivalent,
  isPendingNetemFresh
} from "../../utils/netemOverrides";

// ============================================================================
// Message Types
// ============================================================================

interface EdgeStatsUpdateMessage {
  type: "edge-stats-update";
  data?: {
    edgeUpdates?: Array<{
      id: string;
      extraData: Record<string, unknown>;
      classes?: string;
    }>;
  };
}

type ExtensionMessage =
  | { type: "topology-host:snapshot"; snapshot?: TopologySnapshot }
  | EdgeStatsUpdateMessage
  | { type: string };

// ============================================================================
// Helper Functions
// ============================================================================

function buildEdgeWithExtraData(
  edge: Edge,
  extraData: Record<string, unknown>,
  classes?: string
): Edge {
  return {
    ...edge,
    data: { ...edge.data, extraData },
    className: classes ?? edge.className
  };
}

function mergeExtraData(
  oldExtraData: Record<string, unknown>,
  updateExtraData: Record<string, unknown>
): Record<string, unknown> {
  return { ...oldExtraData, ...updateExtraData };
}

function stripPendingNetemKey(extraData: Record<string, unknown>): void {
  delete extraData[PENDING_NETEM_KEY];
}

function hasNetemUpdate(updateExtraData: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(updateExtraData, "clabSourceNetem") ||
    Object.prototype.hasOwnProperty.call(updateExtraData, "clabTargetNetem")
  );
}

function matchesPendingNetem(
  updateExtraData: Record<string, unknown>,
  pending: PendingNetemOverride
): boolean {
  const incomingSource = updateExtraData.clabSourceNetem as NetemState | undefined;
  const incomingTarget = updateExtraData.clabTargetNetem as NetemState | undefined;
  return (
    areNetemEquivalent(incomingSource, pending.source) &&
    areNetemEquivalent(incomingTarget, pending.target)
  );
}

function mergeExtraDataWithPending(
  oldExtraData: Record<string, unknown>,
  updateExtraData: Record<string, unknown>,
  pending: PendingNetemOverride
): Record<string, unknown> {
  if (!isPendingNetemFresh(pending)) {
    const merged = mergeExtraData(oldExtraData, updateExtraData);
    stripPendingNetemKey(merged);
    return merged;
  }

  if (!hasNetemUpdate(updateExtraData)) {
    return mergeExtraData(oldExtraData, updateExtraData);
  }

  if (!matchesPendingNetem(updateExtraData, pending)) {
    const { clabSourceNetem, clabTargetNetem, ...rest } = updateExtraData;
    return mergeExtraData(oldExtraData, rest);
  }

  const merged = mergeExtraData(oldExtraData, updateExtraData);
  stripPendingNetemKey(merged);
  return merged;
}

/** Apply edge stats update to a single edge */
function applyEdgeStatsToEdge(
  edge: Edge,
  updateMap: Map<string, { id: string; extraData: Record<string, unknown>; classes?: string }>
): Edge {
  const update = updateMap.get(edge.id);
  if (!update) return edge;
  const oldExtraData = ((edge.data as Record<string, unknown>)?.extraData ?? {}) as Record<
    string,
    unknown
  >;
  const updateExtraData = update.extraData ?? {};
  const pending = oldExtraData[PENDING_NETEM_KEY] as PendingNetemOverride | undefined;
  const mergedExtraData = pending
    ? mergeExtraDataWithPending(oldExtraData, updateExtraData, pending)
    : mergeExtraData(oldExtraData, updateExtraData);

  return buildEdgeWithExtraData(edge, mergedExtraData, update.classes);
}

function handleSnapshotMessage(msg: { snapshot?: TopologySnapshot }): void {
  if (msg.snapshot) {
    applySnapshotToStores(msg.snapshot);
  }
}

function handleEdgeStatsUpdateMessage(msg: EdgeStatsUpdateMessage): void {
  const updates = msg.data?.edgeUpdates;
  if (!updates || updates.length === 0) return;

  const { setEdges } = useGraphStore.getState();
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  setEdges((current) => current.map((edge) => applyEdgeStatsToEdge(edge, updateMap)));
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to subscribe to graph-related extension messages.
 * Should be called once at the app root.
 */
export function useGraphMessageSubscription(): void {
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data as ExtensionMessage | undefined;
      if (!message?.type) return;

      switch (message.type) {
        case "topology-host:snapshot":
          handleSnapshotMessage(message as { snapshot?: TopologySnapshot });
          break;
        case "edge-stats-update":
          handleEdgeStatsUpdateMessage(message as EdgeStatsUpdateMessage);
          break;
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, []);
}
