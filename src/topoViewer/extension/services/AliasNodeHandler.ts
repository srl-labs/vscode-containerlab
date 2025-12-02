// file: src/topoViewer/extension/services/AliasNodeHandler.ts

import { log } from '../../webview/platform/logging/logger';
import { CyElement, ClabTopology } from '../../shared/types/topoViewerType';
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
export function buildNodeAnnotationIndex(annotations: any | undefined): Map<string, any> {
  const m = new Map<string, any>();
  const nodeAnns: any[] = Array.isArray(annotations?.nodeAnnotations) ? annotations!.nodeAnnotations : [];
  for (const na of nodeAnns) {
    if (na && typeof na.id === 'string') m.set(na.id, na);
  }
  return m;
}

/**
 * Safely converts a value to a trimmed string.
 */
export function asTrimmedString(val: any): string {
  return typeof val === 'string' ? val.trim() : '';
}

/**
 * Converts annotation to a position object.
 */
export function toPosition(ann: any): { x: number; y: number } {
  if (ann?.position && typeof ann.position.x === 'number' && typeof ann.position.y === 'number') {
    return { x: ann.position.x, y: ann.position.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Converts annotation to a parent string.
 */
export function toParent(ann: any): string | undefined {
  return (ann?.group && ann?.level) ? `${ann.group}:${ann.level}` : undefined;
}

/**
 * Collects alias entries from node annotations.
 */
export function collectAliasEntriesNew(annotations: any | undefined): AliasEntry[] {
  if (!annotations || !Array.isArray(annotations.nodeAnnotations)) return [];
  const out: AliasEntry[] = [];
  for (const na of annotations.nodeAnnotations) {
    if (!na) continue;
    const aliasId = asTrimmedString(na.id);
    const yamlId = asTrimmedString((na as any).yamlNodeId);
    const iface = asTrimmedString((na as any).yamlInterface);
    if (!aliasId || !yamlId || !iface) continue;
    if (aliasId === yamlId) continue;
    out.push({ yamlNodeId: yamlId, interface: iface, aliasNodeId: aliasId });
  }
  return out;
}

/**
 * Lists alias entries from node annotations.
 */
export function listAliasEntriesFromNodeAnnotations(annotations: any | undefined): AliasEntry[] {
  return collectAliasEntriesNew(annotations);
}

/**
 * Normalizes annotations to alias list.
 */
export function normalizeAliasList(annotations: any | undefined): AliasEntry[] {
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
export function deriveAliasPlacement(aliasAnn: any | undefined, baseAnn: any | undefined): { position: { x: number; y: number }; parent?: string } {
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
        // Crucial mapping back to the YAML node id
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
  nodeMap: Record<string, any>,
  aliasId: string,
  yamlRefId: string,
  nodeAnnById: Map<string, any>,
): CyElement | null {
  const refNode = nodeMap[yamlRefId];
  if (!refNode || !isBridgeKind(refNode?.kind)) return null;
  const aliasAnn = nodeAnnById.get(aliasId);
  const baseAnn = nodeAnnById.get(yamlRefId);
  const { position, parent } = deriveAliasPlacement(aliasAnn, baseAnn);
  const aliasDisplayName = (aliasAnn && typeof aliasAnn.label === 'string' && aliasAnn.label.trim())
    ? aliasAnn.label.trim()
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
  annotations: any | undefined,
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
    if (created.has(aliasId)) continue; // ensure 1 element per alias id
    if (aliasId === yamlRefId) continue; // ignore non-alias entries
    const element = createAliasElement(nodeMap, aliasId, yamlRefId, nodeAnnById);
    if (!element) continue;
    elements.push(element);
    created.add(aliasId);
  }

  // The base YAML node remains in the graph to keep YAML links intact.
}

/**
 * Rewires edges to use alias node IDs.
 */
export function rewireEdges(elements: CyElement[], mapping: Map<string, string>): void {
  for (const el of elements) {
    if (el.group !== 'edges') continue;
    const data: any = (el as any).data || {};
    const srcAlias = mapping.get(`${data.source}|${data.sourceEndpoint || ''}`);
    const tgtAlias = mapping.get(`${data.target}|${data.targetEndpoint || ''}`);
    if (!srcAlias && !tgtAlias) continue;
    if (srcAlias) data.source = srcAlias;
    if (tgtAlias) data.target = tgtAlias;
    (el as any).data = data;
  }
}

/**
 * Applies alias mappings to edges.
 */
export function applyAliasMappingsToEdges(annotations: any | undefined, elements: CyElement[]): void {
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
    const data: any = (el as any).data || {};
    const extra = (data.extraData || {}) as any;
    const yamlRef = typeof extra.extYamlNodeId === 'string' ? extra.extYamlNodeId.trim() : '';
    const kind = String(extra.kind || '');
    // Only alias nodes (id != yamlRef) and of bridge kind
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
export function collectStillReferencedBaseBridges(elements: CyElement[], aliasGroups: Map<string, string[]>): Set<string> {
  const stillReferenced = new Set<string>();
  for (const el of elements) {
    if ((el as any).group !== 'edges') continue;
    const d: any = (el as any).data || {};
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
export function addClass(nodeEl: any, className: string): void {
  const existing = nodeEl.classes;
  if (!existing) {
    nodeEl.classes = className;
  } else if (Array.isArray(existing)) {
    if (!existing.includes(className)) nodeEl.classes = [...existing, className];
  } else if (typeof existing === 'string' && !existing.includes(className)) {
    nodeEl.classes = `${existing} ${className}`;
  }
}

/**
 * Hides base bridge nodes that have aliases.
 */
export function hideBaseBridgeNodesWithAliases(
  _annotations: any | undefined,
  elements: CyElement[],
  loggedUnmappedBaseBridges: Set<string>
): void {
  const aliasGroups = collectAliasGroups(elements);
  if (aliasGroups.size === 0) return;
  const stillReferenced = collectStillReferencedBaseBridges(elements, aliasGroups);

  for (const el of elements) {
    const n = el as any;
    if (n.group !== 'nodes') continue;
    const data = n.data || {};
    const id = String(data.id || '');
    if (!aliasGroups.has(id)) continue;
    if (stillReferenced.has(id)) {
      if (!loggedUnmappedBaseBridges.has(id)) {
        log.info(`Base bridge '${id}' has unmapped links; keeping node visible until mapped.`);
        loggedUnmappedBaseBridges.add(id);
      }
      continue;
    }
    const kind = data?.extraData?.kind as string | undefined;
    if (!isBridgeKind(kind)) continue;
    addClass(n, CLASS_ALIASED_BASE_BRIDGE);
  }
}
