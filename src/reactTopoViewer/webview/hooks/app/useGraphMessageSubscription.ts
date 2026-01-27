/**
 * useGraphMessageSubscription - Message subscription hook for graph updates
 *
 * Handles extension messages related to graph state:
 * - topology-host:snapshot: Replace nodes/edges from host snapshot
 * - edge-stats-update: Update edge extraData (packet stats)
 */
import { useEffect } from "react";
import type { Edge } from "@xyflow/react";

import type { TopologySnapshot } from "../../../shared/types/messages";
import {
  subscribeToWebviewMessages,
  type TypedMessageEvent
} from "../../messaging/webviewMessageBus";
import { useGraphStore } from "../../stores/graphStore";
import { applySnapshotToStores } from "../../services/topologyHostSync";

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
  const newExtraData = { ...oldExtraData, ...update.extraData };
  return {
    ...edge,
    data: { ...edge.data, extraData: newExtraData },
    className: update.classes ?? edge.className
  };
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
