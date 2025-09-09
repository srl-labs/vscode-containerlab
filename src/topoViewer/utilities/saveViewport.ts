import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabTopology } from '../types/topoViewerType';
import { annotationsManager } from './annotationsManager';
import { CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';
import { isSpecialEndpoint } from './specialNodes';

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

function endpointIsSpecial(ep: CanonicalEndpoint | string): boolean {
  const epStr = typeof ep === 'string' ? ep : `${ep.node}:${ep.iface}`;
  return (
    isSpecialEndpoint(epStr) ||
    epStr.startsWith('macvlan:') ||
    epStr.startsWith('vxlan:') ||
    epStr.startsWith('vxlan-stitch:') ||
    epStr.startsWith('dummy')
  );
}

function splitEndpointLike(endpoint: string | { node: string; interface?: string }): CanonicalEndpoint {
  if (typeof endpoint === 'string') {
    if (
      endpoint.startsWith('macvlan:') ||
      endpoint.startsWith('dummy') ||
      endpoint.startsWith('vxlan:') ||
      endpoint.startsWith('vxlan-stitch:')
    ) {
      return { node: endpoint, iface: '' };
    }
    const parts = endpoint.split(':');
    if (parts.length === 2) return { node: parts[0], iface: parts[1] };
    return { node: endpoint, iface: '' };
  }
  if (endpoint && typeof endpoint === 'object') {
    return { node: endpoint.node, iface: endpoint.interface ?? '' };
  }
  return { node: '', iface: '' };
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
  return typeof typeNode?.value === 'string'
    ? (typeNode.value as string)
    : typeof typeNode === 'string'
      ? typeNode
      : undefined;
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
    const a = splitEndpointLike((ep as any)?.toJSON?.() ?? ep);
    return { type: t, a };
  }
  const eps = linkItem.get('endpoints', true);
  if (YAML.isSeq(eps) && eps.items.length >= 1) {
    const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
    const bMaybe = eps.items.length > 1
      ? splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any))
      : undefined;
    if (bMaybe) {
      return { type: t, a: endpointIsSpecial(a) && !endpointIsSpecial(bMaybe) ? bMaybe : a };
    }
    return { type: t, a };
  }
  return null;
}

function parseShortLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const eps = linkItem.get('endpoints', true);
  if (YAML.isSeq(eps) && eps.items.length >= 2) {
    const epA = String((eps.items[0] as any).value ?? eps.items[0]);
    const epB = String((eps.items[1] as any).value ?? eps.items[1]);
    const a = splitEndpointLike(epA);
    const b = splitEndpointLike(epB);
    const aIsSpecial = endpointIsSpecial(epA) || endpointIsSpecial(a);
    const bIsSpecial = endpointIsSpecial(epB) || endpointIsSpecial(b);
    if (aIsSpecial !== bIsSpecial) {
      const special = aIsSpecial ? a : b;
      const nonSpecial = aIsSpecial ? b : a;
      let type: CanonicalLinkKey['type'] = 'unknown';
      if (special.node === 'host') type = 'host';
      else if (special.node === 'mgmt-net') type = 'mgmt-net';
      else if (special.node.startsWith('macvlan:')) type = 'macvlan';
      else if (special.node.startsWith('vxlan-stitch:')) type = 'vxlan-stitch';
      else if (special.node.startsWith('vxlan:')) type = 'vxlan';
      else if (special.node.startsWith('dummy')) type = 'dummy';
      return { type, a: nonSpecial };
    }
    return { type: 'veth', a, b };
  }
  return null;
}

function canonicalFromYamlLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  const typeStr = getTypeString(linkItem);
  if (typeStr) {
    const t = typeStr as CanonicalLinkKey['type'];
    if (t === 'veth') return parseExtendedVeth(linkItem);
    if (['mgmt-net', 'host', 'macvlan', 'dummy', 'vxlan', 'vxlan-stitch'].includes(t)) {
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
  const a = splitEndpointLike(sourceEp);
  const b = splitEndpointLike(targetEp);
  const aIsSpecial = isSpecialEndpoint(source) || a.node.startsWith('macvlan:') || a.node.startsWith('vxlan:') || a.node.startsWith('vxlan-stitch:');
  const bIsSpecial = isSpecialEndpoint(target) || b.node.startsWith('macvlan:') || b.node.startsWith('vxlan:') || b.node.startsWith('vxlan-stitch:');

  if (aIsSpecial !== bIsSpecial) {
    const special = aIsSpecial ? a : b;
    const nonSpecial = aIsSpecial ? b : a;
    let type: CanonicalLinkKey['type'] = 'unknown';
    if (special.node === 'host') type = 'host';
    else if (special.node === 'mgmt-net') type = 'mgmt-net';
    else if (special.node.startsWith('macvlan:')) type = 'macvlan';
    else if (special.node.startsWith('vxlan-stitch:')) type = 'vxlan-stitch';
    else if (special.node.startsWith('vxlan:')) type = 'vxlan';
    else if (special.node.startsWith('dummy')) type = 'dummy';
    return { type, a: nonSpecial };
  }

  return { type: 'veth', a, b };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildEndpointMap(doc: YAML.Document.Parsed, ep: CanonicalEndpoint): YAML.YAMLMap {
  const m = new YAML.YAMLMap();
  (m as any).flow = false;
  m.set('node', doc.createNode(ep.node));
  if (ep.iface) m.set('interface', doc.createNode(ep.iface));
  return m;
}

async function saveAnnotationsFromPayload(payloadParsed: any[], yamlFilePath: string): Promise<void> {
  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
  const prevNodeById = new Map<string, NodeAnnotation>();
  for (const na of annotations.nodeAnnotations || []) {
    if (na && typeof na.id === 'string') prevNodeById.set(na.id, na);
  }
  annotations.nodeAnnotations = [];
  annotations.cloudNodeAnnotations = [];

  const regularNodes = payloadParsed.filter(
    el =>
      el.group === 'nodes' &&
      el.data.topoViewerRole !== 'group' &&
      el.data.topoViewerRole !== 'cloud' &&
      el.data.topoViewerRole !== 'freeText' &&
      !isSpecialEndpoint(el.data.id),
  );
  for (const node of regularNodes) {
    const nodeIdForAnn = node.data.name || node.data.id;
    const isGeoActive = !!node?.data?.geoLayoutActive;
    const nodeAnnotation: NodeAnnotation = {
      id: nodeIdForAnn,
      icon: node.data.topoViewerRole,
    };
    if (isGeoActive) {
      const prev = prevNodeById.get(nodeIdForAnn);
      if (prev?.position) {
        nodeAnnotation.position = { x: prev.position.x, y: prev.position.y };
      }
    } else {
      nodeAnnotation.position = {
        x: Math.round(node.position?.x || 0),
        y: Math.round(node.position?.y || 0),
      };
    }
    if (node.data.lat && node.data.lng) {
      const lat = parseFloat(node.data.lat);
      const lng = parseFloat(node.data.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        nodeAnnotation.geoCoordinates = { lat, lng };
      }
    }
    if (node.data.groupLabelPos) {
      nodeAnnotation.groupLabelPos = node.data.groupLabelPos;
    }
    if (node.parent) {
      const parts = node.parent.split(':');
      if (parts.length === 2) {
        nodeAnnotation.group = parts[0];
        nodeAnnotation.level = parts[1];
      }
    }
    annotations.nodeAnnotations!.push(nodeAnnotation);
  }

  const cloudNodes = payloadParsed.filter(
    el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud',
  );
  for (const cloudNode of cloudNodes) {
    const cloudNodeAnnotation: CloudNodeAnnotation = {
      id: cloudNode.data.id,
      type: cloudNode.data.extraData?.kind || 'host',
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
    annotations.cloudNodeAnnotations!.push(cloudNodeAnnotation);
  }

  await annotationsManager.saveAnnotations(yamlFilePath, annotations);
}

function updateYamlNodes(
  payloadParsed: any[],
  doc: YAML.Document.Parsed,
  yamlNodes: YAML.YAMLMap,
  topoObj: ClabTopology | undefined,
  updatedKeys: Map<string, string>,
): void {
  payloadParsed
    .filter(
      el =>
        el.group === 'nodes' &&
        el.data.topoViewerRole !== 'group' &&
        el.data.topoViewerRole !== 'freeText' &&
        !isSpecialEndpoint(el.data.id),
    )
    .forEach(element => {
      const nodeId: string = element.data.id;
      let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;
      if (!nodeYaml) {
        nodeYaml = new YAML.YAMLMap();
        nodeYaml.flow = false;
        yamlNodes.set(nodeId, nodeYaml);
      }
      const nodeMap = nodeYaml;
      const extraData = element.data.extraData || {};

      const originalKind = (nodeMap.get('kind', true) as any)?.value;
      const originalImage = (nodeMap.get('image', true) as any)?.value;
      const originalGroup = (nodeMap.get('group', true) as any)?.value;

      const groupName =
        extraData.group !== undefined && extraData.group !== originalGroup
          ? extraData.group
          : originalGroup;

      const baseInherit = resolveNodeConfig(topoObj!, { group: groupName });
      const desiredKind =
        extraData.kind !== undefined ? extraData.kind : originalKind !== undefined ? originalKind : undefined;
      const inherit = resolveNodeConfig(topoObj!, { group: groupName, kind: desiredKind });
      const desiredImage =
        extraData.image !== undefined ? extraData.image : originalImage !== undefined ? originalImage : undefined;
      const desiredType = extraData.type;

      if (groupName) nodeMap.set('group', doc.createNode(groupName));
      else nodeMap.delete('group');

      if (desiredKind && desiredKind !== baseInherit.kind) nodeMap.set('kind', doc.createNode(desiredKind));
      else nodeMap.delete('kind');

      if (desiredImage && desiredImage !== inherit.image) nodeMap.set('image', doc.createNode(desiredImage));
      else nodeMap.delete('image');

      const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
      if (nokiaKinds.includes(desiredKind)) {
        if (desiredType && desiredType !== '' && desiredType !== inherit.type) {
          nodeMap.set('type', doc.createNode(desiredType));
        } else {
          nodeMap.delete('type');
        }
      } else {
        nodeMap.delete('type');
      }

      const normalize = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
          return Object.keys(obj)
            .sort()
            .reduce((res, key) => {
              res[key] = normalize(obj[key]);
              return res;
            }, {} as any);
        }
        return obj;
      };
      const deepEqual = (a: any, b: any) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
      const shouldPersist = (val: any) => {
        if (val === undefined) return false;
        if (Array.isArray(val)) return val.length > 0;
        if (val && typeof val === 'object') return Object.keys(val).length > 0;
        return true;
      };
      const applyProp = (prop: string) => {
        const val = (extraData as any)[prop];
        const inheritedVal = (inherit as any)[prop];
        if (shouldPersist(val) && !deepEqual(val, inheritedVal)) {
          const node = doc.createNode(val) as any;
          if (node && typeof node === 'object') node.flow = false;
          nodeMap.set(prop, node);
        } else {
          nodeMap.delete(prop);
        }
      };

      [
        'startup-config',
        'enforce-startup-config',
        'suppress-startup-config',
        'license',
        'binds',
        'env',
        'env-files',
        'labels',
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
      ].forEach(applyProp);

      const newKey = element.data.name;
      if (nodeId !== newKey) {
        yamlNodes.set(newKey, nodeMap);
        yamlNodes.delete(nodeId);
        updatedKeys.set(nodeId, newKey);
      }
    });

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

function updateYamlLinks(
  payloadParsed: any[],
  doc: YAML.Document.Parsed,
  updatedKeys: Map<string, string>,
): void {
  const maybeLinksNode = doc.getIn(['topology', 'links'], true);
  let linksNode: YAML.YAMLSeq;
  if (YAML.isSeq(maybeLinksNode)) {
    linksNode = maybeLinksNode;
  } else {
    linksNode = new YAML.YAMLSeq();
    const topologyNode = doc.getIn(['topology'], true);
    if (YAML.isMap(topologyNode)) {
      topologyNode.set('links', linksNode);
    }
  }
  linksNode.flow = false;

  payloadParsed.filter(el => el.group === 'edges').forEach(element => processEdge(element, linksNode, doc));

  const payloadEdgeKeys = new Set<string>(
    payloadParsed
      .filter(el => el.group === 'edges')
      .map(el => canonicalFromPayloadEdge(el.data))
      .filter((k): k is CanonicalLinkKey => Boolean(k))
      .map(k => canonicalKeyToString(k)),
  );

  linksNode.items = linksNode.items.filter(linkItem => {
    if (YAML.isMap(linkItem)) {
      const key = canonicalFromYamlLink(linkItem as YAML.YAMLMap);
      if (key) {
        return payloadEdgeKeys.has(canonicalKeyToString(key));
      }
    }
    return true;
  });

  for (const linkItem of linksNode.items) {
    if (!YAML.isMap(linkItem)) continue;
    (linkItem as YAML.YAMLMap).flow = false;
    const endpointsNode = linkItem.get('endpoints', true);
    if (YAML.isSeq(endpointsNode)) {
      endpointsNode.items = endpointsNode.items.map(item => {
        if (YAML.isMap(item)) {
          const n = (item as YAML.YAMLMap).get('node', true) as any;
          const nodeVal = String(n?.value ?? n ?? '');
          const updated = updatedKeys.get(nodeVal);
          if (updated) {
            (item as YAML.YAMLMap).set('node', doc.createNode(updated));
          }
          return item;
        }
        let endpointStr = String((item as any).value ?? item);
        if (endpointStr.includes(':')) {
          const [nodeKey, rest] = endpointStr.split(':');
          if (updatedKeys.has(nodeKey)) {
            endpointStr = `${updatedKeys.get(nodeKey)}:${rest}`;
          }
        } else if (updatedKeys.has(endpointStr)) {
          endpointStr = updatedKeys.get(endpointStr)!;
        }
        return doc.createNode(endpointStr);
      });
      endpointsNode.flow = endpointsNode.items.every(it => !YAML.isMap(it));
    }
    const endpointSingle = linkItem.get('endpoint', true);
    if (YAML.isMap(endpointSingle)) {
      const n = endpointSingle.get('node', true) as any;
      const nodeVal = String(n?.value ?? n ?? '');
      const updated = updatedKeys.get(nodeVal);
      if (updated) {
        endpointSingle.set('node', doc.createNode(updated));
      }
    }
  }
}

async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  setInternalUpdate?: (_arg: boolean) => void, // eslint-disable-line no-unused-vars
): Promise<void> {
  const updatedYamlString = doc.toString();
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
  const validTypes = new Set<CanonicalLinkKey['type']>(['veth', 'mgmt-net', 'host', 'macvlan', 'vxlan', 'vxlan-stitch', 'dummy']);
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
  const endpointsNode = doc.createNode([srcStr, dstStr]) as YAML.YAMLSeq;
  endpointsNode.flow = true;
  map.set('endpoints', endpointsNode);
  if ((map as any).has && (map as any).has('endpoint', true)) (map as any).delete('endpoint');
  ['host-interface', 'mode', 'remote', 'vni', 'udp-port', 'mtu', 'vars', 'labels'].forEach(k => {
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
  ['host-interface', 'mode', 'remote', 'vni', 'udp-port'].forEach(k => {
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
  const containerIsSource = single.node === data.source && (single.iface || '') === (data.sourceEndpoint || '');
  const selectedMac = containerIsSource ? extra.extSourceMac : extra.extTargetMac;
  const endpointMac = extra.extMac !== undefined && extra.extMac !== '' ? extra.extMac : selectedMac;
  if (endpointMac) epMap.set('mac', doc.createNode(endpointMac));
  else if ((epMap as any).has && (epMap as any).has('mac', true)) (epMap as any).delete('mac');
  map.set('endpoint', epMap);
  if ((map as any).has && (map as any).has('endpoints', true)) (map as any).delete('endpoints');

  if (chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan') {
    setOrDelete(doc, map, 'host-interface', extra.extHostInterface);
  } else if ((map as any).has && (map as any).has('host-interface', true)) {
    (map as any).delete('host-interface');
  }
  if (chosenType === 'macvlan') {
    setOrDelete(doc, map, 'mode', extra.extMode);
  } else if ((map as any).has && (map as any).has('mode', true)) {
    (map as any).delete('mode');
  }
  if (chosenType === 'vxlan' || chosenType === 'vxlan-stitch') {
    setOrDelete(doc, map, 'remote', extra.extRemote);
    setOrDelete(doc, map, 'vni', extra.extVni !== '' ? extra.extVni : undefined);
    setOrDelete(doc, map, 'udp-port', extra.extUdpPort !== '' ? extra.extUdpPort : undefined);
  } else {
    ['remote', 'vni', 'udp-port'].forEach(k => {
      if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k);
    });
  }
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
  const requiresHost = chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan';
  const requiresVx = chosenType === 'vxlan' || chosenType === 'vxlan-stitch';
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

  setOrDelete(doc, map, 'mtu', extra.extMtu !== '' ? extra.extMtu : undefined);
  setOrDelete(doc, map, 'vars', extra.extVars);
  setOrDelete(doc, map, 'labels', extra.extLabels);
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
  const shouldBrief = !hasExtended && chosenType !== 'dummy';
  if (shouldBrief) {
    applyBriefFormat(linkItem, data, doc);
  } else {
    applyExtendedFormat(linkItem, data, extra, chosenType, payloadKey, payloadKeyStr, doc);
  }
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
  const wantsExtended = hasExtendedProperties(extra) || chosenType === 'dummy';
  if (wantsExtended) {
    newLink.set('type', doc.createNode(chosenType));
    const requiresHost = chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan';
    const requiresVx = chosenType === 'vxlan' || chosenType === 'vxlan-stitch';
    const needsHostInterface = requiresHost && !data.source.includes(':') && !data.target.includes(':');
    if ((needsHostInterface && !extra.extHostInterface) ||
        (requiresVx && (!extra.extRemote || extra.extVni === undefined || extra.extUdpPort === undefined))) {
      log.warn(`Skipping creation for link ${payloadKeyStr} due to missing required fields for type ${chosenType}`);
      return;
    }
    if (chosenType === 'veth') {
      applyExtendedVeth(newLink, data, extra, doc);
    } else {
      applyExtendedSingleEndpoint(newLink, data, extra, chosenType, payloadKey, doc);
    }
    setOrDelete(doc, newLink, 'mtu', extra.extMtu !== '' ? extra.extMtu : undefined);
    setOrDelete(doc, newLink, 'vars', extra.extVars);
    setOrDelete(doc, newLink, 'labels', extra.extLabels);
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
    updateExistingLink(existing, data, extra, chosenType, payloadKey, payloadKeyStr, doc);
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
