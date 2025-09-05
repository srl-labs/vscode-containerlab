import * as fs from 'fs';
import * as vscode from 'vscode';
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

function canonicalFromYamlLink(linkItem: YAML.YAMLMap): CanonicalLinkKey | null {
  // Extended format if 'type' exists
  const typeNode = linkItem.get('type', true) as any;
  const typeStr = typeof typeNode?.value === 'string' ? (typeNode.value as string) : (typeof typeNode === 'string' ? typeNode : undefined);

  if (typeStr) {
    const t = typeStr as CanonicalLinkKey['type'];
    if (t === 'veth') {
      const eps = linkItem.get('endpoints', true);
      if (YAML.isSeq(eps) && eps.items.length >= 2) {
        const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
        const b = splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any));
        return { type: 'veth', a, b };
      }
    }

    // Single-endpoint types
    if (['mgmt-net', 'host', 'macvlan', 'dummy', 'vxlan', 'vxlan-stitch'].includes(t)) {
      const ep = linkItem.get('endpoint', true);
      if (ep) {
        const a = splitEndpointLike((ep as any)?.toJSON?.() ?? ep);
        return { type: t as any, a };
      }
      // Some files may still keep endpoints list with one side special; try to derive
      const eps = linkItem.get('endpoints', true);
      if (YAML.isSeq(eps) && eps.items.length >= 1) {
        const a = splitEndpointLike((eps.items[0] as any)?.toJSON?.() ?? (eps.items[0] as any));
        const bMaybe = eps.items.length > 1 ? splitEndpointLike((eps.items[1] as any)?.toJSON?.() ?? (eps.items[1] as any)) : undefined;
        // Pick non-special as canonical 'a' when available
        const aIsSpecial = isSpecialEndpoint(`${a.node}:${a.iface}`) || a.node.startsWith('macvlan:') || a.node.startsWith('vxlan:') || a.node.startsWith('vxlan-stitch:');
        if (bMaybe) {
          const bIsSpecial = isSpecialEndpoint(`${bMaybe.node}:${bMaybe.iface}`) || bMaybe.node.startsWith('macvlan:') || bMaybe.node.startsWith('vxlan:') || bMaybe.node.startsWith('vxlan-stitch:');
          return { type: t as any, a: aIsSpecial && !bIsSpecial ? bMaybe : a };
        }
        return { type: t as any, a };
      }
    }
  }

  // Short format assumed
  const eps = linkItem.get('endpoints', true);
  if (YAML.isSeq(eps) && eps.items.length >= 2) {
    const epA = String((eps.items[0] as any).value ?? eps.items[0]);
    const epB = String((eps.items[1] as any).value ?? eps.items[1]);
    const a = splitEndpointLike(epA);
    const b = splitEndpointLike(epB);
    const aIsSpecial = isSpecialEndpoint(epA) || a.node.startsWith('macvlan:') || a.node.startsWith('vxlan:') || a.node.startsWith('vxlan-stitch:');
    const bIsSpecial = isSpecialEndpoint(epB) || b.node.startsWith('macvlan:') || b.node.startsWith('vxlan:') || b.node.startsWith('vxlan-stitch:');

    // If exactly one side special, derive single-endpoint type and pick non-special as 'a'
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

    // Otherwise treat as veth and sort endpoints
    return { type: 'veth', a, b };
  }
  return null;
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

  // CRITICAL: In view mode, we ONLY save annotations, NEVER modify YAML
  if (mode === 'view') {
    log.info('View mode detected - will only save annotations, not modifying YAML');

    // Load and save annotations only
    const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
    // Preserve previously saved node positions so Geo layout doesn't overwrite XY
    const prevNodeById = new Map<string, NodeAnnotation>();
    for (const na of annotations.nodeAnnotations || []) {
      if (na && typeof na.id === 'string') prevNodeById.set(na.id, na);
    }
    annotations.nodeAnnotations = [];
    annotations.cloudNodeAnnotations = [];

    // Process regular nodes for annotations
    const regularNodes = payloadParsed.filter(
      el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' &&
      el.data.topoViewerRole !== 'cloud' && el.data.topoViewerRole !== 'freeText' &&
      !isSpecialEndpoint(el.data.id)
    );

    for (const node of regularNodes) {
      const nodeIdForAnn = node.data.name || node.data.id; // name reflects rename better
      const isGeoActive = !!(node?.data?.geoLayoutActive);
      const nodeAnnotation: NodeAnnotation = {
        id: nodeIdForAnn,
        icon: node.data.topoViewerRole,
      };
      if (isGeoActive) {
        // Do not write XY when Geo layout is active; preserve prior position if available
        const prev = prevNodeById.get(nodeIdForAnn);
        if (prev?.position) {
          nodeAnnotation.position = { x: prev.position.x, y: prev.position.y };
        }
      } else {
        nodeAnnotation.position = {
          x: Math.round(node.position?.x || 0),
          y: Math.round(node.position?.y || 0)
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

    // Process cloud nodes for annotations
    const cloudNodes = payloadParsed.filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud');
    for (const cloudNode of cloudNodes) {
      const cloudNodeAnnotation: CloudNodeAnnotation = {
        id: cloudNode.data.id,
        type: cloudNode.data.extraData?.kind || 'host',
        label: cloudNode.data.name || cloudNode.data.id,
        position: {
          x: cloudNode.position?.x || 0,
          y: cloudNode.position?.y || 0
        }
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
    log.info('View mode: Saved annotations only - YAML file not touched');
    return; // EXIT EARLY - NO YAML PROCESSING IN VIEW MODE
  }

  // EDIT MODE ONLY from here on
  let doc: YAML.Document.Parsed | undefined;
  if (mode === 'edit') {
    doc = adaptor?.currentClabDoc;
    if (!doc) {
      throw new Error('No parsed Document found (adaptor.currentClabDoc is undefined).');
    }
  } else {
    // This should never happen due to early return above, but keeping as safety
    throw new Error('Invalid mode - should be edit or view');
  }

  const updatedKeys = new Map<string, string>();

  const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
  if (!YAML.isMap(nodesMaybe)) {
    throw new Error('YAML topology nodes is not a map');
  }
  const yamlNodes: YAML.YAMLMap = nodesMaybe;
  // Ensure block style for the nodes mapping (avoid inline `{}` flow style)
  yamlNodes.flow = false;

  const topoObj = mode === 'edit' ? (doc.toJS() as ClabTopology) : undefined;

  payloadParsed
    .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id))
    .forEach(element => {
      const nodeId: string = element.data.id;
      let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;

      if (mode === 'edit') {
        if (!nodeYaml) {
          nodeYaml = new YAML.YAMLMap();
          // Ensure new node maps are block style
          nodeYaml.flow = false;
          yamlNodes.set(nodeId, nodeYaml);
        }
        const nodeMap = nodeYaml;
        const extraData = element.data.extraData || {};

        // For existing nodes, get the original group to determine inheritance
        const originalGroup = (nodeMap.get('group', true) as any)?.value;

        // Only update group if it was changed (extraData.group differs from original)
        const groupName = extraData.group !== undefined && extraData.group !== originalGroup
          ? extraData.group
          : originalGroup;

        // Calculate what would be inherited for this node (with its kind and group)
        const inherit = resolveNodeConfig(topoObj!, {
          kind: extraData.kind || undefined,
          group: groupName
        });

        // Write all properties that exist in extraData
        // Don't remove properties here - let the auto-compact logic handle deduplication
        const desiredKind = extraData.kind; // Always keep the kind - it's essential!
        const desiredImage = extraData.image;
        const desiredType = extraData.type;

        if (groupName) {
          nodeMap.set('group', doc.createNode(groupName));
        } else {
          nodeMap.delete('group');
        }

        if (desiredKind) {
          nodeMap.set('kind', doc.createNode(desiredKind));
        }
        // Never delete the kind property - it's required for inheritance to work!

        if (desiredImage) {
          nodeMap.set('image', doc.createNode(desiredImage));
        } else {
          nodeMap.delete('image');
        }

        const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
        if (nokiaKinds.includes(extraData.kind || inherit.kind) && desiredType) {
          nodeMap.set('type', doc.createNode(desiredType));
        } else {
          nodeMap.delete('type');
        }

        // Handle all additional properties from enhanced editor
        // Configuration properties
        if (extraData['startup-config']) {
          nodeMap.set('startup-config', doc.createNode(extraData['startup-config']));
        } else if (nodeMap.has('startup-config')) {
          nodeMap.delete('startup-config');
        }

        if (extraData['enforce-startup-config']) {
          nodeMap.set('enforce-startup-config', doc.createNode(true));
        } else if (nodeMap.has('enforce-startup-config')) {
          nodeMap.delete('enforce-startup-config');
        }

        if (extraData['suppress-startup-config']) {
          nodeMap.set('suppress-startup-config', doc.createNode(true));
        } else if (nodeMap.has('suppress-startup-config')) {
          nodeMap.delete('suppress-startup-config');
        }

        if (extraData.license) {
          nodeMap.set('license', doc.createNode(extraData.license));
        } else if (nodeMap.has('license')) {
          nodeMap.delete('license');
        }

        if (extraData.binds && Array.isArray(extraData.binds) && extraData.binds.length > 0) {
          nodeMap.set('binds', doc.createNode(extraData.binds));
        } else if (nodeMap.has('binds')) {
          nodeMap.delete('binds');
        }

        if (extraData.env && typeof extraData.env === 'object' && Object.keys(extraData.env).length > 0) {
          nodeMap.set('env', doc.createNode(extraData.env));
        } else if (nodeMap.has('env')) {
          nodeMap.delete('env');
        }

        if (extraData['env-files'] && Array.isArray(extraData['env-files']) && extraData['env-files'].length > 0) {
          nodeMap.set('env-files', doc.createNode(extraData['env-files']));
        } else if (nodeMap.has('env-files')) {
          nodeMap.delete('env-files');
        }

        if (extraData.labels && typeof extraData.labels === 'object' && Object.keys(extraData.labels).length > 0) {
          nodeMap.set('labels', doc.createNode(extraData.labels));
        } else if (nodeMap.has('labels')) {
          nodeMap.delete('labels');
        }

        // Runtime properties
        if (extraData.user) {
          nodeMap.set('user', doc.createNode(extraData.user));
        } else if (nodeMap.has('user')) {
          nodeMap.delete('user');
        }

        if (extraData.entrypoint) {
          nodeMap.set('entrypoint', doc.createNode(extraData.entrypoint));
        } else if (nodeMap.has('entrypoint')) {
          nodeMap.delete('entrypoint');
        }

        if (extraData.cmd) {
          nodeMap.set('cmd', doc.createNode(extraData.cmd));
        } else if (nodeMap.has('cmd')) {
          nodeMap.delete('cmd');
        }

        if (extraData.exec && Array.isArray(extraData.exec) && extraData.exec.length > 0) {
          nodeMap.set('exec', doc.createNode(extraData.exec));
        } else if (nodeMap.has('exec')) {
          nodeMap.delete('exec');
        }

        if (extraData['restart-policy']) {
          nodeMap.set('restart-policy', doc.createNode(extraData['restart-policy']));
        } else if (nodeMap.has('restart-policy')) {
          nodeMap.delete('restart-policy');
        }

        if (extraData['auto-remove']) {
          nodeMap.set('auto-remove', doc.createNode(true));
        } else if (nodeMap.has('auto-remove')) {
          nodeMap.delete('auto-remove');
        }

        if (extraData['startup-delay']) {
          nodeMap.set('startup-delay', doc.createNode(extraData['startup-delay']));
        } else if (nodeMap.has('startup-delay')) {
          nodeMap.delete('startup-delay');
        }

        // Network properties
        if (extraData['mgmt-ipv4']) {
          nodeMap.set('mgmt-ipv4', doc.createNode(extraData['mgmt-ipv4']));
        } else if (nodeMap.has('mgmt-ipv4')) {
          nodeMap.delete('mgmt-ipv4');
        }

        if (extraData['mgmt-ipv6']) {
          nodeMap.set('mgmt-ipv6', doc.createNode(extraData['mgmt-ipv6']));
        } else if (nodeMap.has('mgmt-ipv6')) {
          nodeMap.delete('mgmt-ipv6');
        }

        if (extraData['network-mode']) {
          nodeMap.set('network-mode', doc.createNode(extraData['network-mode']));
        } else if (nodeMap.has('network-mode')) {
          nodeMap.delete('network-mode');
        }

        if (extraData.ports && Array.isArray(extraData.ports) && extraData.ports.length > 0) {
          nodeMap.set('ports', doc.createNode(extraData.ports));
        } else if (nodeMap.has('ports')) {
          nodeMap.delete('ports');
        }

        if (extraData.dns && typeof extraData.dns === 'object') {
          const dnsNode = new YAML.YAMLMap();
          if (extraData.dns.servers && Array.isArray(extraData.dns.servers)) {
            dnsNode.set('servers', doc.createNode(extraData.dns.servers));
          }
          if (extraData.dns.search && Array.isArray(extraData.dns.search)) {
            dnsNode.set('search', doc.createNode(extraData.dns.search));
          }
          if (extraData.dns.options && Array.isArray(extraData.dns.options)) {
            dnsNode.set('options', doc.createNode(extraData.dns.options));
          }
          if (dnsNode.items.length > 0) {
            nodeMap.set('dns', dnsNode);
          } else if (nodeMap.has('dns')) {
            nodeMap.delete('dns');
          }
        } else if (nodeMap.has('dns')) {
          nodeMap.delete('dns');
        }

        if (extraData.aliases && Array.isArray(extraData.aliases) && extraData.aliases.length > 0) {
          nodeMap.set('aliases', doc.createNode(extraData.aliases));
        } else if (nodeMap.has('aliases')) {
          nodeMap.delete('aliases');
        }

        // Advanced properties
        if (extraData.memory) {
          nodeMap.set('memory', doc.createNode(extraData.memory));
        } else if (nodeMap.has('memory')) {
          nodeMap.delete('memory');
        }

        if (extraData.cpu) {
          nodeMap.set('cpu', doc.createNode(extraData.cpu));
        } else if (nodeMap.has('cpu')) {
          nodeMap.delete('cpu');
        }

        if (extraData['cpu-set']) {
          nodeMap.set('cpu-set', doc.createNode(extraData['cpu-set']));
        } else if (nodeMap.has('cpu-set')) {
          nodeMap.delete('cpu-set');
        }

        if (extraData['shm-size']) {
          nodeMap.set('shm-size', doc.createNode(extraData['shm-size']));
        } else if (nodeMap.has('shm-size')) {
          nodeMap.delete('shm-size');
        }

        if (extraData['cap-add'] && Array.isArray(extraData['cap-add']) && extraData['cap-add'].length > 0) {
          nodeMap.set('cap-add', doc.createNode(extraData['cap-add']));
        } else if (nodeMap.has('cap-add')) {
          nodeMap.delete('cap-add');
        }

        if (extraData.sysctls && typeof extraData.sysctls === 'object' && Object.keys(extraData.sysctls).length > 0) {
          nodeMap.set('sysctls', doc.createNode(extraData.sysctls));
        } else if (nodeMap.has('sysctls')) {
          nodeMap.delete('sysctls');
        }

        if (extraData.devices && Array.isArray(extraData.devices) && extraData.devices.length > 0) {
          nodeMap.set('devices', doc.createNode(extraData.devices));
        } else if (nodeMap.has('devices')) {
          nodeMap.delete('devices');
        }

        // Certificate configuration
        if (extraData.certificate && typeof extraData.certificate === 'object') {
          const certNode = new YAML.YAMLMap();
          if (extraData.certificate.issue) {
            certNode.set('issue', doc.createNode(true));
          }
          if (extraData.certificate['key-size']) {
            certNode.set('key-size', doc.createNode(extraData.certificate['key-size']));
          }
          if (extraData.certificate['validity-duration']) {
            certNode.set('validity-duration', doc.createNode(extraData.certificate['validity-duration']));
          }
          if (extraData.certificate.sans && Array.isArray(extraData.certificate.sans)) {
            certNode.set('sans', doc.createNode(extraData.certificate.sans));
          }
          if (certNode.items.length > 0) {
            nodeMap.set('certificate', certNode);
          } else if (nodeMap.has('certificate')) {
            nodeMap.delete('certificate');
          }
        } else if (nodeMap.has('certificate')) {
          nodeMap.delete('certificate');
        }

        // Healthcheck configuration
        if (extraData.healthcheck && typeof extraData.healthcheck === 'object') {
          const hcNode = new YAML.YAMLMap();
          if (extraData.healthcheck.test && Array.isArray(extraData.healthcheck.test)) {
            hcNode.set('test', doc.createNode(extraData.healthcheck.test));
          }
          if (extraData.healthcheck['start-period']) {
            hcNode.set('start-period', doc.createNode(extraData.healthcheck['start-period']));
          }
          if (extraData.healthcheck.interval) {
            hcNode.set('interval', doc.createNode(extraData.healthcheck.interval));
          }
          if (extraData.healthcheck.timeout) {
            hcNode.set('timeout', doc.createNode(extraData.healthcheck.timeout));
          }
          if (extraData.healthcheck.retries) {
            hcNode.set('retries', doc.createNode(extraData.healthcheck.retries));
          }
          if (hcNode.items.length > 0) {
            nodeMap.set('healthcheck', hcNode);
          } else if (nodeMap.has('healthcheck')) {
            nodeMap.delete('healthcheck');
          }
        } else if (nodeMap.has('healthcheck')) {
          nodeMap.delete('healthcheck');
        }

        if (extraData['image-pull-policy']) {
          nodeMap.set('image-pull-policy', doc.createNode(extraData['image-pull-policy']));
        } else if (nodeMap.has('image-pull-policy')) {
          nodeMap.delete('image-pull-policy');
        }

        if (extraData.runtime) {
          nodeMap.set('runtime', doc.createNode(extraData.runtime));
        } else if (nodeMap.has('runtime')) {
          nodeMap.delete('runtime');
        }

        // Stages (dependencies)
        if (extraData.stages && typeof extraData.stages === 'object' && Object.keys(extraData.stages).length > 0) {
          const stagesNode = new YAML.YAMLMap();
          for (const [stageName, stageConfig] of Object.entries(extraData.stages)) {
            const stageNode = new YAML.YAMLMap();
            const config = stageConfig as any;

            if (config['wait-for'] && Array.isArray(config['wait-for'])) {
              stageNode.set('wait-for', doc.createNode(config['wait-for']));
            }
            if (config.exec && Array.isArray(config.exec)) {
              stageNode.set('exec', doc.createNode(config.exec));
            }

            if (stageNode.items.length > 0) {
              stagesNode.set(stageName, stageNode);
            }
          }
          if (stagesNode.items.length > 0) {
            nodeMap.set('stages', stagesNode);
          } else if (nodeMap.has('stages')) {
            nodeMap.delete('stages');
          }
        } else if (nodeMap.has('stages')) {
          nodeMap.delete('stages');
        }

        const newKey = element.data.name;
        if (nodeId !== newKey) {
          yamlNodes.set(newKey, nodeMap);
          yamlNodes.delete(nodeId);
          updatedKeys.set(nodeId, newKey);
        }
      } else {
        if (!nodeYaml) {
          log.warn(`Node ${nodeId} not found in YAML, skipping`);
          return;
        }
      }
    });

  if (mode === 'edit') {
    const payloadNodeIds = new Set(
      payloadParsed.filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id)).map(el => el.data.id)
    );
    for (const item of [...yamlNodes.items]) {
      const keyStr = String(item.key);
      if (!payloadNodeIds.has(keyStr) && ![...updatedKeys.values()].includes(keyStr)) {
        yamlNodes.delete(item.key);
      }
    }

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
    // Ensure links list renders with indented hyphens (block style)
    linksNode.flow = false;

    // Editor no longer relies on a global linkFormat setting; format is inferred per link

    function buildEndpointMap(ep: CanonicalEndpoint): YAML.YAMLMap {
      const m = new YAML.YAMLMap();
      (m as any).flow = false;
      m.set('node', doc!.createNode(ep.node));
      if (ep.iface) m.set('interface', doc!.createNode(ep.iface));
      return m;
    }

    payloadParsed.filter(el => el.group === 'edges').forEach(element => {
      const data = element.data;
      const payloadKey = canonicalFromPayloadEdge(data);
      if (!payloadKey) return;
      const payloadKeyStr = canonicalKeyToString(payloadKey);
      let linkFound = false;

      // Step 7: determine chosen type with UI override and prepare helpers
      const extra = (data.extraData || {}) as any;
      const validTypes = new Set(['veth','mgmt-net','host','macvlan','vxlan','vxlan-stitch','dummy']);
      const chosenType: CanonicalLinkKey['type'] = (extra.extType && validTypes.has(extra.extType))
        ? (extra.extType as any)
        : (payloadKey.type === 'unknown' ? 'veth' : payloadKey.type);

      const setOrDelete = (map: YAML.YAMLMap, key: string, value: any) => {
        if (value === undefined || value === '' || (typeof value === 'object' && value != null && Object.keys(value).length === 0)) {
          if ((map as any).has && (map as any).has(key, true)) (map as any).delete(key);
          return;
        }
        map.set(key, doc!.createNode(value));
      };
      for (const linkItem of linksNode.items) {
        if (YAML.isMap(linkItem)) {
          (linkItem as YAML.YAMLMap).flow = false;
          const yamlKey = canonicalFromYamlLink(linkItem as YAML.YAMLMap);
          if (yamlKey && canonicalKeyToString(yamlKey) === payloadKeyStr) {
            linkFound = true;
            // Check if we need to convert from brief to extended format
            const hasExtendedProperties =
              (extra.extMtu !== undefined && extra.extMtu !== null && extra.extMtu !== '') ||
              (extra.extSourceMac !== undefined && extra.extSourceMac !== null && extra.extSourceMac !== '') ||
              (extra.extTargetMac !== undefined && extra.extTargetMac !== null && extra.extTargetMac !== '') ||
              (extra.extMac !== undefined && extra.extMac !== null && extra.extMac !== '') ||
              (extra.extHostInterface !== undefined && extra.extHostInterface !== null && extra.extHostInterface !== '') ||
              (extra.extRemote !== undefined && extra.extRemote !== null && extra.extRemote !== '') ||
              (extra.extVni !== undefined && extra.extVni !== null && extra.extVni !== '') ||
              (extra.extUdpPort !== undefined && extra.extUdpPort !== null && extra.extUdpPort !== '') ||
              (extra.extMode !== undefined && extra.extMode !== null && extra.extMode !== '') ||
              (extra.extVars && typeof extra.extVars === 'object' && Object.keys(extra.extVars).length > 0) ||
              (extra.extLabels && typeof extra.extLabels === 'object' && Object.keys(extra.extLabels).length > 0);

            {
              const map = linkItem as YAML.YAMLMap;
              // Determine if we should use brief or extended format
              // Use brief format when no extended properties are set
              // EXCEPTION: dummy links MUST always use extended format with single endpoint
              const shouldUseBriefFormat = !hasExtendedProperties && chosenType !== 'dummy';

              if (shouldUseBriefFormat) {
                // Convert to brief format
                // Remove type field to make it brief format
                if ((map as any).has && (map as any).has('type', true)) (map as any).delete('type');
                const srcStr = data.sourceEndpoint ? `${data.source}:${data.sourceEndpoint}` : data.source;
                const dstStr = data.targetEndpoint ? `${data.target}:${data.targetEndpoint}` : data.target;
                const endpointsNode = doc!.createNode([srcStr, dstStr]) as YAML.YAMLSeq;
                endpointsNode.flow = true; // inline style for brief format
                map.set('endpoints', endpointsNode);
                // Remove all extended format fields
                if ((map as any).has && (map as any).has('endpoint', true)) (map as any).delete('endpoint');
                ['host-interface', 'mode', 'remote', 'vni', 'udp-port', 'mtu', 'vars', 'labels'].forEach(k => {
                  if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k);
                });
              } else {
                // Use extended format
                // Apply type
                map.set('type', doc!.createNode(chosenType));

                // Guardrails: required fields per type
                const requiresHost = (chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan');
                const requiresVx = (chosenType === 'vxlan' || chosenType === 'vxlan-stitch');
                if ((requiresHost && !extra.extHostInterface) ||
                    (requiresVx && (!extra.extRemote || extra.extVni === undefined || extra.extUdpPort === undefined))) {
                  log.warn(`Skipping write for link ${payloadKeyStr} due to missing required fields for type ${chosenType}`);
                  break;
                }

                if (chosenType === 'veth') {
                  // endpoints: two maps with optional MACs
                  const srcEp: CanonicalEndpoint = { node: data.source, iface: data.sourceEndpoint || '' };
                  const dstEp: CanonicalEndpoint = { node: data.target, iface: data.targetEndpoint || '' };
                  const endpointsNode = new YAML.YAMLSeq();
                  endpointsNode.flow = false;
                  const epA = buildEndpointMap(srcEp);
                  const epB = buildEndpointMap(dstEp);
                  if (extra.extSourceMac) epA.set('mac', doc!.createNode(extra.extSourceMac)); else if ((epA as any).has && (epA as any).has('mac', true)) (epA as any).delete('mac');
                  if (extra.extTargetMac) epB.set('mac', doc!.createNode(extra.extTargetMac)); else if ((epB as any).has && (epB as any).has('mac', true)) (epB as any).delete('mac');
                  endpointsNode.add(epA);
                  endpointsNode.add(epB);
                  map.set('endpoints', endpointsNode);
                  if ((map as any).has && (map as any).has('endpoint', true)) (map as any).delete('endpoint');
                  // Clean per-type fields not relevant to veth
                  ['host-interface','mode','remote','vni','udp-port'].forEach(k => { if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k); });
                } else {
                  // Single-endpoint shape
                  const single = payloadKey.a;
                  const epMap = buildEndpointMap(single);
                  const containerIsSource = (single.node === data.source && (single.iface || '') === (data.sourceEndpoint || ''));
                  const selectedMac = containerIsSource ? extra.extSourceMac : extra.extTargetMac;
                  const endpointMac = (extra.extMac !== undefined && extra.extMac !== '') ? extra.extMac : selectedMac;
                  if (endpointMac) epMap.set('mac', doc!.createNode(endpointMac)); else if ((epMap as any).has && (epMap as any).has('mac', true)) (epMap as any).delete('mac');
                  map.set('endpoint', epMap);
                  if ((map as any).has && (map as any).has('endpoints', true)) (map as any).delete('endpoints');

                  // Per-type optionals
                  if (chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan') {
                    setOrDelete(map, 'host-interface', extra.extHostInterface);
                  } else {
                    if ((map as any).has && (map as any).has('host-interface', true)) (map as any).delete('host-interface');
                  }
                  if (chosenType === 'macvlan') {
                    setOrDelete(map, 'mode', extra.extMode);
                  } else {
                    if ((map as any).has && (map as any).has('mode', true)) (map as any).delete('mode');
                  }
                  if (chosenType === 'vxlan' || chosenType === 'vxlan-stitch') {
                    setOrDelete(map, 'remote', extra.extRemote);
                    setOrDelete(map, 'vni', (extra.extVni !== '' ? extra.extVni : undefined));
                    setOrDelete(map, 'udp-port', (extra.extUdpPort !== '' ? extra.extUdpPort : undefined));
                  } else {
                    ['remote','vni','udp-port'].forEach(k => { if ((map as any).has && (map as any).has(k, true)) (map as any).delete(k); });
                  }
                }

                // Common
                setOrDelete(map, 'mtu', (extra.extMtu !== '' ? extra.extMtu : undefined));
                setOrDelete(map, 'vars', extra.extVars);
                setOrDelete(map, 'labels', extra.extLabels);
              }
            }
            break;
          }
        }
      }
      if (!linkFound) {
        const newLink = new YAML.YAMLMap();
        newLink.flow = false;

        // Create new entry: choose format based on provided extended fields/type or inferred single-endpoint type
        // Use extended format if:
        // 1. An explicit type is set via extType, OR
        // 2. The inferred type is not 'veth' (single-endpoint types), OR
        // 3. Any extended properties are configured (mtu, mac addresses, vars, labels, etc.)
        const hasExtendedProperties =
          (extra.extMtu !== undefined && extra.extMtu !== null && extra.extMtu !== '') ||
          (extra.extSourceMac !== undefined && extra.extSourceMac !== null && extra.extSourceMac !== '') ||
          (extra.extTargetMac !== undefined && extra.extTargetMac !== null && extra.extTargetMac !== '') ||
          (extra.extMac !== undefined && extra.extMac !== null && extra.extMac !== '') ||
          (extra.extHostInterface !== undefined && extra.extHostInterface !== null && extra.extHostInterface !== '') ||
          (extra.extRemote !== undefined && extra.extRemote !== null && extra.extRemote !== '') ||
          (extra.extVni !== undefined && extra.extVni !== null && extra.extVni !== '') ||
          (extra.extUdpPort !== undefined && extra.extUdpPort !== null && extra.extUdpPort !== '') ||
          (extra.extMode !== undefined && extra.extMode !== null && extra.extMode !== '') ||
          (extra.extVars && typeof extra.extVars === 'object' && Object.keys(extra.extVars).length > 0) ||
          (extra.extLabels && typeof extra.extLabels === 'object' && Object.keys(extra.extLabels).length > 0);

        // Only use extended format if there are actual extended properties
        // EXCEPTION: dummy links MUST always use extended format with single endpoint
        const wantsExtended = hasExtendedProperties || chosenType === 'dummy';
        if (wantsExtended) {
          // Determine type and write extended structure with per-type fields (Step 7)
          newLink.set('type', doc!.createNode(chosenType));
          // Guardrails: skip creating invalid extended links
          // Only check for required fields when using extended format with extended properties
          const requiresHost = (chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan');
          const requiresVx = (chosenType === 'vxlan' || chosenType === 'vxlan-stitch');
          // For host/mgmt-net/macvlan, host-interface is only required if not already in the endpoint
          const needsHostInterface = requiresHost && !data.source.includes(':') && !data.target.includes(':');
          if ((needsHostInterface && !extra.extHostInterface) ||
              (requiresVx && (!extra.extRemote || extra.extVni === undefined || extra.extUdpPort === undefined))) {
            log.warn(`Skipping creation for link ${payloadKeyStr} due to missing required fields for type ${chosenType}`);
            return; // do not add newLink
          }
          if (chosenType === 'veth') {
            const srcEp: CanonicalEndpoint = { node: data.source, iface: data.sourceEndpoint || '' };
            const dstEp: CanonicalEndpoint = { node: data.target, iface: data.targetEndpoint || '' };
            const endpointsNode = new YAML.YAMLSeq();
            endpointsNode.flow = false; // maps inside seq -> block style
            const epA = buildEndpointMap(srcEp);
            const epB = buildEndpointMap(dstEp);
            if (extra.extSourceMac) epA.set('mac', doc!.createNode(extra.extSourceMac));
            if (extra.extTargetMac) epB.set('mac', doc!.createNode(extra.extTargetMac));
            endpointsNode.add(epA);
            endpointsNode.add(epB);
            newLink.set('endpoints', endpointsNode);
          } else {
            // Single-endpoint types
            const single = payloadKey.a; // canonical non-special
            const epMap = buildEndpointMap(single);
            // MAC for container side
            const containerIsSource = (single.node === data.source && (single.iface || '') === (data.sourceEndpoint || ''));
            const selectedMac = containerIsSource ? extra.extSourceMac : extra.extTargetMac;
            const endpointMac = (extra.extMac !== undefined && extra.extMac !== '') ? extra.extMac : selectedMac;
            if (endpointMac) epMap.set('mac', doc!.createNode(endpointMac));
            newLink.set('endpoint', epMap);

            // Per-type fields
            if (chosenType === 'mgmt-net' || chosenType === 'host' || chosenType === 'macvlan') {
              const hostIface = extra.extHostInterface || ((): string | undefined => {
                // Derive from special side id if available (e.g., host:ethX)
                const specialSide = data.source === `${single.node}:${single.iface}` ? data.target : data.source;
                const specialStr = String(specialSide);
                if (specialStr.includes(':')) return specialStr.split(':')[1];
                return undefined;
              })();
              setOrDelete(newLink, 'host-interface', hostIface);
            }
            if (chosenType === 'macvlan') {
              setOrDelete(newLink, 'mode', extra.extMode);
            }
            if (chosenType === 'vxlan' || chosenType === 'vxlan-stitch') {
              setOrDelete(newLink, 'remote', extra.extRemote);
              setOrDelete(newLink, 'vni', (extra.extVni !== '' ? extra.extVni : undefined));
              setOrDelete(newLink, 'udp-port', (extra.extUdpPort !== '' ? extra.extUdpPort : undefined));
            }
          }
          // Common optionals
          setOrDelete(newLink, 'mtu', (extra.extMtu !== '' ? extra.extMtu : undefined));
          setOrDelete(newLink, 'vars', extra.extVars);
          setOrDelete(newLink, 'labels', extra.extLabels);

        } else {
          // Short format
          const srcStr = data.sourceEndpoint ? `${data.source}:${data.sourceEndpoint}` : data.source;
          const dstStr = data.targetEndpoint ? `${data.target}:${data.targetEndpoint}` : data.target;
          const endpointsNode = doc!.createNode([srcStr, dstStr]) as YAML.YAMLSeq;
          endpointsNode.flow = true; // inline style for short format
          newLink.set('endpoints', endpointsNode);
        }
        linksNode.add(newLink);
      }
    });

    const payloadEdgeKeys = new Set<string>(
      payloadParsed
        .filter(el => el.group === 'edges')
        .map(el => canonicalFromPayloadEdge(el.data))
        .filter((k): k is CanonicalLinkKey => Boolean(k))
        .map(k => canonicalKeyToString(k))
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
      if (YAML.isMap(linkItem)) {
        // Normalize to block style for link entries
        (linkItem as YAML.YAMLMap).flow = false;
        const endpointsNode = linkItem.get('endpoints', true);
        if (YAML.isSeq(endpointsNode)) {
          // Handle both short (scalars) and extended (maps) endpoint entries
          endpointsNode.items = endpointsNode.items.map(item => {
            if (YAML.isMap(item)) {
              const n = (item as YAML.YAMLMap).get('node', true) as any;
              const nodeVal = String(n?.value ?? n ?? '');
              const updated = updatedKeys.get(nodeVal);
              if (updated) {
                (item as YAML.YAMLMap).set('node', doc!.createNode(updated));
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
            return doc!.createNode(endpointStr);
          });
          // For short format preserve inline []
          if (endpointsNode.items.every(it => !YAML.isMap(it))) {
            endpointsNode.flow = true;
          } else {
            endpointsNode.flow = false;
          }
        }
        const endpointSingle = linkItem.get('endpoint', true);
        if (YAML.isMap(endpointSingle)) {
          const n = endpointSingle.get('node', true) as any;
          const nodeVal = String(n?.value ?? n ?? '');
          const updated = updatedKeys.get(nodeVal);
          if (updated) {
            endpointSingle.set('node', doc!.createNode(updated));
          }
        }
      }
    }
  }

  // Save annotations for edit mode
  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
  // Preserve previously saved node positions so Geo layout doesn't overwrite XY
  const prevNodeById = new Map<string, NodeAnnotation>();
  for (const na of annotations.nodeAnnotations || []) {
    if (na && typeof na.id === 'string') prevNodeById.set(na.id, na);
  }
  annotations.nodeAnnotations = [];
  annotations.cloudNodeAnnotations = [];

  const regularNodes = payloadParsed.filter(
    el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' && el.data.topoViewerRole !== 'cloud' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id)
  );
  for (const node of regularNodes) {
    const nodeIdForAnn = node.data.name || node.data.id; // name reflects rename better
    const isGeoActive = !!(node?.data?.geoLayoutActive);
    const nodeAnnotation: NodeAnnotation = {
      id: nodeIdForAnn,
      icon: node.data.topoViewerRole,
    };
    if (isGeoActive) {
      // Do not write XY when Geo layout is active; preserve prior position if available
      const prev = prevNodeById.get(nodeIdForAnn);
      if (prev?.position) {
        nodeAnnotation.position = { x: prev.position.x, y: prev.position.y };
      }
    } else {
      nodeAnnotation.position = {
        x: Math.round(node.position?.x || 0),
        y: Math.round(node.position?.y || 0)
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
    // Add group and level if node has a parent
    if (node.parent) {
      const parts = node.parent.split(':');
      if (parts.length === 2) {
        nodeAnnotation.group = parts[0];
        nodeAnnotation.level = parts[1];
      }
    }
    annotations.nodeAnnotations!.push(nodeAnnotation);
  }

  const cloudNodes = payloadParsed.filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud');
  for (const cloudNode of cloudNodes) {
    const cloudNodeAnnotation: CloudNodeAnnotation = {
      id: cloudNode.data.id,
      type: cloudNode.data.extraData?.kind || 'host',
      label: cloudNode.data.name || cloudNode.data.id,
      position: {
        x: cloudNode.position?.x || 0,
        y: cloudNode.position?.y || 0
      }
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

  // Only proceed with YAML writing if we're in edit mode
  // NEVER write YAML in view mode - this is already handled above with early return
  if (mode === 'edit') {
    // Auto-compact kinds logic
    const autoCompact = vscode.workspace.getConfiguration('containerlab').get('editor.autoCompactKinds', true);

    if (autoCompact) {
      // Group nodes by kind
      const nodesByKind = new Map<string, { nodes: Array<{ name: string; map: YAML.YAMLMap }> }>();

      // Get the nodes from the document
      const topologyNode = doc.getIn(['topology'], true);
      const nodesNode = doc.getIn(['topology', 'nodes'], true);

      if (YAML.isMap(nodesNode) && YAML.isMap(topologyNode)) {
        // Group all nodes by their kind
        for (const item of nodesNode.items) {
          const nodeName = String(item.key);
          const nodeMap = item.value as YAML.YAMLMap;

          if (YAML.isMap(nodeMap)) {
            const kind = (nodeMap.get('kind', true) as any)?.value || (nodeMap.get('kind') as any);

            if (kind) {
              if (!nodesByKind.has(kind)) {
                nodesByKind.set(kind, { nodes: [] });
              }
              nodesByKind.get(kind)!.nodes.push({ name: nodeName, map: nodeMap });

              // Log what properties this node has
              const nodeProps: string[] = [];
              for (const prop of nodeMap.items) {
                nodeProps.push(`${prop.key}=${(prop.value as any)?.value || prop.value}`);
              }
              log.info(`AUTO-COMPACT: Node '${nodeName}' of kind '${kind}' has properties: ${nodeProps.join(', ')}`);
            }
          }
        }

        // Properties that can be shared in kinds section
        const sharableProps = [
          'type', 'image', 'startup-config', 'enforce-startup-config', 'suppress-startup-config',
          'license', 'binds', 'env', 'labels', 'user', 'entrypoint', 'cmd', 'exec',
          'restart-policy', 'auto-remove', 'startup-delay', 'mgmt-ipv4', 'mgmt-ipv6',
          'network-mode', 'ports', 'dns', 'sysctls', 'cap-add', 'cap-drop',
          'devices', 'cpu', 'cpu-set', 'memory', 'shm-size', 'runtime'
        ];

        // Helper function to deep compare two values
        const deepEqual = (a: any, b: any): boolean => {
          if (a === b) return true;
          if (a == null || b == null) return false;
          if (typeof a !== typeof b) return false;

          if (typeof a === 'object') {
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b);
            if (aKeys.length !== bKeys.length) return false;
            return aKeys.every(key => deepEqual(a[key], b[key]));
          }

          return false;
        };

        // Find kinds with 2+ nodes and determine their common properties
        const kindsToCreate = new Map<string, any>();

        for (const [kind, data] of nodesByKind.entries()) {
          if (data.nodes.length >= 2) {
            const commonProps: any = {};

            // Check each sharable property
            for (const prop of sharableProps) {
              const firstNode = data.nodes[0].map;
              const firstValue = (firstNode.get(prop, true) as any)?.value || firstNode.get(prop);

              if (firstValue !== undefined) {
                log.info(`AUTO-COMPACT: Checking '${prop}' for kind '${kind}': first node has value '${firstValue}'`);
                // Check if all nodes have the same value for this property
                const allSame = data.nodes.every((node, idx) => {
                  const nodeValue = (node.map.get(prop, true) as any)?.value || node.map.get(prop);
                  const matches = deepEqual(firstValue, nodeValue);
                  if (!matches && nodeValue !== undefined) {
                    log.info(`AUTO-COMPACT: Node ${idx} has different value for '${prop}': '${nodeValue}' vs '${firstValue}'`);
                  }
                  return matches;
                });

                if (allSame) {
                  commonProps[prop] = firstValue;
                  log.info(`AUTO-COMPACT: Found common property '${prop}' = '${firstValue}' for kind '${kind}'`);
                } else {
                  log.info(`AUTO-COMPACT: Property '${prop}' not common for kind '${kind}' (not all nodes have same value)`);
                }
              }
            }

            // Add to kindsToCreate even if no common properties
            // We need to process it to potentially update existing kind properties
            kindsToCreate.set(kind, { properties: commonProps, nodeNames: data.nodes.map(n => n.name) });
            log.info(`AUTO-COMPACT: Kind '${kind}' will be processed with properties: ${JSON.stringify(commonProps)}`);
          }
        }

        // Get existing kinds section if it exists
        let kindsNode = doc.getIn(['topology', 'kinds'], true) as YAML.YAMLMap | undefined;

        if (kindsToCreate.size > 0) {
          // Get or create the kinds section
          if (!kindsNode || !YAML.isMap(kindsNode)) {
            kindsNode = new YAML.YAMLMap();
            kindsNode.flow = false;

            // Insert kinds right after name and before nodes
            const items = [...topologyNode.items];
            const newItems: typeof items = [];

            // Add name first if it exists
            const nameItem = items.find(item => String(item.key) === 'name');
            if (nameItem) {
              newItems.push(nameItem);
            }

            // Add kinds
            const kindsItem = doc.createPair('kinds', kindsNode);
            newItems.push(kindsItem as any);

            // Add everything else except name and kinds
            for (const item of items) {
              const keyStr = String(item.key);
              if (keyStr !== 'name' && keyStr !== 'kinds') {
                newItems.push(item);
              }
            }

            topologyNode.items = newItems;
          }

          // Create/update kind definitions and remove common properties from nodes
          for (const [kindName, data] of kindsToCreate) {
            // Get or create kind definition
            let kindDef = kindsNode.get(kindName);
            if (!kindDef || !YAML.isMap(kindDef)) {
              kindDef = new YAML.YAMLMap();
              (kindDef as YAML.YAMLMap).flow = false;
              kindsNode.set(kindName, kindDef);
            } else {
              // For existing kind definitions, we need to carefully update:
              // 1. Keep properties that no node has (fully inherited from kinds)
              // 2. Keep properties that all nodes have with the same value as in kinds
              // 3. Remove properties that some nodes override or don't match anymore

              const existingKindProps = new Map<string, any>();
              for (const item of (kindDef as YAML.YAMLMap).items) {
                const propKey = String(item.key);
                const propValue = (item.value as any)?.value || item.value;
                existingKindProps.set(propKey, propValue);
              }

              // Check each existing property to see if it should be kept
              for (const [existingProp, existingValue] of existingKindProps) {
                let shouldKeep = false;

                // Check how many nodes have this property
                let nodesWithProp = 0;
                let allMatch = true;

                // Use the node data from nodesByKind which has the original state
                const nodesData = nodesByKind.get(kindName);
                if (nodesData) {
                  for (const node of nodesData.nodes) {
                    const nodeValue = (node.map.get(existingProp, true) as any)?.value || node.map.get(existingProp);
                    if (nodeValue !== undefined) {
                      nodesWithProp++;
                      if (!deepEqual(nodeValue, existingValue)) {
                        allMatch = false;
                        break;
                      }
                    }
                  }
                }

                // Special handling for commonly inherited properties
                // 'image' is typically defined in kinds and inherited by nodes
                const commonlyInheritedProps = ['image'];

                if (nodesWithProp === 0 && commonlyInheritedProps.includes(existingProp)) {
                  // This is a commonly inherited property with no node overrides - keep it
                  shouldKeep = true;
                  log.info(`AUTO-COMPACT: Keeping '${existingProp}' in kind '${kindName}' (commonly inherited, no nodes have it)`);
                } else if (nodesData && nodesWithProp === nodesData.nodes.length && allMatch) {
                  // All nodes have it with same value - keep it (will be deduplicated)
                  shouldKeep = true;
                  log.info(`AUTO-COMPACT: Keeping '${existingProp}' in kind '${kindName}' (all ${nodesWithProp} nodes have same value)`);
                }
                // Otherwise (no nodes have it and it's not commonly inherited,
                // or some nodes have it with different values) - remove it

                if (!shouldKeep) {
                  log.info(`AUTO-COMPACT: REMOVING '${existingProp}' from kind '${kindName}' (nodesWithProp=${nodesWithProp}, total=${nodesData?.nodes.length}, allMatch=${allMatch})`);
                  (kindDef as YAML.YAMLMap).delete(existingProp);
                }
              }
            }

            // Set all newly found common properties in the kind definition
            for (const [prop, value] of Object.entries(data.properties)) {
              log.info(`AUTO-COMPACT: Adding '${prop}' = '${value}' to kind '${kindName}'`);
              (kindDef as YAML.YAMLMap).set(prop, doc.createNode(value));
            }

            // Remove these properties from individual nodes
            for (const nodeName of data.nodeNames) {
              const nodeItem = nodesNode.get(nodeName, true);
              if (YAML.isMap(nodeItem)) {
                for (const prop of Object.keys(data.properties)) {
                  // Only remove if the value matches what's in the kind definition
                  const nodeValue = (nodeItem.get(prop, true) as any)?.value || nodeItem.get(prop);
                  if (deepEqual(nodeValue, data.properties[prop])) {
                    nodeItem.delete(prop);
                  }
                }
              }
            }
          }
        } else if (kindsNode && YAML.isMap(kindsNode)) {
          // No kinds need to be created, remove the entire kinds section
          topologyNode.delete('kinds');
        }

        // Clean up unused kinds (kinds with no nodes using them)
        if (kindsNode && YAML.isMap(kindsNode)) {
          const itemsToProcess = [...kindsNode.items];

          for (const item of itemsToProcess) {
            const kindName = String(item.key);

            // Only remove kinds that have no nodes using them at all
            if (!nodesByKind.has(kindName)) {
              kindsNode.delete(item.key);
            }
            // Otherwise keep the kind, even if it has no common properties to compact
            // It may have been manually created or have properties that nodes inherit
          }

          // If kinds section is now empty, remove it entirely
          if (kindsNode.items.length === 0) {
            topologyNode.delete('kinds');
          }
        }
      }
    }

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
      // Still in edit mode but without internal update flag
      await fs.promises.writeFile(yamlFilePath, updatedYamlString, 'utf8');
      log.info('Saved viewport positions and groups successfully');
      log.info(`Updated file: ${yamlFilePath}`);
    }
  }
}
