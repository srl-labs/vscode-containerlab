import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../../webview/platform/logging/logger';
import { TopoViewerAdaptorClab } from './TopologyAdapter';
import { resolveNodeConfig } from '../../webview/core/nodeConfig';
import { ClabTopology } from '../../shared/types/topoViewerType';
import { annotationsManager } from './AnnotationsFile';
import { NodeAnnotation } from '../../shared/types/topoViewerGraph';
import { isSpecialEndpoint } from '../../shared/utilities/SpecialNodes';
import { STR_HOST, STR_MGMT_NET, HOSTY_TYPES, VX_TYPES } from '../../shared/utilities/LinkTypes';
import { sleep } from '../../shared/utilities/AsyncUtils';

// Import from extracted modules
import {
  CanonicalEndpoint,
  CanonicalLinkKey,
  TYPE_MACVLAN,
  TYPE_VXLAN,
  TYPE_VXLAN_STITCH,
  TYPE_DUMMY,
  canonicalKeyToString,
  canonicalFromYamlLink,
  canonicalFromPayloadEdge,
} from './CanonicalLinkUtils';

import {
  isRegularNode,
  collectAliasInterfacesByAliasId,
  collectAliasBaseSet,
  shouldIncludeNodeAnnotation,
  createNodeAnnotation,
  createCloudNodeAnnotation,
  buildNodeIndex,
  collectAliasAnnotationsFromEdges,
  mergeNodeAnnotationLists,
} from './NodeAnnotationUtils';

import {
  autoFixDuplicateBridgeInterfaces,
  buildNodeIdOverrideMap,
  applyIdOverrideToEdgeData,
} from './BridgeInterfaceFixer';

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
