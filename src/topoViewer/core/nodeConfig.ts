import { ClabTopology, ClabNode } from '../types/topoViewerType';

/**
 * Applies Containerlab inheritance rules to compute the effective
 * configuration for a node. The precedence order is:
 * node -> group -> kind -> defaults.
 */
export function resolveNodeConfig(parsed: ClabTopology, node: ClabNode): ClabNode {
  const defaults = parsed.topology?.defaults ?? {};
  const groups = parsed.topology?.groups ?? {};
  const kinds = parsed.topology?.kinds ?? {};

  const groupCfg = node.group && groups[node.group] ? groups[node.group] : {};
  const kindName = node.kind ?? (groupCfg.kind ?? defaults.kind);
  const kindCfg = kindName && kinds[kindName] ? kinds[kindName] : {};

  const merged: ClabNode = {
    ...defaults,
    ...kindCfg,
    ...groupCfg,
    ...node,
  };
  merged.kind = kindName;
  merged.labels = {
    ...(defaults.labels ?? {}),
    ...(kindCfg.labels ?? {}),
    ...(groupCfg.labels ?? {}),
    ...(node.labels ?? {}),
  };
  return merged;
}
