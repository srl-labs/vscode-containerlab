/**
 * copyPasteUtils - Pure utility functions for copy/paste operations
 * Extracted from useCopyPaste to reduce aggregate complexity
 */
import type { Core, NodeSingular, EdgeSingular } from 'cytoscape';

import { log } from '../../utils/logger';
import { CyElement } from '../../../shared/types/messages';
import { getUniqueId } from '../../../shared/utilities/idUtils';
import { isSpecialEndpointId } from '../../../shared/utilities/LinkTypes';
import {
  createNode,
  createLink,
  beginBatch,
  endBatch,
  type NodeSaveData,
  type LinkSaveData
} from '../../services';

const PASTE_OFFSET = { X: 20, Y: 20 } as const;

export interface CopyData {
  elements: CyElementJson[];
  originalCenter: { x: number; y: number };
}

export interface CyElementJson {
  group: 'nodes' | 'edges';
  data: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphChangeEntry {
  entity: 'node' | 'edge';
  kind: 'add' | 'delete';
  before?: CyElement;
  after?: CyElement;
}

function getNextEndpoint(cy: Core, nodeId: string): string {
  const node = cy.getElementById(nodeId);
  if (node.length === 0) return 'ep1';

  const usedNums = new Set<number>();
  node.connectedEdges().forEach((edge: EdgeSingular) => {
    const epKey = edge.data('source') === nodeId ? 'sourceEndpoint' : 'targetEndpoint';
    const ep = edge.data(epKey) as string | undefined;
    if (!ep || typeof ep !== 'string') return;

    let i = ep.length - 1;
    while (i >= 0 && ep[i] >= '0' && ep[i] <= '9') i--;
    const digits = ep.slice(i + 1);
    if (digits) usedNums.add(parseInt(digits, 10));
  });

  let num = 1;
  while (usedNums.has(num)) num++;
  return `ep${num}`;
}

export function collectCopyData(cy: Core): CopyData | null {
  const selected = cy.$(':selected');
  if (selected.empty()) return null;

  let nodes = selected.nodes().union(selected.nodes().descendants());
  const specialEndpointNodes = nodes.connectedNodes().filter((n: NodeSingular) =>
    isSpecialEndpointId(n.id()) && n.edgesWith(nodes).length > 0
  );
  nodes = nodes.union(specialEndpointNodes);

  const edges = nodes.edgesWith(nodes);
  const elements: CyElementJson[] = [];

  nodes.forEach((node: NodeSingular) => {
    elements.push({
      group: 'nodes',
      data: { ...node.data() },
      position: { ...node.position() }
    });
  });

  edges.forEach((edge: EdgeSingular) => {
    elements.push({
      group: 'edges',
      data: { ...edge.data() }
    });
  });

  const bb = nodes.boundingBox();
  const originalCenter = { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };

  return { elements, originalCenter };
}

function generateTemplateNodeId(usedIds: Set<string>): string {
  const existingNodeIds = Array.from(usedIds).filter(id => id.startsWith('nodeId-'));
  const maxId = existingNodeIds
    .map(id => parseInt(id.replace('nodeId-', ''), 10))
    .filter(num => !isNaN(num))
    .reduce((max, current) => Math.max(max, current), 0);
  return `nodeId-${maxId + 1}`;
}

function generateTemplateNodeIds(
  oldName: string,
  usedIds: Set<string>,
  usedNames: Set<string>
): { newId: string; nodeName: string } {
  const nodeName = getUniqueId(oldName, usedNames);
  const newId = generateTemplateNodeId(usedIds);
  return { newId, nodeName };
}

function generateRegularNodeIds(
  oldName: string,
  usedIds: Set<string>
): { newId: string; nodeName: string } {
  const newId = getUniqueId(oldName, usedIds);
  const nodeName = newId;
  return { newId, nodeName };
}

function applySpecialNameOverrides(newId: string, nodeName: string): string {
  if (newId.startsWith('dummy')) return 'dummy';
  if (isSpecialEndpointId(newId) && newId.includes(':')) return newId;
  return nodeName;
}

function createNodeDataWithProvenance(
  el: CyElementJson,
  newId: string,
  nodeName: string,
  oldId: string
): Record<string, unknown> {
  const newData: Record<string, unknown> = {
    ...el.data,
    id: newId,
    name: nodeName,
    label: (el.data.label as string) || nodeName
  };

  const existingExtraData = el.data.extraData;
  if (existingExtraData && typeof existingExtraData === 'object') {
    newData.extraData = { ...(existingExtraData as Record<string, unknown>), copyFrom: oldId };
  } else {
    newData.extraData = { copyFrom: oldId };
  }

  return newData;
}

function processNodeForPaste(
  el: CyElementJson,
  usedIds: Set<string>,
  usedNames: Set<string>,
  idMap: Map<string, string>
): CyElementJson {
  const oldId = el.data.id as string;
  const oldName = (el.data.name as string) || oldId;
  const isTemplateNode = oldId.startsWith('nodeId-');

  const { newId, nodeName: rawNodeName } = isTemplateNode
    ? generateTemplateNodeIds(oldName, usedIds, usedNames)
    : generateRegularNodeIds(oldName, usedIds);

  const nodeName = applySpecialNameOverrides(newId, rawNodeName);
  const newData = createNodeDataWithProvenance(el, newId, nodeName, oldId);

  idMap.set(oldId, newId);
  usedIds.add(newId);
  usedNames.add(nodeName);

  return {
    group: 'nodes',
    data: newData,
    position: el.position ? { ...el.position } : undefined
  };
}

function processEdgesForPaste(elements: CyElementJson[], idMap: Map<string, string>): CyElementJson[] {
  const newEdges: CyElementJson[] = [];

  for (const el of elements) {
    if (el.group !== 'edges') continue;

    const oldSource = el.data.source as string;
    const oldTarget = el.data.target as string;

    if (!idMap.has(oldSource) || !idMap.has(oldTarget)) continue;

    const newSource = idMap.get(oldSource)!;
    const newTarget = idMap.get(oldTarget)!;
    const newEdgeId = `${newSource}-${newTarget}`;

    newEdges.push({
      group: 'edges',
      data: { ...el.data, id: newEdgeId, source: newSource, target: newTarget, editor: 'true' }
    });
  }

  return newEdges;
}

export function buildNewElements(
  cy: Core,
  elements: CyElementJson[]
): { newElements: CyElementJson[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>(cy.nodes().map((n: NodeSingular) => n.id()));
  const usedNames = new Set<string>(cy.nodes().map((n: NodeSingular) => n.data('name') as string));
  const newElements: CyElementJson[] = [];

  for (const el of elements) {
    if (el.group !== 'nodes') continue;
    newElements.push(processNodeForPaste(el, usedIds, usedNames, idMap));
  }

  for (const el of newElements) {
    if (el.data.parent && idMap.has(el.data.parent as string)) {
      el.data.parent = idMap.get(el.data.parent as string);
    }
  }

  newElements.push(...processEdgesForPaste(elements, idMap));

  return { newElements, idMap };
}

export function calculatePasteDelta(
  cy: Core,
  originalCenter: { x: number; y: number },
  pasteCounter: number,
  lastPasteCenter: { x: number; y: number } | null
): { deltaX: number; deltaY: number } | null {
  if (pasteCounter === 0) {
    const viewport = cy.extent();
    const viewportCenter = {
      x: viewport.x1 + viewport.w / 2,
      y: viewport.y1 + viewport.h / 2
    };
    return {
      deltaX: viewportCenter.x - originalCenter.x,
      deltaY: viewportCenter.y - originalCenter.y
    };
  } else if (lastPasteCenter) {
    return {
      deltaX: lastPasteCenter.x + PASTE_OFFSET.X - originalCenter.x,
      deltaY: lastPasteCenter.y + PASTE_OFFSET.Y - originalCenter.y
    };
  }
  return null;
}

export function applyPositionDelta(
  elements: CyElementJson[],
  deltaX: number,
  deltaY: number
): { x: number; y: number } {
  const positioned = elements.filter(el => el.position);

  for (const el of positioned) {
    if (el.position) {
      el.position.x += deltaX;
      el.position.y += deltaY;
    }
  }

  if (positioned.length === 0) return { x: 0, y: 0 };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const el of positioned) {
    if (el.position) {
      minX = Math.min(minX, el.position.x);
      maxX = Math.max(maxX, el.position.x);
      minY = Math.min(minY, el.position.y);
      maxY = Math.max(maxY, el.position.y);
    }
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function toCyElement(el: CyElementJson): CyElement {
  return { group: el.group, data: el.data, position: el.position };
}

export function postProcessEdges(cy: Core, elements: CyElementJson[]): void {
  for (const el of elements) {
    if (el.group !== 'edges') continue;

    const edge = cy.getElementById(el.data.id as string);
    if (edge.length === 0) continue;

    const src = el.data.source as string;
    const tgt = el.data.target as string;

    if (!el.data.sourceEndpoint && !isSpecialEndpointId(src)) {
      edge.data('sourceEndpoint', getNextEndpoint(cy, src));
    }
    if (!el.data.targetEndpoint && !isSpecialEndpointId(tgt)) {
      edge.data('targetEndpoint', getNextEndpoint(cy, tgt));
    }

    edge.data('editor', 'true');

    if (isSpecialEndpointId(src) || isSpecialEndpointId(tgt)) {
      edge.addClass('stub-link');
    }
  }
}

export function recordPasteAction(
  newElements: CyElementJson[],
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void
): void {
  if (!recordGraphChanges) return;

  const beforeChanges: GraphChangeEntry[] = [];
  const afterChanges: GraphChangeEntry[] = [];

  for (const el of newElements) {
    const cyEl = toCyElement(el);
    const entity = el.group === 'nodes' ? 'node' : 'edge';
    beforeChanges.push({ entity, kind: 'delete', before: cyEl });
    afterChanges.push({ entity, kind: 'add', after: cyEl });
  }

  recordGraphChanges(beforeChanges, afterChanges);
}

function persistPastedNodes(nodes: CyElementJson[]): void {
  for (const node of nodes) {
    const nodeData: NodeSaveData = {
      id: node.data.id as string,
      name: (node.data.name as string) || (node.data.id as string),
      position: node.position,
      extraData: {
        kind: node.data.kind as string | undefined,
        image: node.data.image as string | undefined,
        group: node.data.group as string | undefined,
        topoViewerRole: node.data.topoViewerRole,
        iconColor: node.data.iconColor,
        iconCornerRadius: node.data.iconCornerRadius,
        interfacePattern: node.data.interfacePattern
      }
    };
    void createNode(nodeData);
  }
}

function persistPastedEdges(edges: CyElementJson[]): void {
  for (const edge of edges) {
    const src = edge.data.source as string;
    const tgt = edge.data.target as string;
    if (isSpecialEndpointId(src) || isSpecialEndpointId(tgt)) continue;

    const linkData: LinkSaveData = {
      id: edge.data.id as string,
      source: src,
      target: tgt,
      sourceEndpoint: (edge.data.sourceEndpoint as string) || '',
      targetEndpoint: (edge.data.targetEndpoint as string) || ''
    };
    void createLink(linkData);
  }
}

export function persistPastedElements(elements: CyElementJson[]): void {
  beginBatch();

  const nodes = elements.filter(el => el.group === 'nodes' && !isSpecialEndpointId(el.data.id as string));
  persistPastedNodes(nodes);

  const edges = elements.filter(el => el.group === 'edges');
  persistPastedEdges(edges);

  // Note: positions are saved as part of createNode, no separate call needed
  void endBatch();
}

function applyPastePositionDelta(
  cy: Core,
  newElements: CyElementJson[],
  originalCenter: { x: number; y: number },
  pasteCounter: number,
  lastPasteCenter: { x: number; y: number } | null
): { x: number; y: number } | null {
  const delta = calculatePasteDelta(cy, originalCenter, pasteCounter, lastPasteCenter);
  if (!delta) return null;
  return applyPositionDelta(newElements, delta.deltaX, delta.deltaY);
}

function addAndSelectElements(cy: Core, newElements: CyElementJson[]): void {
  const added = cy.add(newElements.map(el => ({
    group: el.group,
    data: el.data,
    position: el.position
  })));

  postProcessEdges(cy, newElements);

  cy.$(':selected').unselect();
  added.select();
}

export function executePaste(
  cy: Core,
  copyData: CopyData,
  pasteCounter: number,
  lastPasteCenter: { x: number; y: number } | null,
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void
): { newCenter: { x: number; y: number } | null } {
  const { newElements, idMap } = buildNewElements(cy, copyData.elements);

  if (newElements.length === 0) {
    log.info('[CopyPaste] No valid elements to paste');
    return { newCenter: null };
  }

  let newCenter: { x: number; y: number } | null = null;
  if (copyData.originalCenter) {
    newCenter = applyPastePositionDelta(
      cy,
      newElements,
      copyData.originalCenter,
      pasteCounter,
      lastPasteCenter
    );
  }

  addAndSelectElements(cy, newElements);

  log.info(`[CopyPaste] Pasted ${newElements.length} elements (${idMap.size} nodes)`);

  persistPastedElements(newElements);
  recordPasteAction(newElements, recordGraphChanges);

  return { newCenter };
}

export function executeCopy(cy: Core): CopyData | null {
  const copyData = collectCopyData(cy);
  if (!copyData) {
    log.info('[CopyPaste] Nothing selected to copy');
    return null;
  }

  // Copy data is returned and stored locally by the caller
  log.info(`[CopyPaste] Copied ${copyData.elements.length} elements`);
  return copyData;
}
