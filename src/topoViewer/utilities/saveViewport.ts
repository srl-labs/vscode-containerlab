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
      else if (special.node.startsWith('dummy:')) type = 'dummy';
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
    else if (special.node.startsWith('dummy:')) type = 'dummy';
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
    annotations.nodeAnnotations = [];
    annotations.cloudNodeAnnotations = [];

    // Process regular nodes for annotations
    const regularNodes = payloadParsed.filter(
      el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' &&
      el.data.topoViewerRole !== 'cloud' && el.data.topoViewerRole !== 'freeText' &&
      !isSpecialEndpoint(el.data.id)
    );

    for (const node of regularNodes) {
      const nodeAnnotation: NodeAnnotation = {
        id: node.data.id,
        position: {
          x: Math.round(node.position?.x || 0),
          y: Math.round(node.position?.y || 0)
        },
        icon: node.data.topoViewerRole,
      };
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
        const inherit = resolveNodeConfig(topoObj!, { group: groupName });

        // For properties, we only write them if:
        // 1. They were already explicitly in the YAML (preserve them), OR
        // 2. They are new/changed and different from what would be inherited
        const desiredKind = originalKind !== undefined ? originalKind :
          (extraData.kind && extraData.kind !== inherit.kind ? extraData.kind : undefined);
        const desiredImage = originalImage !== undefined ? originalImage :
          (extraData.image && extraData.image !== inherit.image ? extraData.image : undefined);
        const desiredType = originalType !== undefined ? originalType :
          (extraData.type && extraData.type !== inherit.type ? extraData.type : undefined);

        if (groupName) {
          nodeMap.set('group', doc.createNode(groupName));
        } else {
          nodeMap.delete('group');
        }

        if (desiredKind && desiredKind !== inherit.kind) {
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

    payloadParsed.filter(el => el.group === 'edges').forEach(element => {
      const data = element.data;
      const payloadKey = canonicalFromPayloadEdge(data);
      if (!payloadKey) return;
      const payloadKeyStr = canonicalKeyToString(payloadKey);
      let linkFound = false;
      for (const linkItem of linksNode.items) {
        if (YAML.isMap(linkItem)) {
          (linkItem as YAML.YAMLMap).flow = false;
          const yamlKey = canonicalFromYamlLink(linkItem as YAML.YAMLMap);
          if (yamlKey && canonicalKeyToString(yamlKey) === payloadKeyStr) {
            linkFound = true;
            break;
          }
        }
      }
      if (!linkFound) {
        // Until Step 3, write in short format only
        const srcStr = data.sourceEndpoint ? `${data.source}:${data.sourceEndpoint}` : data.source;
        const dstStr = data.targetEndpoint ? `${data.target}:${data.targetEndpoint}` : data.target;
        const newLink = new YAML.YAMLMap();
        newLink.flow = false;
        const endpointsNode = doc.createNode([srcStr, dstStr]) as YAML.YAMLSeq;
        endpointsNode.flow = true;
        newLink.set('endpoints', endpointsNode);
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
          endpointsNode.items = endpointsNode.items.map(item => {
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
          // Ensure endpoints list renders inline with []
          endpointsNode.flow = true;
        }
      }
    }
  }

  // Save annotations for edit mode
  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);
  annotations.nodeAnnotations = [];
  annotations.cloudNodeAnnotations = [];

  const regularNodes = payloadParsed.filter(
    el => el.group === 'nodes' && el.data.topoViewerRole !== 'group' && el.data.topoViewerRole !== 'cloud' && el.data.topoViewerRole !== 'freeText' && !isSpecialEndpoint(el.data.id)
  );
  for (const node of regularNodes) {
    const nodeAnnotation: NodeAnnotation = {
      id: node.data.id,
      position: {
        x: Math.round(node.position?.x || 0),
        y: Math.round(node.position?.y || 0)
      },
      icon: node.data.topoViewerRole,
    };
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
