/**
 * Unified clipboard system for copying/pasting groups, nodes, and annotations together.
 * Maintains group membership and relationships when pasting.
 */

import { useCallback, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from '../../../shared/types/topology';
import { log } from '../../utils/logger';

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
}

export interface UseUnifiedClipboardReturn {
  /** Copy all selected elements to clipboard */
  copy: () => boolean;
  /** Cut all selected elements (copy + delete) */
  cut: () => boolean;
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
    generateGroupId
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

    // Collect all group IDs to include (selected + descendants)
    const groupIdsToInclude = new Set<string>();
    for (const groupId of selectedGroupIds) {
      groupIdsToInclude.add(groupId);
      // Include all descendant groups
      const descendants = getDescendantGroupIds(groupId, groups);
      descendants.forEach(id => groupIdsToInclude.add(id));
    }

    // Also include groups that contain selected nodes
    selectedNodes.forEach(node => {
      const groupId = getNodeMembership(node.id());
      if (groupId) {
        groupIdsToInclude.add(groupId);
      }
    });

    // Get all node IDs to include (selected + members of selected groups)
    const nodeIdsToInclude = new Set<string>();
    selectedNodes.forEach(node => nodeIdsToInclude.add(node.id()));

    // Add members of selected groups
    for (const groupId of groupIdsToInclude) {
      const members = getGroupMembers(groupId);
      members.forEach(nodeId => nodeIdsToInclude.add(nodeId));
    }

    // Collect positions to calculate center
    const allPositions: Array<{ x: number; y: number }> = [];

    // Collect nodes
    const clipboardNodes: ClipboardNode[] = [];
    for (const nodeId of nodeIdsToInclude) {
      const node = cyInstance.getElementById(nodeId) as NodeSingular;
      if (node.length > 0) {
        const pos = node.position();
        allPositions.push(pos);
        const membership = getNodeMembership(node.id());
        log.info(`[UnifiedClipboard] Copying node ${node.id()}, group membership: ${membership ?? 'none'}`);
        clipboardNodes.push({
          id: node.id(),
          data: { ...node.data() },
          position: { ...pos },
          relativePosition: { x: 0, y: 0 }, // Will be calculated after center
          groupId: membership
        });
      }
    }

    // Collect edges (only those with both endpoints in clipboard)
    const clipboardEdges: ClipboardEdge[] = [];
    selectedEdges.forEach(edge => {
      const sourceId = edge.source().id();
      const targetId = edge.target().id();
      if (nodeIdsToInclude.has(sourceId) && nodeIdsToInclude.has(targetId)) {
        clipboardEdges.push({
          id: edge.id(),
          source: sourceId,
          target: targetId,
          data: { ...edge.data() }
        });
      }
    });

    // Collect groups
    const clipboardGroups: ClipboardGroup[] = [];
    for (const groupId of groupIdsToInclude) {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        allPositions.push(group.position);
        clipboardGroups.push({
          group: { ...group },
          relativePosition: { x: 0, y: 0 } // Will be calculated after center
        });
      }
    }

    // Collect text annotations (selected + those belonging to selected groups)
    const textAnnotationIdsToInclude = new Set<string>(selectedTextAnnotationIds);
    for (const groupId of groupIdsToInclude) {
      textAnnotations
        .filter(a => a.groupId === groupId)
        .forEach(a => textAnnotationIdsToInclude.add(a.id));
    }

    const clipboardTextAnnotations: ClipboardTextAnnotation[] = [];
    for (const annotationId of textAnnotationIdsToInclude) {
      const annotation = textAnnotations.find(a => a.id === annotationId);
      if (annotation) {
        allPositions.push(annotation.position);
        clipboardTextAnnotations.push({
          annotation: { ...annotation },
          relativePosition: { x: 0, y: 0 }
        });
      }
    }

    // Collect shape annotations (selected + those belonging to selected groups)
    const shapeAnnotationIdsToInclude = new Set<string>(selectedShapeAnnotationIds);
    for (const groupId of groupIdsToInclude) {
      shapeAnnotations
        .filter(a => a.groupId === groupId)
        .forEach(a => shapeAnnotationIdsToInclude.add(a.id));
    }

    const clipboardShapeAnnotations: ClipboardShapeAnnotation[] = [];
    for (const annotationId of shapeAnnotationIdsToInclude) {
      const annotation = shapeAnnotations.find(a => a.id === annotationId);
      if (annotation) {
        allPositions.push(annotation.position);
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

    // Check if we have anything to copy
    if (
      clipboardNodes.length === 0 &&
      clipboardGroups.length === 0 &&
      clipboardTextAnnotations.length === 0 &&
      clipboardShapeAnnotations.length === 0
    ) {
      log.info('[UnifiedClipboard] Nothing to copy');
      return false;
    }

    // Calculate center (origin)
    const origin = calculateCenter(allPositions);

    // Update relative positions
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

  const cut = useCallback((): boolean => {
    const success = copy();
    if (success && cyInstance) {
      // Delete selected elements
      const selectedNodes = cyInstance.nodes(':selected');
      const selectedEdges = cyInstance.edges(':selected');

      // Note: Deletion of groups/annotations should be handled by the caller
      // through the onDelete callbacks. Here we only delete cytoscape elements.
      selectedEdges.remove();
      selectedNodes.remove();

      log.info('[UnifiedClipboard] Cut completed');
    }
    return success;
  }, [copy, cyInstance]);

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

    const result: PasteResult = {
      idMapping,
      newGroupIds: [],
      newNodeIds: [],
      newTextAnnotationIds: [],
      newShapeAnnotationIds: []
    };

    // Sort groups by depth (parents first)
    const sortedGroups = [...clipboardData.groups].sort((a, b) => {
      const depthA = a.group.parentId ? 1 : 0;
      const depthB = b.group.parentId ? 1 : 0;
      return depthA - depthB;
    });

    // Create groups first (to establish ID mapping)
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
      result.newGroupIds.push(newGroupId);
    }

    // Create nodes
    for (const item of clipboardData.nodes) {
      const newNodeId = generateId('node');
      idMapping.set(item.id, newNodeId);

      const newPosition = {
        x: position.x + item.relativePosition.x + offset,
        y: position.y + item.relativePosition.y + offset
      };

      // Create the node in cytoscape
      const nodeData = { ...item.data, id: newNodeId };
      // Remove old position data from node data
      delete nodeData.position;

      cyInstance.add({
        group: 'nodes',
        data: nodeData,
        position: newPosition
      });

      result.newNodeIds.push(newNodeId);

      // Add to group if it was in a group
      if (item.groupId) {
        const newGroupId = idMapping.get(item.groupId);
        log.info(`[UnifiedClipboard] Node ${item.id} -> ${newNodeId}, original group: ${item.groupId}, new group: ${newGroupId}`);
        if (newGroupId) {
          onAddNodeToGroup(newNodeId, newGroupId);
          log.info(`[UnifiedClipboard] Added node ${newNodeId} to group ${newGroupId}`);
        } else {
          log.warn(`[UnifiedClipboard] Could not find new group ID for original group ${item.groupId}`);
        }
      } else {
        log.info(`[UnifiedClipboard] Node ${item.id} -> ${newNodeId}, no group membership`);
      }
    }

    // Create edges
    for (const item of clipboardData.edges) {
      const newSourceId = idMapping.get(item.source);
      const newTargetId = idMapping.get(item.target);

      if (newSourceId && newTargetId) {
        const newEdgeId = generateId('edge');
        idMapping.set(item.id, newEdgeId);

        const edgeData = {
          ...item.data,
          id: newEdgeId,
          source: newSourceId,
          target: newTargetId
        };

        cyInstance.add({
          group: 'edges',
          data: edgeData
        });
      }
    }

    // Create text annotations
    for (const item of clipboardData.textAnnotations) {
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
      result.newTextAnnotationIds.push(newAnnotationId);
    }

    // Create shape annotations
    for (const item of clipboardData.shapeAnnotations) {
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
      result.newShapeAnnotationIds.push(newAnnotationId);
    }

    log.info(
      `[UnifiedClipboard] Pasted ${result.newNodeIds.length} nodes, ` +
      `${result.newGroupIds.length} groups, ` +
      `${result.newTextAnnotationIds.length} texts, ` +
      `${result.newShapeAnnotationIds.length} shapes`
    );

    return result;
  }, [cyInstance, onAddGroup, onAddTextAnnotation, onAddShapeAnnotation, onAddNodeToGroup, generateGroupId]);

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
    cut,
    paste,
    hasClipboardData,
    clearClipboard,
    getClipboardData
  };
}
