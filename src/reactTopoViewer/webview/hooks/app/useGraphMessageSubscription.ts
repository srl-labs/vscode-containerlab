/**
 * useGraphMessageSubscription - Message subscription hook for graph updates
 *
 * Handles extension messages related to graph state:
 * - topology-host:snapshot: Replace nodes/edges from host snapshot
 * - edge-stats-update: Update edge extraData (packet stats)
 */
import { useEffect } from "react";
import type { Edge, Node } from "@xyflow/react";

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

interface NodeDataUpdateMessage {
  type: "node-data-updated";
  data?: {
    nodeUpdates?: Array<{
      containerLongName: string;
      containerShortName: string;
      state: string;
      status?: string;
      mgmtIpv4Address?: string;
      mgmtIpv6Address?: string;
    }>;
  };
}

type NodeRuntimeUpdateEntry = NonNullable<
  NonNullable<NodeDataUpdateMessage["data"]>["nodeUpdates"]
>[number];

type ExtensionMessage =
  | { type: "topology-host:snapshot"; snapshot?: TopologySnapshot }
  | EdgeStatsUpdateMessage
  | NodeDataUpdateMessage
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

function handleNodeDataUpdateMessage(msg: NodeDataUpdateMessage): void {
  const updates = msg.data?.nodeUpdates;
  if (!updates || updates.length === 0) return;

  const { byLongName, byShortName } = buildNodeRuntimeLookup(updates);

  if (byLongName.size === 0 && byShortName.size === 0) {
    return;
  }

  const { setNodes } = useGraphStore.getState();
  setNodes((currentNodes) =>
    currentNodes.map((node) => applyNodeRuntimeUpdate(node, byLongName, byShortName))
  );
}

function buildNodeRuntimeLookup(updates: NodeRuntimeUpdateEntry[]): {
  byLongName: Map<string, NodeRuntimeUpdateEntry>;
  byShortName: Map<string, NodeRuntimeUpdateEntry>;
} {
  const byLongName = new Map<string, NodeRuntimeUpdateEntry>();
  const byShortName = new Map<string, NodeRuntimeUpdateEntry>();

  for (const update of updates) {
    const longName = update.containerLongName?.trim();
    const shortName = update.containerShortName?.trim();
    if (longName) byLongName.set(longName, update);
    if (shortName) byShortName.set(shortName, update);
  }

  return { byLongName, byShortName };
}

function resolveNodeRuntimeUpdate(
  nodeId: string,
  nodeData: Record<string, unknown>,
  extraData: Record<string, unknown>,
  byLongName: Map<string, NodeRuntimeUpdateEntry>,
  byShortName: Map<string, NodeRuntimeUpdateEntry>
): NodeRuntimeUpdateEntry | undefined {
  const longNameCandidate = [nodeData.longname, extraData.longname].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );

  if (longNameCandidate) {
    const byLong = byLongName.get(longNameCandidate);
    if (byLong) return byLong;
  }

  return byShortName.get(nodeId) ?? byShortName.get((nodeData.label as string) ?? "");
}

function hasNodeRuntimeDataChanged(
  nodeData: Record<string, unknown>,
  extraData: Record<string, unknown>,
  update: NodeRuntimeUpdateEntry
): boolean {
  const nextState = update.state ?? "";
  const nextStatus = update.status ?? "";
  const nextIpv4 = update.mgmtIpv4Address ?? "";
  const nextIpv6 = update.mgmtIpv6Address ?? "";

  return (
    ((nodeData.state as string | undefined) ?? "") !== nextState ||
    ((extraData.state as string | undefined) ?? "") !== nextState ||
    ((extraData.status as string | undefined) ?? "") !== nextStatus ||
    ((nodeData.mgmtIpv4Address as string | undefined) ?? "") !== nextIpv4 ||
    ((nodeData.mgmtIpv6Address as string | undefined) ?? "") !== nextIpv6
  );
}

function applyNodeRuntimeUpdate(
  node: Node,
  byLongName: Map<string, NodeRuntimeUpdateEntry>,
  byShortName: Map<string, NodeRuntimeUpdateEntry>
): Node {
  if (node.type !== "topology-node") {
    return node;
  }

  const nodeData = (node.data ?? {}) as Record<string, unknown>;
  const extraData = (nodeData.extraData ?? {}) as Record<string, unknown>;
  const matchedUpdate = resolveNodeRuntimeUpdate(
    node.id,
    nodeData,
    extraData,
    byLongName,
    byShortName
  );
  if (!matchedUpdate) {
    return node;
  }

  if (!hasNodeRuntimeDataChanged(nodeData, extraData, matchedUpdate)) {
    return node;
  }

  const nextState = matchedUpdate.state ?? "";
  const nextStatus = matchedUpdate.status ?? "";
  const nextIpv4 = matchedUpdate.mgmtIpv4Address ?? "";
  const nextIpv6 = matchedUpdate.mgmtIpv6Address ?? "";

  return {
    ...node,
    data: {
      ...nodeData,
      state: nextState,
      mgmtIpv4Address: nextIpv4,
      mgmtIpv6Address: nextIpv6,
      extraData: {
        ...extraData,
        state: nextState,
        status: nextStatus,
        mgmtIpv4Address: nextIpv4,
        mgmtIpv6Address: nextIpv6
      }
    }
  };
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
        case "node-data-updated":
          handleNodeDataUpdateMessage(message as NodeDataUpdateMessage);
          break;
      }
    };

    return subscribeToWebviewMessages(handleMessage);
  }, []);
}
