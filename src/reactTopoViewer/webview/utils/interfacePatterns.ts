/**
 * Shared utilities for interface pattern handling in edge/link creation
 */

import { DEFAULT_INTERFACE_PATTERNS } from "../../shared/constants/interfacePatterns";

// Re-export for consumers
export { DEFAULT_INTERFACE_PATTERNS };

// ============================================================================
// Constants
// ============================================================================

/** Default interface pattern when no specific pattern is configured */
export const DEFAULT_INTERFACE_PATTERN = "eth{n}";

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
    return { prefix: pattern || "eth", suffix: "", startIndex: 0 };
  }
  const [, prefix = "", startStr, suffix = ""] = match;
  const startIndex = startStr ? parseInt(startStr, 10) : 1;
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
  const escapedPrefix = parsed.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSuffix = parsed.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/** Node data shape for interface pattern resolution */
export interface NodeExtraData {
  interfacePattern?: string;
  kind?: string;
}

/**
 * Get interface pattern for a node from its extraData or kind-based mapping
 * Priority: node.extraData.interfacePattern → kindMapping[kind] → DEFAULT
 *
 * NOTE: During ReactFlow migration, this function takes extraData directly
 * instead of a node object with .data() method.
 */
export function getNodeInterfacePattern(
  extraData: NodeExtraData | undefined,
  interfacePatternMapping: Record<string, string> = DEFAULT_INTERFACE_PATTERNS
): string {
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

/** Edge data shape for endpoint extraction */
export interface EdgeData {
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
}

/**
 * Collect used interface indices for a node using its interface pattern
 *
 * NOTE: During ReactFlow migration, this function takes an array of edge data
 * instead of using a Cytoscape-like query.
 */
export function collectUsedIndices(
  edges: EdgeData[],
  nodeId: string,
  parsed: ParsedInterfacePattern
): Set<number> {
  const usedIndices = new Set<number>();

  for (const edge of edges) {
    if (edge.source === nodeId && edge.sourceEndpoint) {
      const idx = extractInterfaceIndex(edge.sourceEndpoint, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
    if (edge.target === nodeId && edge.targetEndpoint) {
      const idx = extractInterfaceIndex(edge.targetEndpoint, parsed);
      if (idx >= 0) usedIndices.add(idx);
    }
  }

  return usedIndices;
}

/**
 * Get the next available endpoint for a node using its interface pattern
 *
 * NOTE: During ReactFlow migration, this function takes node data directly
 * instead of using Cytoscape-like methods.
 *
 * @param edges Array of edges connected to the node
 * @param nodeId ID of the node
 * @param extraData Node's extra data containing interfacePattern and kind
 * @param isNetworkNode Whether the node is a network node (returns empty string for network nodes)
 * @param interfacePatternMapping Optional custom interface pattern mapping
 */
export function getNextEndpointForNode(
  edges: EdgeData[],
  nodeId: string,
  extraData: NodeExtraData | undefined,
  isNetworkNode: boolean = false,
  interfacePatternMapping: Record<string, string> = DEFAULT_INTERFACE_PATTERNS
): string {
  // Network nodes don't have interface endpoints
  if (isNetworkNode) {
    return "";
  }

  const pattern = getNodeInterfacePattern(extraData, interfacePatternMapping);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(edges, nodeId, parsed);

  // Find next available index
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return generateInterfaceName(parsed, nextIndex);
}

/**
 * Get the next available endpoint for a node, excluding specified endpoints.
 * Used for self-loops where we need two different endpoints on the same node.
 *
 * NOTE: During ReactFlow migration, this function takes node data directly.
 *
 * @param edges Array of edges connected to the node
 * @param nodeId ID of the node
 * @param extraData Node's extra data containing interfacePattern and kind
 * @param interfacePatternMapping Custom interface pattern mapping
 * @param excludeEndpoints Endpoints to exclude from allocation
 */
export function getNextEndpointForNodeExcluding(
  edges: EdgeData[],
  nodeId: string,
  extraData: NodeExtraData | undefined,
  interfacePatternMapping: Record<string, string>,
  excludeEndpoints: string[]
): string {
  const pattern = getNodeInterfacePattern(extraData, interfacePatternMapping);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(edges, nodeId, parsed);

  // Also exclude specified endpoints
  for (const ep of excludeEndpoints) {
    const idx = extractInterfaceIndex(ep, parsed);
    if (idx >= 0) usedIndices.add(idx);
  }

  // Find next available index
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return generateInterfaceName(parsed, nextIndex);
}
