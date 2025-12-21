/**
 * Node configuration resolver for Containerlab inheritance.
 * Pure functions - no VS Code dependencies.
 */

import type { ClabTopology, ClabNode } from '../types/topology';

/**
 * Gets a section from the topology configuration.
 */
function getSection(
  source: Record<string, ClabNode> | undefined,
  key: string | undefined
): ClabNode {
  return key && source?.[key] ? source[key] : {};
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
  ...labels: (Record<string, unknown> | undefined)[]
): Record<string, unknown> {
  const filtered = labels.filter((l): l is Record<string, unknown> => Boolean(l));
  return Object.assign({}, ...filtered) as Record<string, unknown>;
}

/**
 * Applies Containerlab inheritance rules to compute the effective
 * configuration for a node. The precedence order is:
 * node -> group -> kind -> defaults.
 */
export function resolveNodeConfig(
  parsed: ClabTopology,
  node: ClabNode
): ClabNode {
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
      defaults.labels as Record<string, unknown>,
      kindCfg.labels as Record<string, unknown>,
      groupCfg.labels as Record<string, unknown>,
      node.labels as Record<string, unknown>,
    ),
  };
}
