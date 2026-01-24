/**
 * Utility functions for bulk link creation
 */
import { FilterUtils } from "../../../../../helpers/filterUtils";
import { isSpecialEndpointId } from "../../../../shared/utilities/LinkTypes";
import type { CyElement } from "../../../../shared/types/messages";
import type { GraphChange } from "../../../hooks/state/useUndoRedo";
import type { CyCompatCore, CyCompatElement } from "../../../hooks/useCytoCompatInstance";
import {
  type ParsedInterfacePattern,
  parseInterfacePattern,
  generateInterfaceName,
  getNodeInterfacePattern,
  collectUsedIndices
} from "../../../utils/interfacePatterns";

export type LinkCandidate = { sourceId: string; targetId: string };

type EndpointAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

function getOrCreateAllocator(
  allocators: Map<string, EndpointAllocator>,
  cyCompat: CyCompatCore,
  node: CyCompatElement
): EndpointAllocator {
  const nodeId = node.id();
  const cached = allocators.get(nodeId);
  if (cached) return cached;

  const pattern = getNodeInterfacePattern(node);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(cyCompat, nodeId, parsed);
  const created = { parsed, usedIndices };
  allocators.set(nodeId, created);
  return created;
}

function allocateEndpoint(
  allocators: Map<string, EndpointAllocator>,
  cyCompat: CyCompatCore,
  node: CyCompatElement
): string {
  if (isSpecialEndpointId(node.id())) return "";

  const allocator = getOrCreateAllocator(allocators, cyCompat, node);
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

/** Check if an edge exists between two nodes */
function hasEdgeBetween(cyCompat: CyCompatCore, sourceId: string, targetId: string): boolean {
  const edges = cyCompat.edges();
  let found = false;
  edges.forEach((edge) => {
    const src = edge.data("source") as string;
    const tgt = edge.data("target") as string;
    if ((src === sourceId && tgt === targetId) || (src === targetId && tgt === sourceId)) {
      found = true;
    }
  });
  return found;
}

export function computeCandidates(
  cyCompat: CyCompatCore,
  sourceFilterText: string,
  targetFilterText: string
): LinkCandidate[] {
  const nodes = cyCompat.nodes('node[topoViewerRole != "freeText"]');
  const candidates: LinkCandidate[] = [];

  const sourceRegex = FilterUtils.tryCreateRegExp(sourceFilterText);
  const sourceFallbackFilter = sourceRegex ? null : FilterUtils.createFilter(sourceFilterText);

  nodes.forEach((sourceNode) => {
    const sourceName = sourceNode.data("name") as string;
    const match = getSourceMatch(sourceName, sourceRegex, sourceFallbackFilter);
    if (match === undefined) return;

    const substitutedTargetPattern = applyBackreferences(targetFilterText, match);
    const targetFilter = FilterUtils.createFilter(substitutedTargetPattern);

    nodes.forEach((targetNode) => {
      if (sourceNode.id() === targetNode.id()) return;
      if (!targetFilter(targetNode.data("name") as string)) return;
      if (hasEdgeBetween(cyCompat, sourceNode.id(), targetNode.id())) return;

      candidates.push({ sourceId: sourceNode.id(), targetId: targetNode.id() });
    });
  });

  return candidates;
}

export function buildBulkEdges(cyCompat: CyCompatCore, candidates: LinkCandidate[]): CyElement[] {
  const allocators = new Map<string, EndpointAllocator>();
  const edges: CyElement[] = [];

  for (const { sourceId, targetId } of candidates) {
    const sourceNode = cyCompat.getElementById(sourceId);
    const targetNode = cyCompat.getElementById(targetId);
    if (!sourceNode.length || !targetNode.length) continue;

    const sourceEndpoint = allocateEndpoint(allocators, cyCompat, sourceNode);
    const targetEndpoint = allocateEndpoint(allocators, cyCompat, targetNode);
    const edgeId = `${sourceId}-${targetId}`;

    edges.push({
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

  return edges;
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
