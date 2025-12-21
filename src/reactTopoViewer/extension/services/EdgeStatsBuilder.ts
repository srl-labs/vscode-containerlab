/**
 * EdgeStatsBuilder - Builds edge statistics updates from lab inspection data
 */

import type { CyElement, ClabTopology } from '../../shared/types/topology';
import type { ClabLabTreeNode } from '../../../treeView/common';
import { extractEdgeInterfaceStats, computeEdgeClassFromStates } from '../../shared/parsing';
import { findInterfaceNode } from './TreeUtils';

export interface EdgeStatsUpdate {
  id: string;
  extraData: Record<string, unknown>;
  classes?: string;
}

export interface EdgeStatsBuilderContext {
  currentLabName: string;
  topology: ClabTopology['topology'] | undefined;
}

/**
 * Build edge stats updates from cached elements and fresh labs data.
 */
export function buildEdgeStatsUpdates(
  elements: CyElement[],
  labs: Record<string, ClabLabTreeNode> | undefined,
  context: EdgeStatsBuilderContext
): EdgeStatsUpdate[] {
  if (!labs || elements.length === 0) {
    return [];
  }

  const updates: EdgeStatsUpdate[] = [];

  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const update = buildSingleEdgeUpdate(el, labs, context);
    if (update) {
      updates.push(update);
    }
  }

  return updates;
}

/**
 * Build update for a single edge element.
 */
function buildSingleEdgeUpdate(
  el: CyElement,
  labs: Record<string, ClabLabTreeNode>,
  context: EdgeStatsBuilderContext
): EdgeStatsUpdate | null {
  const data = el.data as Record<string, unknown>;
  const edgeId = data.id as string;
  const extraData = (data.extraData ?? {}) as Record<string, unknown>;

  // Look up fresh interface data
  const { sourceIface, targetIface } = lookupEdgeInterfaces(data, extraData, labs, context.currentLabName);

  // Build updated extraData from interfaces
  const updatedExtraData = buildInterfaceExtraData(sourceIface, targetIface);

  // Compute edge class based on interface states
  const edgeClass = computeEdgeClassForUpdate(
    context.topology, extraData, data, sourceIface?.state, targetIface?.state
  );

  // Only return update if we have something to update
  if (Object.keys(updatedExtraData).length === 0) {
    return null;
  }

  return { id: edgeId, extraData: updatedExtraData, classes: edgeClass };
}

/**
 * Look up source and target interfaces for an edge.
 */
function lookupEdgeInterfaces(
  data: Record<string, unknown>,
  extraData: Record<string, unknown>,
  labs: Record<string, ClabLabTreeNode>,
  currentLabName: string
): { sourceIface: ReturnType<typeof findInterfaceNode>; targetIface: ReturnType<typeof findInterfaceNode> } {
  const sourceIfaceName = normalizeInterfaceName(extraData.clabSourcePort, data.sourceEndpoint);
  const targetIfaceName = normalizeInterfaceName(extraData.clabTargetPort, data.targetEndpoint);

  const sourceIface = findInterfaceNode(
    labs, (extraData.clabSourceLongName as string) ?? '', sourceIfaceName, currentLabName
  );
  const targetIface = findInterfaceNode(
    labs, (extraData.clabTargetLongName as string) ?? '', targetIfaceName, currentLabName
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
    applyInterfaceToExtraData(updatedExtraData, 'Source', sourceIface);
  }
  if (targetIface) {
    applyInterfaceToExtraData(updatedExtraData, 'Target', targetIface);
  }

  return updatedExtraData;
}

/**
 * Apply interface data to extraData object with given prefix.
 */
function applyInterfaceToExtraData(
  extraData: Record<string, unknown>,
  prefix: 'Source' | 'Target',
  iface: NonNullable<ReturnType<typeof findInterfaceNode>>
): void {
  extraData[`clab${prefix}InterfaceState`] = iface.state || '';
  extraData[`clab${prefix}MacAddress`] = iface.mac ?? '';
  extraData[`clab${prefix}Mtu`] = iface.mtu ?? '';
  extraData[`clab${prefix}Type`] = iface.type ?? '';
  const stats = extractEdgeInterfaceStats(iface);
  if (stats) {
    extraData[`clab${prefix}Stats`] = stats;
  }
}

/**
 * Compute edge class for an update.
 */
function computeEdgeClassForUpdate(
  topology: ClabTopology['topology'] | undefined,
  extraData: Record<string, unknown>,
  data: Record<string, unknown>,
  sourceState?: string,
  targetState?: string
): string | undefined {
  if (!topology) return undefined;
  const sourceNodeId = (extraData.yamlSourceNodeId as string) || (data.source as string);
  const targetNodeId = (extraData.yamlTargetNodeId as string) || (data.target as string);
  return computeEdgeClassFromStates(topology, sourceNodeId, targetNodeId, sourceState, targetState);
}

/**
 * Normalize interface name, using fallback if primary is empty.
 */
function normalizeInterfaceName(value: unknown, fallback: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback;
  }
  return '';
}
