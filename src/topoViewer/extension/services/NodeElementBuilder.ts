// file: src/topoViewer/extension/services/NodeElementBuilder.ts

import { ClabNode, CyElement, ClabTopology } from '../../shared/types/topoViewerType';
import { ClabLabTreeNode, ClabContainerTreeNode } from "../../../treeView/common";
import { resolveNodeConfig } from '../../webview/core/nodeConfig';
import { findContainerNode } from './TreeUtils';
import { NODE_KIND_BRIDGE, NODE_KIND_OVS_BRIDGE } from './LinkParser';
import { findDistributedSrosContainer, isDistributedSrosNode } from './DistributedSrosHandler';

export interface NodeBuildOptions {
  includeContainerData: boolean;
  clabTreeData?: Record<string, ClabLabTreeNode>;
  annotations?: any;
}

/**
 * Checks if the topology has preset layout (all nodes have positions).
 */
export function isPresetLayout(parsed: ClabTopology, annotations?: any): boolean {
  const topology = parsed.topology;
  if (!topology || !topology.nodes) return false;
  return Object.keys(topology.nodes).every(nodeName => {
    const ann = annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
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
export function buildParent(nodeObj: ClabNode, nodeAnnotation?: any): string {
  const grp = nodeAnnotation?.group || nodeObj.labels?.['topoViewer-group'] || nodeObj.labels?.['graph-group'] || '';
  const lvl = nodeAnnotation?.level || nodeObj.labels?.['topoViewer-groupLevel'] || nodeObj.labels?.['graph-level'] || '1';

  if (grp && lvl) {
    return `${grp}:${lvl}`;
  }
  return '';
}

/**
 * Extracts icon visual properties from node annotation.
 */
export function extractIconVisuals(nodeAnn: any): Record<string, unknown> {
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
    components: (resolvedNode as any).components ?? [],
  });

  return distributed ?? null;
}

/**
 * Sanitizes labels by removing graph-* properties.
 */
export function sanitizeLabels(labels: Record<string, any> | undefined): Record<string, any> {
  const cleaned = { ...(labels ?? {}) } as Record<string, any>;
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
export function getNodeLatLng(nodeAnn: any): { lat: string; lng: string } {
  const lat = nodeAnn?.geoCoordinates?.lat !== undefined ? String(nodeAnn.geoCoordinates.lat) : '';
  const lng = nodeAnn?.geoCoordinates?.lng !== undefined ? String(nodeAnn.geoCoordinates.lng) : '';
  return { lat, lng };
}

/**
 * Creates the extraData object for a node element.
 */
export function createNodeExtraData(params: {
  mergedNode: any;
  inheritedProps: string[];
  nodeName: string;
  clabName: string;
  nodeIndex: number;
  fullPrefix: string;
  containerData: ClabContainerTreeNode | null;
  cleanedLabels: Record<string, any>;
  includeContainerData: boolean;
}): any {
  const { mergedNode, inheritedProps, nodeName, clabName, nodeIndex, fullPrefix, containerData, cleanedLabels, includeContainerData } = params;
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
  nodeAnn: any;
  nodeIndex: number;
}): { element: CyElement; parentId: string | undefined } {
  const { parsed, nodeName, nodeObj, opts, fullPrefix, clabName, nodeAnn, nodeIndex } = params;
  const mergedNode = resolveNodeConfig(parsed, nodeObj || {});
  const nodePropKeys = new Set(Object.keys(nodeObj || {}));
  const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
  const parentId = buildParent(mergedNode, nodeAnn);
  const containerData = getContainerData(opts, fullPrefix, nodeName, clabName, mergedNode);
  const cleanedLabels = sanitizeLabels(mergedNode.labels);
  const position = nodeAnn?.position ? { x: nodeAnn.position.x, y: nodeAnn.position.y } : { x: 0, y: 0 };
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

  const topoViewerRole =
    nodeAnn?.icon ||
    mergedNode.labels?.['topoViewer-role'] ||
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
  let nodeIndex = 0;
  for (const [nodeName, nodeObj] of Object.entries(topology.nodes)) {
    const nodeAnn = opts.annotations?.nodeAnnotations?.find((na: any) => na.id === nodeName);
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
      parentMap.set(parentId, nodeAnn?.groupLabelPos);
    }
    elements.push(element);
    nodeIndex++;
  }
}

/**
 * Adds group nodes to the elements array.
 */
export function addGroupNodes(parentMap: Map<string, string | undefined>, elements: CyElement[]): void {
  // Create group nodes without positions - Cytoscape will auto-calculate based on children
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
      // Don't set position - let Cytoscape auto-calculate from children's absolute positions
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
