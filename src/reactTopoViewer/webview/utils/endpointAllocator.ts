/**
 * Endpoint allocation helpers for link creation.
 */
import { isSpecialEndpointId } from "../../shared/utilities/LinkTypes";
import { DEFAULT_INTERFACE_PATTERNS } from "../../shared/constants/interfacePatterns";
import type { TopoNode, TopoEdge } from "../../shared/types/graph";

import { getNodeById, getConnectedEdges } from "./graphQueryUtils";

const DEFAULT_INTERFACE_PATTERN = "eth{n}";
const INTERFACE_PATTERN_REGEX = /^(.+)?\{n(?::(\d+)(?:-(\d+))?)?\}(.+)?$/;

export type ParsedInterfacePattern = {
  prefix: string;
  suffix: string;
  startIndex: number;
  endIndex?: number;
};

type NodeExtraData = {
  interfacePattern?: string;
  kind?: string;
};

type PatternAllocator = {
  parsed: ParsedInterfacePattern;
  usedIndices: Set<number>;
};

export type EndpointAllocator = {
  patterns: PatternAllocator[];
};

function splitInterfacePatterns(patternList: string): string[] {
  const patterns: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (const char of patternList) {
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1);

    if (char === "," && braceDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) patterns.push(trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) patterns.push(trimmed);
  return patterns;
}

function parseInterfacePattern(pattern: string): ParsedInterfacePattern {
  const trimmed = pattern.trim();
  const match = INTERFACE_PATTERN_REGEX.exec(trimmed);
  if (!match) {
    return { prefix: trimmed || "eth", suffix: "", startIndex: 1 };
  }
  const [, prefix = "", startStr, endStr, suffix = ""] = match;
  const parsedStart = startStr ? parseInt(startStr, 10) : NaN;
  const startIndex = Number.isFinite(parsedStart) ? parsedStart : 1;
  const parsedEnd = endStr ? parseInt(endStr, 10) : NaN;
  const endIndex = Number.isFinite(parsedEnd) && parsedEnd >= startIndex ? parsedEnd : undefined;
  return { prefix, suffix, startIndex, ...(endIndex !== undefined ? { endIndex } : {}) };
}

function parseInterfacePatternList(patternList: string): ParsedInterfacePattern[] {
  const parts = splitInterfacePatterns(patternList);
  if (parts.length === 0) {
    return [parseInterfacePattern(DEFAULT_INTERFACE_PATTERN)];
  }
  return parts.map(parseInterfacePattern);
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

function tryAddIndexForEndpoint(patterns: PatternAllocator[], endpoint: string | undefined) {
  if (!endpoint) return;
  for (const pattern of patterns) {
    const idx = extractInterfaceIndex(endpoint, pattern.parsed);
    if (idx >= 0) {
      pattern.usedIndices.add(idx);
      return;
    }
  }
}

function collectUsedIndices(edges: TopoEdge[], nodeId: string, patterns: PatternAllocator[]): void {
  for (const edge of edges) {
    if (edge.source === nodeId) {
      const sourceEndpoint = readEndpointFromEdge(edge, "sourceEndpoint");
      tryAddIndexForEndpoint(patterns, sourceEndpoint);
    }
    if (edge.target === nodeId) {
      const targetEndpoint = readEndpointFromEdge(edge, "targetEndpoint");
      tryAddIndexForEndpoint(patterns, targetEndpoint);
    }
  }
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
    const parsedPatterns = parseInterfacePatternList(DEFAULT_INTERFACE_PATTERN);
    const patterns = parsedPatterns.map((parsed) => ({ parsed, usedIndices: new Set<number>() }));
    const createdFallback = { patterns };
    allocators.set(nodeId, createdFallback);
    return createdFallback;
  }

  const data = node.data as Record<string, unknown>;
  const extraData = data.extraData as { interfacePattern?: string; kind?: string } | undefined;
  const pattern = getNodeInterfacePattern(extraData);
  const parsedPatterns = parseInterfacePatternList(pattern);
  const patterns = parsedPatterns.map((parsed) => ({ parsed, usedIndices: new Set<number>() }));

  const connectedEdges = getConnectedEdges(edges, nodeId);
  collectUsedIndices(connectedEdges, nodeId, patterns);

  const created = { patterns };
  allocators.set(nodeId, created);
  return created;
}

function getNextAvailableIndex(
  pattern: PatternAllocator,
  ignoreEndRange = false
): number | undefined {
  let nextIndex = 0;
  while (pattern.usedIndices.has(nextIndex)) nextIndex++;

  if (!ignoreEndRange && pattern.parsed.endIndex !== undefined) {
    const maxIndex = pattern.parsed.endIndex - pattern.parsed.startIndex;
    if (nextIndex > maxIndex) return undefined;
  }

  return nextIndex;
}

export function allocateEndpoint(
  allocators: Map<string, EndpointAllocator>,
  nodes: TopoNode[],
  edges: TopoEdge[],
  nodeId: string
): string {
  if (isSpecialEndpointId(nodeId)) return "";

  const allocator = getOrCreateAllocator(allocators, nodes, edges, nodeId);
  for (const pattern of allocator.patterns) {
    const nextIndex = getNextAvailableIndex(pattern);
    if (nextIndex !== undefined) {
      pattern.usedIndices.add(nextIndex);
      return generateInterfaceName(pattern.parsed, nextIndex);
    }
  }

  const fallbackPattern = allocator.patterns[allocator.patterns.length - 1];
  const nextIndex = getNextAvailableIndex(fallbackPattern, true) ?? 0;
  fallbackPattern.usedIndices.add(nextIndex);
  return generateInterfaceName(fallbackPattern.parsed, nextIndex);
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
