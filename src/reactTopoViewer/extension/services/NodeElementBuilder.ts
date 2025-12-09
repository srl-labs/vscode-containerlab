/**
 * Node element builder for creating Cytoscape node elements.
 */

import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topology';
import { ClabLabTreeNode, ClabContainerTreeNode } from '../../../treeView/common';
import { resolveNodeConfig } from './nodeConfig';
import { findContainerNode } from './TreeUtils';
import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from './LinkParser';
import { findDistributedSrosContainer, isDistributedSrosNode } from './DistributedSrosHandler';

export interface NodeBuildOptions {
  includeContainerData: boolean;
  clabTreeData?: Record<string, ClabLabTreeNode>;
  annotations?: Record<string, unknown>;
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
 * Constructs a parent identifier for a node based on its group and label information.
 */
export function buildParent(
  nodeObj: ClabNode,
  nodeAnnotation?: Record<string, unknown>
): string {
  const labels = nodeObj.labels as Record<string, unknown> | undefined;
  const grp = (nodeAnnotation?.group as string) ||
    labels?.['topoViewer-group'] as string ||
    labels?.['graph-group'] as string || '';
  const lvl = (nodeAnnotation?.level as string) ||
    labels?.['topoViewer-groupLevel'] as string ||
    labels?.['graph-level'] as string || '1';

  if (grp && lvl) {
    return `${grp}:${lvl}`;
  }
  return '';
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
}): Record<string, unknown> {
  const {
    mergedNode, inheritedProps, nodeName, clabName, nodeIndex,
    fullPrefix, containerData, cleanedLabels, includeContainerData
  } = params;
  return {
    ...mergedNode,
    inherited: inheritedProps,
    clabServerUsername: 'asad',
    fqdn: `${nodeName}.${clabName}.io`,
    group: mergedNode.group ?? '',
    id: nodeName,
    image: mergedNode.image ?? '',
    index: nodeIndex.toString(),
    kind: mergedNode.kind ?? '',
    type: mergedNode.type ?? '',
    labdir: fullPrefix ? `${fullPrefix}/` : '',
    labels: cleanedLabels,
    longname: containerData?.name ?? (fullPrefix ? `${fullPrefix}-${nodeName}` : nodeName),
    macAddress: '',
    mgmtIntf: '',
    mgmtIpv4AddressLength: 0,
    mgmtIpv4Address: includeContainerData ? `${containerData?.IPv4Address}` : '',
    mgmtIpv6Address: includeContainerData ? `${containerData?.IPv6Address}` : '',
    mgmtIpv6AddressLength: 0,
    mgmtNet: '',
    name: nodeName,
    shortname: nodeName,
    state: includeContainerData ? `${containerData?.state}` : '',
    weight: '3',
  };
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
}): { element: CyElement; parentId: string | undefined } {
  const { parsed, nodeName, nodeObj, opts, fullPrefix, clabName, nodeAnn, nodeIndex } = params;
  const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
  const nodePropKeys = new Set(Object.keys(nodeObj || {}));
  const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
  const parentId = buildParent(mergedNode, nodeAnn);
  const containerData = getContainerData(opts, fullPrefix, nodeName, clabName, mergedNode);
  const cleanedLabels = sanitizeLabels(mergedNode.labels as Record<string, unknown>);
  const pos = nodeAnn?.position as { x: number; y: number } | undefined;
  const position = pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
  const { lat, lng } = getNodeLatLng(nodeAnn);
  const extraData = createNodeExtraData({
    mergedNode,
    inheritedProps,
    nodeName,
    clabName,
    nodeIndex,
    fullPrefix,
    containerData,
    cleanedLabels,
    includeContainerData: opts.includeContainerData,
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
      parent: parentId || undefined,
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

  return { element, parentId };
}

/**
 * Adds node elements to the elements array.
 */
export function addNodeElements(
  parsed: ClabTopology,
  opts: NodeBuildOptions,
  fullPrefix: string,
  clabName: string,
  parentMap: Map<string, string | undefined>,
  elements: CyElement[]
): void {
  const topology = parsed.topology!;
  if (!topology.nodes) return;
  const nodeAnnotations = (opts.annotations as { nodeAnnotations?: Array<{ id: string; groupLabelPos?: string }> })?.nodeAnnotations;
  let nodeIndex = 0;
  for (const [nodeName, nodeObj] of Object.entries(topology.nodes)) {
    const nodeAnn = nodeAnnotations?.find((na) => na.id === nodeName) as Record<string, unknown> | undefined;
    const { element, parentId } = buildNodeElement({
      parsed,
      nodeName,
      nodeObj,
      opts,
      fullPrefix,
      clabName,
      nodeAnn,
      nodeIndex,
    });
    if (parentId && !parentMap.has(parentId)) {
      parentMap.set(parentId, nodeAnn?.groupLabelPos as string | undefined);
    }
    elements.push(element);
    nodeIndex++;
  }
}

/**
 * Adds group nodes to the elements array.
 */
export function addGroupNodes(parentMap: Map<string, string | undefined>, elements: CyElement[]): void {
  for (const [parentId, groupLabelPos] of parentMap) {
    const [groupName, groupLevel] = parentId.split(':');
    const groupNodeEl: CyElement = {
      group: 'nodes',
      data: {
        id: parentId,
        name: groupName || 'UnnamedGroup',
        topoViewerRole: 'group',
        weight: '1000',
        parent: '',
        lat: '',
        lng: '',
        extraData: {
          clabServerUsername: 'asad',
          weight: '2',
          name: '',
          topoViewerGroup: groupName ?? '',
          topoViewerGroupLevel: groupLevel ?? '',
        },
      },
      removed: false,
      selected: false,
      selectable: true,
      locked: false,
      grabbed: false,
      grabbable: true,
      classes: groupLabelPos,
    };
    elements.push(groupNodeEl);
  }
}
