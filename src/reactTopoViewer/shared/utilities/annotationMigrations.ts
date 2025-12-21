/**
 * Shared utilities for annotation migrations
 */

import type { TopologyAnnotations } from '../types/topology';

/**
 * Migration data for interface patterns
 */
export interface InterfacePatternMigration {
  nodeId: string;
  interfacePattern: string;
}

/**
 * Applies interface pattern migrations to annotations.
 * Returns the modified annotations and whether any changes were made.
 */
export function applyInterfacePatternMigrations(
  annotations: TopologyAnnotations,
  migrations: InterfacePatternMigration[]
): { annotations: TopologyAnnotations; modified: boolean } {
  if (migrations.length === 0) {
    return { annotations, modified: false };
  }

  if (!annotations.nodeAnnotations) {
    annotations.nodeAnnotations = [];
  }

  let modified = false;
  for (const { nodeId, interfacePattern } of migrations) {
    const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
    if (existing) {
      if (!existing.interfacePattern) {
        existing.interfacePattern = interfacePattern;
        modified = true;
      }
    } else {
      annotations.nodeAnnotations.push({ id: nodeId, interfacePattern });
      modified = true;
    }
  }

  return { annotations, modified };
}
