/**
 * Utility functions for bulk link creation
 * NOTE: Disabled during ReactFlow migration - cyCompat no longer available
 */
import { FilterUtils } from "../../../../../helpers/filterUtils";
import { isSpecialEndpointId } from "../../../../shared/utilities/LinkTypes";
import type { CyElement } from "../../../../shared/types/messages";
import type { GraphChange } from "../../../hooks/state/useUndoRedo";
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

// Stubbed types for disabled functionality
interface NodeLike {
  id(): string;
  data(key: string): unknown;
}

function getOrCreateAllocator(
  allocators: Map<string, EndpointAllocator>,
  _cyCompat: null,
  node: NodeLike
): EndpointAllocator {
  const nodeId = node.id();
  const cached = allocators.get(nodeId);
  if (cached) return cached;

  // Extract extraData for getNodeInterfacePattern
  const extraData = node.data("extraData") as
    | { interfacePattern?: string; kind?: string }
    | undefined;
  const pattern = getNodeInterfacePattern(extraData);
  const parsed = parseInterfacePattern(pattern);
  // Disabled - collectUsedIndices needs edges array
  const usedIndices = new Set<number>();
  void collectUsedIndices;
  const created = { parsed, usedIndices };
  allocators.set(nodeId, created);
  return created;
}

function allocateEndpoint(
  allocators: Map<string, EndpointAllocator>,
  cyCompat: null,
  node: NodeLike
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

/** Check if an edge exists between two nodes - disabled during ReactFlow migration */
function hasEdgeBetween(_cyCompat: null, _sourceId: string, _targetId: string): boolean {
  // Disabled during ReactFlow migration
  // TODO: Use ReactFlow state to check for existing edges
  return false;
}

export function computeCandidates(
  _cyCompat: null,
  _sourceFilterText: string,
  _targetFilterText: string
): LinkCandidate[] {
  // Disabled during ReactFlow migration
  // TODO: Use ReactFlow nodes/edges state for computing candidates
  void FilterUtils;
  void getSourceMatch;
  void applyBackreferences;
  void hasEdgeBetween;
  return [];
}

export function buildBulkEdges(_cyCompat: null, candidates: LinkCandidate[]): CyElement[] {
  // Disabled during ReactFlow migration - no cyCompat.getElementById available
  // Return empty for now - proper implementation needs ReactFlow node access
  void allocateEndpoint;
  const edges: CyElement[] = [];

  for (const { sourceId, targetId } of candidates) {
    const edgeId = `${sourceId}-${targetId}`;
    edges.push({
      group: "edges",
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceEndpoint: "",
        targetEndpoint: "",
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
