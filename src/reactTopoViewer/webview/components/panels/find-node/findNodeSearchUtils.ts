import type { TopoNode } from "../../../../shared/types/graph";
import { searchNodes as searchNodesUtil } from "../../../utils/graphQueryUtils";

function wildcardToRegex(pattern: string): RegExp {
  let out = "^";
  for (const ch of pattern) {
    if (ch === "*") {
      out += ".*";
      continue;
    }
    if (ch === "?") {
      out += ".";
      continue;
    }
    // Escape regex special chars so matching is literal (except '*' and '?').
    if (/[.*+?^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  out += "$";
  return new RegExp(out, "i");
}

function createWildcardFilter(trimmed: string): (value: string) => boolean {
  const regex = wildcardToRegex(trimmed);
  return (value: string) => regex.test(value);
}

function createPrefixFilter(trimmed: string): (value: string) => boolean {
  const prefix = trimmed.slice(1).toLowerCase();
  return (value: string) => value.toLowerCase().startsWith(prefix);
}

function createContainsFilter(lower: string): (value: string) => boolean {
  return (value: string) => value.toLowerCase().includes(lower);
}

export function createFilter(pattern: string): (value: string) => boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return () => true;
  if (trimmed.includes("*") || trimmed.includes("?")) return createWildcardFilter(trimmed);
  if (trimmed.startsWith("+")) return createPrefixFilter(trimmed);
  return createContainsFilter(trimmed.toLowerCase());
}

export function filterNodes(nodes: TopoNode[], searchTerm: string): TopoNode[] {
  const filter = createFilter(searchTerm);
  return nodes.filter((node) => {
    if (filter(node.id)) return true;
    const data = node.data as Record<string, unknown>;
    const label = data.label;
    if (typeof label === "string" && filter(label)) return true;
    return false;
  });
}

export function getCombinedMatches(nodes: TopoNode[], searchTerm: string): TopoNode[] {
  const basicMatches = searchNodesUtil(nodes, searchTerm);
  const filterMatches = filterNodes(nodes, searchTerm);
  const matchedIds = new Set<string>();
  const combined: TopoNode[] = [];
  for (const node of [...basicMatches, ...filterMatches]) {
    if (!matchedIds.has(node.id)) {
      matchedIds.add(node.id);
      combined.push(node);
    }
  }
  return combined;
}

export function formatMatchCountText(count: number): string {
  if (count === 0) return "No nodes found";
  const suffix = count === 1 ? "" : "s";
  return `Found ${count} node${suffix}`;
}
