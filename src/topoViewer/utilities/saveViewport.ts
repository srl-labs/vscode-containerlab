import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabTopology } from '../types/topoViewerType';
import { annotationsManager } from './annotationsManager';
import { CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';
import { isSpecialEndpoint } from './specialNodes';
import { STR_HOST, STR_MGMT_NET, PREFIX_MACVLAN, PREFIX_VXLAN_STITCH, PREFIX_VXLAN, PREFIX_DUMMY, TYPE_DUMMY, SINGLE_ENDPOINT_TYPES, VX_TYPES, HOSTY_TYPES, splitEndpointLike } from './linkTypes';
import { sleep } from './asyncUtils';

type CanonicalEndpoint = { node: string; iface: string };
type CanonicalLinkKey = {
  type: 'veth' | 'mgmt-net' | 'host' | 'macvlan' | 'dummy' | 'vxlan' | 'vxlan-stitch' | 'unknown';
  a: CanonicalEndpoint;
  b?: CanonicalEndpoint; // present for veth
  // Optional, reserved for future matching refinements (Step 7)
  hostIface?: string;
  mode?: string;
  vni?: string | number;
  udpPort?: string | number;
};

// Common string literals used in multiple places in this module
const TYPE_MACVLAN = 'macvlan' as const;
const TYPE_VXLAN_STITCH = 'vxlan-stitch' as const;
const TYPE_VXLAN = 'vxlan' as const;
const TYPE_UNKNOWN = 'unknown' as const;

// Common node kinds
const KIND_BRIDGE = 'bridge' as const;
const KIND_OVS_BRIDGE = 'ovs-bridge' as const;

// Commonly duplicated YAML keys
const KEY_HOST_INTERFACE = 'host-interface';
const KEY_MODE = 'mode';
const KEY_REMOTE = 'remote';
const KEY_VNI = 'vni';
const KEY_UDP_PORT = 'udp-port';
const KEY_MTU = 'mtu';
const KEY_VARS = 'vars';
const KEY_LABELS = 'labels';

// Key sets used for brief/extended representations
const BRIEF_REMOVE_KEYS = [
  KEY_HOST_INTERFACE,
  KEY_MODE,
  KEY_REMOTE,
  KEY_VNI,
  KEY_UDP_PORT,
  KEY_MTU,
  KEY_VARS,
  KEY_LABELS,
] as const;
const VETH_REMOVE_KEYS = [
  KEY_HOST_INTERFACE,
  KEY_MODE,
  KEY_REMOTE,
  KEY_VNI,
  KEY_UDP_PORT,
] as const;

// Common type groups
// Use shared sets

function endpointIsSpecial(ep: CanonicalEndpoint | string): boolean {
  const epStr = typeof ep === 'string' ? ep : `${ep.node}:${ep.iface}`;
  return (
    isSpecialEndpoint(epStr) ||
    epStr.startsWith(PREFIX_MACVLAN) ||
    epStr.startsWith(PREFIX_VXLAN) ||
    epStr.startsWith(PREFIX_VXLAN_STITCH) ||
    epStr.startsWith(PREFIX_DUMMY)
  );
}

function splitEndpointCanonical(endpoint: string | { node: string; interface?: string }): CanonicalEndpoint {
  const { node, iface } = splitEndpointLike(endpoint);
  return { node, iface };
}

function linkTypeFromSpecial(special: CanonicalEndpoint): CanonicalLinkKey['type'] {
  const { node } = special;
  if (node === STR_HOST) return STR_HOST;
  if (node === STR_MGMT_NET) return STR_MGMT_NET;
  if (node.startsWith(PREFIX_MACVLAN)) return TYPE_MACVLAN;
  if (node.startsWith(PREFIX_VXLAN_STITCH)) return TYPE_VXLAN_STITCH;
  if (node.startsWith(PREFIX_VXLAN)) return TYPE_VXLAN;
  if (node.startsWith(PREFIX_DUMMY)) return TYPE_DUMMY;
  return TYPE_UNKNOWN;
}

function selectNonSpecial(a: CanonicalEndpoint, b?: CanonicalEndpoint): CanonicalEndpoint {
  if (!b) return a;
  return endpointIsSpecial(a) && !endpointIsSpecial(b) ? b : a;
}

function canonicalKeyToString(key: CanonicalLinkKey): string {
  if (key.type === 'veth' && key.b) {
    const aStr = `${key.a.node}:${key.a.iface}`;
    const bStr = `${key.b.node}:${key.b.iface}`;
    const [first, second] = aStr < bStr ? [aStr, bStr] : [bStr, aStr];
    return `veth|${first}|${second}`;
  }
  // Single-endpoint types: only endpoint A determines identity for now
  return `${key.type}|${key.a.node}:${key.a.iface}`;
}

function getTypeString(linkItem: YAML.YAMLMap): string | undefined {
  const typeNode = linkItem.get('type', true) as any;
  if (typeNode && typeof typeNode.value === 'string') {
    return typeNode.value as string;
  }
  if (typeof typeNode === 'string') {
    return typeNode;
  }
  return undefined;
}

function parseExtendedVeth(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const eps = linkItem.get('endpoints', true);
  if (YAML.isSeq(eps) && eps.items.length >= 2) {
    const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
    const b = splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any));
    return { type: 'veth', a, b };
  }
  return null;
}

function parseExtendedSingle(linkItem: YAML.YAMLMap, t: CanonicalLinkKey['type']): CanonicalLinkKey | null {
  const ep = linkItem.get('endpoint', true);
  if (ep) {
    return { type: t, a: splitEndpointLike((ep as any)?.toJSON?.() ?? ep) };
  }

  const eps = linkItem.get('endpoints', true);
  if (!YAML.isSeq(eps) || eps.items.length === 0) return null;

  const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
  const b = eps.items.length > 1
    ? splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any))
    : undefined;

  return { type: t, a: selectNonSpecial(a, b) };
}

function parseShortLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const eps = linkItem.get('endpoints', true);
  if (!YAML.isSeq(eps) || eps.items.length < 2) return null;

  const epA = String((eps.items[0] as any).value ?? eps.items[0]);
  const epB = String((eps.items[1] as any).value ?? eps.items[1]);
  const a = splitEndpointCanonical(epA);
  const b = splitEndpointCanonical(epB);
  return canonicalFromPair(a, b);
}

function canonicalFromYamlLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const typeStr = getTypeString(linkItem);
  if (typeStr) {
    const t = typeStr as CanonicalLinkKey['type'];
    if (t === 'veth') return parseExtendedVeth(linkItem);
    if (SINGLE_ENDPOINT_TYPES.has(t)) {
      return parseExtendedSingle(linkItem, t);
    }
    return null;
  }
  return parseShortLink(linkItem);
}

function canonicalFromPayloadEdge(data: any): CanonicalLinkKey | null {
  const source: string = data.source;
  const target: string = data.target;
  const sourceEp = data.sourceEndpoint ? `${source}:${data.sourceEndpoint}` : source;
  const targetEp = data.targetEndpoint ? `${target}:${data.targetEndpoint}` : target;
  const a = splitEndpointCanonical(sourceEp);
  const b = splitEndpointCanonical(targetEp);
  return canonicalFromPair(a, b);
}

function canonicalFromPair(a: CanonicalEndpoint, b: CanonicalEndpoint): CanonicalLinkKey {
  const aIsSpecial = endpointIsSpecial(a);
  const bIsSpecial = endpointIsSpecial(b);
  if (aIsSpecial !== bIsSpecial) {
    const special = aIsSpecial ? a : b;
    const nonSpecial = aIsSpecial ? b : a;
    return { type: linkTypeFromSpecial(special), a: nonSpecial };
  }
  return { type: 'veth', a, b };
}

// sleep is imported from utilities/asyncUtils

function buildEndpointMap(doc: YAML.Document.Parsed, ep: CanonicalEndpoint): YAML.YAMLMap {
  const m = new YAML.YAMLMap();
  (m as any).flow = false;
  m.set('node', createEndpointScalar(doc, ep.node));
  if (ep.iface) m.set('interface', createEndpointScalar(doc, ep.iface));
  return m;
}

async function saveAnnotationsFromPayload(payloadParsed: any[], yamlFilePath: string): Promise<void> {
  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
  const prevNodeById = new Map<string, NodeAnnotation>();
  for (const na of annotations.nodeAnnotations || []) {
    if (na && typeof na.id === 'string') prevNodeById.set(na.id, na);
  }

  // Build alias interface mapping per alias node id from edges
  const aliasIfaceByAlias = collectAliasInterfacesByAliasId(payloadParsed);
  const nodeById = buildNodeIndex(payloadParsed);

  // Build set of YAML base bridge ids that have at least one alias visual node
  const aliasBaseSet = collectAliasBaseSet(payloadParsed);

  const regularNodes = payloadParsed
    .filter(isRegularNode)
    .filter(n => shouldIncludeNodeAnnotation(n, aliasBaseSet))
    .map(node => createNodeAnnotation(node, prevNodeById, aliasIfaceByAlias, nodeById));
  const cloudNodes = payloadParsed
    .filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud')
    .map(createCloudNodeAnnotation);

  // Also synthesize alias annotations from edges to ensure one entry per YAML interface
  const aliasFromEdges = collectAliasAnnotationsFromEdges(payloadParsed, nodeById, prevNodeById);
  annotations.nodeAnnotations = mergeNodeAnnotationLists(regularNodes, aliasFromEdges);
  annotations.cloudNodeAnnotations = cloudNodes;

  // New model: encode alias mapping via nodeAnnotations (id + yamlNodeId)
  // Do not persist aliasEndpointAnnotations anymore; keep for backward compat only if already present
  if (Array.isArray((annotations as any).aliasEndpointAnnotations) && (annotations as any).aliasEndpointAnnotations.length > 0) {
    // Drop stale aliasEndpointAnnotations to avoid conflicts with the new model
    delete (annotations as any).aliasEndpointAnnotations;
  }

  await annotationsManager.saveAnnotations(yamlFilePath, annotations);
}

function isRegularNode(el: any): boolean {
  return (
    el.group === 'nodes' &&
    el.data.topoViewerRole !== 'group' &&
    el.data.topoViewerRole !== 'cloud' &&
    el.data.topoViewerRole !== 'freeText' &&
    el.data.topoViewerRole !== 'freeShape' &&
    !isSpecialEndpoint(el.data.id)
  );
}

function setNodePosition(nodeAnn: NodeAnnotation, node: any, prev?: NodeAnnotation): void {
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

function addGeo(nodeAnn: NodeAnnotation, node: any): void {
  if (node.data.lat && node.data.lng) {
    const lat = parseFloat(node.data.lat);
    const lng = parseFloat(node.data.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      nodeAnn.geoCoordinates = { lat, lng };
    }
  }
}

function addGroupInfo(nodeAnn: NodeAnnotation, parent: any): void {
  if (!parent) return;
  const parts = parent.split(':');
  if (parts.length === 2) {
    nodeAnn.group = parts[0];
    nodeAnn.level = parts[1];
  }
}

function createNodeAnnotation(
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

function applyNodeIconColor(nodeAnnotation: NodeAnnotation, node: any): void {
  assignAnnotationColor(nodeAnnotation, node);
  assignAnnotationCornerRadius(nodeAnnotation, node);
}

function assignAnnotationColor(nodeAnnotation: NodeAnnotation, node: any): void {
  const color = typeof node?.data?.iconColor === 'string' ? node.data.iconColor.trim() : '';
  if (color) {
    nodeAnnotation.iconColor = color;
    return;
  }
  if ('iconColor' in nodeAnnotation) {
    delete (nodeAnnotation as any).iconColor;
  }
}

function assignAnnotationCornerRadius(nodeAnnotation: NodeAnnotation, node: any): void {
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


function decorateAliasAnnotation(nodeAnnotation: NodeAnnotation, node: any, aliasIfaceByAlias: Map<string, Set<string>>): string | undefined {
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

function collectAliasInterfacesByAliasId(payloadParsed: any[]): Map<string, Set<string>> {
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

function addVal(map: Map<string, Set<string>>, key: string, val: string): void {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(val);
}

function firstInterface(set: Set<string> | undefined): string | '' {
  if (!set || set.size === 0) return '';
  // Prefer ethN order; sort deterministically
  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return arr[0];
}

function computeStableAnnotationId(
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

function createCloudNodeAnnotation(cloudNode: any): CloudNodeAnnotation {
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

function updateYamlNodes(
  payloadParsed: any[],
  doc: YAML.Document.Parsed,
  yamlNodes: YAML.YAMLMap,
  topoObj: ClabTopology | undefined,
  updatedKeys: Map<string, string>,
  idOverride: Map<string, string>,
): void {
  payloadParsed.filter(isWritableNode).forEach(el =>
    updateNodeYaml(el, doc, yamlNodes, topoObj, updatedKeys, idOverride),
  );

  // Build the set of YAML node keys that should exist after this update.
  // Prefer explicit YAML key overrides (extYamlNodeId), else fall back to node "name", then id.
  const payloadNodeYamlKeys = new Set(
    payloadParsed
      .filter(isWritableNode)
      .map(el => {
        const extra = (el.data?.extraData) || {};
        const overrideKey = typeof extra.extYamlNodeId === 'string' && extra.extYamlNodeId.trim() ? extra.extYamlNodeId.trim() : '';
        if (overrideKey) return overrideKey;
        const preferred = (el.data?.name && String(el.data.name)) || String(el.data?.id || '');
        return preferred;
      }),
  );
  for (const item of [...yamlNodes.items]) {
    const keyStr = String(item.key);
    if (!payloadNodeYamlKeys.has(keyStr)) {
      yamlNodes.delete(item.key);
    }
  }
}

interface MissingNodeSpec {
  nodeId: string;
  extraData: any;
}

function synthesizeMissingNodes(
  payloadParsed: any[],
  doc: YAML.Document.Parsed,
  yamlNodes: YAML.YAMLMap,
): void {
  const existingKeys = collectExistingNodeKeys(yamlNodes);
  const missingSpecs = collectMissingNodeSpecs(payloadParsed, existingKeys);

  missingSpecs.forEach(spec => {
    const nodeYaml = createYamlNodeFromSpec(doc, spec.extraData);
    yamlNodes.set(spec.nodeId, nodeYaml);
  });

  if (missingSpecs.length > 0) {
    log.warn(`saveViewport: synthesized ${missingSpecs.length} missing node entries from viewport payload`);
  }
}

function collectExistingNodeKeys(yamlNodes: YAML.YAMLMap): Set<string> {
  const existingKeys = new Set<string>();
  yamlNodes.items.forEach(item => {
    const key = String(item.key);
    if (key) {
      existingKeys.add(key);
    }
  });
  return existingKeys;
}

function collectMissingNodeSpecs(payloadParsed: any[], existingKeys: Set<string>): MissingNodeSpec[] {
  const specs: MissingNodeSpec[] = [];
  payloadParsed.filter(isWritableNode).forEach(el => {
    const extraData = el?.data?.extraData || {};
    const nodeId = String(el?.data?.id || '');
    const overrideKey = typeof extraData.extYamlNodeId === 'string' ? extraData.extYamlNodeId.trim() : '';

    addSpecIfMissing(nodeId, extraData, specs, existingKeys);
    addSpecIfMissing(overrideKey, extraData, specs, existingKeys);
  });

  return specs;
}

function addSpecIfMissing(
  candidateId: string,
  extraData: any,
  specs: MissingNodeSpec[],
  existingKeys: Set<string>
): void {
  if (!candidateId || existingKeys.has(candidateId)) {
    return;
  }
  existingKeys.add(candidateId);
  specs.push({ nodeId: candidateId, extraData });
}

function createYamlNodeFromSpec(doc: YAML.Document.Parsed, extraData: any): YAML.YAMLMap {
  const nodeYaml = new YAML.YAMLMap();
  nodeYaml.flow = false;

  const kind =
    typeof extraData.kind === 'string' && extraData.kind.trim() ? extraData.kind.trim() : 'nokia_srlinux';
  nodeYaml.set('kind', doc.createNode(kind));
  if (typeof extraData.type === 'string' && extraData.type.trim()) {
    nodeYaml.set('type', doc.createNode(extraData.type.trim()));
  }
  if (typeof extraData.image === 'string' && extraData.image.trim()) {
    nodeYaml.set('image', doc.createNode(extraData.image.trim()));
  }
  if (typeof extraData['mgmt-ipv4'] === 'string' && extraData['mgmt-ipv4'].trim()) {
    nodeYaml.set('mgmt-ipv4', doc.createNode(extraData['mgmt-ipv4'].trim()));
  }

  return nodeYaml;
}


function isWritableNode(el: any): boolean {
  return (
    el.group === 'nodes' &&
    el.data.topoViewerRole !== 'group' &&
    el.data.topoViewerRole !== 'freeText' &&
    el.data.topoViewerRole !== 'freeShape' &&
    !isSpecialEndpoint(el.data.id)
  );
}

function getOrCreateNodeMap(nodeId: string, yamlNodes: YAML.YAMLMap): YAML.YAMLMap {
  let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;
  if (!nodeYaml) {
    nodeYaml = new YAML.YAMLMap();
    nodeYaml.flow = false;
    yamlNodes.set(nodeId, nodeYaml);
  }
  return nodeYaml;
}

function updateNodeYaml(
  element: any,
  doc: YAML.Document.Parsed,
  yamlNodes: YAML.YAMLMap,
  topoObj: ClabTopology | undefined,
  updatedKeys: Map<string, string>,
  idOverride: Map<string, string>,
): void {
  const nodeId: string = element.data.id;
  const initialKey = idOverride.get(nodeId) || nodeId;
  const nodeMap = getOrCreateNodeMap(initialKey, yamlNodes);
  const extraData = element.data.extraData || {};

  const originalKind = (nodeMap.get('kind', true) as any)?.value;
  const originalImage = (nodeMap.get('image', true) as any)?.value;
  const originalGroup = (nodeMap.get('group', true) as any)?.value;

  const groupName =
    extraData.group !== undefined && extraData.group !== originalGroup
      ? extraData.group
      : originalGroup;

  const baseInherit = resolveNodeConfig(topoObj!, { group: groupName });
  const desiredKind = extraData.kind ?? originalKind;
  const inherit = resolveNodeConfig(topoObj!, { group: groupName, kind: desiredKind });
  const desiredImage = extraData.image ?? originalImage;
  const desiredType = extraData.type;

  applyBasicProps(
    doc,
    nodeMap,
    groupName,
    desiredKind,
    desiredImage,
    desiredType,
    baseInherit,
    inherit,
  );
  applyExtraProps(doc, nodeMap, extraData, inherit);

  // Prefer explicit YAML node name override if provided
  const desiredYamlKey = (typeof extraData.extYamlNodeId === 'string' && extraData.extYamlNodeId.trim()) ? extraData.extYamlNodeId.trim() : element.data.name;
  if (initialKey !== desiredYamlKey) {
    yamlNodes.set(desiredYamlKey, nodeMap);
    yamlNodes.delete(initialKey);
    updatedKeys.set(initialKey, desiredYamlKey);
  }
}

function applyBasicProps(
  doc: YAML.Document.Parsed,
  nodeMap: YAML.YAMLMap,
  groupName: any,
  desiredKind: any,
  desiredImage: any,
  desiredType: any,
  baseInherit: any,
  inherit: any,
): void {
  updateScalarProp(doc, nodeMap, 'group', groupName);
  updateScalarProp(doc, nodeMap, 'kind', desiredKind, baseInherit.kind);
  updateScalarProp(doc, nodeMap, 'image', desiredImage, inherit.image);
  applyTypeProp(doc, nodeMap, desiredType, inherit?.type);
}

function updateScalarProp(
  doc: YAML.Document.Parsed,
  nodeMap: YAML.YAMLMap,
  key: string,
  newValue: any,
  compareValue?: any,
): void {
  const current = nodeMap.get(key, true) as any;
  if (newValue && (compareValue === undefined || newValue !== compareValue)) {
    if (!current || current.value !== newValue) {
      nodeMap.set(key, doc.createNode(newValue));
    }
  } else if (current) {
    nodeMap.delete(key);
  }
}

function applyTypeProp(
  doc: YAML.Document.Parsed,
  nodeMap: YAML.YAMLMap,
  desiredType: any,
  inheritedTypeNode: any,
): void {
  const currentTypeNode = nodeMap.get('type', true) as any;
  const currentTypeValue = getScalarValue(currentTypeNode);
  const desiredTypeRaw = typeof desiredType === 'string' ? desiredType : undefined;
  const desiredTypeProvided = desiredTypeRaw !== undefined;
  const desiredTypeValue = desiredTypeRaw?.trim();
  const inheritedType = getScalarValue(inheritedTypeNode);

  if (desiredTypeProvided) {
    if (!desiredTypeValue || (inheritedType !== undefined && desiredTypeValue === inheritedType)) {
      if (currentTypeNode !== undefined) {
        nodeMap.delete('type');
      }
      return;
    }
    if (!currentTypeNode || currentTypeValue !== desiredTypeValue) {
      nodeMap.set('type', doc.createNode(desiredTypeValue));
    }
    return;
  }

  if (!currentTypeValue || (inheritedType !== undefined && currentTypeValue === inheritedType)) {
    if (currentTypeNode !== undefined) {
      nodeMap.delete('type');
    }
  }
}

function getScalarValue(value: any): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    return value.value;
  }
  return undefined;
}

function normalizeObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(normalizeObject);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((res, key) => {
        res[key] = normalizeObject(obj[key]);
        return res;
      }, {} as any);
  }
  return obj;
}

function deepEqualNormalized(a: any, b: any): boolean {
  return JSON.stringify(normalizeObject(a)) === JSON.stringify(normalizeObject(b));
}

function shouldPersist(val: any): boolean {
  if (val === undefined) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (val && typeof val === 'object') return Object.keys(val).length > 0;
  return true;
}

function applyExtraProp(
  doc: YAML.Document.Parsed,
  nodeMap: YAML.YAMLMap,
  extraData: any,
  inherit: any,
  prop: string,
): void {
  const val = (extraData as any)[prop];
  const inheritedVal = (inherit as any)[prop];
  const currentNode = nodeMap.get(prop, true) as any;

  if (val === undefined) {
    nodeMap.delete(prop);
    return;
  }

  if (!shouldPersist(val) || deepEqualNormalized(val, inheritedVal)) {
    nodeMap.delete(prop);
    return;
  }

  if (currentNode && deepEqualNormalized(currentNode.toJSON(), val)) {
    return;
  }

  const node = doc.createNode(val) as any;
  if (node && typeof node === 'object') node.flow = false;
  nodeMap.set(prop, node);
}

function applyExtraProps(
  doc: YAML.Document.Parsed,
  nodeMap: YAML.YAMLMap,
  extraData: any,
  inherit: any,
): void {
  [
    'startup-config',
    'enforce-startup-config',
    'suppress-startup-config',
    'license',
    'binds',
    'env',
    'env-files',
    KEY_LABELS,
    'user',
    'entrypoint',
    'cmd',
    'exec',
    'restart-policy',
    'auto-remove',
    'startup-delay',
    'mgmt-ipv4',
    'mgmt-ipv6',
    'network-mode',
    'ports',
    'dns',
    'aliases',
    'memory',
    'cpu',
    'cpu-set',
    'shm-size',
    'cap-add',
    'sysctls',
    'devices',
    'certificate',
    'healthcheck',
    'image-pull-policy',
    'runtime',
    'components',
    'stages',
  ].forEach(prop => applyExtraProp(doc, nodeMap, extraData, inherit, prop));
}

function ensureLinksNode(doc: YAML.Document.Parsed): YAML.YAMLSeq {
  const maybeLinksNode = doc.getIn(['topology', 'links'], true);
  if (YAML.isSeq(maybeLinksNode)) {
    maybeLinksNode.flow = false;
    return maybeLinksNode;
  }
  const linksNode = new YAML.YAMLSeq();
  const topologyNode = doc.getIn(['topology'], true);
  if (YAML.isMap(topologyNode)) topologyNode.set('links', linksNode);
  linksNode.flow = false;
  return linksNode;
}

function getPayloadEdges(payloadParsed: any[]): any[] {
  return payloadParsed.filter(el => el.group === 'edges');
}

// aliasEndpointAnnotations are deprecated; alias mappings are encoded via nodeAnnotations

// buildNodeIndex removed (was used only by deprecated alias mapping logic)

function isBridgeAliasNode(node: any): boolean {
  if (!node) return false;
  const role = node.data?.topoViewerRole;
  const kind = node.data?.extraData?.kind;
  const yaml = node.data?.extraData?.extYamlNodeId;
  const id = node.data?.id;
  const yamlRef = typeof yaml === 'string' ? yaml.trim() : '';
  // Only treat as alias when extYamlNodeId points to a different node id
  return role === 'bridge' && yamlRef.length > 0 && yamlRef !== id && (kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE);
}

function isBridgeKindNode(node: any): boolean {
  const kind = node?.data?.extraData?.kind;
  return kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE;
}

function collectAliasBaseSet(payloadParsed: any[]): Set<string> {
  const set = new Set<string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    if (!isBridgeAliasNode(el)) continue;
    const yamlRef = String(el.data?.extraData?.extYamlNodeId || '').trim();
    if (yamlRef) set.add(yamlRef);
  }
  return set;
}

function shouldIncludeNodeAnnotation(nodeEl: any, aliasBaseSet: Set<string>): boolean {
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

// Legacy mapping utilities removed; migration now uses nodeAnnotations directly

// --- Duplicate bridge interface auto-fix ---

function autoFixDuplicateBridgeInterfaces(payloadParsed: any[]): void {
  const idOverride = buildNodeIdOverrideMap(payloadParsed);
  const bridgeYamlIds = collectBridgeYamlIds(payloadParsed);
  if (bridgeYamlIds.size === 0) return;

  const usage = collectBridgeInterfaceUsage(payloadParsed, idOverride, bridgeYamlIds);
  rewriteDuplicateInterfaces(usage);
}

function collectBridgeYamlIds(payloadParsed: any[]): Set<string> {
  const set = new Set<string>();
  const aliasContrib = new Set<string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const data = el.data || {};
    const extra = data.extraData || {};
    const kind = String(extra.kind || '');
    const yamlRef = typeof extra.extYamlNodeId === 'string' ? extra.extYamlNodeId.trim() : '';
    const isAlias = yamlRef && yamlRef !== data.id;
    const isBridgeKind = kind === KIND_BRIDGE || kind === KIND_OVS_BRIDGE;
    if (!isBridgeKind) continue;

    if (isAlias && yamlRef) {
      // Alias node contributes its referenced YAML id
      set.add(yamlRef);
      aliasContrib.add(yamlRef);
    } else {
      // Base bridge node contributes its own id
      set.add(String(data.id));
    }
  }
  if (aliasContrib.size > 0) {
    log.info(
      `Auto-fix duplicate bridge interfaces: included alias-mapped YAML ids: ${Array.from(aliasContrib).join(', ')}`,
    );
  }
  return set;
}

type EdgeRef = { edge: any; side: 'source' | 'target' };
type UsageMap = Map<string, Map<string, EdgeRef[]>>; // yamlId -> iface -> refs

function collectBridgeInterfaceUsage(
  payloadParsed: any[],
  idOverride: Map<string, string>,
  bridgeYamlIds: Set<string>,
): UsageMap {
  const usage: UsageMap = new Map();
  for (const el of payloadParsed) {
    if (el.group !== 'edges') continue;
    const d = el.data || {};
    const src = idOverride.get(d.source) || d.source;
    const tgt = idOverride.get(d.target) || d.target;
    const srcEp = d.sourceEndpoint || '';
    const tgtEp = d.targetEndpoint || '';
    if (bridgeYamlIds.has(src) && srcEp) addUsage(usage, src, srcEp, { edge: el, side: 'source' });
    if (bridgeYamlIds.has(tgt) && tgtEp) addUsage(usage, tgt, tgtEp, { edge: el, side: 'target' });
  }
  return usage;
}

function addUsage(usage: UsageMap, yamlId: string, iface: string, ref: EdgeRef): void {
  let byIface = usage.get(yamlId);
  if (!byIface) { byIface = new Map(); usage.set(yamlId, byIface); }
  let arr = byIface.get(iface);
  if (!arr) { arr = []; byIface.set(iface, arr); }
  arr.push(ref);
}

function rewriteDuplicateInterfaces(usage: UsageMap): void {
  for (const [yamlId, byIface] of usage) {
    const used = new Set<string>(Array.from(byIface.keys()));
    for (const [iface, refs] of byIface) {
      if (!refs || refs.length <= 1) continue;
      const reassign: string[] = [];
      // Keep first as-is; reassign the rest
      for (let i = 1; i < refs.length; i++) {
        const newName = nextFreeEth(used);
        applyNewIface(refs[i], newName);
        used.add(newName);
        reassign.push(newName);
      }
      if (reassign.length > 0) {
        log.warn(`Duplicate bridge interfaces detected on ${yamlId}:${iface} -> reassigned to ${reassign.join(', ')}`);
      }
    }
  }
}

function nextFreeEth(used: Set<string>): string {
  // Find the next ethN not in used
  let n = 1;
  // Try to start from the current max if available
  const max = Array.from(used)
    .map(v => (v.startsWith('eth') ? parseInt(v.slice(3), 10) : NaN))
    .filter(v => Number.isFinite(v)) as number[];
  if (max.length > 0) n = Math.max(...max) + 1;
  while (used.has(`eth${n}`)) n++;
  return `eth${n}`;
}

function applyNewIface(ref: EdgeRef, newIface: string): void {
  const d = ref.edge?.data || {};
  if (ref.side === 'source') d.sourceEndpoint = newIface;
  else d.targetEndpoint = newIface;
  ref.edge.data = d;
}

function buildNodeIdOverrideMap(payloadParsed: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const data = el.data || {};
    const extra = data.extraData || {};
    // Only consider explicit YAML node mappings
    if (typeof extra.extYamlNodeId === 'string' && extra.extYamlNodeId.trim()) {
      map.set(data.id, extra.extYamlNodeId.trim());
    }
  }
  return map;
}

function applyIdOverrideToEdgeData(data: any, idOverride: Map<string, string>): any {
  if (!data) return data;
  const src = data.source;
  const tgt = data.target;
  const newSrc = idOverride.get(src) || src;
  const newTgt = idOverride.get(tgt) || tgt;
  if (newSrc === src && newTgt === tgt) return data;
  return { ...data, source: newSrc, target: newTgt };
}

function buildPayloadEdgeKeys(edges: any[], idOverride: Map<string, string>): Set<string> {
  return new Set(
    edges
      .map(el => canonicalFromPayloadEdge(applyIdOverrideToEdgeData(el.data, idOverride)))
      .filter((k): k is CanonicalLinkKey => Boolean(k))
      .map(k => canonicalKeyToString(k)),
  );
}

function filterObsoleteLinks(linksNode: YAML.YAMLSeq, payloadEdgeKeys: Set<string>): void {
  linksNode.items = linksNode.items.filter(linkItem => {
    if (YAML.isMap(linkItem)) {
      const key = canonicalFromYamlLink(linkItem as YAML.YAMLMap);
      if (key) return payloadEdgeKeys.has(canonicalKeyToString(key));
    }
    return true;
  });
}

function createEndpointScalar(doc: YAML.Document.Parsed, value: string): YAML.Scalar {
  const scalar = doc.createNode(value) as YAML.Scalar;
  // Always use double quotes to ensure consistent endpoint formatting
  scalar.type = 'QUOTE_DOUBLE';
  return scalar;
}

function replaceEndpointValue(
  item: any,
  doc: YAML.Document.Parsed,
  updatedKeys: Map<string, string>,
): YAML.Node {
  if (YAML.isMap(item)) {
    const n = (item as YAML.YAMLMap).get('node', true) as any;
    const nodeVal = String(n?.value ?? n ?? '');
    const updated = updatedKeys.get(nodeVal);
    if (updated) (item as YAML.YAMLMap).set('node', createEndpointScalar(doc, updated));
    return item;
  }
  let endpointStr = String((item as any).value ?? item);
  let replaced = false;
  if (endpointStr.includes(':')) {
    const [nodeKey, rest] = endpointStr.split(':');
    if (updatedKeys.has(nodeKey)) {
      endpointStr = `${updatedKeys.get(nodeKey)}:${rest}`;
      replaced = true;
    }
  } else if (updatedKeys.has(endpointStr)) {
    endpointStr = updatedKeys.get(endpointStr)!;
    replaced = true;
  }
  return replaced ? createEndpointScalar(doc, endpointStr) : item;
}

function updateEndpointsSeq(
  endpointsNode: YAML.YAMLSeq,
  doc: YAML.Document.Parsed,
  updatedKeys: Map<string, string>,
): void {
  endpointsNode.items = endpointsNode.items.map(item => replaceEndpointValue(item, doc, updatedKeys));
  endpointsNode.flow = endpointsNode.items.every(it => !YAML.isMap(it));
}

function updateEndpointMap(
  endpoint: YAML.YAMLMap | undefined,
  doc: YAML.Document.Parsed,
  updatedKeys: Map<string, string>,
): void {
  if (!endpoint) return;
  const n = endpoint.get('node', true) as any;
  const nodeVal = String(n?.value ?? n ?? '');
  const updated = updatedKeys.get(nodeVal);
  if (updated) endpoint.set('node', createEndpointScalar(doc, updated));
}

function updateExistingLinks(
  linksNode: YAML.YAMLSeq,
  doc: YAML.Document.Parsed,
  updatedKeys: Map<string, string>,
): void {
  if (updatedKeys.size === 0) return;
  for (const linkItem of linksNode.items) {
    if (!YAML.isMap(linkItem)) continue;
    (linkItem as YAML.YAMLMap).flow = false;
    const endpointsNode = linkItem.get('endpoints', true);
    if (YAML.isSeq(endpointsNode)) updateEndpointsSeq(endpointsNode, doc, updatedKeys);
    updateEndpointMap(linkItem.get('endpoint', true) as YAML.YAMLMap | undefined, doc, updatedKeys);
  }
}

function updateYamlLinks(payloadParsed: any[], doc: YAML.Document.Parsed, updatedKeys: Map<string, string>): void {
  const linksNode = ensureLinksNode(doc);
  const edges = getPayloadEdges(payloadParsed);
  const idOverride = buildNodeIdOverrideMap(payloadParsed);
  edges.forEach(element => processEdge(element, linksNode, doc, idOverride));
  const payloadEdgeKeys = buildPayloadEdgeKeys(edges, idOverride);
  filterObsoleteLinks(linksNode, payloadEdgeKeys);
  updateExistingLinks(linksNode, doc, updatedKeys);
}

function canonicalize(obj: any): any {
  if (Array.isArray(obj)) return obj.map(canonicalize);
  if (obj && typeof obj === 'object') {
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return obj;
}

function yamlStructurallyEqual(doc: YAML.Document.Parsed, existingYaml: string): boolean {
  try {
    const existingObj = YAML.parse(existingYaml);
    const docObj = doc.toJS();
    return JSON.stringify(canonicalize(existingObj)) === JSON.stringify(canonicalize(docObj));
  } catch {
    return existingYaml === doc.toString();
  }
}

async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  setInternalUpdate?: (_arg: boolean) => void, // eslint-disable-line no-unused-vars
): Promise<void> {
  const updatedYamlString = doc.toString();
  const existingYaml = await fs.promises.readFile(yamlFilePath, 'utf8').catch(() => '');
  if (yamlStructurallyEqual(doc, existingYaml)) {
    log.info('No YAML changes detected; skipping save');
    return;
  }
  if (setInternalUpdate) {
    setInternalUpdate(true);
    await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');
    await sleep(50);
    setInternalUpdate(false);
    log.info('Saved topology with preserved comments!');
    log.info(doc);
    log.info(yamlFilePath);
  } else {
    await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');
    log.info('Saved viewport positions and groups successfully');
    log.info(`Updated file: ${yamlFilePath}`);
  }
}

function determineChosenType(payloadKey: CanonicalLinkKey, extra: any): CanonicalLinkKey['type'] {
  const validTypes = new Set<CanonicalLinkKey['type']>(['veth', STR_MGMT_NET, STR_HOST, TYPE_MACVLAN, TYPE_VXLAN, TYPE_VXLAN_STITCH, TYPE_DUMMY]);
  if (extra.extType && validTypes.has(extra.extType)) return extra.extType;
  return payloadKey.type === 'unknown' ? 'veth' : payloadKey.type;
}

function hasExtendedProperties(extra: any): boolean {
  const keys = ['extMtu', 'extSourceMac', 'extTargetMac', 'extMac', 'extHostInterface', 'extRemote', 'extVni', 'extUdpPort', 'extMode'];
  if (keys.some(k => extra[k] !== undefined && extra[k] !== null && extra[k] !== '')) return true;
  if (extra.extVars && typeof extra.extVars === 'object' && Object.keys(extra.extVars).length > 0) return true;
  if (extra.extLabels && typeof extra.extLabels === 'object' && Object.keys(extra.extLabels).length > 0) return true;
  return false;
}

function findExistingLinkMap(linksNode: YAML.YAMLSeq, payloadKeyStr: string): YAML.YAMLMap | undefined {
  for (const linkItem of linksNode.items) {
    if (YAML.isMap(linkItem)) {
      const yamlKey = canonicalFromYamlLink(linkItem as YAML.YAMLMap);
      if (yamlKey && canonicalKeyToString(yamlKey) === payloadKeyStr) {
        return linkItem as YAML.YAMLMap;
      }
    }
  }
  return undefined;
}

function setOrDelete(doc: YAML.Document.Parsed, map: YAML.YAMLMap, key: string, value: any): void {
  if (value === undefined || value === '' || (typeof value === 'object' && value != null && Object.keys(value).length === 0)) {
    if ((map as any).has && (map as any).has(key, true)) (map as any).delete(key);
    return;
  }
  map.set(key, doc.createNode(value));
}

function applyBriefFormat(map: YAML.YAMLMap, data: any, doc: YAML.Document.Parsed): void {
  if ((map as any).has && (map as any).has('type', true)) (map as any).delete('type');
  const srcStr = data.sourceEndpoint ? `${data.source}:${data.sourceEndpoint}` : data.source;
  const dstStr = data.targetEndpoint ? `${data.target}:${data.targetEndpoint}` : data.target;
  const endpointsNode = new YAML.YAMLSeq();
  endpointsNode.flow = true;
  endpointsNode.add(createEndpointScalar(doc, srcStr));
  endpointsNode.add(createEndpointScalar(doc, dstStr));
  map.set('endpoints', endpointsNode);
  if ((map as any).has && (map as any).has('endpoint', true)) (map as any).delete('endpoint');
  BRIEF_REMOVE_KEYS.forEach(k => {
    if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k);
  });
}

function applyExtendedVeth(map: YAML.YAMLMap, data: any, extra: any, doc: YAML.Document.Parsed): void {
  const srcEp: CanonicalEndpoint = { node: data.source, iface: data.sourceEndpoint || '' };
  const dstEp: CanonicalEndpoint = { node: data.target, iface: data.targetEndpoint || '' };
  const endpointsNode = new YAML.YAMLSeq();
  endpointsNode.flow = false;
  const epA = buildEndpointMap(doc, srcEp);
  const epB = buildEndpointMap(doc, dstEp);
  if (extra.extSourceMac) epA.set('mac', doc.createNode(extra.extSourceMac));
  else if ((epA as any).has && (epA as any).has('mac', true)) (epA as any).delete('mac');
  if (extra.extTargetMac) epB.set('mac', doc.createNode(extra.extTargetMac));
  else if ((epB as any).has && (epB as any).has('mac', true)) (epB as any).delete('mac');
  endpointsNode.add(epA);
  endpointsNode.add(epB);
  map.set('endpoints', endpointsNode);
  if ((map as any).has && (map as any).has('endpoint', true)) (map as any).delete('endpoint');
  VETH_REMOVE_KEYS.forEach(k => {
    if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k);
  });
}

function applyExtendedSingleEndpoint(
  map: YAML.YAMLMap,
  data: any,
  extra: any,
  chosenType: CanonicalLinkKey['type'],
  payloadKey: CanonicalLinkKey,
  doc: YAML.Document.Parsed,
): void {
  const single = payloadKey.a;
  const epMap = buildEndpointMap(doc, single);
  const containerIsSource =
    single.node === data.source && (single.iface || '') === (data.sourceEndpoint || '');
  const selectedMac = containerIsSource ? extra.extSourceMac : extra.extTargetMac;
  applyEndpointMac(doc, epMap, extra.extMac, selectedMac);
  map.set('endpoint', epMap);
  if ((map as any).has && (map as any).has('endpoints', true)) (map as any).delete('endpoints');

  applyHostInterface(doc, map, chosenType, extra.extHostInterface);
  applyMacvlanMode(doc, map, chosenType, extra.extMode);
  applyVxlanOptions(doc, map, chosenType, extra);
}

function applyEndpointMac(
  doc: YAML.Document.Parsed,
  epMap: YAML.YAMLMap,
  extMac: string | undefined,
  selectedMac: string | undefined,
): void {
  const endpointMac = extMac && extMac !== '' ? extMac : selectedMac;
  if (endpointMac) epMap.set('mac', doc.createNode(endpointMac));
  else if ((epMap as any).has && (epMap as any).has('mac', true)) (epMap as any).delete('mac');
}

function applyHostInterface(
  doc: YAML.Document.Parsed,
  map: YAML.YAMLMap,
  chosenType: CanonicalLinkKey['type'],
  hostInterface: any,
): void {
  if (HOSTY_TYPES.has(chosenType)) {
    setOrDelete(doc, map, KEY_HOST_INTERFACE, hostInterface);
  } else if ((map as any).has && (map as any).has(KEY_HOST_INTERFACE, true)) {
    (map as any).delete(KEY_HOST_INTERFACE);
  }
}

function applyMacvlanMode(
  doc: YAML.Document.Parsed,
  map: YAML.YAMLMap,
  chosenType: CanonicalLinkKey['type'],
  mode: any,
): void {
  if (chosenType === TYPE_MACVLAN) {
    setOrDelete(doc, map, KEY_MODE, mode);
  } else if ((map as any).has && (map as any).has(KEY_MODE, true)) {
    (map as any).delete(KEY_MODE);
  }
}

function applyVxlanOptions(
  doc: YAML.Document.Parsed,
  map: YAML.YAMLMap,
  chosenType: CanonicalLinkKey['type'],
  extra: any,
): void {
  if (VX_TYPES.has(chosenType)) {
    setOrDelete(doc, map, KEY_REMOTE, extra.extRemote);
    setOrDelete(doc, map, KEY_VNI, extra.extVni !== '' ? extra.extVni : undefined);
    setOrDelete(doc, map, KEY_UDP_PORT, extra.extUdpPort !== '' ? extra.extUdpPort : undefined);
  } else {
    removeKeys(map, [KEY_REMOTE, KEY_VNI, KEY_UDP_PORT]);
  }
}

function removeKeys(map: YAML.YAMLMap, keys: string[]): void {
  keys.forEach(k => {
    if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k);
  });
}

function applyExtendedFormat(
  map: YAML.YAMLMap,
  data: any,
  extra: any,
  chosenType: CanonicalLinkKey['type'],
  payloadKey: CanonicalLinkKey,
  payloadKeyStr: string,
  doc: YAML.Document.Parsed,
): boolean {
  map.set('type', doc.createNode(chosenType));
  const requiresHost =
    chosenType === STR_MGMT_NET || chosenType === STR_HOST || chosenType === TYPE_MACVLAN;
  const requiresVx = chosenType === TYPE_VXLAN || chosenType === TYPE_VXLAN_STITCH;
  if ((requiresHost && !extra.extHostInterface) ||
      (requiresVx && (!extra.extRemote || extra.extVni === undefined || extra.extUdpPort === undefined))) {
    log.warn(`Skipping write for link ${payloadKeyStr} due to missing required fields for type ${chosenType}`);
    return false;
  }

  if (chosenType === 'veth') {
    applyExtendedVeth(map, data, extra, doc);
  } else {
    applyExtendedSingleEndpoint(map, data, extra, chosenType, payloadKey, doc);
  }

  setOrDelete(doc, map, KEY_MTU, extra.extMtu !== '' ? extra.extMtu : undefined);
  setOrDelete(doc, map, KEY_VARS, extra.extVars);
  setOrDelete(doc, map, KEY_LABELS, extra.extLabels);
  return true;
}

function updateExistingLink(
  linkItem: YAML.YAMLMap,
  data: any,
  extra: any,
  chosenType: CanonicalLinkKey['type'],
  payloadKey: CanonicalLinkKey,
  payloadKeyStr: string,
  doc: YAML.Document.Parsed,
): void {
  linkItem.flow = false;
  const hasExtended = hasExtendedProperties(extra);
  const shouldBrief = !hasExtended && chosenType !== TYPE_DUMMY;
  if (shouldBrief) {
    applyBriefFormat(linkItem, data, doc);
  } else {
    applyExtendedFormat(linkItem, data, extra, chosenType, payloadKey, payloadKeyStr, doc);
  }
}

function validateRequiredFields(
  chosenType: CanonicalLinkKey['type'],
  data: any,
  extra: any,
  payloadKeyStr: string,
): boolean {
  const requiresHost =
    chosenType === STR_MGMT_NET || chosenType === STR_HOST || chosenType === TYPE_MACVLAN;
  const requiresVx = chosenType === TYPE_VXLAN || chosenType === TYPE_VXLAN_STITCH;
  const needsHostInterface = requiresHost && !data.source.includes(':') && !data.target.includes(':');
  if (
    (needsHostInterface && !extra.extHostInterface) ||
    (requiresVx && (!extra.extRemote || extra.extVni === undefined || extra.extUdpPort === undefined))
  ) {
    log.warn(`Skipping creation for link ${payloadKeyStr} due to missing required fields for type ${chosenType}`);
    return false;
  }
  return true;
}

function applyExtendedLink(
  link: YAML.YAMLMap,
  data: any,
  extra: any,
  chosenType: CanonicalLinkKey['type'],
  payloadKey: CanonicalLinkKey,
  doc: YAML.Document.Parsed,
): void {
  if (chosenType === 'veth') {
    applyExtendedVeth(link, data, extra, doc);
  } else {
    applyExtendedSingleEndpoint(link, data, extra, chosenType, payloadKey, doc);
  }
  setOrDelete(doc, link, KEY_MTU, extra.extMtu !== '' ? extra.extMtu : undefined);
  setOrDelete(doc, link, KEY_VARS, extra.extVars);
  setOrDelete(doc, link, KEY_LABELS, extra.extLabels);
}

function createNewLink(
  linksNode: YAML.YAMLSeq,
  data: any,
  extra: any,
  chosenType: CanonicalLinkKey['type'],
  payloadKey: CanonicalLinkKey,
  payloadKeyStr: string,
  doc: YAML.Document.Parsed,
): void {
  const newLink = new YAML.YAMLMap();
  newLink.flow = false;
  const wantsExtended = hasExtendedProperties(extra) || chosenType === TYPE_DUMMY;
  if (wantsExtended) {
    newLink.set('type', doc.createNode(chosenType));
    if (!validateRequiredFields(chosenType, data, extra, payloadKeyStr)) return;
    applyExtendedLink(newLink, data, extra, chosenType, payloadKey, doc);
  } else {
    applyBriefFormat(newLink, data, doc);
  }
  linksNode.add(newLink);
}

function processEdge(element: any, linksNode: YAML.YAMLSeq, doc: YAML.Document.Parsed, idOverride: Map<string, string>): void {
  const data = applyIdOverrideToEdgeData(element.data, idOverride);
  const payloadKey = canonicalFromPayloadEdge(data);
  if (!payloadKey) return;
  const payloadKeyStr = canonicalKeyToString(payloadKey);
  const extra = (data.extraData || {}) as any;
  const chosenType = determineChosenType(payloadKey, extra);
  const existing = findExistingLinkMap(linksNode, payloadKeyStr);
  if (existing) {
    // Determine if applying the update would actually change the YAML. If not,
    // we skip mutating the existing node to preserve its original formatting.
    const tempDoc = new YAML.Document();
    const clone = YAML.parseDocument(YAML.stringify(existing)).contents as YAML.YAMLMap;
    updateExistingLink(clone, data, extra, chosenType, payloadKey, payloadKeyStr, tempDoc as any);
    if (YAML.stringify(clone) !== YAML.stringify(existing)) {
      updateExistingLink(existing, data, extra, chosenType, payloadKey, payloadKeyStr, doc);
    }
  } else {
    createNewLink(linksNode, data, extra, chosenType, payloadKey, payloadKeyStr, doc);
  }
}

// Deprecated: computeEndpointsStr removed in favor of canonical link matching

export interface SaveViewportParams {
  mode: 'edit' | 'view';
  yamlFilePath: string;
  payload: string;
  adaptor?: TopoViewerAdaptorClab;
  setInternalUpdate?: (_arg: boolean) => void; // eslint-disable-line no-unused-vars
}

export async function saveViewport({
  mode,
  yamlFilePath,
  payload,
  adaptor,
  setInternalUpdate,
}: SaveViewportParams): Promise<void> {
  const payloadParsed: any[] = JSON.parse(payload);

  if (mode === 'view') {
    log.info('View mode detected - will only save annotations, not modifying YAML');
    await saveAnnotationsFromPayload(payloadParsed, yamlFilePath);
    log.info('View mode: Saved annotations only - YAML file not touched');
    return;
  }

  const doc = adaptor?.currentClabDoc;
  if (!doc) {
    throw new Error('No parsed Document found (adaptor.currentClabDoc is undefined).');
  }

  const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
  if (!YAML.isMap(nodesMaybe)) {
    throw new Error('YAML topology nodes is not a map');
  }
  const yamlNodes: YAML.YAMLMap = nodesMaybe;
  yamlNodes.flow = false;

  // Auto-fix duplicate bridge interfaces (so aliases can persist per-interface)
  try {
    autoFixDuplicateBridgeInterfaces(payloadParsed);
  } catch (e) {
    log.warn(`autoFixDuplicateBridgeInterfaces failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const updatedKeys = new Map<string, string>();
  const topoObj = doc.toJS() as ClabTopology;
  const idOverride = buildNodeIdOverrideMap(payloadParsed);
  updateYamlNodes(payloadParsed, doc, yamlNodes, topoObj, updatedKeys, idOverride);
  synthesizeMissingNodes(payloadParsed, doc, yamlNodes);
  updateYamlLinks(payloadParsed, doc, updatedKeys);

  await saveAnnotationsFromPayload(payloadParsed, yamlFilePath);
  await writeYamlFile(doc, yamlFilePath, setInternalUpdate);
}
function buildNodeIndex(payloadParsed: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const el of payloadParsed) {
    if (el.group !== 'nodes') continue;
    const id = String(el?.data?.id || '');
    if (id) m.set(id, el);
  }
  return m;
}

function collectAliasAnnotationsFromEdges(
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

function resolveBridgeNode(nodeById: Map<string, any>, nodeId: string): any | undefined {
  const n = nodeById.get(String(nodeId));
  if (!n) return undefined;
  return isBridgeKindNode(n) ? n : undefined;
}

function normalizeIface(iface: string | undefined): string {
  return (iface || '').toString().trim();
}

function resolveYamlBaseId(n: any): string {
  const yamlRef = String(n?.data?.extraData?.extYamlNodeId || '').trim();
  const nodeId = String(n?.data?.id || '');
  return yamlRef && yamlRef !== nodeId ? yamlRef : nodeId;
}

function buildAliasAnnotationSkeleton(annId: string, yamlId: string, ep: string, label?: string): NodeAnnotation {
  const ann: NodeAnnotation = { id: annId, icon: 'bridge', yamlNodeId: yamlId, yamlInterface: ep } as any;
  if (label) (ann as any).label = label;
  return ann;
}

function applyPreferredPosition(ann: NodeAnnotation, prev: NodeAnnotation | undefined, n: any): void {
  if (prev?.position) {
    ann.position = { x: prev.position.x, y: prev.position.y };
    return;
  }
  if (n?.position && typeof n.position.x === 'number' && typeof n.position.y === 'number') {
    ann.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
  }
}

function pickAliasLabel(nodeEl: any, sideName?: string): string {
  const nameFromNode = ((nodeEl?.data?.name ?? '') as string).trim();
  const candidate = ((sideName ?? '') as string).trim();
  return candidate || nameFromNode;
}

function mergeNodeAnnotationLists(primary: NodeAnnotation[], secondary: NodeAnnotation[]): NodeAnnotation[] {
  const byId = new Map<string, NodeAnnotation>();
  primary.forEach(a => byId.set(a.id, a));
  secondary.forEach(b => upsertAnnotation(byId, b));
  return Array.from(byId.values());
}

function upsertAnnotation(byId: Map<string, NodeAnnotation>, incoming: NodeAnnotation): void {
  const existing = byId.get(incoming.id);
  if (!existing) {
    byId.set(incoming.id, incoming);
    return;
  }
  mergeAnnotation(existing, incoming);
}

function mergeAnnotation(target: NodeAnnotation, source: NodeAnnotation): void {
  if (!('label' in (target as any)) && (source as any).label) (target as any).label = (source as any).label;
  if (!target.position && source.position) target.position = source.position;
  if (!(target as any).yamlNodeId && (source as any).yamlNodeId) (target as any).yamlNodeId = (source as any).yamlNodeId;
  if (!(target as any).yamlInterface && (source as any).yamlInterface) (target as any).yamlInterface = (source as any).yamlInterface;
  if (!target.iconColor && source.iconColor) target.iconColor = source.iconColor;
  if (target.iconCornerRadius === undefined && source.iconCornerRadius !== undefined) target.iconCornerRadius = source.iconCornerRadius;
}
