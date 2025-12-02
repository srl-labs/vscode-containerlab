import { ClabTopology, ClabNode } from '../shared/types/topoViewerType';

/**
 * Applies Containerlab inheritance rules to compute the effective
 * configuration for a node. The precedence order is:
 * node -> group -> kind -> defaults.
 */

function getSection(
  source: Record<string, ClabNode> | undefined,
  key: string | undefined
): ClabNode {
  return key && source?.[key] ? source[key] : {};
}

function resolveKindName(
  node: ClabNode,
  groupCfg: ClabNode,
  defaults: ClabNode
): string | undefined {
  return node.kind ?? groupCfg.kind ?? defaults.kind;
}

function mergeNodeLabels(
  ...labels: (Record<string, any> | undefined)[]
): Record<string, any> {
  return Object.assign({}, ...labels.filter(Boolean));
}

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
      defaults.labels,
      kindCfg.labels,
      groupCfg.labels,
      node.labels,
    ),
  };
}
