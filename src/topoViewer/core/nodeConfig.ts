// file: nodeConfig.ts
// Resolves effective node configuration using Containerlab inheritance rules.

import { ClabTopology, ClabNode } from '../types/topoViewerType';

/**
 * Applies Containerlab inheritance rules to compute a node's final configuration.
 * Precedence order: node → group → kind → defaults.
 *
 * @param parsed - Parsed Containerlab topology.
 * @param node - Node definition to resolve.
 * @returns Fully merged node configuration.
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
