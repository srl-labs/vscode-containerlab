/**
 * SaveTopologyService - Handles saving topology changes to YAML files
 *
 * This service manages the persistence of node and link changes from the React TopoViewer
 * back to the Containerlab YAML configuration file. It preserves YAML formatting and comments.
 */

import * as fs from 'fs';
import * as YAML from 'yaml';
import { log } from './logger';
import { ClabTopology } from '../../shared/types/topology';
import { annotationsManager } from './AnnotationsManager';

// ============================================================================
// Types
// ============================================================================

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

/** Link data from the webview */
export interface LinkSaveData {
  id: string;
  source: string;
  target: string;
  sourceEndpoint?: string;
  targetEndpoint?: string;
  extraData?: {
    extType?: string;
    extMtu?: string | number;
    extHostInterface?: string;
    extMode?: string;
    extRemote?: string;
    extVni?: string | number;
    extDstPort?: string | number;
    extSrcPort?: string | number;
    extSourceMac?: string;
    extTargetMac?: string;
    extVars?: Record<string, unknown>;
    extLabels?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/** Result of a save operation */
export interface SaveResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

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

/** Link types that use single endpoint format */
const SINGLE_ENDPOINT_TYPES = new Set(['host', 'mgmt-net', 'macvlan', 'vxlan', 'vxlan-stitch']);

/** Common error messages */
const ERROR_NODES_NOT_MAP = 'YAML topology.nodes is not a map';
const ERROR_LINKS_NOT_SEQ = 'YAML topology.links is not a sequence';
const ERROR_SERVICE_NOT_INIT = 'Service not initialized';
const ERROR_NO_YAML_PATH = 'No YAML file path set';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a YAML scalar with double quotes for endpoint values
 */
function createQuotedScalar(doc: YAML.Document, value: string): YAML.Scalar {
  const scalar = doc.createNode(value) as YAML.Scalar;
  scalar.type = 'QUOTE_DOUBLE';
  return scalar;
}

/**
 * Checks if two objects are structurally equal (ignoring key order)
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Checks if a value should be persisted (not empty/undefined)
 */
function shouldPersist(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Sets or deletes a key in a YAML map based on the value
 */
function setOrDelete(doc: YAML.Document, map: YAML.YAMLMap, key: string, value: unknown): void {
  if (!shouldPersist(value)) {
    if (map.has(key)) map.delete(key);
    return;
  }
  map.set(key, doc.createNode(value));
}

// ============================================================================
// Node Operations
// ============================================================================

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
 * Adds a new node to the topology
 */
async function addNode(
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
 * Updates an existing node in the topology
 */
function editNode(
  doc: YAML.Document.Parsed,
  nodeData: NodeSaveData,
  topoObj: ClabTopology
): SaveResult {
  try {
    const nodesMap = doc.getIn(['topology', 'nodes'], true) as YAML.YAMLMap | undefined;
    if (!nodesMap || !YAML.isMap(nodesMap)) {
      return { success: false, error: ERROR_NODES_NOT_MAP };
    }

    const nodeId = nodeData.name || nodeData.id;
    if (!nodeId) {
      return { success: false, error: 'Node must have a name or id' };
    }

    let nodeMap = nodesMap.get(nodeId, true) as YAML.YAMLMap | undefined;
    if (!nodeMap) {
      // Node doesn't exist, create it
      nodeMap = new YAML.YAMLMap();
      nodeMap.flow = false;
      nodesMap.set(nodeId, nodeMap);
    }

    // Get inherited configuration
    const inheritedConfig = resolveInheritedConfig(topoObj, nodeData.extraData?.group, nodeData.extraData?.kind);

    // Update the node
    updateNodeYaml(doc, nodeMap, nodeData, inheritedConfig);

    log.info(`[SaveTopology] Updated node: ${nodeId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Removes a node from the topology
 */
function deleteNode(doc: YAML.Document.Parsed, nodeId: string): SaveResult {
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

// ============================================================================
// Link Operations
// ============================================================================

/**
 * Creates a link entry in brief format: endpoints: ["node1:eth1", "node2:eth1"]
 */
function createBriefLink(doc: YAML.Document, linkData: LinkSaveData): YAML.YAMLMap {
  const linkMap = new YAML.YAMLMap();
  linkMap.flow = false;

  const srcStr = linkData.sourceEndpoint
    ? `${linkData.source}:${linkData.sourceEndpoint}`
    : linkData.source;
  const dstStr = linkData.targetEndpoint
    ? `${linkData.target}:${linkData.targetEndpoint}`
    : linkData.target;

  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = true;
  endpointsSeq.add(createQuotedScalar(doc, srcStr));
  endpointsSeq.add(createQuotedScalar(doc, dstStr));

  linkMap.set('endpoints', endpointsSeq);
  return linkMap;
}

/**
 * Creates a single endpoint map for special link types
 */
function createSingleEndpointMap(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData['extraData']
): YAML.YAMLMap {
  const epMap = new YAML.YAMLMap();
  epMap.flow = false;
  epMap.set('node', createQuotedScalar(doc, linkData.source));
  if (linkData.sourceEndpoint) {
    epMap.set('interface', createQuotedScalar(doc, linkData.sourceEndpoint));
  }
  if (extra?.extSourceMac) {
    epMap.set('mac', doc.createNode(extra.extSourceMac));
  }
  return epMap;
}

/**
 * Applies type-specific properties for single endpoint links
 */
function applySingleEndpointProperties(
  doc: YAML.Document,
  linkMap: YAML.YAMLMap,
  linkType: string,
  extra: LinkSaveData['extraData']
): void {
  if (extra?.extHostInterface) {
    linkMap.set('host-interface', doc.createNode(extra.extHostInterface));
  }
  if (linkType === 'macvlan' && extra?.extMode) {
    linkMap.set('mode', doc.createNode(extra.extMode));
  }
  if (linkType === 'vxlan' || linkType === 'vxlan-stitch') {
    setOrDelete(doc, linkMap, 'remote', extra?.extRemote);
    setOrDelete(doc, linkMap, 'vni', extra?.extVni);
    setOrDelete(doc, linkMap, 'dst-port', extra?.extDstPort);
    setOrDelete(doc, linkMap, 'src-port', extra?.extSrcPort);
  }
}

/**
 * Creates dual endpoint sequence for veth links
 */
function createDualEndpointSeq(
  doc: YAML.Document,
  linkData: LinkSaveData,
  extra: LinkSaveData['extraData']
): YAML.YAMLSeq {
  const endpointsSeq = new YAML.YAMLSeq();
  endpointsSeq.flow = false;

  const srcEp = new YAML.YAMLMap();
  srcEp.flow = false;
  srcEp.set('node', createQuotedScalar(doc, linkData.source));
  if (linkData.sourceEndpoint) {
    srcEp.set('interface', createQuotedScalar(doc, linkData.sourceEndpoint));
  }
  if (extra?.extSourceMac) {
    srcEp.set('mac', doc.createNode(extra.extSourceMac));
  }

  const dstEp = new YAML.YAMLMap();
  dstEp.flow = false;
  dstEp.set('node', createQuotedScalar(doc, linkData.target));
  if (linkData.targetEndpoint) {
    dstEp.set('interface', createQuotedScalar(doc, linkData.targetEndpoint));
  }
  if (extra?.extTargetMac) {
    dstEp.set('mac', doc.createNode(extra.extTargetMac));
  }

  endpointsSeq.add(srcEp);
  endpointsSeq.add(dstEp);
  return endpointsSeq;
}

/**
 * Creates a link entry in extended format with type and additional properties
 */
function createExtendedLink(doc: YAML.Document, linkData: LinkSaveData): YAML.YAMLMap {
  const linkMap = new YAML.YAMLMap();
  linkMap.flow = false;

  const extra = linkData.extraData || {};
  const linkType = extra.extType || 'veth';

  linkMap.set('type', doc.createNode(linkType));

  if (SINGLE_ENDPOINT_TYPES.has(linkType)) {
    linkMap.set('endpoint', createSingleEndpointMap(doc, linkData, extra));
    applySingleEndpointProperties(doc, linkMap, linkType, extra);
  } else {
    linkMap.set('endpoints', createDualEndpointSeq(doc, linkData, extra));
  }

  // Common extended properties
  setOrDelete(doc, linkMap, 'mtu', extra.extMtu);
  setOrDelete(doc, linkMap, 'vars', extra.extVars);
  setOrDelete(doc, linkMap, 'labels', extra.extLabels);

  return linkMap;
}

/**
 * Checks if link data has extended properties requiring extended format
 */
function hasExtendedProperties(linkData: LinkSaveData): boolean {
  const extra = linkData.extraData || {};
  const extendedKeys = [
    'extMtu', 'extSourceMac', 'extTargetMac', 'extHostInterface',
    'extMode', 'extRemote', 'extVni', 'extDstPort', 'extSrcPort'
  ];

  if (extendedKeys.some(k => extra[k] !== undefined && extra[k] !== '')) return true;
  if (extra.extVars && typeof extra.extVars === 'object' && Object.keys(extra.extVars).length > 0) return true;
  if (extra.extLabels && typeof extra.extLabels === 'object' && Object.keys(extra.extLabels).length > 0) return true;
  if (extra.extType && extra.extType !== 'veth') return true;

  return false;
}

/**
 * Generates a canonical key for a link to find duplicates
 */
function getLinkKey(linkData: LinkSaveData): string {
  const src = linkData.sourceEndpoint
    ? `${linkData.source}:${linkData.sourceEndpoint}`
    : linkData.source;
  const dst = linkData.targetEndpoint
    ? `${linkData.target}:${linkData.targetEndpoint}`
    : linkData.target;

  // Sort to ensure consistent key regardless of direction
  return [src, dst].toSorted().join('|');
}

/**
 * Extracts endpoint string from a YAML endpoint item
 */
function extractEndpointString(ep: unknown): string | null {
  if (YAML.isScalar(ep)) {
    return String(ep.value);
  }
  if (YAML.isMap(ep)) {
    const node = (ep as YAML.YAMLMap).get('node');
    const iface = (ep as YAML.YAMLMap).get('interface');
    return iface ? `${node}:${iface}` : String(node);
  }
  return null;
}

/**
 * Gets the canonical key from an existing YAML link map
 */
function getYamlLinkKey(linkMap: YAML.YAMLMap): string | null {
  const endpoints: string[] = [];

  // Check endpoints array
  const endpointsSeq = linkMap.get('endpoints', true);
  if (YAML.isSeq(endpointsSeq)) {
    for (const ep of endpointsSeq.items) {
      const epStr = extractEndpointString(ep);
      if (epStr) endpoints.push(epStr);
    }
  }

  // Check single endpoint
  const endpoint = linkMap.get('endpoint', true);
  if (YAML.isMap(endpoint)) {
    const epStr = extractEndpointString(endpoint);
    if (epStr) endpoints.push(epStr);
  }

  if (endpoints.length < 1) return null;

  // For single-endpoint types, the second endpoint is the type (host, mgmt-net, etc.)
  const linkType = linkMap.get('type');
  if (endpoints.length === 1 && linkType) {
    endpoints.push(String(linkType));
  }

  return [...endpoints].sort().join('|');
}

/**
 * Adds a new link to the topology
 */
function addLink(doc: YAML.Document.Parsed, linkData: LinkSaveData): SaveResult {
  try {
    // Ensure links array exists
    let linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (!linksSeq) {
      linksSeq = new YAML.YAMLSeq();
      linksSeq.flow = false;
      const topoMap = doc.getIn(['topology'], true) as YAML.YAMLMap;
      if (topoMap && YAML.isMap(topoMap)) {
        topoMap.set('links', linksSeq);
      } else {
        return { success: false, error: 'YAML topology is not a map' };
      }
    }

    // Check for duplicate
    const newKey = getLinkKey(linkData);
    for (const item of linksSeq.items) {
      if (YAML.isMap(item)) {
        const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
        if (existingKey === newKey) {
          return { success: false, error: 'Link already exists' };
        }
      }
    }

    // Create the link
    const linkMap = hasExtendedProperties(linkData)
      ? createExtendedLink(doc, linkData)
      : createBriefLink(doc, linkData);

    linksSeq.add(linkMap);

    log.info(`[SaveTopology] Added link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing link in the topology
 */
function editLink(doc: YAML.Document.Parsed, linkData: LinkSaveData): SaveResult {
  try {
    const linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (!linksSeq || !YAML.isSeq(linksSeq)) {
      return { success: false, error: ERROR_LINKS_NOT_SEQ };
    }

    const targetKey = getLinkKey(linkData);
    let found = false;

    for (let i = 0; i < linksSeq.items.length; i++) {
      const item = linksSeq.items[i];
      if (!YAML.isMap(item)) continue;

      const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
      if (existingKey === targetKey) {
        // Replace with updated link
        const updatedLink = hasExtendedProperties(linkData)
          ? createExtendedLink(doc, linkData)
          : createBriefLink(doc, linkData);
        linksSeq.items[i] = updatedLink;
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: 'Link not found' };
    }

    log.info(`[SaveTopology] Updated link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Removes a link from the topology
 */
function deleteLink(doc: YAML.Document.Parsed, linkData: LinkSaveData): SaveResult {
  try {
    const linksSeq = doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (!linksSeq || !YAML.isSeq(linksSeq)) {
      return { success: false, error: ERROR_LINKS_NOT_SEQ };
    }

    const targetKey = getLinkKey(linkData);
    const initialLength = linksSeq.items.length;

    linksSeq.items = linksSeq.items.filter(item => {
      if (!YAML.isMap(item)) return true;
      const existingKey = getYamlLinkKey(item as YAML.YAMLMap);
      return existingKey !== targetKey;
    });

    if (linksSeq.items.length === initialLength) {
      return { success: false, error: 'Link not found' };
    }

    log.info(`[SaveTopology] Deleted link: ${linkData.source} <-> ${linkData.target}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ============================================================================
// Inheritance Resolution
// ============================================================================

/**
 * Resolves inherited configuration from defaults, kinds, and groups
 */
function resolveInheritedConfig(
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

// ============================================================================
// File Operations
// ============================================================================

/**
 * Writes the YAML document to disk
 */
async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  setInternalUpdate?: (updating: boolean) => void
): Promise<SaveResult> {
  try {
    const newContent = doc.toString();

    // Compare with existing content to avoid unnecessary writes
    const existingContent = await fs.promises.readFile(yamlFilePath, 'utf8').catch(() => '');
    if (existingContent === newContent) {
      log.info('[SaveTopology] No changes detected, skipping write');
      return { success: true };
    }

    // Write with internal update flag to prevent file watcher loops
    if (setInternalUpdate) {
      setInternalUpdate(true);
    }

    await fs.promises.writeFile(yamlFilePath, newContent, 'utf8');

    if (setInternalUpdate) {
      // Small delay before clearing flag
      await new Promise(resolve => setTimeout(resolve, 50));
      setInternalUpdate(false);
    }

    log.info(`[SaveTopology] Saved YAML to: ${yamlFilePath}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Saves a node's position to the annotations file
 */
async function saveNodePosition(
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

// ============================================================================
// Main Service Class
// ============================================================================

/**
 * Service for saving topology changes to YAML files
 */
export class SaveTopologyService {
  private doc: YAML.Document.Parsed | null = null;
  private yamlFilePath: string = '';
  private setInternalUpdate?: (updating: boolean) => void;

  /**
   * Initializes the service with a YAML document
   */
  initialize(
    doc: YAML.Document.Parsed,
    yamlFilePath: string,
    setInternalUpdate?: (updating: boolean) => void
  ): void {
    this.doc = doc;
    this.yamlFilePath = yamlFilePath;
    this.setInternalUpdate = setInternalUpdate;
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.doc !== null && this.yamlFilePath !== '';
  }

  /**
   * Adds a new node and saves to YAML
   */
  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = await addNode(this.doc, nodeData, this.yamlFilePath);
    if (result.success) {
      await this.save();
    }
    return result;
  }

  /**
   * Updates an existing node and saves to YAML
   */
  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const topoObj = this.doc.toJS() as ClabTopology;
    const result = editNode(this.doc, nodeData, topoObj);
    if (result.success) {
      await this.save();
    }
    return result;
  }

  /**
   * Removes a node and saves to YAML
   */
  async deleteNode(nodeId: string): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = deleteNode(this.doc, nodeId);
    if (result.success) {
      await this.save();

      // Also remove from annotations
      await annotationsManager.loadAnnotations(this.yamlFilePath).then(async annotations => {
        if (annotations.nodeAnnotations) {
          annotations.nodeAnnotations = annotations.nodeAnnotations.filter(n => n.id !== nodeId);
          await annotationsManager.saveAnnotations(this.yamlFilePath, annotations);
        }
      });
    }
    return result;
  }

  /**
   * Adds a new link and saves to YAML
   */
  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = addLink(this.doc, linkData);
    if (result.success) {
      await this.save();
    }
    return result;
  }

  /**
   * Updates an existing link and saves to YAML
   */
  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = editLink(this.doc, linkData);
    if (result.success) {
      await this.save();
    }
    return result;
  }

  /**
   * Removes a link and saves to YAML
   */
  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = deleteLink(this.doc, linkData);
    if (result.success) {
      await this.save();
    }
    return result;
  }

  /**
   * Saves the current document to disk
   */
  async save(): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }
    return writeYamlFile(this.doc, this.yamlFilePath, this.setInternalUpdate);
  }

  /**
   * Saves node positions to annotations file
   */
  async savePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<SaveResult> {
    if (!this.yamlFilePath) {
      return { success: false, error: ERROR_NO_YAML_PATH };
    }

    try {
      const annotations = await annotationsManager.loadAnnotations(this.yamlFilePath);

      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      for (const { id, position } of positions) {
        const existing = annotations.nodeAnnotations.find(n => n.id === id);
        if (existing) {
          existing.position = position;
        } else {
          annotations.nodeAnnotations.push({ id, position });
        }
      }

      await annotationsManager.saveAnnotations(this.yamlFilePath, annotations);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

// Singleton instance
export const saveTopologyService = new SaveTopologyService();
