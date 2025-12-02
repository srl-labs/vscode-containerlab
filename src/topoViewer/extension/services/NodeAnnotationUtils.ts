import { CloudNodeAnnotation, NodeAnnotation } from '../../shared/types/topoViewerGraph';
import { isSpecialEndpoint } from '../../shared/utilities/SpecialNodes';
import { STR_HOST } from '../../shared/utilities/LinkTypes';

// Common node kinds
export const KIND_BRIDGE = 'bridge' as const;
export const KIND_OVS_BRIDGE = 'ovs-bridge' as const;

/**
 * Checks if an element is a regular node (not a group, cloud, freeText, freeShape, or special endpoint)
 */
export function isRegularNode(el: any): boolean {
  return (
    el.group === 'nodes' &&
    el.data.topoViewerRole !== 'group' &&
    el.data.topoViewerRole !== 'cloud' &&
    el.data.topoViewerRole !== 'freeText' &&
    el.data.topoViewerRole !== 'freeShape' &&
    !isSpecialEndpoint(el.data.id)
  );
}

/**
 * Sets the position on a node annotation, respecting geo layout state
 */
export function setNodePosition(nodeAnn: NodeAnnotation, node: any, prev?: NodeAnnotation): void {
  const isGeoActive = !!node?.data?.geoLayoutActive;
  if (isGeoActive) {
    if (prev?.position) nodeAnn.position = { x: prev.position.x, y: prev.position.y };
    return;
  }
  nodeAnn.position = {
    x: Math.round(node.position?.x || 0),
    y: Math.round(node.position?.y || 0),
  };
}

/**
 * Adds geo coordinates to a node annotation if present
 */
export function addGeo(nodeAnn: NodeAnnotation, node: any): void {
  if (node.data.lat && node.data.lng) {
    const lat = parseFloat(node.data.lat);
    const lng = parseFloat(node.data.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      nodeAnn.geoCoordinates = { lat, lng };
    }
  }
}

/**
 * Adds group info to a node annotation from parent string
 */
export function addGroupInfo(nodeAnn: NodeAnnotation, parent: any): void {
  if (!parent) return;
  const parts = parent.split(':');
  if (parts.length === 2) {
    nodeAnn.group = parts[0];
    nodeAnn.level = parts[1];
  }
}

/**
 * Assigns icon color to a node annotation
 */
export function assignAnnotationColor(nodeAnnotation: NodeAnnotation, node: any): void {
  const color = typeof node?.data?.iconColor === 'string' ? node.data.iconColor.trim() : '';
  if (color) {
    nodeAnnotation.iconColor = color;
    return;
  }
  if ('iconColor' in nodeAnnotation) {
    delete (nodeAnnotation as any).iconColor;
  }
}

/**
 * Assigns corner radius to a node annotation
 */
export function assignAnnotationCornerRadius(nodeAnnotation: NodeAnnotation, node: any): void {
  const radius = typeof node?.data?.iconCornerRadius === 'number' ? node.data.iconCornerRadius : undefined;
  const validRadius = typeof radius === 'number' && Number.isFinite(radius) && radius > 0 ? radius : null;
  if (validRadius) {
    nodeAnnotation.iconCornerRadius = validRadius;
    return;
  }
  if ('iconCornerRadius' in nodeAnnotation) {
    delete (nodeAnnotation as any).iconCornerRadius;
  }
}

/**
 * Applies icon color and corner radius to a node annotation
 */
export function applyNodeIconColor(nodeAnnotation: NodeAnnotation, node: any): void {
  assignAnnotationColor(nodeAnnotation, node);
  assignAnnotationCornerRadius(nodeAnnotation, node);
}

/**
 * Helper to add a value to a map of sets
 */
export function addVal(map: Map<string, Set<string>>, key: string, val: string): void {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(val);
}

/**
 * Gets the first interface from a set (sorted alphabetically)
 */
export function firstInterface(set: Set<string> | undefined): string | '' {
  if (!set || set.size === 0) return '';
  // Prefer ethN order; sort deterministically
  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return arr[0];
}

/**
 * Collects alias interfaces by alias node id from edges
 */
export function collectAliasInterfacesByAliasId(payloadParsed: any[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const el of payloadParsed) {
    if (el.group !== 'edges') continue;
    const d = el.data || {};
    const s = String(d.source || '');
    const t = String(d.target || '');
    const se = String(d.sourceEndpoint || '');
    const te = String(d.targetEndpoint || '');
    if (s && se) addVal(map, s, se);
    if (t && te) addVal(map, t, te);
  }
  return map;
}

/**
 * Decorates an alias annotation with yaml node id and interface
 */
export function decorateAliasAnnotation(
  nodeAnnotation: NodeAnnotation,
  node: any,
  aliasIfaceByAlias: Map<string, Set<string>>,
): string | undefined {
  const rawId = String(node?.data?.id || '');
  const yamlRef = String(node?.data?.extraData?.extYamlNodeId || '').trim();
  if (!yamlRef) return undefined;
  const iface = firstInterface(aliasIfaceByAlias.get(rawId));
  (nodeAnnotation as any).yamlNodeId = yamlRef;
  if (iface) (nodeAnnotation as any).yamlInterface = iface;
  const displayName = (node?.data?.name ?? '').toString().trim();
  if (displayName) (nodeAnnotation as any).label = displayName;
  if (!iface) return undefined;
  const annId = `${yamlRef}:${iface}`;
  (nodeAnnotation as any).id = annId;
  return annId;
}

/**
 * Checks if a node is a bridge alias node
 */
export function isBridgeAliasNode(node: any): boolean {
  if (!node) return false;
  const role = node.data?.topoViewerRole;
  const kind = node.data?.extraData?.kind;
  const yaml = node.data?.extraData?.extYamlNodeId;
  const id = node.data?.id;
  const yamlRef = typeof yaml === 'string' ? yaml.trim() : '';
  // Only treat as alias when extYamlNodeId points to a different node id
  return role === 'bridge' && yamlRef.length > 0 && yamlRef !== id && (kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE);
}

/**
 * Checks if a node is a bridge kind node
 */
export function isBridgeKindNode(node: any): boolean {
  const kind = node?.data?.extraData?.kind;
  return kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE;
}

/**
 * Computes a stable annotation id for a node
 */
export function computeStableAnnotationId(
  nodeId: string,
  nodeById: Map<string, any>,
  aliasIfaceByAlias: Map<string, Set<string>>,
): string {
  const n = nodeById.get(nodeId);
  if (!n) return nodeId;
  if (!isBridgeAliasNode(n)) return nodeId;
  const yamlRef = String(n?.data?.extraData?.extYamlNodeId || '').trim();
  const iface = firstInterface(aliasIfaceByAlias.get(nodeId));
  return yamlRef && iface ? `${yamlRef}:${iface}` : nodeId;
}

/**
 * Collects the set of YAML base bridge ids that have at least one alias visual node
 */
export function collectAliasBaseSet(payloadParsed: any[]): Set<string> {
  const set = new Set<string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    if (!isBridgeAliasNode(el)) continue;
    const yamlRef = String(el.data?.extraData?.extYamlNodeId || '').trim();
    if (yamlRef) set.add(yamlRef);
  }
  return set;
}

/**
 * Determines if a node annotation should be included
 */
export function shouldIncludeNodeAnnotation(nodeEl: any, aliasBaseSet: Set<string>): boolean {
  // Always skip special endpoints (already filtered by isRegularNode)
  // Include alias visuals so their positions persist under their alias ids
  if (isBridgeAliasNode(nodeEl)) return true;
  // For base bridge nodes: skip if they have any alias mapped, to avoid duplicate entries
  if (isBridgeKindNode(nodeEl)) {
    const id = String(nodeEl?.data?.id || '');
    if (aliasBaseSet.has(id)) return false;
  }
  return true;
}

/**
 * Creates a node annotation from a payload node element
 */
export function createNodeAnnotation(
  node: any,
  prevNodeById: Map<string, NodeAnnotation>,
  aliasIfaceByAlias: Map<string, Set<string>>,
  nodeById: Map<string, any>,
): NodeAnnotation {
  const rawId = String(node?.data?.id || '');
  let annId = rawId;
  const nodeAnnotation: NodeAnnotation = { id: annId, icon: node.data.topoViewerRole };
  applyNodeIconColor(nodeAnnotation, node);
  if (isBridgeAliasNode(node)) {
    annId = decorateAliasAnnotation(nodeAnnotation, node, aliasIfaceByAlias) || annId;
  }
  // Persist copyFrom provenance if present on the node's extraData
  const rawCopyFrom = String(node?.data?.extraData?.copyFrom || '').trim();
  if (rawCopyFrom) {
    (nodeAnnotation as any).copyFrom = computeStableAnnotationId(rawCopyFrom, nodeById, aliasIfaceByAlias);
  }
  setNodePosition(nodeAnnotation, node, prevNodeById.get(annId));
  addGeo(nodeAnnotation, node);
  if (node.data.groupLabelPos) nodeAnnotation.groupLabelPos = node.data.groupLabelPos;
  addGroupInfo(nodeAnnotation, node.parent);
  return nodeAnnotation;
}

/**
 * Creates a cloud node annotation from a payload cloud node element
 */
export function createCloudNodeAnnotation(cloudNode: any): CloudNodeAnnotation {
  const cloudNodeAnnotation: CloudNodeAnnotation = {
    id: cloudNode.data.id,
    type: cloudNode.data.extraData?.kind || STR_HOST,
    label: cloudNode.data.name || cloudNode.data.id,
    position: {
      x: cloudNode.position?.x || 0,
      y: cloudNode.position?.y || 0,
    },
  };
  if (cloudNode.parent) {
    const parts = cloudNode.parent.split(':');
    if (parts.length === 2) {
      cloudNodeAnnotation.group = parts[0];
      cloudNodeAnnotation.level = parts[1];
    }
  }
  return cloudNodeAnnotation;
}

/**
 * Builds an index of nodes by their id
 */
export function buildNodeIndex(payloadParsed: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const id = String(el?.data?.id || '');
    if (id) m.set(id, el);
  }
  return m;
}

/**
 * Resolves a bridge node from the node index
 */
function resolveBridgeNode(nodeById: Map<string, any>, nodeId: string): any | undefined {
  const n = nodeById.get(String(nodeId));
  if (!n) return undefined;
  return isBridgeKindNode(n) ? n : undefined;
}

/**
 * Normalizes an interface string
 */
function normalizeIface(iface: string | undefined): string {
  return (iface || '').toString().trim();
}

/**
 * Resolves the YAML base id for a node
 */
function resolveYamlBaseId(n: any): string {
  const yamlRef = String(n?.data?.extraData?.extYamlNodeId || '').trim();
  const nodeId = String(n?.data?.id || '');
  return yamlRef && yamlRef !== nodeId ? yamlRef : nodeId;
}

/**
 * Builds an alias annotation skeleton
 */
function buildAliasAnnotationSkeleton(annId: string, yamlId: string, ep: string, label?: string): NodeAnnotation {
  const ann: NodeAnnotation = { id: annId, icon: 'bridge', yamlNodeId: yamlId, yamlInterface: ep } as any;
  if (label) (ann as any).label = label;
  return ann;
}

/**
 * Applies the preferred position to an annotation
 */
function applyPreferredPosition(ann: NodeAnnotation, prev: NodeAnnotation | undefined, n: any): void {
  if (prev?.position) {
    ann.position = { x: prev.position.x, y: prev.position.y };
    return;
  }
  if (n?.position && typeof n.position.x === 'number' && typeof n.position.y === 'number') {
    ann.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
  }
}

/**
 * Picks the alias label from a node element
 */
function pickAliasLabel(nodeEl: any, sideName?: string): string {
  const nameFromNode = ((nodeEl?.data?.name ?? '') as string).trim();
  const candidate = ((sideName ?? '') as string).trim();
  return candidate || nameFromNode;
}

/**
 * Maybe records an alias annotation from edge data
 */
function maybeRecordAliasAnn(
  nodeById: Map<string, any>,
  prevNodeById: Map<string, NodeAnnotation>,
  out: Map<string, NodeAnnotation>,
  nodeId: string,
  iface: string | undefined,
  sideName: string | undefined,
): void {
  const n = resolveBridgeNode(nodeById, nodeId);
  const ep = normalizeIface(iface);
  if (!n || !ep) return;
  const yamlId = resolveYamlBaseId(n);
  const annId = `${yamlId}:${ep}`;
  const ann = buildAliasAnnotationSkeleton(annId, yamlId, ep, pickAliasLabel(n, sideName));
  applyPreferredPosition(ann, prevNodeById.get(annId), n);
  out.set(annId, ann);
}

/**
 * Collects alias annotations from edges
 */
export function collectAliasAnnotationsFromEdges(
  payloadParsed: any[],
  nodeById: Map<string, any>,
  prevNodeById: Map<string, NodeAnnotation>,
): NodeAnnotation[] {
  const out = new Map<string, NodeAnnotation>();
  for (const el of payloadParsed) {
    if (el.group !== 'edges') continue;
    const d = el.data || {};
    maybeRecordAliasAnn(nodeById, prevNodeById, out, d.source, d.sourceEndpoint, d.sourceName);
    maybeRecordAliasAnn(nodeById, prevNodeById, out, d.target, d.targetEndpoint, d.targetName);
  }
  return Array.from(out.values());
}

/**
 * Merges an annotation into a target annotation
 */
function mergeAnnotation(target: NodeAnnotation, source: NodeAnnotation): void {
  if (!('label' in (target as any)) && (source as any).label) (target as any).label = (source as any).label;
  if (!target.position && source.position) target.position = source.position;
  if (!(target as any).yamlNodeId && (source as any).yamlNodeId) (target as any).yamlNodeId = (source as any).yamlNodeId;
  if (!(target as any).yamlInterface && (source as any).yamlInterface) (target as any).yamlInterface = (source as any).yamlInterface;
  if (!target.iconColor && source.iconColor) target.iconColor = source.iconColor;
  if (target.iconCornerRadius === undefined && source.iconCornerRadius !== undefined) target.iconCornerRadius = source.iconCornerRadius;
}

/**
 * Upserts an annotation into a map by id
 */
function upsertAnnotation(byId: Map<string, NodeAnnotation>, incoming: NodeAnnotation): void {
  const existing = byId.get(incoming.id);
  if (!existing) {
    byId.set(incoming.id, incoming);
    return;
  }
  mergeAnnotation(existing, incoming);
}

/**
 * Merges two node annotation lists, with primary taking precedence
 */
export function mergeNodeAnnotationLists(primary: NodeAnnotation[], secondary: NodeAnnotation[]): NodeAnnotation[] {
  const byId = new Map<string, NodeAnnotation>();
  primary.forEach(a => byId.set(a.id, a));
  secondary.forEach(b => upsertAnnotation(byId, b));
  return Array.from(byId.values());
}
