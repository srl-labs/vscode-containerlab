/**
 * Unified clipboard system for copying/pasting groups, nodes, and annotations together.
 * Maintains group membership and relationships when pasting.
 */

import { useCallback, useRef } from 'react';
import type { Core as CyCore, NodeSingular, NodeCollection, EdgeCollection } from 'cytoscape';

import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from '../../../shared/types/topology';
import type { CyElement } from '../../../shared/types/messages';
import { log } from '../../utils/logger';
import { beginBatch, endBatch } from '../../services';
import { getUniqueId } from '../../../shared/utilities/idUtils';

/** Node data stored in clipboard */
interface ClipboardNode {
  id: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  relativePosition: { x: number; y: number };
  groupId: string | null;
}

/** Edge data stored in clipboard */
interface ClipboardEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown>;
}

/** Group data stored in clipboard */
interface ClipboardGroup {
  group: GroupStyleAnnotation;
  relativePosition: { x: number; y: number };
}

/** Text annotation in clipboard */
interface ClipboardTextAnnotation {
  annotation: FreeTextAnnotation;
  relativePosition: { x: number; y: number };
}

/** Shape annotation in clipboard */
interface ClipboardShapeAnnotation {
  annotation: FreeShapeAnnotation;
  relativePosition: { x: number; y: number };
  relativeEndPosition?: { x: number; y: number };
}

/** Complete clipboard data structure */
export interface UnifiedClipboardData {
  /** Origin point used for relative positioning */
  origin: { x: number; y: number };
  /** Cytoscape nodes */
  nodes: ClipboardNode[];
  /** Cytoscape edges */
  edges: ClipboardEdge[];
  /** Groups (hierarchical) */
  groups: ClipboardGroup[];
  /** Text annotations */
  textAnnotations: ClipboardTextAnnotation[];
  /** Shape annotations */
  shapeAnnotations: ClipboardShapeAnnotation[];
  /** Timestamp of copy operation */
  timestamp: number;
}

/** Result of paste operation */
export interface PasteResult {
  /** Mapping of old IDs to new IDs */
  idMapping: Map<string, string>;
  /** New group IDs created */
  newGroupIds: string[];
  /** New node IDs created */
  newNodeIds: string[];
  /** New text annotation IDs created */
  newTextAnnotationIds: string[];
  /** New shape annotation IDs created */
  newShapeAnnotationIds: string[];
}

export interface UseUnifiedClipboardOptions {
  /** Cytoscape instance */
  cyInstance: CyCore | null;
  /** All groups */
  groups: GroupStyleAnnotation[];
  /** All text annotations */
  textAnnotations: FreeTextAnnotation[];
  /** All shape annotations */
  shapeAnnotations: FreeShapeAnnotation[];
  /** Get group membership for a node */
  getNodeMembership: (nodeId: string) => string | null;
  /** Get members of a group */
  getGroupMembers: (groupId: string) => string[];
  /** Selected group IDs */
  selectedGroupIds: Set<string>;
  /** Selected text annotation IDs */
  selectedTextAnnotationIds: Set<string>;
  /** Selected shape annotation IDs */
  selectedShapeAnnotationIds: Set<string>;
  /** Callback to add a group */
  onAddGroup: (group: GroupStyleAnnotation) => void;
  /** Callback to add a text annotation */
  onAddTextAnnotation: (annotation: FreeTextAnnotation) => void;
  /** Callback to add a shape annotation */
  onAddShapeAnnotation: (annotation: FreeShapeAnnotation) => void;
  /** Callback to add a node to a group */
  onAddNodeToGroup: (nodeId: string, groupId: string) => void;
  /** Generate a unique group ID */
  generateGroupId: () => string;
  /** Callback to create a node (persists to YAML) */
  onCreateNode?: (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => void;
  /** Callback to create an edge (persists to YAML) */
  onCreateEdge?: (sourceId: string, targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => void;
  /** Begin undo batch mode - actions will be collected until endBatch is called */
  beginUndoBatch?: () => void;
  /** End undo batch mode - commits all collected actions as a single undo entry */
  endUndoBatch?: () => void;
}

export interface UseUnifiedClipboardReturn {
  /** Copy all selected elements to clipboard */
  copy: () => boolean;
  /** Paste clipboard contents at position */
  paste: (position: { x: number; y: number }) => PasteResult | null;
  /** Check if clipboard has data */
  hasClipboardData: () => boolean;
  /** Clear clipboard */
  clearClipboard: () => void;
  /** Get clipboard data for inspection */
  getClipboardData: () => UnifiedClipboardData | null;
}

/** Counter for generating unique IDs */
let idCounter = 0;

/** Generate a unique ID with prefix */
function generateId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

/** Calculate bounding box center of positions */
function calculateCenter(positions: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };

  const sum = positions.reduce(
    (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length
  };
}

/** Get descendant groups of a group */
function getDescendantGroupIds(groupId: string, groups: GroupStyleAnnotation[]): string[] {
  const descendants: string[] = [];
  const children = groups.filter(g => g.parentId === groupId);

  for (const child of children) {
    descendants.push(child.id);
    descendants.push(...getDescendantGroupIds(child.id, groups));
  }

  return descendants;
}

/** Collect all group IDs to include in clipboard */
function collectGroupIdsToInclude(
  selectedGroupIds: Set<string>,
  selectedNodes: NodeCollection,
  groups: GroupStyleAnnotation[],
  getNodeMembership: (nodeId: string) => string | null
): Set<string> {
  const groupIdsToInclude = new Set<string>();

  for (const groupId of selectedGroupIds) {
    groupIdsToInclude.add(groupId);
    const descendants = getDescendantGroupIds(groupId, groups);
    descendants.forEach(id => groupIdsToInclude.add(id));
  }

  selectedNodes.forEach(node => {
    const groupId = getNodeMembership(node.id());
    if (groupId) {
      groupIdsToInclude.add(groupId);
    }
  });

  return groupIdsToInclude;
}

/** Collect all node IDs to include in clipboard */
function collectNodeIdsToInclude(
  selectedNodes: NodeCollection,
  groupIdsToInclude: Set<string>,
  getGroupMembers: (groupId: string) => string[]
): Set<string> {
  const nodeIdsToInclude = new Set<string>();
  selectedNodes.forEach(node => { nodeIdsToInclude.add(node.id()); });

  for (const groupId of groupIdsToInclude) {
    const members = getGroupMembers(groupId);
    members.forEach(nodeId => nodeIdsToInclude.add(nodeId));
  }

  return nodeIdsToInclude;
}

/** Collect clipboard nodes from cytoscape */
function collectClipboardNodes(
  nodeIdsToInclude: Set<string>,
  cyInstance: CyCore,
  getNodeMembership: (nodeId: string) => string | null
): { nodes: ClipboardNode[]; positions: Array<{ x: number; y: number }> } {
  const clipboardNodes: ClipboardNode[] = [];
  const positions: Array<{ x: number; y: number }> = [];

  for (const nodeId of nodeIdsToInclude) {
    const node = cyInstance.getElementById(nodeId) as NodeSingular;
    if (node.length > 0) {
      const pos = node.position();
      positions.push(pos);
      const membership = getNodeMembership(node.id());
      log.info(`[UnifiedClipboard] Copying node ${node.id()}, group membership: ${membership ?? 'none'}`);
      clipboardNodes.push({
        id: node.id(),
        data: { ...(node.data() as Record<string, unknown>) },
        position: { ...pos },
        relativePosition: { x: 0, y: 0 },
        groupId: membership
      });
    }
  }

  return { nodes: clipboardNodes, positions };
}

/** Collect clipboard edges from cytoscape */
function collectClipboardEdges(
  selectedEdges: EdgeCollection,
  nodeIdsToInclude: Set<string>
): ClipboardEdge[] {
  const clipboardEdges: ClipboardEdge[] = [];

  selectedEdges.forEach(edge => {
    const sourceId = edge.source().id();
    const targetId = edge.target().id();
    if (nodeIdsToInclude.has(sourceId) && nodeIdsToInclude.has(targetId)) {
      clipboardEdges.push({
        id: edge.id(),
        source: sourceId,
        target: targetId,
        data: { ...(edge.data() as Record<string, unknown>) }
      });
    }
  });

  return clipboardEdges;
}

/** Collect clipboard groups */
function collectClipboardGroups(
  groupIdsToInclude: Set<string>,
  groups: GroupStyleAnnotation[]
): { groups: ClipboardGroup[]; positions: Array<{ x: number; y: number }> } {
  const clipboardGroups: ClipboardGroup[] = [];
  const positions: Array<{ x: number; y: number }> = [];

  for (const groupId of groupIdsToInclude) {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      positions.push(group.position);
      clipboardGroups.push({
        group: { ...group },
        relativePosition: { x: 0, y: 0 }
      });
    }
  }

  return { groups: clipboardGroups, positions };
}

/** Collect clipboard text annotations */
function collectClipboardTextAnnotations(
  selectedTextAnnotationIds: Set<string>,
  groupIdsToInclude: Set<string>,
  textAnnotations: FreeTextAnnotation[]
): { annotations: ClipboardTextAnnotation[]; positions: Array<{ x: number; y: number }> } {
  const textAnnotationIdsToInclude = new Set<string>(selectedTextAnnotationIds);

  for (const groupId of groupIdsToInclude) {
    textAnnotations
      .filter(a => a.groupId === groupId)
      .forEach(a => textAnnotationIdsToInclude.add(a.id));
  }

  const clipboardTextAnnotations: ClipboardTextAnnotation[] = [];
  const positions: Array<{ x: number; y: number }> = [];

  for (const annotationId of textAnnotationIdsToInclude) {
    const annotation = textAnnotations.find(a => a.id === annotationId);
    if (annotation) {
      positions.push(annotation.position);
      clipboardTextAnnotations.push({
        annotation: { ...annotation },
        relativePosition: { x: 0, y: 0 }
      });
    }
  }

  return { annotations: clipboardTextAnnotations, positions };
}

/** Collect clipboard shape annotations */
function collectClipboardShapeAnnotations(
  selectedShapeAnnotationIds: Set<string>,
  groupIdsToInclude: Set<string>,
  shapeAnnotations: FreeShapeAnnotation[]
): { annotations: ClipboardShapeAnnotation[]; positions: Array<{ x: number; y: number }> } {
  const shapeAnnotationIdsToInclude = new Set<string>(selectedShapeAnnotationIds);

  for (const groupId of groupIdsToInclude) {
    shapeAnnotations
      .filter(a => a.groupId === groupId)
      .forEach(a => shapeAnnotationIdsToInclude.add(a.id));
  }

  const clipboardShapeAnnotations: ClipboardShapeAnnotation[] = [];
  const positions: Array<{ x: number; y: number }> = [];

  for (const annotationId of shapeAnnotationIdsToInclude) {
    const annotation = shapeAnnotations.find(a => a.id === annotationId);
    if (annotation) {
      positions.push(annotation.position);
      const item: ClipboardShapeAnnotation = {
        annotation: { ...annotation },
        relativePosition: { x: 0, y: 0 }
      };
      if (annotation.endPosition) {
        item.relativeEndPosition = { x: 0, y: 0 };
      }
      clipboardShapeAnnotations.push(item);
    }
  }

  return { annotations: clipboardShapeAnnotations, positions };
}

/** Update relative positions based on origin */
function updateRelativePositions(
  origin: { x: number; y: number },
  clipboardNodes: ClipboardNode[],
  clipboardGroups: ClipboardGroup[],
  clipboardTextAnnotations: ClipboardTextAnnotation[],
  clipboardShapeAnnotations: ClipboardShapeAnnotation[]
): void {
  clipboardNodes.forEach(node => {
    node.relativePosition = {
      x: node.position.x - origin.x,
      y: node.position.y - origin.y
    };
  });

  clipboardGroups.forEach(item => {
    item.relativePosition = {
      x: item.group.position.x - origin.x,
      y: item.group.position.y - origin.y
    };
  });

  clipboardTextAnnotations.forEach(item => {
    item.relativePosition = {
      x: item.annotation.position.x - origin.x,
      y: item.annotation.position.y - origin.y
    };
  });

  clipboardShapeAnnotations.forEach(item => {
    item.relativePosition = {
      x: item.annotation.position.x - origin.x,
      y: item.annotation.position.y - origin.y
    };
    if (item.annotation.endPosition && item.relativeEndPosition) {
      item.relativeEndPosition = {
        x: item.annotation.endPosition.x - origin.x,
        y: item.annotation.endPosition.y - origin.y
      };
    }
  });
}

/** Paste groups into the topology */
function pasteGroups(
  clipboardGroups: ClipboardGroup[],
  position: { x: number; y: number },
  offset: number,
  idMapping: Map<string, string>,
  generateGroupId: () => string,
  onAddGroup: (group: GroupStyleAnnotation) => void
): string[] {
  const sortedGroups = [...clipboardGroups].sort((a, b) => {
    const depthA = a.group.parentId ? 1 : 0;
    const depthB = b.group.parentId ? 1 : 0;
    return depthA - depthB;
  });

  const newGroupIds: string[] = [];

  for (const item of sortedGroups) {
    const newGroupId = generateGroupId();
    idMapping.set(item.group.id, newGroupId);

    const newParentId = item.group.parentId
      ? idMapping.get(item.group.parentId)
      : undefined;

    const newGroup: GroupStyleAnnotation = {
      ...item.group,
      id: newGroupId,
      parentId: newParentId,
      position: {
        x: position.x + item.relativePosition.x + offset,
        y: position.y + item.relativePosition.y + offset
      }
    };

    onAddGroup(newGroup);
    newGroupIds.push(newGroupId);
  }

  return newGroupIds;
}

/** Paste nodes into the topology */
function pasteNodes(
  clipboardNodes: ClipboardNode[],
  position: { x: number; y: number },
  offset: number,
  idMapping: Map<string, string>,
  cyInstance: CyCore,
  onAddNodeToGroup: (nodeId: string, groupId: string) => void,
  onCreateNode?: (nodeId: string, nodeElement: CyElement, position: { x: number; y: number }) => void
): string[] {
  const newNodeIds: string[] = [];

  // Get existing node names to avoid duplicates
  const usedNames = new Set<string>(cyInstance.nodes().map(node => (node.data('name') as string | undefined) || node.id()));

  for (const item of clipboardNodes) {
    // Generate unique name based on original node name
    const originalName = (item.data.name as string) || item.id;
    const newNodeName = getUniqueId(originalName, usedNames);
    usedNames.add(newNodeName); // Add to set to prevent duplicates in same paste

    idMapping.set(item.id, newNodeName);

    const newPosition = {
      x: position.x + item.relativePosition.x + offset,
      y: position.y + item.relativePosition.y + offset
    };

    const nodeData: Record<string, unknown> = { ...item.data, id: newNodeName, name: newNodeName };
    delete nodeData.position;

    if (onCreateNode) {
      // Use the callback to create node with persistence
      const nodeElement: CyElement = {
        group: 'nodes',
        data: nodeData,
        position: newPosition
      };
      onCreateNode(newNodeName, nodeElement, newPosition);
    } else {
      // Fallback to direct cytoscape add (no persistence)
      cyInstance.add({
        group: 'nodes',
        data: nodeData,
        position: newPosition
      });
    }

    newNodeIds.push(newNodeName);

    if (item.groupId) {
      const newGroupId = idMapping.get(item.groupId);
      log.info(`[UnifiedClipboard] Node ${item.id} -> ${newNodeName}, original group: ${item.groupId}, new group: ${newGroupId}`);
      if (newGroupId) {
        onAddNodeToGroup(newNodeName, newGroupId);
        log.info(`[UnifiedClipboard] Added node ${newNodeName} to group ${newGroupId}`);
      } else {
        log.warn(`[UnifiedClipboard] Could not find new group ID for original group ${item.groupId}`);
      }
    } else {
      log.info(`[UnifiedClipboard] Node ${item.id} -> ${newNodeName}, no group membership`);
    }
  }

  return newNodeIds;
}

/** Paste edges into the topology */
function pasteEdges(
  clipboardEdges: ClipboardEdge[],
  idMapping: Map<string, string>,
  cyInstance: CyCore,
  onCreateEdge?: (sourceId: string, targetId: string, edgeData: { id: string; source: string; target: string; sourceEndpoint: string; targetEndpoint: string }) => void
): void {
  for (const item of clipboardEdges) {
    const newSourceId = idMapping.get(item.source);
    const newTargetId = idMapping.get(item.target);

    if (newSourceId && newTargetId) {
      const newEdgeId = `${newSourceId}:${(item.data.sourceEndpoint as string) || 'eth1'}--${newTargetId}:${(item.data.targetEndpoint as string) || 'eth1'}`;
      idMapping.set(item.id, newEdgeId);

      const edgeData = {
        ...item.data,
        id: newEdgeId,
        source: newSourceId,
        target: newTargetId
      };

      if (onCreateEdge) {
        // Use the callback to create edge with persistence
        onCreateEdge(newSourceId, newTargetId, {
          id: newEdgeId,
          source: newSourceId,
          target: newTargetId,
          sourceEndpoint: (item.data.sourceEndpoint as string) || 'eth1',
          targetEndpoint: (item.data.targetEndpoint as string) || 'eth1'
        });
      } else {
        // Fallback to direct cytoscape add (no persistence)
        cyInstance.add({
          group: 'edges',
          data: edgeData
        });
      }
    }
  }
}

/** Paste text annotations into the topology */
function pasteTextAnnotations(
  clipboardTextAnnotations: ClipboardTextAnnotation[],
  position: { x: number; y: number },
  offset: number,
  idMapping: Map<string, string>,
  onAddTextAnnotation: (annotation: FreeTextAnnotation) => void
): string[] {
  const newTextAnnotationIds: string[] = [];

  for (const item of clipboardTextAnnotations) {
    const newAnnotationId = generateId('freeText');
    idMapping.set(item.annotation.id, newAnnotationId);

    const newGroupId = item.annotation.groupId
      ? idMapping.get(item.annotation.groupId)
      : undefined;

    const newAnnotation: FreeTextAnnotation = {
      ...item.annotation,
      id: newAnnotationId,
      groupId: newGroupId,
      position: {
        x: position.x + item.relativePosition.x + offset,
        y: position.y + item.relativePosition.y + offset
      }
    };

    onAddTextAnnotation(newAnnotation);
    newTextAnnotationIds.push(newAnnotationId);
  }

  return newTextAnnotationIds;
}

/** Paste shape annotations into the topology */
function pasteShapeAnnotations(
  clipboardShapeAnnotations: ClipboardShapeAnnotation[],
  position: { x: number; y: number },
  offset: number,
  idMapping: Map<string, string>,
  onAddShapeAnnotation: (annotation: FreeShapeAnnotation) => void
): string[] {
  const newShapeAnnotationIds: string[] = [];

  for (const item of clipboardShapeAnnotations) {
    const newAnnotationId = generateId('freeShape');
    idMapping.set(item.annotation.id, newAnnotationId);

    const newGroupId = item.annotation.groupId
      ? idMapping.get(item.annotation.groupId)
      : undefined;

    const newAnnotation: FreeShapeAnnotation = {
      ...item.annotation,
      id: newAnnotationId,
      groupId: newGroupId,
      position: {
        x: position.x + item.relativePosition.x + offset,
        y: position.y + item.relativePosition.y + offset
      }
    };

    if (item.relativeEndPosition && item.annotation.endPosition) {
      newAnnotation.endPosition = {
        x: position.x + item.relativeEndPosition.x + offset,
        y: position.y + item.relativeEndPosition.y + offset
      };
    }

    onAddShapeAnnotation(newAnnotation);
    newShapeAnnotationIds.push(newAnnotationId);
  }

  return newShapeAnnotationIds;
}

export function useUnifiedClipboard(options: UseUnifiedClipboardOptions): UseUnifiedClipboardReturn {
  const {
    cyInstance,
    groups,
    textAnnotations,
    shapeAnnotations,
    getNodeMembership,
    getGroupMembers,
    selectedGroupIds,
    selectedTextAnnotationIds,
    selectedShapeAnnotationIds,
    onAddGroup,
    onAddTextAnnotation,
    onAddShapeAnnotation,
    onAddNodeToGroup,
    generateGroupId,
    onCreateNode,
    onCreateEdge,
    beginUndoBatch,
    endUndoBatch
  } = options;

  const clipboardRef = useRef<UnifiedClipboardData | null>(null);
  const pasteCounterRef = useRef(0);

  const copy = useCallback((): boolean => {
    if (!cyInstance) {
      log.warn('[UnifiedClipboard] No cytoscape instance');
      return false;
    }

    const selectedNodes = cyInstance.nodes(':selected');
    const selectedEdges = cyInstance.edges(':selected');

    // Collect IDs
    const groupIdsToInclude = collectGroupIdsToInclude(
      selectedGroupIds, selectedNodes, groups, getNodeMembership
    );
    const nodeIdsToInclude = collectNodeIdsToInclude(
      selectedNodes, groupIdsToInclude, getGroupMembers
    );

    // Collect all elements
    const { nodes: clipboardNodes, positions: nodePositions } =
      collectClipboardNodes(nodeIdsToInclude, cyInstance, getNodeMembership);
    const clipboardEdges = collectClipboardEdges(selectedEdges, nodeIdsToInclude);
    const { groups: clipboardGroups, positions: groupPositions } =
      collectClipboardGroups(groupIdsToInclude, groups);
    const { annotations: clipboardTextAnnotations, positions: textPositions } =
      collectClipboardTextAnnotations(selectedTextAnnotationIds, groupIdsToInclude, textAnnotations);
    const { annotations: clipboardShapeAnnotations, positions: shapePositions } =
      collectClipboardShapeAnnotations(selectedShapeAnnotationIds, groupIdsToInclude, shapeAnnotations);

    // Check if we have anything to copy
    const hasContent = clipboardNodes.length > 0 || clipboardGroups.length > 0 ||
      clipboardTextAnnotations.length > 0 || clipboardShapeAnnotations.length > 0;
    if (!hasContent) {
      log.info('[UnifiedClipboard] Nothing to copy');
      return false;
    }

    // Calculate center and update relative positions
    const allPositions = [...nodePositions, ...groupPositions, ...textPositions, ...shapePositions];
    const origin = calculateCenter(allPositions);
    updateRelativePositions(origin, clipboardNodes, clipboardGroups, clipboardTextAnnotations, clipboardShapeAnnotations);

    // Store in clipboard
    clipboardRef.current = {
      origin,
      nodes: clipboardNodes,
      edges: clipboardEdges,
      groups: clipboardGroups,
      textAnnotations: clipboardTextAnnotations,
      shapeAnnotations: clipboardShapeAnnotations,
      timestamp: Date.now()
    };

    pasteCounterRef.current = 0;

    log.info(
      `[UnifiedClipboard] Copied ${clipboardNodes.length} nodes, ` +
      `${clipboardEdges.length} edges, ${clipboardGroups.length} groups, ` +
      `${clipboardTextAnnotations.length} texts, ${clipboardShapeAnnotations.length} shapes`
    );

    return true;
  }, [
    cyInstance, groups, textAnnotations, shapeAnnotations,
    selectedGroupIds, selectedTextAnnotationIds, selectedShapeAnnotationIds,
    getNodeMembership, getGroupMembers
  ]);

  const paste = useCallback((position: { x: number; y: number }): PasteResult | null => {
    const clipboardData = clipboardRef.current;
    if (!clipboardData) {
      log.warn('[UnifiedClipboard] No clipboard data to paste');
      return null;
    }

    if (!cyInstance) {
      log.warn('[UnifiedClipboard] No cytoscape instance for paste');
      return null;
    }

    const idMapping = new Map<string, string>();
    pasteCounterRef.current++;
    const offset = pasteCounterRef.current * 20;

    // Determine if we have anything to paste that needs undo batching
    const hasNodesToCreate = clipboardData.nodes.length > 0 && onCreateNode;
    const hasEdgesToCreate = clipboardData.edges.length > 0 && onCreateEdge;
    const hasGroupsToCreate = clipboardData.groups.length > 0;
    const needsBatching = hasNodesToCreate || hasEdgesToCreate || hasGroupsToCreate;

    // Begin undo batch BEFORE any paste operations to group everything into single undo entry
    if (needsBatching && beginUndoBatch) {
      beginUndoBatch();
    }

    // Begin batch to prevent race conditions when creating multiple nodes/edges
    if (hasNodesToCreate || hasEdgesToCreate) {
      beginBatch();
    }

    // Paste all elements using helper functions
    const newGroupIds = pasteGroups(
      clipboardData.groups, position, offset, idMapping, generateGroupId, onAddGroup
    );

    const newNodeIds = pasteNodes(
      clipboardData.nodes, position, offset, idMapping, cyInstance, onAddNodeToGroup, onCreateNode
    );
    pasteEdges(clipboardData.edges, idMapping, cyInstance, onCreateEdge);

    // End batch to flush all changes at once
    if (hasNodesToCreate || hasEdgesToCreate) {
      void endBatch();
    }

    const newTextAnnotationIds = pasteTextAnnotations(
      clipboardData.textAnnotations, position, offset, idMapping, onAddTextAnnotation
    );
    const newShapeAnnotationIds = pasteShapeAnnotations(
      clipboardData.shapeAnnotations, position, offset, idMapping, onAddShapeAnnotation
    );

    // End undo batch - this commits all collected actions as a single undo entry
    if (needsBatching && endUndoBatch) {
      endUndoBatch();
    }

    log.info(
      `[UnifiedClipboard] Pasted ${newNodeIds.length} nodes, ` +
      `${newGroupIds.length} groups, ` +
      `${newTextAnnotationIds.length} texts, ` +
      `${newShapeAnnotationIds.length} shapes`
    );

    return {
      idMapping,
      newGroupIds,
      newNodeIds,
      newTextAnnotationIds,
      newShapeAnnotationIds
    };
  }, [cyInstance, onAddGroup, onAddTextAnnotation, onAddShapeAnnotation, onAddNodeToGroup, generateGroupId, onCreateNode, onCreateEdge, beginUndoBatch, endUndoBatch]);

  const hasClipboardData = useCallback((): boolean => {
    return clipboardRef.current !== null;
  }, []);

  const clearClipboard = useCallback((): void => {
    clipboardRef.current = null;
    pasteCounterRef.current = 0;
    log.info('[UnifiedClipboard] Clipboard cleared');
  }, []);

  const getClipboardData = useCallback((): UnifiedClipboardData | null => {
    return clipboardRef.current;
  }, []);

  return {
    copy,
    paste,
    hasClipboardData,
    clearClipboard,
    getClipboardData
  };
}
