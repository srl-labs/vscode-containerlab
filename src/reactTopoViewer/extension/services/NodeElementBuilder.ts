/**
 * Node element builder for creating Cytoscape node elements.
 */

import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topology';
import { ClabLabTreeNode, ClabContainerTreeNode } from '../../../treeView/common';
import { resolveNodeConfig } from './NodeConfig';
import { findContainerNode } from './TreeUtils';
import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from './LinkParser';
import { findDistributedSrosContainer, isDistributedSrosNode } from './DistributedSrosHandler';
import { DEFAULT_INTERFACE_PATTERNS } from '../../shared/constants/interfacePatterns';

export interface NodeBuildOptions {
  includeContainerData: boolean;
  clabTreeData?: Record<string, ClabLabTreeNode>;
  annotations?: Record<string, unknown>;
}

/**
 * Build interface pattern mapping from built-in defaults only.
 * Custom template patterns are NOT included here - they're only applied
 * when a node is explicitly created from that template (stored in annotation).
 * This avoids conflicts when multiple templates use the same kind.
 */
function buildInterfacePatternMapping(): Record<string, string> {
  return { ...DEFAULT_INTERFACE_PATTERNS };
}

/**
 * Checks if the topology has preset layout (all nodes have positions).
 */
export function isPresetLayout(
  parsed: ClabTopology,
  annotations?: Record<string, unknown>
): boolean {
  const topology = parsed.topology;
  if (!topology || !topology.nodes) return false;
  const nodeAnnotations = (annotations as { nodeAnnotations?: Array<{ id: string; position?: unknown }> })?.nodeAnnotations;
  return Object.keys(topology.nodes).every(nodeName => {
    const ann = nodeAnnotations?.find((na) => na.id === nodeName);
    return ann?.position !== undefined;
  });
}

/**
 * Computes the full prefix for container names.
 */
export function computeFullPrefix(parsed: ClabTopology, clabName: string): string {
  if (parsed.prefix === undefined) {
    return `clab-${clabName}`;
  }
  if (parsed.prefix === '' || parsed.prefix.trim() === '') {
    return '';
  }
  return `${parsed.prefix.trim()}-${clabName}`;
}

/**
 * Extracts icon visual properties from node annotation.
 */
export function extractIconVisuals(nodeAnn: Record<string, unknown> | undefined): Record<string, unknown> {
  const visuals: Record<string, unknown> = {};
  if (typeof nodeAnn?.iconColor === 'string') {
    visuals.iconColor = nodeAnn.iconColor;
  }
  if (typeof nodeAnn?.iconCornerRadius === 'number') {
    visuals.iconCornerRadius = nodeAnn.iconCornerRadius;
  }
  return visuals;
}

/**
 * Gets container data for a node.
 */
export function getContainerData(
  opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> },
  fullPrefix: string,
  nodeName: string,
  clabName: string,
  resolvedNode: ClabNode
): ClabContainerTreeNode | null {
  if (!opts.includeContainerData) return null;
  const containerName = fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
  const direct = findContainerNode(opts.clabTreeData ?? {}, containerName, clabName);
  if (direct) {
    return direct;
  }

  if (!isDistributedSrosNode(resolvedNode)) {
    return null;
  }

  const distributed = findDistributedSrosContainer({
    baseNodeName: nodeName,
    fullPrefix,
    clabTreeData: opts.clabTreeData,
    clabName,
    components: (resolvedNode as Record<string, unknown>).components as unknown[] ?? [],
  });

  return distributed ?? null;
}

/**
 * Sanitizes labels by removing graph-* properties.
 */
export function sanitizeLabels(labels: Record<string, unknown> | undefined): Record<string, unknown> {
  const cleaned = { ...(labels ?? {}) };
  delete cleaned['graph-posX'];
  delete cleaned['graph-posY'];
  delete cleaned['graph-icon'];
  delete cleaned['graph-geoCoordinateLat'];
  delete cleaned['graph-geoCoordinateLng'];
  delete cleaned['graph-groupLabelPos'];
  delete cleaned['graph-group'];
  delete cleaned['graph-level'];
  return cleaned;
}

/**
 * Gets lat/lng from node annotation.
 */
export function getNodeLatLng(nodeAnn: Record<string, unknown> | undefined): { lat: string; lng: string } {
  const geoCoords = nodeAnn?.geoCoordinates as { lat?: number; lng?: number } | undefined;
  const lat = geoCoords?.lat !== undefined ? String(geoCoords.lat) : '';
  const lng = geoCoords?.lng !== undefined ? String(geoCoords.lng) : '';
  return { lat, lng };
}

/**
 * Compute the long name for a node
 */
function computeLongname(
  containerName: string | undefined,
  fullPrefix: string,
  nodeName: string
): string {
  if (containerName) return containerName;
  return fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName;
}

/**
 * Build container-dependent data for extraData
 */
function buildContainerFields(
  includeContainerData: boolean,
  containerData: ClabContainerTreeNode | null
): { mgmtIpv4Address: string; mgmtIpv6Address: string; state: string } {
  if (!includeContainerData) {
    return { mgmtIpv4Address: '', mgmtIpv6Address: '', state: '' };
  }
  return {
    mgmtIpv4Address: `${containerData?.IPv4Address}`,
    mgmtIpv6Address: `${containerData?.IPv6Address}`,
    state: `${containerData?.state}`,
  };
}

/** Result of resolving interface pattern for a node */
interface InterfacePatternResult {
  pattern: string | undefined;
  /** True if pattern was resolved from kind mapping (needs migration to annotations) */
  needsMigration: boolean;
}

/**
 * Resolve interface pattern for a node.
 * Priority: annotation > kind-based mapping
 * Returns the pattern and whether it needs to be migrated to annotations
 */
function resolveInterfacePattern(
  nodeAnn: Record<string, unknown> | undefined,
  kind: string,
  interfacePatternMapping: Record<string, string>
): InterfacePatternResult {
  // First check if the annotation has an interface pattern (node-specific)
  const annPattern = nodeAnn?.interfacePattern;
  if (typeof annPattern === 'string' && annPattern) {
    return { pattern: annPattern, needsMigration: false };
  }
  // Fall back to kind-based mapping - this needs migration
  const kindPattern = interfacePatternMapping[kind];
  return { pattern: kindPattern, needsMigration: Boolean(kindPattern) };
}

/** Result of creating node extraData */
interface NodeExtraDataResult {
  extraData: Record<string, unknown>;
  /** If set, this node's interfacePattern needs to be migrated to annotations */
  migrationPattern?: string;
}

/**
 * Creates the extraData object for a node element.
 */
export function createNodeExtraData(params: {
  mergedNode: ClabNode;
  inheritedProps: string[];
  nodeName: string;
  clabName: string;
  nodeIndex: number;
  fullPrefix: string;
  containerData: ClabContainerTreeNode | null;
  cleanedLabels: Record<string, unknown>;
  includeContainerData: boolean;
  interfacePatternMapping: Record<string, string>;
  nodeAnn?: Record<string, unknown>;
}): NodeExtraDataResult {
  const {
    mergedNode, inheritedProps, nodeName, clabName, nodeIndex,
    fullPrefix, containerData, cleanedLabels, includeContainerData,
    interfacePatternMapping, nodeAnn
  } = params;

  const kind = mergedNode.kind ?? '';
  const { pattern: interfacePattern, needsMigration } = resolveInterfacePattern(nodeAnn, kind, interfacePatternMapping);
  const containerFields = buildContainerFields(includeContainerData, containerData);

  const extraData = {
    ...mergedNode,
    inherited: inheritedProps,
    clabServerUsername: 'asad',
    fqdn: `${nodeName}.${clabName}.io`,
    group: mergedNode.group ?? '',
    id: nodeName,
    image: mergedNode.image ?? '',
    index: nodeIndex.toString(),
    kind,
    type: mergedNode.type ?? '',
    labdir: fullPrefix ? `${fullPrefix}/` : '',
    labels: cleanedLabels,
    longname: computeLongname(containerData?.name, fullPrefix, nodeName),
    macAddress: '',
    mgmtIntf: '',
    mgmtIpv4AddressLength: 0,
    mgmtIpv4Address: containerFields.mgmtIpv4Address,
    mgmtIpv6Address: containerFields.mgmtIpv6Address,
    mgmtIpv6AddressLength: 0,
    mgmtNet: '',
    name: nodeName,
    shortname: nodeName,
    state: containerFields.state,
    weight: '3',
    ...(interfacePattern && { interfacePattern }),
  };

  return {
    extraData,
    migrationPattern: needsMigration ? interfacePattern : undefined
  };
}

/** Result of building a node element */
interface NodeElementResult {
  element: CyElement;
  /** If set, this node's interfacePattern needs to be migrated to annotations */
  migrationPattern?: string;
}

/**
 * Builds a single node element.
 */
export function buildNodeElement(params: {
  parsed: ClabTopology;
  nodeName: string;
  nodeObj: ClabNode;
  opts: { includeContainerData: boolean; clabTreeData?: Record<string, ClabLabTreeNode> };
  fullPrefix: string;
  clabName: string;
  nodeAnn: Record<string, unknown> | undefined;
  nodeIndex: number;
  interfacePatternMapping: Record<string, string>;
}): NodeElementResult {
  const { parsed, nodeName, nodeObj, opts, fullPrefix, clabName, nodeAnn, nodeIndex, interfacePatternMapping } = params;
  const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
  const nodePropKeys = new Set(Object.keys(nodeObj || {}));
  const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
  const containerData = getContainerData(opts, fullPrefix, nodeName, clabName, mergedNode);
  const cleanedLabels = sanitizeLabels(mergedNode.labels as Record<string, unknown>);
  const pos = nodeAnn?.position as { x: number; y: number } | undefined;
  const position = pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
  const { lat, lng } = getNodeLatLng(nodeAnn);
  const { extraData, migrationPattern } = createNodeExtraData({
    mergedNode,
    inheritedProps,
    nodeName,
    clabName,
    nodeIndex,
    fullPrefix,
    containerData,
    cleanedLabels,
    includeContainerData: opts.includeContainerData,
    interfacePatternMapping,
    nodeAnn,
  });

  const labels = mergedNode.labels as Record<string, unknown> | undefined;
  const topoViewerRole =
    (nodeAnn?.icon as string) ||
    labels?.['topoViewer-role'] as string ||
    (mergedNode.kind === NODE_KIND_BRIDGE || mergedNode.kind === NODE_KIND_OVS_BRIDGE ? NODE_KIND_BRIDGE : 'router');

  const iconVisuals = extractIconVisuals(nodeAnn);
  const element: CyElement = {
    group: 'nodes',
    data: {
      id: nodeName,
      weight: '30',
      name: nodeName,
      topoViewerRole,
      ...iconVisuals,
      lat,
      lng,
      extraData,
    },
    position,
    removed: false,
    selected: false,
    selectable: true,
    locked: false,
    grabbed: false,
    grabbable: true,
    classes: '',
  };

  return { element, migrationPattern };
}

/** Interface pattern migration entry */
export interface InterfacePatternMigration {
  nodeId: string;
  interfacePattern: string;
}

/**
 * Adds node elements to the elements array.
 * Returns list of nodes that need interfacePattern migrated to annotations.
 */
export function addNodeElements(
  parsed: ClabTopology,
  opts: NodeBuildOptions,
  fullPrefix: string,
  clabName: string,
  elements: CyElement[]
): InterfacePatternMigration[] {
  const migrations: InterfacePatternMigration[] = [];
  const topology = parsed.topology!;
  if (!topology.nodes) return migrations;
  const nodeAnnotations = (opts.annotations as { nodeAnnotations?: Array<{ id: string; position?: { x: number; y: number } }> })?.nodeAnnotations;
  const interfacePatternMapping = buildInterfacePatternMapping();
  let nodeIndex = 0;
  for (const [nodeName, nodeObj] of Object.entries(topology.nodes)) {
    const nodeAnn = nodeAnnotations?.find((na) => na.id === nodeName) as Record<string, unknown> | undefined;
    const { element, migrationPattern } = buildNodeElement({
      parsed,
      nodeName,
      nodeObj,
      opts,
      fullPrefix,
      clabName,
      nodeAnn,
      nodeIndex,
      interfacePatternMapping,
    });
    elements.push(element);
    // Track migrations for nodes that need interfacePattern written to annotations
    if (migrationPattern) {
      migrations.push({ nodeId: nodeName, interfacePattern: migrationPattern });
    }
    nodeIndex++;
  }
  return migrations;
}
