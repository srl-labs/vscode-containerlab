/**
 * Alias node handler for managing visual alias nodes (e.g., multiple bridge instances).
 * Pure functions - no VS Code dependencies.
 */

import type {
  ParsedElement,
  ClabTopology,
  TopologyAnnotations,
  NodeAnnotation
} from "../types/topology";

import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from "./LinkNormalizer";
import type { ParserLogger } from "./types";
import { nullLogger } from "./types";

export const CLASS_ALIASED_BASE_BRIDGE = "aliased-base-bridge" as const;

export interface AliasEntry {
  yamlNodeId: string;
  interface: string;
  aliasNodeId: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if a kind is a bridge type.
 */
export function isBridgeKind(kind: string | undefined): boolean {
  return kind === NODE_KIND_BRIDGE || kind === NODE_KIND_OVS_BRIDGE;
}

/**
 * Builds an index of node annotations by ID.
 */
export function buildNodeAnnotationIndex(
  annotations?: TopologyAnnotations
): Map<string, NodeAnnotation> {
  const m = new Map<string, NodeAnnotation>();
  const nodeAnns = annotations?.nodeAnnotations;
  if (!Array.isArray(nodeAnns)) return m;
  for (const na of nodeAnns) {
    if (na && typeof na.id === "string") m.set(na.id, na);
  }
  return m;
}

/**
 * Safely converts a value to a trimmed string.
 */
export function asTrimmedString(val: unknown): string {
  return typeof val === "string" ? val.trim() : "";
}

/**
 * Converts annotation to a position object.
 */
export function toPosition(ann: NodeAnnotation | undefined): { x: number; y: number } {
  const pos = ann?.position;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x, y: pos.y };
  }
  return { x: 0, y: 0 };
}

// ============================================================================
// Alias Entry Collection
// ============================================================================

/**
 * Collects alias entries from node annotations.
 */
export function collectAliasEntriesNew(annotations?: TopologyAnnotations): AliasEntry[] {
  const nodeAnns = annotations?.nodeAnnotations;
  if (!nodeAnns || !Array.isArray(nodeAnns)) return [];
  const out: AliasEntry[] = [];
  for (const na of nodeAnns) {
    if (!na) continue;
    const aliasId = asTrimmedString(na.id);
    const yamlId = asTrimmedString(na.yamlNodeId);
    const iface = asTrimmedString(na.yamlInterface);
    if (!aliasId || !yamlId || !iface) continue;
    if (aliasId === yamlId) continue;
    out.push({ yamlNodeId: yamlId, interface: iface, aliasNodeId: aliasId });
  }
  return out;
}

/**
 * Lists alias entries from node annotations.
 */
export function listAliasEntriesFromNodeAnnotations(
  annotations?: TopologyAnnotations
): AliasEntry[] {
  return collectAliasEntriesNew(annotations);
}

/**
 * Normalizes annotations to alias list.
 */
export function normalizeAliasList(annotations?: TopologyAnnotations): AliasEntry[] {
  return listAliasEntriesFromNodeAnnotations(annotations);
}

/**
 * Builds a map from yamlNodeId|interface to aliasNodeId.
 */
export function buildAliasMap(list: AliasEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of list) map.set(`${a.yamlNodeId}|${a.interface}`, a.aliasNodeId);
  return map;
}

// ============================================================================
// Alias Node Creation
// ============================================================================

/**
 * Derives alias placement from annotations.
 */
export function deriveAliasPlacement(
  aliasAnn: NodeAnnotation | undefined,
  baseAnn: NodeAnnotation | undefined
): { position: { x: number; y: number } } {
  if (aliasAnn) return { position: toPosition(aliasAnn) };
  if (baseAnn) return { position: toPosition(baseAnn) };
  return { position: { x: 0, y: 0 } };
}

/**
 * Builds a bridge alias element.
 */
export function buildBridgeAliasElement(
  aliasId: string,
  kind: string,
  position: { x: number; y: number },
  yamlRefId: string,
  displayName: string
): ParsedElement {
  return {
    group: "nodes",
    data: {
      id: aliasId,
      weight: "30",
      name: displayName,
      topoViewerRole: "bridge",
      lat: "",
      lng: "",
      extraData: {
        clabServerUsername: "",
        fqdn: "",
        group: "",
        id: aliasId,
        image: "",
        index: "999",
        kind,
        type: kind,
        labdir: "",
        labels: {},
        longname: displayName,
        macAddress: "",
        mgmtIntf: "",
        mgmtIpv4AddressLength: 0,
        mgmtIpv4Address: "",
        mgmtIpv6Address: "",
        mgmtIpv6AddressLength: 0,
        mgmtNet: "",
        name: displayName,
        shortname: displayName,
        state: "",
        weight: "3",
        extYamlNodeId: yamlRefId
      }
    },
    position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: ""
  };
}

/**
 * Creates an alias element.
 */
export function createAliasElement(
  nodeMap: Record<string, { kind?: string }>,
  aliasId: string,
  yamlRefId: string,
  nodeAnnById: Map<string, NodeAnnotation>
): ParsedElement | null {
  const refNode = nodeMap[yamlRefId];
  if (!refNode || !isBridgeKind(refNode?.kind)) return null;
  const aliasAnn = nodeAnnById.get(aliasId);
  const baseAnn = nodeAnnById.get(yamlRefId);
  const { position } = deriveAliasPlacement(aliasAnn, baseAnn);
  const aliasDisplayName =
    aliasAnn && typeof aliasAnn.label === "string" && aliasAnn.label.trim()
      ? aliasAnn.label.trim()
      : aliasId;
  return buildBridgeAliasElement(
    aliasId,
    (refNode.kind || NODE_KIND_BRIDGE) as string,
    position,
    yamlRefId,
    aliasDisplayName
  );
}

/**
 * Adds alias nodes from annotations to the elements array.
 */
export function addAliasNodesFromAnnotations(
  parsed: ClabTopology,
  annotations?: TopologyAnnotations,
  elements?: ParsedElement[]
): ParsedElement[] {
  const result = elements ?? [];
  const nodeMap = parsed.topology?.nodes || {};
  const nodeAnnById = buildNodeAnnotationIndex(annotations);
  const aliasList = listAliasEntriesFromNodeAnnotations(annotations);
  if (aliasList.length === 0) return result;

  const created = new Set<string>();
  for (const a of aliasList) {
    const aliasId = String(a.aliasNodeId);
    const yamlRefId = String(a.yamlNodeId);
    if (created.has(aliasId)) continue;
    if (aliasId === yamlRefId) continue;
    const element = createAliasElement(
      nodeMap as Record<string, { kind?: string }>,
      aliasId,
      yamlRefId,
      nodeAnnById
    );
    if (!element) continue;
    result.push(element);
    created.add(aliasId);
  }
  return result;
}

// ============================================================================
// Edge Rewiring
// ============================================================================

/**
 * Rewires edges to use alias node IDs.
 */
export function rewireEdges(elements: ParsedElement[], mapping: Map<string, string>): void {
  for (const el of elements) {
    if (el.group !== "edges") continue;
    const data = el.data as {
      source?: string;
      target?: string;
      sourceEndpoint?: string;
      targetEndpoint?: string;
      extraData?: Record<string, unknown>;
    };
    const originalSource = data.source;
    const originalTarget = data.target;
    const srcAlias = mapping.get(`${data.source}|${data.sourceEndpoint || ""}`);
    const tgtAlias = mapping.get(`${data.target}|${data.targetEndpoint || ""}`);
    if (!srcAlias && !tgtAlias) continue;
    const extra = { ...(data.extraData ?? {}) };
    if (srcAlias) {
      data.source = srcAlias;
      if (originalSource) {
        extra.yamlSourceNodeId = originalSource;
      }
    }
    if (tgtAlias) {
      data.target = tgtAlias;
      if (originalTarget) {
        extra.yamlTargetNodeId = originalTarget;
      }
    }
    data.extraData = extra;
  }
}

/**
 * Applies alias mappings to edges.
 */
export function applyAliasMappingsToEdges(
  annotations?: TopologyAnnotations,
  elements?: ParsedElement[]
): void {
  if (!elements) return;
  const aliasList = normalizeAliasList(annotations);
  if (aliasList.length === 0) return;
  const mapping = buildAliasMap(aliasList);
  rewireEdges(elements, mapping);
}

// ============================================================================
// Base Bridge Hiding
// ============================================================================

/**
 * Collects alias groups from elements.
 */
export function collectAliasGroups(elements: ParsedElement[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group !== "nodes") continue;
    const data = el.data as { id?: string; extraData?: { extYamlNodeId?: string; kind?: string } };
    const extra = data.extraData || {};
    const yamlRef = typeof extra.extYamlNodeId === "string" ? extra.extYamlNodeId.trim() : "";
    const kind = String(extra.kind || "");
    if (!yamlRef || yamlRef === data.id) continue;
    if (!isBridgeKind(kind)) continue;
    const list = groups.get(yamlRef) || [];
    list.push(String(data.id));
    groups.set(yamlRef, list);
  }
  return groups;
}

/**
 * Collects base bridges that are still referenced by edges.
 */
export function collectStillReferencedBaseBridges(
  elements: ParsedElement[],
  aliasGroups: Map<string, string[]>
): Set<string> {
  const stillReferenced = new Set<string>();
  for (const el of elements) {
    if (el.group !== "edges") continue;
    const d = el.data as { source?: string; target?: string };
    const s = String(d.source || "");
    const t = String(d.target || "");
    if (aliasGroups.has(s)) stillReferenced.add(s);
    if (aliasGroups.has(t)) stillReferenced.add(t);
  }
  return stillReferenced;
}

/**
 * Adds a class to a node element.
 */
export function addClass(nodeEl: ParsedElement, className: string): void {
  const existing = nodeEl.classes;
  if (!existing) {
    nodeEl.classes = className;
  } else if (Array.isArray(existing)) {
    if (!existing.includes(className)) nodeEl.classes = [...existing, className].join(" ");
  } else if (typeof existing === "string" && !existing.includes(className)) {
    nodeEl.classes = `${existing} ${className}`;
  }
}

/**
 * Hides base bridge nodes that have aliases.
 */
export function hideBaseBridgeNodesWithAliases(
  elements: ParsedElement[],
  loggedUnmappedBaseBridges: Set<string>,
  logger?: ParserLogger
): void {
  const log = logger ?? nullLogger;
  const aliasGroups = collectAliasGroups(elements);
  if (aliasGroups.size === 0) return;
  const stillReferenced = collectStillReferencedBaseBridges(elements, aliasGroups);

  for (const el of elements) {
    if (el.group !== "nodes") continue;
    const data = el.data as { id?: string; extraData?: { kind?: string } };
    const id = String(data.id || "");
    if (!aliasGroups.has(id)) continue;
    if (stillReferenced.has(id)) {
      if (!loggedUnmappedBaseBridges.has(id)) {
        log.info(`Base bridge '${id}' has unmapped links; keeping node visible until mapped.`);
        loggedUnmappedBaseBridges.add(id);
      }
      continue;
    }
    const kind = data?.extraData?.kind;
    if (!isBridgeKind(kind)) continue;
    addClass(el, CLASS_ALIASED_BASE_BRIDGE);
  }
}
