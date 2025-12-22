/**
 * Utility functions for bulk link creation
 */
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import { FilterUtils } from '../../../../../helpers/filterUtils';
import { isSpecialEndpointId } from '../../../../shared/utilities/LinkTypes';
import type { CyElement } from '../../../../shared/types/messages';
import type { GraphChange } from '../../../hooks/state/useUndoRedo';
import {
  type ParsedInterfacePattern,
  parseInterfacePattern,
  generateInterfaceName,
  getNodeInterfacePattern,
  collectUsedIndices
} from '../../../utils/interfacePatterns';

export type LinkCandidate = { sourceId: string; targetId: string };

type EndpointAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

function getOrCreateAllocator(
  allocators: Map<string, EndpointAllocator>,
  cy: CyCore,
  node: NodeSingular
): EndpointAllocator {
  const nodeId = node.id();
  const cached = allocators.get(nodeId);
  if (cached) return cached;

  const pattern = getNodeInterfacePattern(node);
  const parsed = parseInterfacePattern(pattern);
  const usedIndices = collectUsedIndices(cy, nodeId, parsed);
  const created = { parsed, usedIndices };
  allocators.set(nodeId, created);
  return created;
}

function allocateEndpoint(
  allocators: Map<string, EndpointAllocator>,
  cy: CyCore,
  node: NodeSingular
): string {
  if (isSpecialEndpointId(node.id())) return '';

  const allocator = getOrCreateAllocator(allocators, cy, node);
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
      if (fullMatch === '$$') return '$';
      if (!match) return fullMatch;

      if (fullMatch.startsWith('$<')) {
        if (namedGroup && match.groups && Object.prototype.hasOwnProperty.call(match.groups, namedGroup)) {
          return match.groups[namedGroup] ?? '';
        }
        return fullMatch;
      }

      if (numberedGroup) {
        const index = Number(numberedGroup);
        if (!Number.isNaN(index) && index < match.length) {
          return match[index] ?? '';
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

export function computeCandidates(
  cy: CyCore,
  sourceFilterText: string,
  targetFilterText: string
): LinkCandidate[] {
  const nodes = cy.nodes('node[topoViewerRole != "freeText"]');
  const candidates: LinkCandidate[] = [];

  const sourceRegex = FilterUtils.tryCreateRegExp(sourceFilterText);
  const sourceFallbackFilter = sourceRegex ? null : FilterUtils.createFilter(sourceFilterText);

  nodes.forEach((sourceNode) => {
    const sourceName = sourceNode.data('name') as string;
    const match = getSourceMatch(sourceName, sourceRegex, sourceFallbackFilter);
    if (match === undefined) return;

    const substitutedTargetPattern = applyBackreferences(targetFilterText, match);
    const targetFilter = FilterUtils.createFilter(substitutedTargetPattern);

    nodes.forEach((targetNode) => {
      if (sourceNode.id() === targetNode.id()) return;
      if (!targetFilter(targetNode.data('name') as string)) return;
      if (sourceNode.edgesWith(targetNode).nonempty()) return;

      candidates.push({ sourceId: sourceNode.id(), targetId: targetNode.id() });
    });
  });

  return candidates;
}

export function buildBulkEdges(cy: CyCore, candidates: LinkCandidate[]): CyElement[] {
  const allocators = new Map<string, EndpointAllocator>();
  const edges: CyElement[] = [];

  for (const { sourceId, targetId } of candidates) {
    const sourceNode = cy.getElementById(sourceId) as unknown as NodeSingular;
    const targetNode = cy.getElementById(targetId) as unknown as NodeSingular;
    if (!sourceNode || !targetNode) continue;

    const sourceEndpoint = allocateEndpoint(allocators, cy, sourceNode);
    const targetEndpoint = allocateEndpoint(allocators, cy, targetNode);
    const edgeId = `${sourceId}-${targetId}`;

    edges.push({
      group: 'edges',
      data: {
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceEndpoint,
        targetEndpoint,
        editor: 'true'
      },
      classes: isSpecialEndpointId(sourceId) || isSpecialEndpointId(targetId) ? 'stub-link' : ''
    });
  }

  return edges;
}

export function buildUndoRedoEntries(edges: CyElement[]): { before: GraphChange[]; after: GraphChange[] } {
  const before: GraphChange[] = [];
  const after: GraphChange[] = [];
  for (const edge of edges) {
    before.push({ entity: 'edge', kind: 'delete', before: { ...edge, data: { ...edge.data } } });
    after.push({ entity: 'edge', kind: 'add', after: { ...edge, data: { ...edge.data } } });
  }
  return { before, after };
}
