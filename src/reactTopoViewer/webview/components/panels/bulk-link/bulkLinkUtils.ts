/**
 * Utility functions for bulk link creation
 */
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import { FilterUtils } from '../../../../../helpers/filterUtils';
import { isSpecialEndpointId } from '../../../../shared/utilities/LinkTypes';
import type { CyElement } from '../../../../shared/types/messages';
import type { GraphChangeEntry } from '../../../hooks/graph/copyPasteUtils';

export type LinkCandidate = { sourceId: string; targetId: string };

interface ParsedInterfacePattern {
  prefix: string;
  suffix: string;
  startIndex: number;
}

type EndpointAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

const DEFAULT_INTERFACE_PATTERN = 'eth{n}' as const;

const DEFAULT_INTERFACE_PATTERNS: Record<string, string> = {
  nokia_srlinux: 'e1-{n}',
  nokia_srsim: '1/1/c{n}/1',
  nokia_sros: '1/1/{n}',
  cisco_xrd: 'Gi0-0-0-{n}',
  cisco_xrv: 'Gi0/0/0/{n}',
  cisco_xrv9k: 'Gi0/0/0/{n}',
  cisco_csr1000v: 'Gi{n}',
  cisco_c8000v: 'Gi{n}',
  cisco_cat9kv: 'Gi1/0/{n}',
  cisco_iol: 'e0/{n}'
};

const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;

function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    return { prefix: pattern || 'eth', suffix: '', startIndex: 0 };
  }
  const [, prefix = '', startStr, suffix = ''] = match;
  const startIndex = startStr ? parseInt(startStr, 10) : 0;
  return { prefix, suffix, startIndex };
}

function generateInterfaceName(parsed: ParsedInterfacePattern, index: number): string {
  const num = parsed.startIndex + index;
  return `${parsed.prefix}${num}${parsed.suffix}`;
}

function getNodeInterfacePattern(node: NodeSingular): string {
  const extraData = node.data('extraData') as { interfacePattern?: string; kind?: string } | undefined;
  if (extraData?.interfacePattern) return extraData.interfacePattern;
  const kind = extraData?.kind;
  if (kind && DEFAULT_INTERFACE_PATTERNS[kind]) return DEFAULT_INTERFACE_PATTERNS[kind];
  return DEFAULT_INTERFACE_PATTERN;
}

function extractInterfaceIndex(endpoint: string, parsed: ParsedInterfacePattern): number {
  const escapedPrefix = parsed.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = parsed.suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix}(\\d+)${escapedSuffix}$`);
  const match = regex.exec(endpoint);
  if (match) {
    return parseInt(match[1], 10) - parsed.startIndex;
  }
  return -1;
}

function collectUsedIndices(cy: CyCore, nodeId: string, parsed: ParsedInterfacePattern): Set<number> {
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

export function buildUndoRedoEntries(edges: CyElement[]): { before: GraphChangeEntry[]; after: GraphChangeEntry[] } {
  const before: GraphChangeEntry[] = [];
  const after: GraphChangeEntry[] = [];
  for (const edge of edges) {
    before.push({ entity: 'edge', kind: 'delete', before: { ...edge, data: { ...edge.data } } });
    after.push({ entity: 'edge', kind: 'add', after: { ...edge, data: { ...edge.data } } });
  }
  return { before, after };
}
