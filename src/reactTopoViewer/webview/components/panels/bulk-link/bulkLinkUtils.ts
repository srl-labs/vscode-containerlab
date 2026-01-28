/**
 * Utility functions for bulk link creation
 * Uses React Flow nodes/edges arrays for graph queries.
 */
import { FilterUtils } from "../../../../../helpers/filterUtils";
import { isSpecialEndpointId } from "../../../../shared/utilities/LinkTypes";
import type { TopoNode, TopoEdge } from "../../../../shared/types/graph";
import { hasEdgeBetween as hasEdgeBetweenUtil } from "../../../utils/graphQueryUtils";
import { allocateEndpoint, type EndpointAllocator } from "../../../utils/endpointAllocator";

export type LinkCandidate = { sourceId: string; targetId: string };

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

  // Filter topology nodes (exclude network nodes)
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
