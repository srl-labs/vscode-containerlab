/**
 * Interface pattern resolver for node interface naming patterns.
 * Pure functions - no VS Code dependencies, no I/O.
 */

import { NodeAnnotation } from '../types/topology';
import { DEFAULT_INTERFACE_PATTERNS } from '../constants/interfacePatterns';
import type { InterfacePatternMigration } from './types';

// ============================================================================
// Interface Pattern Resolution
// ============================================================================

/**
 * Result of resolving an interface pattern.
 */
export interface InterfacePatternResult {
  /** The resolved pattern (e.g., "e1-{n}") */
  pattern: string | undefined;
  /** True if pattern was resolved from kind mapping (needs migration to annotations) */
  needsMigration: boolean;
}

/**
 * Resolves the interface pattern for a node.
 * Priority: annotation > kind-based mapping
 *
 * @param nodeAnn - The node annotation (may have interfacePattern)
 * @param kind - The node kind (for kind-based pattern lookup)
 * @param customPatterns - Optional custom patterns to use instead of defaults
 * @returns The resolved pattern and whether it needs migration
 */
export function resolveInterfacePattern(
  nodeAnn: NodeAnnotation | undefined,
  kind: string,
  customPatterns?: Record<string, string>
): InterfacePatternResult {
  // First check if the annotation has an interface pattern (node-specific)
  const annPattern = nodeAnn?.interfacePattern;
  if (typeof annPattern === 'string' && annPattern) {
    return { pattern: annPattern, needsMigration: false };
  }

  // Fall back to kind-based mapping - this needs migration
  const patterns = customPatterns ?? DEFAULT_INTERFACE_PATTERNS;
  const kindPattern = patterns[kind];
  return { pattern: kindPattern, needsMigration: Boolean(kindPattern) };
}

/**
 * Gets the default interface patterns.
 */
export function getDefaultInterfacePatterns(): Record<string, string> {
  return { ...DEFAULT_INTERFACE_PATTERNS };
}

/**
 * Checks if a node needs interface pattern migration.
 */
export function needsInterfacePatternMigration(
  nodeAnn: NodeAnnotation | undefined,
  kind: string
): boolean {
  // Node already has pattern in annotation - no migration needed
  const annPattern = nodeAnn?.interfacePattern;
  if (typeof annPattern === 'string' && annPattern) {
    return false;
  }

  // Check if kind has a default pattern that should be migrated
  return kind in DEFAULT_INTERFACE_PATTERNS;
}

/**
 * Creates an interface pattern migration entry.
 */
export function createInterfacePatternMigration(
  nodeId: string,
  kind: string
): InterfacePatternMigration | undefined {
  const pattern = DEFAULT_INTERFACE_PATTERNS[kind];
  if (!pattern) return undefined;
  return { nodeId, interfacePattern: pattern };
}

/**
 * Collects all interface pattern migrations for a topology.
 */
export function collectInterfacePatternMigrations(
  nodes: Record<string, { kind?: string }>,
  nodeAnnotations?: NodeAnnotation[]
): InterfacePatternMigration[] {
  const migrations: InterfacePatternMigration[] = [];
  const annotationMap = new Map<string, NodeAnnotation>();

  if (nodeAnnotations) {
    for (const ann of nodeAnnotations) {
      annotationMap.set(ann.id, ann);
    }
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    const kind = node.kind || '';
    const ann = annotationMap.get(nodeId);

    if (needsInterfacePatternMigration(ann, kind)) {
      const migration = createInterfacePatternMigration(nodeId, kind);
      if (migration) {
        migrations.push(migration);
      }
    }
  }

  return migrations;
}
