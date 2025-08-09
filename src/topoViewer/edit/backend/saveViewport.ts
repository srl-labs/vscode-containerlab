import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../../common/backend/logger';
import { TopoViewerAdaptorClab } from '../../view/backend/topoViewerAdaptorClab';
import { ClabTopology, ClabNode } from '../../common/types/topoViewerType';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveNodeConfig(parsed: ClabTopology, node: ClabNode): ClabNode {
  const defaults = parsed.topology?.defaults ?? {};
  const groups = parsed.topology?.groups ?? {};
  const kinds = parsed.topology?.kinds ?? {};

  const groupCfg = node.group && groups[node.group] ? groups[node.group] : {};
  const kindName = node.kind ?? groupCfg.kind ?? defaults.kind;
  const kindCfg = kindName && kinds[kindName] ? kinds[kindName] : {};

  const merged: ClabNode = {
    ...defaults,
    ...kindCfg,
    ...groupCfg,
    ...node,
  };
  merged.kind = kindName;
  merged.labels = {
    ...(defaults.labels ?? {}),
    ...(kindCfg.labels ?? {}),
    ...(groupCfg.labels ?? {}),
    ...(node.labels ?? {}),
  };
  return merged;
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

export async function saveViewport(
  adaptor: TopoViewerAdaptorClab,
  lastYamlFilePath: string,
  payload: string,
  setInternalUpdate: (_arg: boolean) => void // eslint-disable-line no-unused-vars
): Promise<void> {
  const payloadParsed: any[] = JSON.parse(payload);
  const doc: YAML.Document.Parsed | undefined = adaptor.currentClabDoc;
  if (!doc) {
    throw new Error('No parsed Document found (adaptor.currentClabDoc is undefined).');
  }

  const updatedKeys = new Map<string, string>();

  const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
  if (!YAML.isMap(nodesMaybe)) {
    throw new Error('YAML topology nodes is not a map');
  }
  const yamlNodes: YAML.YAMLMap = nodesMaybe;
  const topoObj = doc.toJS() as ClabTopology;

  payloadParsed
    .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'group')
    .forEach(element => {
      const nodeId: string = element.data.id;
      let nodeYaml = yamlNodes.get(nodeId, true) as YAML.YAMLMap | undefined;
      if (!nodeYaml) {
        nodeYaml = new YAML.YAMLMap();
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
      const inherit = resolveNodeConfig(topoObj, { group: groupName });

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

      let labels = nodeMap.get('labels', true) as YAML.YAMLMap | undefined;
      if (!labels || !YAML.isMap(labels)) {
        labels = new YAML.YAMLMap();
        nodeMap.set('labels', labels);
      }
      if (extraData.labels) {
        for (const [key, value] of Object.entries(extraData.labels)) {
          labels.set(key, doc.createNode(value));
        }
      }
      const x = element.position?.x || 0;
      const y = element.position?.y || 0;
      labels.set('graph-posX', doc.createNode(Math.round(x).toString()));
      labels.set('graph-posY', doc.createNode(Math.round(y).toString()));
      labels.set('graph-icon', doc.createNode(element.data.topoViewerRole || 'pe'));
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

      const newKey = element.data.name;
      if (nodeId !== newKey) {
        yamlNodes.set(newKey, nodeMap);
        yamlNodes.delete(nodeId);
        updatedKeys.set(nodeId, newKey);
      }
    });

  const payloadNodeIds = new Set(
    payloadParsed.filter(el => el.group === 'nodes').map(el => el.data.id)
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

  payloadParsed.filter(el => el.group === 'edges').forEach(element => {
    const data = element.data;
    const endpointsStr = computeEndpointsStr(data);
    if (!endpointsStr) {
      return;
    }
    let linkFound = false;
    for (const linkItem of linksNode.items) {
      if (YAML.isMap(linkItem)) {
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
      const endpoints = endpointsArrStr.split(',');
      const endpointsNode = doc.createNode(endpoints) as YAML.YAMLSeq;
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
        endpointsNode.flow = true;
      }
    }
  }

  const updatedYamlString = doc.toString();
  setInternalUpdate(true);
  await fs.promises.writeFile(lastYamlFilePath, updatedYamlString, 'utf8');
  await sleep(50);
  setInternalUpdate(false);

  log.info('Saved topology with preserved comments!');
  log.info(doc);
  log.info(lastYamlFilePath);
}

