/**
 * Utility functions for bulk link creation
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import { FilterUtils } from "../../../../../helpers/filterUtils";
import { isSpecialEndpointId } from "../../../../shared/utilities/LinkTypes";
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import { DEFAULT_INTERFACE_PATTERNS } from "../../../../shared/constants/interfacePatterns";
import {
  hasEdgeBetween as hasEdgeBetweenUtil,
  getNodeById,
  getConnectedEdges
} from "../../../utils/graphQueryUtils";

export type LinkCandidate = { sourceId: string; targetId: string };

const DEFAULT_INTERFACE_PATTERN = "eth{n}";
const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;

type ParsedInterfacePattern = {
  prefix: string;
  suffix: string;
  startIndex: number;
};

type NodeExtraData = {
  interfacePattern?: string;
  kind?: string;
};

type EdgeData = {
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
};

function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    return { prefix: pattern || "eth", suffix: "", startIndex: 0 };
  }
  const [, prefix = "", startStr, suffix = ""] = match;
  const startIndex = startStr ? parseInt(startStr, 10) : 1;
  return { prefix, suffix, startIndex };
}

function generateInterfaceName(parsed: ParsedInterfacePattern, index: number): string {
  const num = parsed.startIndex + index;
  return `${parsed.prefix}${num}${parsed.suffix}`;
}

function extractInterfaceIndex(endpoint: string, parsed: ParsedInterfacePattern): number {
  const escapedPrefix = parsed.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSuffix = parsed.suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedPrefix}(\\d+)${escapedSuffix}$`);
  const match = regex.exec(endpoint);
  if (match) {
    return parseInt(match[1], 10) - parsed.startIndex;
  }
  return -1;
}

function getNodeInterfacePattern(
  extraData: NodeExtraData | undefined,
  interfacePatternMapping: Record<string, string> = DEFAULT_INTERFACE_PATTERNS
): string {
  if (extraData?.interfacePattern) {
    return extraData.interfacePattern;
  }

  const kind = extraData?.kind;
  if (kind && interfacePatternMapping[kind]) {
    return interfacePatternMapping[kind];
  }

  return DEFAULT_INTERFACE_PATTERN;
}

function collectUsedIndices(
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

type EndpointAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

function getOrCreateAllocator(
  allocators: Map<string, EndpointAllocator>,
  nodes: TopoNode[],
  edges: TopoEdge[],
  nodeId: string
): EndpointAllocator {
  const cached = allocators.get(nodeId);
  if (cached) return cached;

  const node = getNodeById(nodes, nodeId);
  if (!node) {
    // Return a default allocator if node not found
    const parsed = parseInterfacePattern("eth{0}");
    return { parsed, usedIndices: new Set<number>() };
  }

  // Extract extraData for getNodeInterfacePattern
  const data = node.data as Record<string, unknown>;
  const extraData = data.extraData as { interfacePattern?: string; kind?: string } | undefined;
  const pattern = getNodeInterfacePattern(extraData);
  const parsed = parseInterfacePattern(pattern);

  // Collect used indices from connected edges
  const connectedEdges = getConnectedEdges(edges, nodeId);
  const usedIndices = collectUsedIndices(connectedEdges, nodeId, parsed);

  const created = { parsed, usedIndices };
  allocators.set(nodeId, created);
  return created;
}

function allocateEndpoint(
  allocators: Map<string, EndpointAllocator>,
  nodes: TopoNode[],
  edges: TopoEdge[],
  nodeId: string
): string {
  if (isSpecialEndpointId(nodeId)) return "";

  const allocator = getOrCreateAllocator(allocators, nodes, edges, nodeId);
  let nextIndex = 0;
  while (allocator.usedIndices.has(nextIndex)) nextIndex++;
  allocator.usedIndices.add(nextIndex);
  return generateInterfaceName(allocator.parsed, nextIndex);
}

function applyBackreferences(pattern: string, match: RegExpMatchArray | null): string {
  if (!pattern) return pattern;

  return pattern.replace(
    /\$\$|\$<([^>]+)>|\$(\d+)/g,
    (fullMatch: string, namedGroup?: string, numberedGroup?: string) => {
      if (fullMatch === "$$") return "$";
      if (!match) return fullMatch;

      if (fullMatch.startsWith("$<")) {
        if (
          namedGroup &&
          match.groups &&
          Object.prototype.hasOwnProperty.call(match.groups, namedGroup)
        ) {
          return match.groups[namedGroup] ?? "";
        }
        return fullMatch;
      }

      if (numberedGroup) {
        const index = Number(numberedGroup);
        if (!Number.isNaN(index) && index < match.length) {
          return match[index] ?? "";
        }
        return fullMatch;
      }

      return fullMatch;
    }
  );
}

function getSourceMatch(
  name: string,
  sourceRegex: RegExp | null,
  fallbackFilter: ReturnType<typeof FilterUtils.createFilter> | null
): RegExpMatchArray | null | undefined {
  if (sourceRegex) {
    const execResult = sourceRegex.exec(name);
    return execResult ?? undefined;
  }

  if (!fallbackFilter) return null;
  return fallbackFilter(name) ? null : undefined;
}

/** Check if target name matches filter with backreference support */
function matchTargetWithBackrefs(
  targetName: string,
  targetFilterText: string,
  targetRegex: RegExp | null,
  sourceMatch: RegExpMatchArray | null
): boolean {
  if (targetRegex && sourceMatch) {
    // Apply backreferences from source match
    const expandedPattern = applyBackreferences(targetFilterText, sourceMatch);
    const expandedRegex = FilterUtils.tryCreateRegExp(expandedPattern);
    if (expandedRegex) {
      return expandedRegex.test(targetName);
    }
    return false;
  }
  const targetFilter = FilterUtils.createFilter(targetFilterText);
  return targetFilter(targetName);
}

/** Process a single target node for potential link candidate */
function processTargetNode(
  sourceId: string,
  targetNode: TopoNode,
  targetFilterText: string,
  targetRegex: RegExp | null,
  sourceMatch: RegExpMatchArray | null,
  edges: TopoEdge[],
  candidates: LinkCandidate[]
): void {
  const targetId = targetNode.id;
  if (sourceId === targetId) return; // Skip self-loops

  const targetName = ((targetNode.data as Record<string, unknown>).label as string) || targetId;
  if (!matchTargetWithBackrefs(targetName, targetFilterText, targetRegex, sourceMatch)) return;
  if (hasEdgeBetweenUtil(edges, sourceId, targetId)) return;

  candidates.push({ sourceId, targetId });
}

/**
 * Compute candidate link pairs between source and target nodes.
 * Uses React Flow nodes/edges arrays for graph queries.
 */
export function computeCandidates(
  nodes: TopoNode[],
  edges: TopoEdge[],
  sourceFilterText: string,
  targetFilterText: string
): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];

  // Build source filter
  const sourceRegex = FilterUtils.tryCreateRegExp(sourceFilterText);
  const sourceFallbackFilter = sourceRegex ? null : FilterUtils.createFilter(sourceFilterText);

  // Build target filter (with backreference support)
  const targetRegex = FilterUtils.tryCreateRegExp(targetFilterText);

  // Filter topology nodes (exclude cloud/network nodes)
  const topologyNodes = nodes.filter((node) => node.type === "topology-node");

  for (const sourceNode of topologyNodes) {
    const sourceId = sourceNode.id;
    const sourceName = ((sourceNode.data as Record<string, unknown>).label as string) || sourceId;

    // Check if source matches filter
    const sourceMatch = getSourceMatch(sourceName, sourceRegex, sourceFallbackFilter);
    if (sourceMatch === undefined) continue; // No match

    // Process all potential target nodes
    for (const targetNode of topologyNodes) {
      processTargetNode(
        sourceId,
        targetNode,
        targetFilterText,
        targetRegex,
        sourceMatch,
        edges,
        candidates
      );
    }
  }

  return candidates;
}

/**
 * Build edge elements for bulk link creation.
 * Uses React Flow nodes/edges arrays for endpoint allocation.
 */
export function buildBulkEdges(
  nodes: TopoNode[],
  edges: TopoEdge[],
  candidates: LinkCandidate[]
): TopoEdge[] {
  const allocators = new Map<string, EndpointAllocator>();
  const result: TopoEdge[] = [];

  for (const { sourceId, targetId } of candidates) {
    const sourceEndpoint = allocateEndpoint(allocators, nodes, edges, sourceId);
    const targetEndpoint = allocateEndpoint(allocators, nodes, edges, targetId);

    const edgeId = `${sourceId}:${sourceEndpoint}--${targetId}:${targetEndpoint}`;
    const isSpecialLink = isSpecialEndpointId(sourceId) || isSpecialEndpointId(targetId);
    result.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      type: "topology-edge",
      data: {
        sourceEndpoint,
        targetEndpoint,
        isSpecialLink
      }
    });
  }

  return result;
}
