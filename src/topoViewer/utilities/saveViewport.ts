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

        // For existing nodes, preserve what was originally in the YAML
        // Don't add properties that were inherited from kinds/groups/defaults
        const originalKind = (nodeMap.get('kind', true) as any)?.value;
        const originalImage = (nodeMap.get('image', true) as any)?.value;
        const originalType = (nodeMap.get('type', true) as any)?.value;
        const originalGroup = (nodeMap.get('group', true) as any)?.value;

        // Only update group if it was changed (extraData.group differs from original)
        const groupName = extraData.group !== undefined && extraData.group !== originalGroup
          ? extraData.group
          : originalGroup;

        // Calculate what would be inherited with the current group
        const baseInherit = resolveNodeConfig(topoObj!, { group: groupName });
        const desiredKind = extraData.kind !== undefined ? extraData.kind : (originalKind !== undefined ? originalKind : undefined);
        const inherit = resolveNodeConfig(topoObj!, { group: groupName, kind: desiredKind });
        const desiredImage = extraData.image !== undefined ? extraData.image : (originalImage !== undefined ? originalImage : undefined);
        const desiredType = extraData.type !== undefined ? extraData.type : (originalType !== undefined ? originalType : undefined);

        if (groupName) {
          nodeMap.set('group', doc.createNode(groupName));
        } else {
          nodeMap.delete('group');
        }

        if (desiredKind && desiredKind !== baseInherit.kind) {
          nodeMap.set('kind', doc.createNode(desiredKind));
        } else {
          nodeMap.delete('kind');
        }

        if (desiredImage && desiredImage !== inherit.image) {
          nodeMap.set('image', doc.createNode(desiredImage));
        } else {
          nodeMap.delete('image');
        }

        const nokiaKinds = ['nokia_srlinux', 'nokia_srsim', 'nokia_sros'];
        if (nokiaKinds.includes(desiredKind) && desiredType !== undefined && desiredType !== '' && desiredType !== inherit.type) {
          nodeMap.set('type', doc.createNode(desiredType));
        } else {
          nodeMap.delete('type');
        }

        // Generic handling of additional properties with inheritance awareness
        const normalize = (obj: any): any => {
          if (Array.isArray(obj)) return obj.map(normalize);
          if (obj && typeof obj === 'object') {
            return Object.keys(obj).sort().reduce((res, key) => {
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
          'startup-config','enforce-startup-config','suppress-startup-config','license','binds','env','env-files','labels',
          'user','entrypoint','cmd','exec','restart-policy','auto-remove','startup-delay','mgmt-ipv4','mgmt-ipv6',
          'network-mode','ports','dns','aliases','memory','cpu','cpu-set','shm-size','cap-add','sysctls','devices',
          'certificate','healthcheck','image-pull-policy','runtime','stages'
        ].forEach(applyProp);

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
