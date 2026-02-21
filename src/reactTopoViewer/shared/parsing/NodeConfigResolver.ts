/**
 * Node configuration resolver for Containerlab inheritance.
 * Pure functions - no VS Code dependencies.
 */

import type { ClabTopology, ClabNode } from "../types/topology";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Gets a section from the topology configuration.
 */
function getSection(
  source: Record<string, ClabNode> | undefined,
  key: string | undefined
): ClabNode {
  if (source === undefined || key === undefined || key.length === 0) return {};
  return source[key] ?? {};
}

/**
 * Resolves the kind name through inheritance.
 */
function resolveKindName(
  node: ClabNode,
  groupCfg: ClabNode,
  defaults: ClabNode
): string | undefined {
  return node.kind ?? groupCfg.kind ?? defaults.kind;
}

/**
 * Merges node labels from multiple sources.
 */
function mergeNodeLabels(
  ...labels: unknown[]
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const label of labels) {
    if (!isRecord(label)) continue;
    Object.assign(merged, label);
  }
  return merged;
}

/**
 * Applies Containerlab inheritance rules to compute the effective
 * configuration for a node. The precedence order is:
 * node -> group -> kind -> defaults.
 */
export function resolveNodeConfig(parsed: ClabTopology, node: ClabNode): ClabNode {
  const { defaults = {}, groups, kinds } = parsed.topology ?? {};

  const groupCfg = getSection(groups, node.group);
  const kindName = resolveKindName(node, groupCfg, defaults);
  const kindCfg = getSection(kinds, kindName);

  return {
    ...defaults,
    ...kindCfg,
    ...groupCfg,
    ...node,
    kind: kindName,
    labels: mergeNodeLabels(
      defaults.labels,
      kindCfg.labels,
      groupCfg.labels,
      node.labels
    )
  };
}
