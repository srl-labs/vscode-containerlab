/**
 * Shared utilities for interface pattern handling in edge/link creation
 */
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import { DEFAULT_INTERFACE_PATTERNS } from '../../shared/constants/interfacePatterns';

// Re-export for consumers
export { DEFAULT_INTERFACE_PATTERNS };

// ============================================================================
// Constants
// ============================================================================

/** Default interface pattern when no specific pattern is configured */
export const DEFAULT_INTERFACE_PATTERN = 'eth{n}';

/** Regex for parsing interface patterns like "eth{n}" or "Gi0/0/{n:0}" */
export const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;

// ============================================================================
// Types
// ============================================================================

export interface ParsedInterfacePattern {
  prefix: string;
  suffix: string;
  startIndex: number;
}

// ============================================================================
// Pattern Parsing
// ============================================================================

/**
 * Parse interface pattern like "eth{n}", "Gi0/0/{n:0}", or simple patterns like "lo"
 * If no {n} placeholder, treat the whole pattern as prefix and append numbers
 */
export function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    // No {n} placeholder - treat the whole pattern as prefix
    // This handles patterns like "lo" -> lo0, lo1, etc.
    return { prefix: pattern || 'eth', suffix: '', startIndex: 0 };
  }
  const [, prefix = '', startStr, suffix = ''] = match;
  const startIndex = startStr ? parseInt(startStr, 10) : 0;
  return { prefix, suffix, startIndex };
}

/**
 * Generate interface name from pattern and index
 */
export function generateInterfaceName(parsed: ParsedInterfacePattern, index: number): string {
  const num = parsed.startIndex + index;
  return `${parsed.prefix}${num}${parsed.suffix}`;
}

/**
 * Extract interface index from an endpoint string using a parsed pattern
 * Returns -1 if not matching
 */
export function extractInterfaceIndex(endpoint: string, parsed: ParsedInterfacePattern): number {
  // Build regex to match the pattern
  const escapedPrefix = parsed.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = parsed.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix}(\\d+)${escapedSuffix}$`);
  const match = regex.exec(endpoint);
  if (match) {
    return parseInt(match[1], 10) - parsed.startIndex;
  }
  return -1;
}

// ============================================================================
// Node Interface Pattern
// ============================================================================

/**
 * Get interface pattern for a node from its extraData or kind-based mapping
 * Priority: node.extraData.interfacePattern → kindMapping[kind] → DEFAULT
 */
export function getNodeInterfacePattern(
  node: NodeSingular,
  interfacePatternMapping: Record<string, string> = DEFAULT_INTERFACE_PATTERNS
): string {
  const extraData = node.data('extraData') as { interfacePattern?: string; kind?: string } | undefined;

  // Priority 1: Node-specific interface pattern (from template or annotation)
  if (extraData?.interfacePattern) {
    return extraData.interfacePattern;
  }

  // Priority 2: Kind-based mapping (built-in + custom nodes)
  const kind = extraData?.kind;
  if (kind && interfacePatternMapping[kind]) {
    return interfacePatternMapping[kind];
  }

  // Priority 3: Default pattern
  return DEFAULT_INTERFACE_PATTERN;
}

// ============================================================================
// Used Indices Collection
// ============================================================================

/**
 * Collect used interface indices for a node using its interface pattern
 */
export function collectUsedIndices(cy: CyCore, nodeId: string, parsed: ParsedInterfacePattern): Set<number> {
  const usedIndices = new Set<number>();
  const edges = cy.edges(`[source = "${nodeId}"], [target = "${nodeId}"]`);

  edges.forEach((edge) => {
    const src = edge.data('source');
    const tgt = edge.data('target');
    const epSrc = edge.data('sourceEndpoint') as string | undefined;
    const epTgt = edge.data('targetEndpoint') as string | undefined;

    if (src === nodeId && epSrc) {
      const idx = extractInterfaceIndex(epSrc, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
    if (tgt === nodeId && epTgt) {
      const idx = extractInterfaceIndex(epTgt, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
  });

  return usedIndices;
}

/**
 * Get the next available endpoint for a node using its interface pattern
 * @param cy Cytoscape instance
 * @param node Node to get endpoint for
 * @param isNetworkNode Function to check if node is a network node (returns empty string for network nodes)
 * @param interfacePatternMapping Optional custom interface pattern mapping
 */
export function getNextEndpointForNode(
  cy: CyCore,
  node: NodeSingular,
  isNetworkNode?: (node: NodeSingular) => boolean,
  interfacePatternMapping: Record<string, string> = DEFAULT_INTERFACE_PATTERNS
): string {
  // Network nodes don't have interface endpoints
  if (isNetworkNode && isNetworkNode(node)) {
    return '';
  }

  const pattern = getNodeInterfacePattern(node, interfacePatternMapping);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(cy, node.id(), parsed);

  // Find next available index
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return generateInterfaceName(parsed, nextIndex);
}
