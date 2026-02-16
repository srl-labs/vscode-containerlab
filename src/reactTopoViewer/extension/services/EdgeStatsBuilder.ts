/**
 * EdgeStatsBuilder - Builds edge statistics updates from lab inspection data
 */

import type { ClabLabTreeNode } from "../../../treeView/common";
import type { ClabTopology } from "../../shared/types/topology";
import type { TopoEdge, TopologyEdgeData } from "../../shared/types/graph";
import { extractEdgeInterfaceStats, computeEdgeClassFromStates } from "../../shared/parsing";

import { findInterfaceNode } from "./TreeUtils";

export interface EdgeStatsUpdate {
  id: string;
  extraData: Record<string, unknown>;
  classes?: string;
}

export interface EdgeStatsBuilderContext {
  currentLabName: string;
  topology: ClabTopology["topology"] | undefined;
}

export interface NodeRuntimeUpdate {
  containerLongName: string;
  containerShortName: string;
  state: string;
  status?: string;
  mgmtIpv4Address?: string;
  mgmtIpv6Address?: string;
}

/**
 * Build edge stats updates from cached edges and fresh labs data.
 */
export function buildEdgeStatsUpdates(
  edges: TopoEdge[],
  labs: Record<string, ClabLabTreeNode> | undefined,
  context: EdgeStatsBuilderContext
): EdgeStatsUpdate[] {
  if (!labs || edges.length === 0) {
    return [];
  }

  const updates: EdgeStatsUpdate[] = [];

  for (const edge of edges) {
    const update = buildSingleEdgeUpdate(edge, labs, context);
    if (update) {
      updates.push(update);
    }
  }

  return updates;
}

/**
 * Build node runtime updates from fresh lab/container data.
 */
export function buildNodeRuntimeUpdates(
  labs: Record<string, ClabLabTreeNode> | undefined,
  currentLabName: string
): NodeRuntimeUpdate[] {
  if (!labs) {
    return [];
  }

  const updates: NodeRuntimeUpdate[] = [];
  const labValues = Object.values(labs).filter((lab) => lab.name === currentLabName);
  if (labValues.length === 0) {
    return [];
  }

  for (const lab of labValues) {
    for (const container of lab.containers ?? []) {
      updates.push({
        containerLongName: container.name,
        containerShortName: container.name_short,
        state: container.state ?? "",
        status: container.status,
        mgmtIpv4Address: container.IPv4Address ?? "",
        mgmtIpv6Address: container.IPv6Address ?? ""
      });
    }
  }

  return updates;
}

/**
 * Build update for a single edge.
 */
function buildSingleEdgeUpdate(
  edge: TopoEdge,
  labs: Record<string, ClabLabTreeNode>,
  context: EdgeStatsBuilderContext
): EdgeStatsUpdate | null {
  const edgeData = edge.data as TopologyEdgeData | undefined;
  const extraData = (edgeData?.extraData ?? {}) as Record<string, unknown>;

  // Look up fresh interface data
  const { sourceIface, targetIface } = lookupEdgeInterfaces(
    edge,
    edgeData,
    extraData,
    labs,
    context.currentLabName
  );

  // Build updated extraData from interfaces
  const updatedExtraData = buildInterfaceExtraData(sourceIface, targetIface);

  // Compute edge class based on interface states
  const edgeClass = computeEdgeClassForUpdate(
    context.topology,
    extraData,
    edge,
    sourceIface?.state,
    targetIface?.state
  );

  // Only return update if we have something to update
  if (Object.keys(updatedExtraData).length === 0) {
    return null;
  }

  return { id: edge.id, extraData: updatedExtraData, classes: edgeClass };
}

/**
 * Look up source and target interfaces for an edge.
 */
function lookupEdgeInterfaces(
  _edge: TopoEdge,
  edgeData: TopologyEdgeData | undefined,
  extraData: Record<string, unknown>,
  labs: Record<string, ClabLabTreeNode>,
  currentLabName: string
): {
  sourceIface: ReturnType<typeof findInterfaceNode>;
  targetIface: ReturnType<typeof findInterfaceNode>;
} {
  const sourceIfaceName = normalizeInterfaceName(
    extraData.clabSourcePort,
    edgeData?.sourceEndpoint
  );
  const targetIfaceName = normalizeInterfaceName(
    extraData.clabTargetPort,
    edgeData?.targetEndpoint
  );

  const sourceIface = findInterfaceNode(
    labs,
    (extraData.clabSourceLongName as string) ?? "",
    sourceIfaceName,
    currentLabName
  );
  const targetIface = findInterfaceNode(
    labs,
    (extraData.clabTargetLongName as string) ?? "",
    targetIfaceName,
    currentLabName
  );

  return { sourceIface, targetIface };
}

/**
 * Build extraData object from interface data.
 */
function buildInterfaceExtraData(
  sourceIface: ReturnType<typeof findInterfaceNode>,
  targetIface: ReturnType<typeof findInterfaceNode>
): Record<string, unknown> {
  const updatedExtraData: Record<string, unknown> = {};

  if (sourceIface) {
    applyInterfaceToExtraData(updatedExtraData, "Source", sourceIface);
  }
  if (targetIface) {
    applyInterfaceToExtraData(updatedExtraData, "Target", targetIface);
  }

  return updatedExtraData;
}

/**
 * Apply interface data to extraData object with given prefix.
 */
function applyInterfaceToExtraData(
  extraData: Record<string, unknown>,
  prefix: "Source" | "Target",
  iface: NonNullable<ReturnType<typeof findInterfaceNode>>
): void {
  extraData[`clab${prefix}InterfaceState`] = iface.state || "";
  extraData[`clab${prefix}MacAddress`] = iface.mac ?? "";
  extraData[`clab${prefix}Mtu`] = iface.mtu ?? "";
  extraData[`clab${prefix}Type`] = iface.type ?? "";
  extraData[`clab${prefix}Netem`] = iface.netemState ?? undefined;
  const stats = extractEdgeInterfaceStats(iface);
  if (stats) {
    extraData[`clab${prefix}Stats`] = stats;
  }
}

/**
 * Compute edge class for an update.
 */
function computeEdgeClassForUpdate(
  topology: ClabTopology["topology"] | undefined,
  extraData: Record<string, unknown>,
  edge: TopoEdge,
  sourceState?: string,
  targetState?: string
): string | undefined {
  if (!topology) return undefined;
  const sourceNodeId = (extraData.yamlSourceNodeId as string) || edge.source;
  const targetNodeId = (extraData.yamlTargetNodeId as string) || edge.target;
  return computeEdgeClassFromStates(topology, sourceNodeId, targetNodeId, sourceState, targetState);
}

/**
 * Normalize interface name, using fallback if primary is empty.
 */
function normalizeInterfaceName(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }
  return "";
}
