import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabTopology } from '../types/topoViewerType';
import { annotationsManager } from './annotationsManager';
import { CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';
import { isSpecialEndpoint } from './specialNodes';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeEndpointsStr(data: any): string | null {
  // Prefer explicit endpoints array when present, as special endpoints already correct encoded
  if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length === 2) {
    const valid = data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'));
    if (valid) {
      return (data.endpoints as string[]).join(',');
    }
  }
  if (data.sourceEndpoint && data.targetEndpoint) {
    return `${data.source}:${data.sourceEndpoint},${data.target}:${data.targetEndpoint}`;
  }
  return null;
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

    payloadParsed.filter(el => el.group === 'edges').forEach(element => {
      const data = element.data;
      const endpointsStr = computeEndpointsStr(data);
      if (!endpointsStr) {
        return;
      }
      let linkFound = false;
      for (const linkItem of linksNode.items) {
        if (YAML.isMap(linkItem)) {
          // Ensure each link map uses block style (no `{}`)
          (linkItem as YAML.YAMLMap).flow = false;
          const eps = linkItem.get('endpoints', true);
          if (YAML.isSeq(eps)) {
            const yamlEndpointsStr = eps.items
              .map(item => String((item as any).value ?? item))
              .join(',');
            if (yamlEndpointsStr === endpointsStr) {
              linkFound = true;
              break;
            }
          }
        }
      }
      if (!linkFound) {
        const endpointsArrStr = endpointsStr;
        const newLink = new YAML.YAMLMap();
        // New link map should be block style
        newLink.flow = false;
        const endpoints = endpointsArrStr.split(',');
        const endpointsNode = doc.createNode(endpoints) as YAML.YAMLSeq;
        // Endpoints list should be inline with []
        endpointsNode.flow = true;
        newLink.set('endpoints', endpointsNode);
        linksNode.add(newLink);
      }
    });

    const payloadEdgeEndpoints = new Set(
      payloadParsed
        .filter(el => el.group === 'edges')
        .map(el => computeEndpointsStr(el.data))
        .filter((s): s is string => Boolean(s))
    );
    linksNode.items = linksNode.items.filter(linkItem => {
      if (YAML.isMap(linkItem)) {
        const endpointsNode = linkItem.get('endpoints', true);
        if (YAML.isSeq(endpointsNode)) {
          const endpointsStr = endpointsNode.items
            .map(item => String((item as any).value ?? item))
            .join(',');
          return payloadEdgeEndpoints.has(endpointsStr);
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
