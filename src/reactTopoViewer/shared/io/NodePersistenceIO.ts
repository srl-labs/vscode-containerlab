/**
 * NodePersistenceIO - Pure YAML AST operations for node CRUD
 *
 * Contains only the YAML manipulation logic without file I/O or annotations.
 * Used by both VS Code extension and dev server.
 */

import * as YAML from "yaml";

import type { ClabTopology } from "../types/topology";

import type { SaveResult, IOLogger } from "./types";
import { ERROR_NODES_NOT_MAP, noopLogger } from "./types";
import { deepEqual, setOrDelete } from "./YamlDocumentIO";

/**
 * Gets the nodes map from a YAML document, returning an error result if not found.
 */
function getNodesMapOrError(
  doc: YAML.Document.Parsed
): { nodesMap: YAML.YAMLMap } | { error: SaveResult } {
  const nodesMap = doc.getIn(["topology", "nodes"], true) as YAML.YAMLMap | undefined;
  if (!nodesMap || !YAML.isMap(nodesMap)) {
    return { error: { success: false, error: ERROR_NODES_NOT_MAP } };
  }
  return { nodesMap };
}

/**
 * Ensures the document has topology.nodes and topology.links containers.
 * Used when creating or upserting nodes from an empty/minimal YAML file.
 */
function ensureTopologyContainers(doc: YAML.Document.Parsed): YAML.YAMLMap {
  if (!doc.contents || !YAML.isMap(doc.contents)) {
    doc.contents = doc.createNode({}) as unknown as YAML.ParsedNode;
  }

  const topology = doc.get("topology", true);
  if (!topology || !YAML.isMap(topology)) {
    doc.set("topology", doc.createNode({}) as YAML.YAMLMap);
  }

  const nodesMap = doc.getIn(["topology", "nodes"], true);
  if (!nodesMap || !YAML.isMap(nodesMap)) {
    doc.setIn(["topology", "nodes"], doc.createNode({}) as YAML.YAMLMap);
  }

  const linksSeq = doc.getIn(["topology", "links"], true);
  if (!linksSeq || !YAML.isSeq(linksSeq)) {
    doc.setIn(["topology", "links"], doc.createNode([]) as YAML.YAMLSeq);
  }

  return doc.getIn(["topology", "nodes"], true) as YAML.YAMLMap;
}

/** Node data for save operations */
export interface NodeSaveData {
  id: string;
  name: string;
  extraData?: {
    kind?: string;
    type?: string;
    image?: string;
    group?: string;
    "startup-config"?: string;
    "mgmt-ipv4"?: string;
    "mgmt-ipv6"?: string;
    labels?: Record<string, unknown>;
    env?: Record<string, unknown>;
    binds?: string[];
    ports?: string[];
    [key: string]: unknown;
  };
  position?: { x: number; y: number };
}

/** Node annotation data that can be saved to annotations file */
export interface NodeAnnotationData {
  label?: string | null;
  icon?: string;
  iconColor?: string;
  iconCornerRadius?: number;
  /** Interface pattern for link creation - tracks template inheritance */
  interfacePattern?: string;
  /** Group ID for group membership */
  groupId?: string;
}

/** Node properties that can be saved to YAML */
const NODE_YAML_PROPERTIES = [
  "kind",
  "type",
  "image",
  "group",
  "startup-config",
  "enforce-startup-config",
  "suppress-startup-config",
  "license",
  "binds",
  "env",
  "env-files",
  "labels",
  "user",
  "entrypoint",
  "cmd",
  "exec",
  "restart-policy",
  "auto-remove",
  "startup-delay",
  "mgmt-ipv4",
  "mgmt-ipv6",
  "network-mode",
  "ports",
  "dns",
  "aliases",
  "memory",
  "cpu",
  "cpu-set",
  "shm-size",
  "cap-add",
  "sysctls",
  "devices",
  "certificate",
  "healthcheck",
  "image-pull-policy",
  "runtime",
  "components",
  "stages"
] as const;

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
 * Sets a single property on a node map if the value is valid.
 * Returns true if the property was set, false otherwise.
 */
function setNodeProperty(
  doc: YAML.Document,
  nodeMap: YAML.YAMLMap,
  prop: string,
  value: unknown
): void {
  // Skip undefined/null values
  if (value === undefined || value === null) return;

  // Handle string values - trim whitespace
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) nodeMap.set(prop, doc.createNode(trimmed));
    return;
  }

  // Handle arrays - set if non-empty
  if (Array.isArray(value)) {
    if (value.length > 0) setOrDelete(doc, nodeMap, prop, value);
    return;
  }

  // Handle objects - set if non-empty
  if (typeof value === "object") {
    if (Object.keys(value).length > 0) setOrDelete(doc, nodeMap, prop, value);
    return;
  }

  // Handle other primitives (numbers, booleans)
  setOrDelete(doc, nodeMap, prop, value);
}

/**
 * Creates a new node entry in the YAML document
 */
function createNodeYaml(doc: YAML.Document, nodeData: NodeSaveData): YAML.YAMLMap {
  const nodeMap = new YAML.YAMLMap();
  nodeMap.flow = false;

  const extra = nodeData.extraData || {};

  // Set kind (required, defaults to nokia_srlinux)
  const kind = extra.kind?.trim() || "nokia_srlinux";
  nodeMap.set("kind", doc.createNode(kind));

  // Set all other supported properties from NODE_YAML_PROPERTIES
  for (const prop of NODE_YAML_PROPERTIES) {
    if (prop !== "kind") {
      setNodeProperty(doc, nodeMap, prop, extra[prop]);
    }
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

    // Only delete properties that are explicitly set to null
    // Undefined means "not provided" - preserve existing value
    if (value === undefined) {
      continue;
    }

    // Explicit null means "delete this property"
    if (value === null) {
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
 * Checks if an endpoint item references a specific node
 */
function endpointReferencesNode(ep: unknown, nodeId: string): boolean {
  if (YAML.isScalar(ep)) {
    const str = String(ep.value);
    return str === nodeId || str.startsWith(`${nodeId}:`);
  }
  if (YAML.isMap(ep)) {
    return (ep as YAML.YAMLMap).get("node") === nodeId;
  }
  return false;
}

/**
 * Checks if a link references a specific node
 */
function linkReferencesNode(linkMap: YAML.YAMLMap, nodeId: string): boolean {
  // Check endpoints array
  const endpoints = linkMap.get("endpoints", true);
  if (YAML.isSeq(endpoints)) {
    if (endpoints.items.some((ep) => endpointReferencesNode(ep, nodeId))) {
      return true;
    }
  }

  // Check single endpoint
  const endpoint = linkMap.get("endpoint", true);
  if (YAML.isMap(endpoint)) {
    return (endpoint as YAML.YAMLMap).get("node") === nodeId;
  }

  return false;
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
    if (epMap.get("node") === oldId) {
      epMap.set("node", newId);
    }
  }
}

/**
 * Updates all link references when a node is renamed
 */
function updateLinksForRename(doc: YAML.Document.Parsed, oldId: string, newId: string): void {
  const linksSeq = doc.getIn(["topology", "links"], true) as YAML.YAMLSeq | undefined;
  if (!linksSeq || !YAML.isSeq(linksSeq)) {
    return;
  }

  for (const item of linksSeq.items) {
    if (!YAML.isMap(item)) continue;
    const linkMap = item as YAML.YAMLMap;

    // Check endpoints array
    const endpoints = linkMap.get("endpoints", true);
    if (YAML.isSeq(endpoints)) {
      for (const ep of endpoints.items) {
        updateEndpointReferences(ep, oldId, newId);
      }
    }

    // Check single endpoint (less common)
    const endpoint = linkMap.get("endpoint", true);
    if (YAML.isMap(endpoint)) {
      const epMap = endpoint as YAML.YAMLMap;
      if (epMap.get("node") === oldId) {
        epMap.set("node", newId);
      }
    }
  }
}

/**
 * Find or create a node for editing. Returns the node map and any early exit result.
 */
function findNodeForEdit(
  nodesMap: YAML.YAMLMap,
  originalId: string,
  newName: string,
  isRename: boolean,
  logger: IOLogger
): { nodeMap: YAML.YAMLMap | null; earlyResult: SaveResult | null } {
  const nodeMap = nodesMap.get(originalId, true) as YAML.YAMLMap | undefined;

  if (nodeMap) {
    return { nodeMap, earlyResult: null };
  }

  // Node doesn't exist with originalId
  // For renames (undo/redo), check if target already exists (rename may have already happened)
  if (isRename && nodesMap.has(newName)) {
    logger.info(
      `[SaveTopology] Node "${originalId}" not found, but "${newName}" exists - rename may already be applied`
    );
    return { nodeMap: null, earlyResult: { success: true } };
  }

  // Node truly doesn't exist - fail for renames, create for simple edits
  if (isRename) {
    return {
      nodeMap: null,
      earlyResult: { success: false, error: `Cannot rename: source node "${originalId}" not found` }
    };
  }

  // For non-rename edits, create a new node
  const newNodeMap = new YAML.YAMLMap();
  newNodeMap.flow = false;
  nodesMap.set(newName, newNodeMap);
  logger.warn(`[SaveTopology] Node "${originalId}" not found, creating new node "${newName}"`);
  return { nodeMap: newNodeMap, earlyResult: null };
}

/**
 * Adds a new node to the topology (YAML only, no annotations)
 */
export function addNodeToDoc(
  doc: YAML.Document.Parsed,
  nodeData: NodeSaveData,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    const nodesMap = ensureTopologyContainers(doc);

    const nodeId = nodeData.name || nodeData.id;
    if (!nodeId) {
      return { success: false, error: "Node must have a name or id" };
    }

    // Check if node already exists
    if (nodesMap.has(nodeId)) {
      return { success: false, error: `Node "${nodeId}" already exists` };
    }

    // Create and add the node
    const nodeYaml = createNodeYaml(doc, nodeData);
    nodesMap.set(nodeId, nodeYaml);

    logger.info(`[SaveTopology] Added node: ${nodeId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing node in the topology
 */
export function editNodeInDoc(
  doc: YAML.Document.Parsed,
  nodeData: NodeSaveData,
  topoObj: ClabTopology,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    const nodesMap = ensureTopologyContainers(doc);

    const originalId = nodeData.id;
    const newName = nodeData.name || nodeData.id;

    if (!originalId) {
      return { success: false, error: "Node must have an id" };
    }

    const isRename = newName !== originalId;
    const { nodeMap, earlyResult } = findNodeForEdit(
      nodesMap,
      originalId,
      newName,
      isRename,
      logger
    );

    if (earlyResult) {
      return earlyResult;
    }

    if (!nodeMap) {
      return { success: false, error: "Failed to find or create node" };
    }

    const inheritedConfig = resolveInheritedConfig(
      topoObj,
      nodeData.extraData?.group,
      nodeData.extraData?.kind
    );

    if (isRename) {
      if (nodesMap.has(newName)) {
        return { success: false, error: `Cannot rename: node "${newName}" already exists` };
      }

      updateNodeYaml(doc, nodeMap, nodeData, inheritedConfig);
      nodesMap.set(newName, nodeMap);
      nodesMap.delete(originalId);
      updateLinksForRename(doc, originalId, newName);
      logger.info(`[SaveTopology] Renamed node: ${originalId} -> ${newName}`);
    } else {
      updateNodeYaml(doc, nodeMap, nodeData, inheritedConfig);
      logger.info(`[SaveTopology] Updated node: ${originalId}`);
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
export function deleteNodeFromDoc(
  doc: YAML.Document.Parsed,
  nodeId: string,
  logger: IOLogger = noopLogger
): SaveResult {
  try {
    const result = getNodesMapOrError(doc);
    if ("error" in result) return result.error;
    const { nodesMap } = result;

    if (!nodesMap.has(nodeId)) {
      return { success: false, error: `Node "${nodeId}" not found` };
    }

    nodesMap.delete(nodeId);

    // Also remove any links connected to this node
    const linksSeq = doc.getIn(["topology", "links"], true) as YAML.YAMLSeq | undefined;
    if (linksSeq && YAML.isSeq(linksSeq)) {
      linksSeq.items = linksSeq.items.filter((item) => {
        if (!YAML.isMap(item)) return true;
        return !linkReferencesNode(item as YAML.YAMLMap, nodeId);
      });
    }

    logger.info(`[SaveTopology] Deleted node: ${nodeId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/** Apply annotation data to an annotation object */
export function applyAnnotationData(
  annotation: {
    label?: string;
    icon?: string;
    iconColor?: string;
    iconCornerRadius?: number;
    interfacePattern?: string;
    groupId?: string;
  },
  data?: NodeAnnotationData
): void {
  if (!data) return;
  if (data.label === null) {
    delete annotation.label;
  } else if (data.label !== undefined) {
    annotation.label = data.label;
  }
  if (data.icon) annotation.icon = data.icon;
  if (data.iconColor) annotation.iconColor = data.iconColor;
  if (data.iconCornerRadius !== undefined) annotation.iconCornerRadius = data.iconCornerRadius;
  if (data.interfacePattern) annotation.interfacePattern = data.interfacePattern;
  if (data.groupId) annotation.groupId = data.groupId;
}

/** Build annotation properties for spread */
export function buildAnnotationProps(data?: NodeAnnotationData): Record<string, unknown> {
  if (!data) return {};
  return {
    ...(data.icon && { icon: data.icon }),
    ...(data.iconColor && { iconColor: data.iconColor }),
    ...(data.iconCornerRadius !== undefined && { iconCornerRadius: data.iconCornerRadius }),
    ...(data.interfacePattern && { interfacePattern: data.interfacePattern }),
    ...(data.groupId && { groupId: data.groupId })
  };
}
