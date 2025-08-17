import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/extensionLogger';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabTopology } from '../types/topoViewerType';
import { annotationsManager } from './annotationsManager';
import { CloudNodeAnnotation } from '../types/topoViewerGraph';

/**
 * Determines if a node ID represents a special endpoint.
 * @param nodeId - The node ID to check.
 * @returns True if the node is a special endpoint (host, mgmt-net, macvlan).
 */
function isSpecialEndpoint(nodeId: string): boolean {
  return (
    nodeId.startsWith('host:') ||
    nodeId.startsWith('mgmt-net:') ||
    nodeId.startsWith('macvlan:')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function computeEndpointsStr(data: any): string | null {
  if (data.sourceEndpoint && data.targetEndpoint) {
    return `${data.source}:${data.sourceEndpoint},${data.target}:${data.targetEndpoint}`;
  }
  if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length === 2) {
    const valid = data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'));
    return valid ? (data.endpoints as string[]).join(',') : null;
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
  let doc: YAML.Document.Parsed | undefined;
  if (mode === 'edit') {
    doc = adaptor?.currentClabDoc;
    if (!doc) {
      throw new Error('No parsed Document found (adaptor.currentClabDoc is undefined).');
    }
  } else {
    const yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
    doc = YAML.parseDocument(yamlContent);
    if (!doc) {
      throw new Error('Failed to parse YAML document');
    }
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

  const updateLabels = (nodeMap: YAML.YAMLMap, element: any): void => {
    let labels = nodeMap.get('labels', true) as YAML.YAMLMap | undefined;
    if (!labels || !YAML.isMap(labels)) {
      labels = new YAML.YAMLMap();
      nodeMap.set('labels', labels);
    }

    let x = element.position?.x || 0;
    let y = element.position?.y || 0;
    if (mode === 'view' && element.data?.extraData?.labels) {
      const labelPosX = element.data.extraData.labels['graph-posX'];
      const labelPosY = element.data.extraData.labels['graph-posY'];
      if (labelPosX !== undefined && labelPosX !== null) {
        x = parseFloat(labelPosX) || x;
      }
      if (labelPosY !== undefined && labelPosY !== null) {
        y = parseFloat(labelPosY) || y;
      }
    }

    labels.set('graph-posX', doc.createNode(Math.round(x).toString()));
    labels.set('graph-posY', doc.createNode(Math.round(y).toString()));
    if (element.data.topoViewerRole) {
      labels.set('graph-icon', doc.createNode(element.data.topoViewerRole));
    }

    const parent = element.parent;
    if (parent) {
      const parts = parent.split(':');
      labels.set('graph-group', doc.createNode(parts[0]));
      labels.set('graph-level', doc.createNode(parts[1]));
    } else {
      labels.delete('graph-group');
      labels.delete('graph-level');
    }

    const groupLabelPos = element.data.groupLabelPos;
    labels.set('graph-groupLabelPos', doc.createNode(groupLabelPos || 'bottom-center'));

    if (mode === 'view' && element.data?.extraData?.labels) {
      const geoLat = element.data.extraData.labels['graph-geoCoordinateLat'];
      const geoLng = element.data.extraData.labels['graph-geoCoordinateLng'];
      if (geoLat !== undefined && geoLat !== null && geoLat !== '') {
        labels.set('graph-geoCoordinateLat', doc.createNode(geoLat));
      }
      if (geoLng !== undefined && geoLng !== null && geoLng !== '') {
        labels.set('graph-geoCoordinateLng', doc.createNode(geoLng));
      }
    }
  };

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
        const existingKind = (nodeMap.get('kind', true) as any)?.value;
        const existingImage = (nodeMap.get('image', true) as any)?.value;
        const existingType = (nodeMap.get('type', true) as any)?.value;
        const groupName = extraData.group ?? (nodeMap.get('group', true) as any)?.value;
        const desiredKind = extraData.kind ?? existingKind ?? element.data.topoViewerRole;
        const desiredImage = extraData.image ?? existingImage;
        const desiredType = extraData.type ?? existingType;
        const inherit = resolveNodeConfig(topoObj!, { group: groupName });

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
        if (nokiaKinds.includes(desiredKind) && desiredType !== undefined && desiredType !== inherit.type) {
          nodeMap.set('type', doc.createNode(desiredType));
        } else {
          nodeMap.delete('type');
        }

        if (extraData.labels) {
          let labels = nodeMap.get('labels', true) as YAML.YAMLMap | undefined;
          if (!labels || !YAML.isMap(labels)) {
            labels = new YAML.YAMLMap();
            // Ensure labels map renders in block style
            labels.flow = false;
            nodeMap.set('labels', labels);
          }
          for (const [key, value] of Object.entries(extraData.labels)) {
            if (value !== undefined && value !== null && value !== '') {
              labels.set(key, doc.createNode(value));
            }
          }
        }

        updateLabels(nodeMap, element);

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
        updateLabels(nodeYaml, element);
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

  // Save cloud node positions to annotations
  const cloudNodes = payloadParsed.filter(el => el.group === 'nodes' && el.data.topoViewerRole === 'cloud');
  if (cloudNodes.length > 0) {
    const annotations = await annotationsManager.loadAnnotations(yamlFilePath);

    // Clear existing cloud node annotations
    annotations.cloudNodeAnnotations = [];

    // Add new cloud node annotations
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
      annotations.cloudNodeAnnotations.push(cloudNodeAnnotation);
    }

    await annotationsManager.saveAnnotations(yamlFilePath, annotations);
  }

  const updatedYamlString = doc.toString();
  if (mode === 'edit' && setInternalUpdate) {
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
