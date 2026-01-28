/**
 * Endpoint allocation helpers for link creation.
 */
import { isSpecialEndpointId } from "../../shared/utilities/LinkTypes";
import { DEFAULT_INTERFACE_PATTERNS } from "../../shared/constants/interfacePatterns";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";
import { getNodeById, getConnectedEdges } from "./graphQueryUtils";

const DEFAULT_INTERFACE_PATTERN = "eth{n}";
const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+))?\}(.+)?$/;

export type ParsedInterfacePattern = {
  prefix: string;
  suffix: string;
  startIndex: number;
};

type NodeExtraData = {
  interfacePattern?: string;
  kind?: string;
};

export type EndpointAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const match = INTERFACE_PATTERN_REGEX.exec(pattern);
  if (!match) {
    return { prefix: pattern || "eth", suffix: "", startIndex: 1 };
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

function readEndpointFromEdge(
  edge: TopoEdge,
  key: "sourceEndpoint" | "targetEndpoint"
): string | undefined {
  const data = edge.data as Record<string, unknown> | undefined;
  const fromData = data?.[key];
  if (typeof fromData === "string" && fromData.length > 0) return fromData;

  const fromTopLevel = (edge as Record<string, unknown>)[key];
  return typeof fromTopLevel === "string" && fromTopLevel.length > 0 ? fromTopLevel : undefined;
}

function collectUsedIndices(
  edges: TopoEdge[],
  nodeId: string,
  parsed: ParsedInterfacePattern
): Set<number> {
  const usedIndices = new Set<number>();

  for (const edge of edges) {
    if (edge.source === nodeId) {
      const sourceEndpoint = readEndpointFromEdge(edge, "sourceEndpoint");
      if (sourceEndpoint) {
        const idx = extractInterfaceIndex(sourceEndpoint, parsed);
        if (idx >= 0) usedIndices.add(idx);
      }
    }
    if (edge.target === nodeId) {
      const targetEndpoint = readEndpointFromEdge(edge, "targetEndpoint");
      if (targetEndpoint) {
        const idx = extractInterfaceIndex(targetEndpoint, parsed);
        if (idx >= 0) usedIndices.add(idx);
      }
    }
  }

  return usedIndices;
}

export function getOrCreateAllocator(
  allocators: Map<string, EndpointAllocator>,
  nodes: TopoNode[],
  edges: TopoEdge[],
  nodeId: string
): EndpointAllocator {
  const cached = allocators.get(nodeId);
  if (cached) return cached;

  const node = getNodeById(nodes, nodeId);
  if (!node) {
    const parsed = parseInterfacePattern(DEFAULT_INTERFACE_PATTERN);
    const createdFallback = { parsed, usedIndices: new Set<number>() };
    allocators.set(nodeId, createdFallback);
    return createdFallback;
  }

  const data = node.data as Record<string, unknown>;
  const extraData = data.extraData as { interfacePattern?: string; kind?: string } | undefined;
  const pattern = getNodeInterfacePattern(extraData);
  const parsed = parseInterfacePattern(pattern);

  const connectedEdges = getConnectedEdges(edges, nodeId);
  const usedIndices = collectUsedIndices(connectedEdges, nodeId, parsed);

  const created = { parsed, usedIndices };
  allocators.set(nodeId, created);
  return created;
}

export function allocateEndpoint(
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

export function allocateEndpointsForLink(
  nodes: TopoNode[],
  edges: TopoEdge[],
  sourceId: string,
  targetId: string
): { sourceEndpoint: string; targetEndpoint: string } {
  const allocators = new Map<string, EndpointAllocator>();
  const sourceEndpoint = allocateEndpoint(allocators, nodes, edges, sourceId);
  const targetEndpoint = allocateEndpoint(allocators, nodes, edges, targetId);
  return { sourceEndpoint, targetEndpoint };
}
