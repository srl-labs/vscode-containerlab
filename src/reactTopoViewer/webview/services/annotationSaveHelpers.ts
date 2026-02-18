/**
 * Annotation Save Helpers (Host-authoritative)
 */

import type { Node } from "@xyflow/react";

import type {
  FreeTextAnnotation,
  FreeShapeAnnotation,
  GroupStyleAnnotation,
  EdgeAnnotation,
  TopologyAnnotations
} from "../../shared/types/topology";
import { useGraphStore } from "../stores/graphStore";
import { nodesToAnnotations } from "../annotations/annotationNodeConverters";

import { executeTopologyCommand } from "./topologyHostCommands";

const WARN_COMMAND_FAILED = "[Host] Annotation command failed";

export async function saveFreeTextAnnotations(annotations: FreeTextAnnotation[]): Promise<void> {
  try {
    await executeTopologyCommand({
      command: "setAnnotations",
      payload: { freeTextAnnotations: annotations }
    });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotations(freeTextAnnotations)`, err);
  }
}

export interface SaveAnnotationNodesOptions {
  /** Skip re-applying snapshot to avoid position snapback during continuous updates */
  applySnapshot?: boolean;
}

export async function saveAnnotationNodesFromGraph(
  nodes?: Node[],
  options: SaveAnnotationNodesOptions = {}
): Promise<void> {
  try {
    const graphNodes = nodes ?? useGraphStore.getState().nodes;
    const { freeTextAnnotations, freeShapeAnnotations, trafficRateAnnotations, groups } =
      nodesToAnnotations(graphNodes);
    await executeTopologyCommand(
      {
        command: "setAnnotations",
        payload: {
          freeTextAnnotations,
          freeShapeAnnotations,
          trafficRateAnnotations,
          groupStyleAnnotations: groups
        }
      },
      { applySnapshot: options.applySnapshot ?? true }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotations(annotationNodes)`, err);
  }
}

export async function saveAnnotationNodesWithMemberships(
  memberships: Array<{ id: string; groupId?: string }>,
  nodes?: Node[]
): Promise<void> {
  try {
    const graphNodes = nodes ?? useGraphStore.getState().nodes;
    const { freeTextAnnotations, freeShapeAnnotations, trafficRateAnnotations, groups } =
      nodesToAnnotations(graphNodes);
    await executeTopologyCommand({
      command: "setAnnotationsWithMemberships",
      payload: {
        annotations: {
          freeTextAnnotations,
          freeShapeAnnotations,
          trafficRateAnnotations,
          groupStyleAnnotations: groups
        },
        memberships: memberships.map((m) => ({ nodeId: m.id, groupId: m.groupId ?? null }))
      }
    });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotationsWithMemberships`, err);
  }
}

export async function saveFreeShapeAnnotations(annotations: FreeShapeAnnotation[]): Promise<void> {
  try {
    await executeTopologyCommand({
      command: "setAnnotations",
      payload: { freeShapeAnnotations: annotations }
    });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotations(freeShapeAnnotations)`, err);
  }
}

export async function saveGroupStyleAnnotations(
  annotations: GroupStyleAnnotation[]
): Promise<void> {
  try {
    await executeTopologyCommand({
      command: "setAnnotations",
      payload: { groupStyleAnnotations: annotations }
    });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setAnnotations(groupStyleAnnotations)`, err);
  }
}

export async function saveEdgeAnnotations(annotations: EdgeAnnotation[]): Promise<void> {
  try {
    await executeTopologyCommand({ command: "setEdgeAnnotations", payload: annotations });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setEdgeAnnotations`, err);
  }
}

export async function saveViewerSettings(
  settings: NonNullable<TopologyAnnotations["viewerSettings"]>
): Promise<void> {
  try {
    await executeTopologyCommand({ command: "setViewerSettings", payload: settings });
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setViewerSettings`, err);
  }
}

export async function saveNodeGroupMembership(
  nodeId: string,
  groupId: string | null
): Promise<void> {
  try {
    // Avoid snapshot re-apply here to prevent position snapback when membership changes
    // are sent separately from position saves during drag/drop.
    await executeTopologyCommand(
      { command: "setNodeGroupMembership", payload: { nodeId, groupId } },
      { applySnapshot: false }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setNodeGroupMembership`, err);
  }
}

export async function saveAllNodeGroupMemberships(
  memberships: Array<{ id: string; groupId?: string }>
): Promise<void> {
  try {
    // Avoid snapshot re-apply here for the same reason as saveNodeGroupMembership.
    await executeTopologyCommand(
      {
        command: "setNodeGroupMemberships",
        payload: memberships.map((m) => ({ nodeId: m.id, groupId: m.groupId ?? null }))
      },
      { applySnapshot: false }
    );
  } catch (err) {
    console.error(`${WARN_COMMAND_FAILED}: setNodeGroupMemberships`, err);
  }
}
