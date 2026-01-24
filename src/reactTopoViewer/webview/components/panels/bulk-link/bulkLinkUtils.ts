/**
 * Utility functions for bulk link creation
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import { FilterUtils } from "../../../../../helpers/filterUtils";
import { isSpecialEndpointId } from "../../../../shared/utilities/LinkTypes";
import type { CyElement } from "../../../../shared/types/messages";
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import type { GraphChange } from "../../../hooks/state/useUndoRedo";
import {
  type ParsedInterfacePattern,
  parseInterfacePattern,
  generateInterfaceName,
  getNodeInterfacePattern,
  collectUsedIndices
} from "../../../utils/interfacePatterns";
import {
  hasEdgeBetween as hasEdgeBetweenUtil,
  getNodeById,
  getConnectedEdges
} from "../../../hooks/shared/graphQueryUtils";

export type LinkCandidate = { sourceId: string; targetId: string };

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

    for (const targetNode of topologyNodes) {
      const targetId = targetNode.id;
      if (sourceId === targetId) continue; // Skip self-loops

      const targetName = ((targetNode.data as Record<string, unknown>).label as string) || targetId;

      // Check if target matches filter (with backreference support)
      let targetMatches = false;
      if (targetRegex) {
        // Apply backreferences from source match
        const expandedPattern = applyBackreferences(targetFilterText, sourceMatch);
        const expandedRegex = FilterUtils.tryCreateRegExp(expandedPattern);
        if (expandedRegex) {
          targetMatches = expandedRegex.test(targetName);
        }
      } else {
        const targetFilter = FilterUtils.createFilter(targetFilterText);
        targetMatches = targetFilter(targetName);
      }

      if (!targetMatches) continue;

      // Check if edge already exists
      if (hasEdgeBetweenUtil(edges, sourceId, targetId)) continue;

      candidates.push({ sourceId, targetId });
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
): CyElement[] {
  const allocators = new Map<string, EndpointAllocator>();
  const result: CyElement[] = [];

  for (const { sourceId, targetId } of candidates) {
    const sourceEndpoint = allocateEndpoint(allocators, nodes, edges, sourceId);
    const targetEndpoint = allocateEndpoint(allocators, nodes, edges, targetId);

    const edgeId = `${sourceId}:${sourceEndpoint}--${targetId}:${targetEndpoint}`;
    result.push({
      group: "edges",
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceEndpoint,
        targetEndpoint,
        editor: "true"
      },
      classes: isSpecialEndpointId(sourceId) || isSpecialEndpointId(targetId) ? "stub-link" : ""
    });
  }

  return result;
}

export function buildUndoRedoEntries(edges: CyElement[]): {
  before: GraphChange[];
  after: GraphChange[];
} {
  const before: GraphChange[] = [];
  const after: GraphChange[] = [];
  for (const edge of edges) {
    before.push({ entity: "edge", kind: "delete", before: { ...edge, data: { ...edge.data } } });
    after.push({ entity: "edge", kind: "add", after: { ...edge, data: { ...edge.data } } });
  }
  return { before, after };
}
