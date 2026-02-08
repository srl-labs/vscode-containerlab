/**
 * Topology CRUD Helpers (Host-authoritative)
 *
 * Dispatches topology commands to the host and applies snapshots.
 */

import type { Node } from "@xyflow/react";

import type { NodeSaveData } from "../../shared/io/NodePersistenceIO";
import type { LinkSaveData } from "../../shared/io/LinkPersistenceIO";
import { nodesToAnnotations } from "../annotations/annotationNodeConverters";
import { collectNodeGroupMemberships } from "../annotations/groupMembership";
import { useGraphStore } from "../stores/graphStore";
import { BRIDGE_NETWORK_TYPES } from "../utils/networkNodeTypes";
import { buildNetworkNodeAnnotations } from "../utils/networkNodeAnnotations";

import { executeTopologyCommand } from "./topologyHostCommands";

// Re-export types for convenience
export type { NodeSaveData, LinkSaveData };

const WARN_COMMAND_FAILED = "[Host] Topology command failed";

export { buildNetworkNodeAnnotations };

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
 * Note: We set applySnapshot: false because position-only changes should not
 * trigger a full topology reload, which would reset geo-mode positions.
 */
export async function saveNodePositions(
  positions: Array<{
    id: string;
    position?: { x: number; y: number };
    geoCoordinates?: { lat: number; lng: number };
  }>
): Promise<void> {
  try {
    await executeTopologyCommand(
      { command: "savePositions", payload: positions },
      { applySnapshot: false }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: savePositions`, err);
  }
}

/**
 * Save node positions and annotation nodes in a single host command.
 * This keeps related moves (e.g., groups + members) as one undo entry.
 */
export async function saveNodePositionsWithAnnotations(
  positions: Array<{
    id: string;
    position?: { x: number; y: number };
    geoCoordinates?: { lat: number; lng: number };
  }>,
  nodes?: Node[]
): Promise<void> {
  try {
    const graphNodes = nodes ?? useGraphStore.getState().nodes;
    const { freeTextAnnotations, freeShapeAnnotations, groups } = nodesToAnnotations(graphNodes);
    await executeTopologyCommand(
      {
        command: "savePositionsAndAnnotations",
        payload: {
          positions,
          annotations: {
            freeTextAnnotations,
            freeShapeAnnotations,
            groupStyleAnnotations: groups
          }
        }
      },
      { applySnapshot: false }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: savePositionsAndAnnotations`, err);
  }
}

/**
 * Save node positions + group memberships as a single batch command (one undo entry).
 * Used when a node drag may change group membership.
 */
export async function saveNodePositionsWithMemberships(
  positions: Array<{
    id: string;
    position?: { x: number; y: number };
    geoCoordinates?: { lat: number; lng: number };
  }>
): Promise<void> {
  try {
    const memberships = collectNodeGroupMemberships(useGraphStore.getState().nodes);
    await executeTopologyCommand(
      {
        command: "batch",
        payload: {
          commands: [
            { command: "savePositions", payload: positions },
            {
              command: "setNodeGroupMemberships",
              payload: memberships.map((m) => ({ nodeId: m.id, groupId: m.groupId ?? null }))
            }
          ]
        }
      },
      { applySnapshot: false }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: savePositionsWithMemberships(batch)`, err);
  }
}
