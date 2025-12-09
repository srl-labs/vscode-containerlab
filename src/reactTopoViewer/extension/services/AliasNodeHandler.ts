/**
 * Alias node handler for managing visual alias nodes (e.g., multiple bridge instances).
 */

import { log } from './logger';
import { CyElement, ClabTopology } from '../../shared/types/topology';
import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from './LinkParser';

export const CLASS_ALIASED_BASE_BRIDGE = 'aliased-base-bridge' as const;

export interface AliasEntry {
  yamlNodeId: string;
  interface: string;
  aliasNodeId: string;
}

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
  annotations: Record<string, unknown> | undefined
): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  const nodeAnns = (annotations as { nodeAnnotations?: Array<{ id: string }> })?.nodeAnnotations;
  if (!Array.isArray(nodeAnns)) return m;
  for (const na of nodeAnns) {
    if (na && typeof na.id === 'string') m.set(na.id, na as Record<string, unknown>);
  }
  return m;
}

/**
 * Safely converts a value to a trimmed string.
 */
export function asTrimmedString(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Converts annotation to a position object.
 */
export function toPosition(ann: Record<string, unknown> | undefined): { x: number; y: number } {
  const pos = ann?.position as { x?: number; y?: number } | undefined;
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return { x: pos.x, y: pos.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Converts annotation to a parent string.
 */
export function toParent(ann: Record<string, unknown> | undefined): string | undefined {
  return (ann?.group && ann?.level) ? `${ann.group}:${ann.level}` : undefined;
}

/**
 * Collects alias entries from node annotations.
 */
export function collectAliasEntriesNew(annotations: Record<string, unknown> | undefined): AliasEntry[] {
  const nodeAnns = (annotations as { nodeAnnotations?: Array<Record<string, unknown>> })?.nodeAnnotations;
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
  annotations: Record<string, unknown> | undefined
): AliasEntry[] {
  return collectAliasEntriesNew(annotations);
}

/**
 * Normalizes annotations to alias list.
 */
export function normalizeAliasList(annotations: Record<string, unknown> | undefined): AliasEntry[] {
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

/**
 * Derives alias placement from annotations.
 */
export function deriveAliasPlacement(
  aliasAnn: Record<string, unknown> | undefined,
  baseAnn: Record<string, unknown> | undefined
): { position: { x: number; y: number }; parent?: string } {
  if (aliasAnn) return { position: toPosition(aliasAnn), parent: toParent(aliasAnn) };
  if (baseAnn) return { position: toPosition(baseAnn), parent: toParent(baseAnn) };
  return { position: { x: 0, y: 0 } };
}

/**
 * Builds a bridge alias element.
 */
export function buildBridgeAliasElement(
  aliasId: string,
  kind: string,
  parent: string | undefined,
  position: { x: number; y: number },
  yamlRefId: string,
  displayName: string,
): CyElement {
  return {
    group: 'nodes',
    data: {
      id: aliasId,
      weight: '30',
      name: displayName,
      parent,
      topoViewerRole: 'bridge',
      lat: '',
      lng: '',
      extraData: {
        clabServerUsername: '',
        fqdn: '',
        group: '',
        id: aliasId,
        image: '',
        index: '999',
        kind,
        type: kind,
        labdir: '',
        labels: {},
        longname: displayName,
        macAddress: '',
        mgmtIntf: '',
        mgmtIpv4AddressLength: 0,
        mgmtIpv4Address: '',
        mgmtIpv6Address: '',
        mgmtIpv6AddressLength: 0,
        mgmtNet: '',
        name: displayName,
        shortname: displayName,
        state: '',
        weight: '3',
        extYamlNodeId: yamlRefId,
      },
    },
    position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: '',
  };
}

/**
 * Creates an alias element.
 */
export function createAliasElement(
  nodeMap: Record<string, { kind?: string }>,
  aliasId: string,
  yamlRefId: string,
  nodeAnnById: Map<string, Record<string, unknown>>,
): CyElement | null {
  const refNode = nodeMap[yamlRefId];
  if (!refNode || !isBridgeKind(refNode?.kind)) return null;
  const aliasAnn = nodeAnnById.get(aliasId);
  const baseAnn = nodeAnnById.get(yamlRefId);
  const { position, parent } = deriveAliasPlacement(aliasAnn, baseAnn);
  const aliasDisplayName = (aliasAnn && typeof aliasAnn.label === 'string' && (aliasAnn.label as string).trim())
    ? (aliasAnn.label as string).trim()
    : aliasId;
  return buildBridgeAliasElement(
    aliasId,
    (refNode.kind || NODE_KIND_BRIDGE) as string,
    parent,
    position,
    yamlRefId,
    aliasDisplayName,
  );
}

/**
 * Adds alias nodes from annotations to the elements array.
 */
export function addAliasNodesFromAnnotations(
  parsed: ClabTopology,
  annotations: Record<string, unknown> | undefined,
  elements: CyElement[]
): void {
  const nodeMap = parsed.topology?.nodes || {};
  const nodeAnnById = buildNodeAnnotationIndex(annotations);
  const aliasList = listAliasEntriesFromNodeAnnotations(annotations);
  if (aliasList.length === 0) return;

  const created = new Set<string>();
  for (const a of aliasList) {
    const aliasId = String(a.aliasNodeId);
    const yamlRefId = String(a.yamlNodeId);
    if (created.has(aliasId)) continue;
    if (aliasId === yamlRefId) continue;
    const element = createAliasElement(nodeMap as Record<string, { kind?: string }>, aliasId, yamlRefId, nodeAnnById);
    if (!element) continue;
    elements.push(element);
    created.add(aliasId);
  }
}

/**
 * Rewires edges to use alias node IDs.
 */
export function rewireEdges(elements: CyElement[], mapping: Map<string, string>): void {
  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const data = el.data as { source?: string; target?: string; sourceEndpoint?: string; targetEndpoint?: string };
    const srcAlias = mapping.get(`${data.source}|${data.sourceEndpoint || ''}`);
    const tgtAlias = mapping.get(`${data.target}|${data.targetEndpoint || ''}`);
    if (!srcAlias && !tgtAlias) continue;
    if (srcAlias) data.source = srcAlias;
    if (tgtAlias) data.target = tgtAlias;
  }
}

/**
 * Applies alias mappings to edges.
 */
export function applyAliasMappingsToEdges(
  annotations: Record<string, unknown> | undefined,
  elements: CyElement[]
): void {
  const aliasList = normalizeAliasList(annotations);
  if (aliasList.length === 0) return;
  const mapping = buildAliasMap(aliasList);
  rewireEdges(elements, mapping);
}

/**
 * Collects alias groups from elements.
 */
export function collectAliasGroups(elements: CyElement[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const data = el.data as { id?: string; extraData?: { extYamlNodeId?: string; kind?: string } };
    const extra = data.extraData || {};
    const yamlRef = typeof extra.extYamlNodeId === 'string' ? extra.extYamlNodeId.trim() : '';
    const kind = String(extra.kind || '');
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
  elements: CyElement[],
  aliasGroups: Map<string, string[]>
): Set<string> {
  const stillReferenced = new Set<string>();
  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const d = el.data as { source?: string; target?: string };
    const s = String(d.source || '');
    const t = String(d.target || '');
    if (aliasGroups.has(s)) stillReferenced.add(s);
    if (aliasGroups.has(t)) stillReferenced.add(t);
  }
  return stillReferenced;
}

/**
 * Adds a class to a node element.
 */
export function addClass(nodeEl: CyElement, className: string): void {
  const existing = nodeEl.classes;
  if (!existing) {
    nodeEl.classes = className;
  } else if (Array.isArray(existing)) {
    if (!existing.includes(className)) nodeEl.classes = [...existing, className].join(' ');
  } else if (typeof existing === 'string' && !existing.includes(className)) {
    nodeEl.classes = `${existing} ${className}`;
  }
}

/**
 * Hides base bridge nodes that have aliases.
 */
export function hideBaseBridgeNodesWithAliases(
  _annotations: Record<string, unknown> | undefined,
  elements: CyElement[],
  loggedUnmappedBaseBridges: Set<string>
): void {
  const aliasGroups = collectAliasGroups(elements);
  if (aliasGroups.size === 0) return;
  const stillReferenced = collectStillReferencedBaseBridges(elements, aliasGroups);

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    const data = el.data as { id?: string; extraData?: { kind?: string } };
    const id = String(data.id || '');
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
