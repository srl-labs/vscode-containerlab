/**
 * Topology CRUD Helpers (Host-authoritative)
 *
 * Dispatches topology commands to the host and applies snapshots.
 */

import type { Node, Edge } from "@xyflow/react";

import type { NodeSaveData } from "../../shared/io/NodePersistenceIO";
import type { LinkSaveData } from "../../shared/io/LinkPersistenceIO";
import type { NetworkNodeAnnotation } from "../../shared/types/topology";

import { executeTopologyCommand } from "./topologyHostCommands";
import { useGraphStore } from "../stores/graphStore";

// Re-export types for convenience
export type { NodeSaveData, LinkSaveData };

// Network node types stored in annotations (not YAML nodes)
const SPECIAL_NETWORK_TYPES = new Set([
  "host",
  "mgmt-net",
  "macvlan",
  "vxlan",
  "vxlan-stitch",
  "dummy"
]);

const BRIDGE_NETWORK_TYPES = new Set(["bridge", "ovs-bridge"]);

const WARN_COMMAND_FAILED = "[Host] Topology command failed";

function isNetworkNode(node: Node): boolean {
  const data = node.data as Record<string, unknown> | undefined;
  return data?.role === "cloud" || data?.topoViewerRole === "cloud";
}

function getNetworkType(data: Record<string, unknown>): string | undefined {
  const kind = data.kind;
  if (typeof kind === "string") return kind;
  const nodeType = data.nodeType;
  if (typeof nodeType === "string") return nodeType;
  const extraData = data.extraData as Record<string, unknown> | undefined;
  const extraKind = extraData?.kind;
  if (typeof extraKind === "string") return extraKind;
  return undefined;
}

function buildNetworkNodeAnnotations(nodes: Node[]): NetworkNodeAnnotation[] {
  const annotations: NetworkNodeAnnotation[] = [];

  for (const node of nodes) {
    if (!isNetworkNode(node)) continue;

    const data = (node.data ?? {}) as Record<string, unknown>;
    const type = getNetworkType(data);
    if (!type || !SPECIAL_NETWORK_TYPES.has(type)) continue;

    const label = (data.label as string) || (data.name as string) || node.id;
    const geoCoordinates = data.geoCoordinates as { lat: number; lng: number } | undefined;

    annotations.push({
      id: node.id,
      type: type as NetworkNodeAnnotation["type"],
      label,
      position: node.position,
      ...(geoCoordinates ? { geoCoordinates } : {}),
      ...(typeof data.group === "string" ? { group: data.group } : {}),
      ...(typeof data.level === "string" ? { level: data.level } : {})
    });
  }

  return annotations;
}

export async function createNode(nodeData: NodeSaveData): Promise<void> {
  try {
    await executeTopologyCommand({ command: "addNode", payload: nodeData });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: addNode`, err);
  }
}

export async function editNode(nodeData: NodeSaveData): Promise<void> {
  try {
    await executeTopologyCommand({ command: "editNode", payload: nodeData });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: editNode`, err);
  }
}

export async function deleteNode(nodeId: string): Promise<void> {
  try {
    await executeTopologyCommand({ command: "deleteNode", payload: { id: nodeId } });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: deleteNode`, err);
  }
}

export async function createLink(linkData: LinkSaveData): Promise<void> {
  try {
    await executeTopologyCommand({ command: "addLink", payload: linkData });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: addLink`, err);
  }
}

export async function editLink(linkData: LinkSaveData): Promise<void> {
  try {
    await executeTopologyCommand({ command: "editLink", payload: linkData });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: editLink`, err);
  }
}

export async function deleteLink(linkData: LinkSaveData): Promise<void> {
  try {
    await executeTopologyCommand({ command: "deleteLink", payload: linkData });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: deleteLink`, err);
  }
}

/** Data for network node creation (for non-bridge types) */
export interface NetworkNodeData {
  id: string;
  label: string;
  type:
    | "host"
    | "mgmt-net"
    | "macvlan"
    | "vxlan"
    | "vxlan-stitch"
    | "dummy"
    | "bridge"
    | "ovs-bridge";
  position: { x: number; y: number };
  geoCoordinates?: { lat: number; lng: number };
}

/**
 * Persist network nodes (non-bridge types) via annotations.
 * Assumes the graph store already contains the latest network nodes.
 */
export async function saveNetworkNodesFromGraph(nodes?: Node[]): Promise<void> {
  try {
    const graphNodes = nodes ?? useGraphStore.getState().nodes;
    const annotations = buildNetworkNodeAnnotations(graphNodes);
    await executeTopologyCommand({
      command: "setAnnotations",
      payload: { networkNodeAnnotations: annotations }
    });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotations(networkNodeAnnotations)`, err);
  }
}

/**
 * Create a network node stored in annotations (non-bridge types).
 * Bridge types should be persisted via addNode/editNode instead.
 */
export async function createNetworkNode(data: NetworkNodeData): Promise<void> {
  if (BRIDGE_NETWORK_TYPES.has(data.type)) {
    console.warn(`[Host] Bridge network nodes should be created via addNode: ${data.type}`);
    return;
  }
  await saveNetworkNodesFromGraph();
}

/**
 * Save node positions via host command.
 */
export async function saveNodePositions(
  positions: Array<{
    id: string;
    position?: { x: number; y: number };
    geoCoordinates?: { lat: number; lng: number };
  }>
): Promise<void> {
  try {
    await executeTopologyCommand({ command: "savePositions", payload: positions });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: savePositions`, err);
  }
}
