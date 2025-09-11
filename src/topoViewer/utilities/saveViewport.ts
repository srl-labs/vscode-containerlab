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

  const regularNodes = payloadParsed.filter(isRegularNode).map(node =>
    createNodeAnnotation(node, prevNodeById),
  );
  const cloudNodes = payloadParsed
    .filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud')
    .map(createCloudNodeAnnotation);

  annotations.nodeAnnotations = regularNodes;
  annotations.cloudNodeAnnotations = cloudNodes;

  await annotationsManager.saveAnnotations(yamlFilePath, annotations);
}

function isRegularNode(el: any): boolean {
  return (
    el.group === 'nodes' &&
    el.data.topoViewerRole !== 'group' &&
    el.data.topoViewerRole !== 'cloud' &&
    el.data.topoViewerRole !== 'freeText' &&
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
): NodeAnnotation {
  const nodeIdForAnn = node.data.name || node.data.id;
  const nodeAnnotation: NodeAnnotation = { id: nodeIdForAnn, icon: node.data.topoViewerRole };
  setNodePosition(nodeAnnotation, node, prevNodeById.get(nodeIdForAnn));
  addGeo(nodeAnnotation, node);
  if (node.data.groupLabelPos) nodeAnnotation.groupLabelPos = node.data.groupLabelPos;
  addGroupInfo(nodeAnnotation, node.parent);
  return nodeAnnotation;
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
): void {
  payloadParsed.filter(isWritableNode).forEach(el =>
    updateNodeYaml(el, doc, yamlNodes, topoObj, updatedKeys),
  );

  const payloadNodeIds = new Set(
    payloadParsed
      .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id))
      .map(el => el.data.id),
  );
  for (const item of [...yamlNodes.items]) {
    const keyStr = String(item.key);
    if (!payloadNodeIds.has(keyStr) && ![...updatedKeys.values()].includes(keyStr)) {
      yamlNodes.delete(item.key);
    }
  }
}

function isWritableNode(el: any): boolean {
  return (
    el.group === 'nodes' &&
    el.data.topoViewerRole !== 'group' &&
    el.data.topoViewerRole !== 'freeText' &&
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
): void {
  const nodeId: string = element.data.id;
  const nodeMap = getOrCreateNodeMap(nodeId, yamlNodes);
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

  const newKey = element.data.name;
  if (nodeId !== newKey) {
    yamlNodes.set(newKey, nodeMap);
    yamlNodes.delete(nodeId);
    updatedKeys.set(nodeId, newKey);
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

  const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
  const currentType = nodeMap.get('type', true) as any;
  if (nokiaKinds.includes(desiredKind)) {
    if (desiredType && desiredType !== '' && desiredType !== inherit.type) {
      if (!currentType || currentType.value !== desiredType) {
        nodeMap.set('type', doc.createNode(desiredType));
      }
    } else if (currentType) {
      nodeMap.delete('type');
    }
  } else if (currentType) {
    nodeMap.delete('type');
  }
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

function buildPayloadEdgeKeys(edges: any[]): Set<string> {
  return new Set(
    edges
      .map(el => canonicalFromPayloadEdge(el.data))
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
  edges.forEach(element => processEdge(element, linksNode, doc));
  const payloadEdgeKeys = buildPayloadEdgeKeys(edges);
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

function processEdge(element: any, linksNode: YAML.YAMLSeq, doc: YAML.Document.Parsed): void {
  const data = element.data;
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

  const updatedKeys = new Map<string, string>();
  const topoObj = doc.toJS() as ClabTopology;
  updateYamlNodes(payloadParsed, doc, yamlNodes, topoObj, updatedKeys);
  updateYamlLinks(payloadParsed, doc, updatedKeys);

  await saveAnnotationsFromPayload(payloadParsed, yamlFilePath);
  await writeYamlFile(doc, yamlFilePath, setInternalUpdate);
}
