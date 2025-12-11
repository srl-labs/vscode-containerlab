/**
 * NodePersistence - Handles node CRUD operations in YAML documents
 */

import * as YAML from 'yaml';
import { log } from '../services/logger';
import { annotationsManager } from '../services/AnnotationsManager';
import { ClabTopology } from '../../shared/types/topology';
import {
  SaveResult,
  deepEqual,
  setOrDelete,
  ERROR_NODES_NOT_MAP
} from './YamlDocStore';

/** Node data from the webview */
export interface NodeSaveData {
  id: string;
  name: string;
  extraData?: {
    kind?: string;
    type?: string;
    image?: string;
    group?: string;
    'startup-config'?: string;
    'mgmt-ipv4'?: string;
    'mgmt-ipv6'?: string;
    labels?: Record<string, unknown>;
    env?: Record<string, unknown>;
    binds?: string[];
    ports?: string[];
    [key: string]: unknown;
  };
  position?: { x: number; y: number };
}

/** Node properties that can be saved to YAML */
const NODE_YAML_PROPERTIES = [
  'kind',
  'type',
  'image',
  'group',
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
  'components',
  'stages',
] as const;

/**
 * Creates a new node entry in the YAML document
 */
function createNodeYaml(doc: YAML.Document, nodeData: NodeSaveData): YAML.YAMLMap {
  const nodeMap = new YAML.YAMLMap();
  nodeMap.flow = false;

  const extra = nodeData.extraData || {};

  // Set kind (required, defaults to nokia_srlinux)
  const kind = extra.kind?.trim() || 'nokia_srlinux';
  nodeMap.set('kind', doc.createNode(kind));

  // Set optional properties
  if (extra.type?.trim()) {
    nodeMap.set('type', doc.createNode(extra.type.trim()));
  }
  if (extra.image?.trim()) {
    nodeMap.set('image', doc.createNode(extra.image.trim()));
  }
  if (extra.group?.trim()) {
    nodeMap.set('group', doc.createNode(extra.group.trim()));
  }
  if (extra['mgmt-ipv4']?.trim()) {
    nodeMap.set('mgmt-ipv4', doc.createNode(extra['mgmt-ipv4'].trim()));
  }

  return nodeMap;
}

/**
 * Updates an existing node in the YAML document
 */
function updateNodeYaml(
  doc: YAML.Document,
  nodeMap: YAML.YAMLMap,
  nodeData: NodeSaveData,
  inheritedConfig: Partial<Record<string, unknown>>
): void {
  const extra = nodeData.extraData || {};

  // Update each supported property
  for (const prop of NODE_YAML_PROPERTIES) {
    const value = extra[prop];
    const inherited = inheritedConfig[prop];

    // Skip if value matches inherited or is empty
    if (value === undefined) {
      // If no value provided, remove from node-level (will inherit)
      if (nodeMap.has(prop)) nodeMap.delete(prop);
      continue;
    }

    // If value matches inherited, remove node-level override
    if (deepEqual(value, inherited)) {
      if (nodeMap.has(prop)) nodeMap.delete(prop);
      continue;
    }

    // Set the value
    setOrDelete(doc, nodeMap, prop, value);
  }
}

/**
 * Resolves inherited configuration from defaults, kinds, and groups
 */
export function resolveInheritedConfig(
  topo: ClabTopology,
  group?: string,
  kind?: string
): Partial<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // Apply defaults
  if (topo.topology?.defaults) {
    Object.assign(result, topo.topology.defaults);
  }

  // Apply kind defaults
  if (kind && topo.topology?.kinds?.[kind]) {
    Object.assign(result, topo.topology.kinds[kind]);
  }

  // Apply group defaults
  if (group && topo.topology?.groups?.[group]) {
    Object.assign(result, topo.topology.groups[group]);
  }

  return result;
}

/**
 * Saves a node's position to the annotations file
 */
export async function saveNodePosition(
  yamlFilePath: string,
  nodeId: string,
  position: { x: number; y: number }
): Promise<void> {
  const annotations = await annotationsManager.loadAnnotations(yamlFilePath);

  if (!annotations.nodeAnnotations) {
    annotations.nodeAnnotations = [];
  }

  const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
  if (existing) {
    existing.position = position;
  } else {
    annotations.nodeAnnotations.push({ id: nodeId, position });
  }

  await annotationsManager.saveAnnotations(yamlFilePath, annotations);
}

/**
 * Checks if an endpoint item references a specific node
 */
function endpointReferencesNode(ep: unknown, nodeId: string): boolean {
  if (YAML.isScalar(ep)) {
    const str = String(ep.value);
    return str === nodeId || str.startsWith(`${nodeId}:`);
  }
  if (YAML.isMap(ep)) {
    return (ep as YAML.YAMLMap).get('node') === nodeId;
  }
  return false;
}

/**
 * Checks if a link references a specific node
 */
function linkReferencesNode(linkMap: YAML.YAMLMap, nodeId: string): boolean {
  // Check endpoints array
  const endpoints = linkMap.get('endpoints', true);
  if (YAML.isSeq(endpoints)) {
    if (endpoints.items.some(ep => endpointReferencesNode(ep, nodeId))) {
      return true;
    }
  }

  // Check single endpoint
  const endpoint = linkMap.get('endpoint', true);
  if (YAML.isMap(endpoint)) {
    return (endpoint as YAML.YAMLMap).get('node') === nodeId;
  }

  return false;
}

/**
 * Adds a new node to the topology
 */
export async function addNode(
  doc: YAML.Document.Parsed,
  nodeData: NodeSaveData,
  yamlFilePath: string
): Promise<SaveResult> {
  try {
    const nodesMap = doc.getIn(['topology', 'nodes'], true) as YAML.YAMLMap | undefined;
    if (!nodesMap || !YAML.isMap(nodesMap)) {
      return { success: false, error: ERROR_NODES_NOT_MAP };
    }

    const nodeId = nodeData.name || nodeData.id;
    if (!nodeId) {
      return { success: false, error: 'Node must have a name or id' };
    }

    // Check if node already exists
    if (nodesMap.has(nodeId)) {
      return { success: false, error: `Node "${nodeId}" already exists` };
    }

    // Create and add the node
    const nodeYaml = createNodeYaml(doc, nodeData);
    nodesMap.set(nodeId, nodeYaml);

    // Save position to annotations if provided
    if (nodeData.position) {
      await saveNodePosition(yamlFilePath, nodeId, nodeData.position);
    }

    log.info(`[SaveTopology] Added node: ${nodeId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Updates endpoint references in a link when a node is renamed
 */
function updateEndpointReferences(ep: unknown, oldId: string, newId: string): void {
  if (YAML.isScalar(ep)) {
    const str = String(ep.value);
    // Format: "nodeName:interface" or just "nodeName"
    if (str === oldId) {
      ep.value = newId;
    } else if (str.startsWith(`${oldId}:`)) {
      ep.value = `${newId}:${str.slice(oldId.length + 1)}`;
    }
  } else if (YAML.isMap(ep)) {
    const epMap = ep as YAML.YAMLMap;
    if (epMap.get('node') === oldId) {
      epMap.set('node', newId);
    }
  }
}

/**
 * Updates all link references when a node is renamed
 */
function updateLinksForRename(doc: YAML.Document.Parsed, oldId: string, newId: string): void {
  const linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
  if (!linksSeq || !YAML.isSeq(linksSeq)) {
    return;
  }

  for (const item of linksSeq.items) {
    if (!YAML.isMap(item)) continue;
    const linkMap = item as YAML.YAMLMap;

    // Check endpoints array
    const endpoints = linkMap.get('endpoints', true);
    if (YAML.isSeq(endpoints)) {
      for (const ep of endpoints.items) {
        updateEndpointReferences(ep, oldId, newId);
      }
    }

    // Check single endpoint (less common)
    const endpoint = linkMap.get('endpoint', true);
    if (YAML.isMap(endpoint)) {
      const epMap = endpoint as YAML.YAMLMap;
      if (epMap.get('node') === oldId) {
        epMap.set('node', newId);
      }
    }
  }
}

/**
 * Updates an existing node in the topology
 */
export function editNode(
  doc: YAML.Document.Parsed,
  nodeData: NodeSaveData,
  topoObj: ClabTopology
): SaveResult {
  try {
    const nodesMap = doc.getIn(['topology', 'nodes'], true) as YAML.YAMLMap | undefined;
    if (!nodesMap || !YAML.isMap(nodesMap)) {
      return { success: false, error: ERROR_NODES_NOT_MAP };
    }

    // Use the original ID to find the existing node
    const originalId = nodeData.id;
    const newName = nodeData.name || nodeData.id;

    if (!originalId) {
      return { success: false, error: 'Node must have an id' };
    }

    // Check if the original node exists
    let nodeMap = nodesMap.get(originalId, true) as YAML.YAMLMap | undefined;
    if (!nodeMap) {
      // Node doesn't exist with originalId - this shouldn't happen in normal edit flow
      // But we handle it gracefully by creating a new node with the target name
      nodeMap = new YAML.YAMLMap();
      nodeMap.flow = false;
      nodesMap.set(newName, nodeMap);
      log.warn(`[SaveTopology] Node "${originalId}" not found, creating new node "${newName}"`);
    }

    // Get inherited configuration
    const inheritedConfig = resolveInheritedConfig(topoObj, nodeData.extraData?.group, nodeData.extraData?.kind);

    // Check if this is a rename operation
    const isRename = newName !== originalId;

    if (isRename) {
      // Check if target name already exists (would cause conflict)
      if (nodesMap.has(newName)) {
        return { success: false, error: `Cannot rename: node "${newName}" already exists` };
      }

      // Update the node properties first
      updateNodeYaml(doc, nodeMap, nodeData, inheritedConfig);

      // Rename the node in the map: add with new name, delete old
      nodesMap.set(newName, nodeMap);
      nodesMap.delete(originalId);

      // Update all links that reference this node
      updateLinksForRename(doc, originalId, newName);

      log.info(`[SaveTopology] Renamed node: ${originalId} -> ${newName}`);
    } else {
      // Just update the node properties
      updateNodeYaml(doc, nodeMap, nodeData, inheritedConfig);
      log.info(`[SaveTopology] Updated node: ${originalId}`);
    }

    return { success: true, renamed: isRename ? { oldId: originalId, newId: newName } : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Removes a node from the topology
 */
export function deleteNode(doc: YAML.Document.Parsed, nodeId: string): SaveResult {
  try {
    const nodesMap = doc.getIn(['topology', 'nodes'], true) as YAML.YAMLMap | undefined;
    if (!nodesMap || !YAML.isMap(nodesMap)) {
      return { success: false, error: ERROR_NODES_NOT_MAP };
    }

    if (!nodesMap.has(nodeId)) {
      return { success: false, error: `Node "${nodeId}" not found` };
    }

    nodesMap.delete(nodeId);

    // Also remove any links connected to this node
    const linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (linksSeq && YAML.isSeq(linksSeq)) {
      linksSeq.items = linksSeq.items.filter(item => {
        if (!YAML.isMap(item)) return true;
        return !linkReferencesNode(item as YAML.YAMLMap, nodeId);
      });
    }

    log.info(`[SaveTopology] Deleted node: ${nodeId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
