/**
 * Hook for drag-to-reparent functionality.
 * When a node is dragged and dropped inside a group, it becomes a child of that group.
 */
import React, { useEffect, useCallback, useRef } from 'react';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import { log } from '../../utils/logger';
import { isGroupNode, updateGroupEmptyStatus, parseGroupId } from './groupHelpers';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

export interface UseNodeReparentOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
}

/**
 * Save node's group membership to annotations
 */
function saveNodeGroupMembership(nodeId: string, groupId: string | null): void {
  if (groupId) {
    const { name, level } = parseGroupId(groupId);
    sendCommandToExtension('save-node-group-membership', {
      nodeId,
      group: name,
      level
    });
  } else {
    sendCommandToExtension('save-node-group-membership', {
      nodeId,
      group: null,
      level: null
    });
  }
}

/**
 * Check if a node can be reparented (not a group, annotation, or already being dragged with its parent)
 */
function canBeReparented(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'group' && role !== 'freeText' && role !== 'freeShape';
}

/**
 * Check if node position is inside group bounding box
 */
function isNodeInsideGroup(node: NodeSingular, group: NodeSingular): boolean {
  const groupBox = group.boundingBox();
  const nodePos = node.position();
  return (
    nodePos.x >= groupBox.x1 &&
    nodePos.x <= groupBox.x2 &&
    nodePos.y >= groupBox.y1 &&
    nodePos.y <= groupBox.y2
  );
}

/**
 * Find the group that the node is inside
 */
function findTargetGroup(cy: Core, draggedNode: NodeSingular): NodeSingular | null {
  // Never find a target for groups - they cannot be nested
  if (draggedNode.data('topoViewerRole') === 'group') {
    return null;
  }

  let targetGroup: NodeSingular | null = null;

  cy.nodes('[topoViewerRole = "group"]').forEach(group => {
    const groupNode = group as NodeSingular;
    // Skip if it's the same node or the group is being grabbed
    if (groupNode.id() === draggedNode.id()) return;
    if (groupNode.grabbed()) return;

    // Check if the dragged node is inside this group
    if (isNodeInsideGroup(draggedNode, groupNode)) {
      targetGroup = groupNode;
    }
  });

  return targetGroup;
}

/**
 * Determine if reparent should be skipped for this drag event
 */
function shouldSkipReparent(cy: Core, node: NodeSingular): boolean {
  // Skip annotations
  if (!canBeReparented(node)) {
    return true;
  }

  // Skip if any group is being dragged
  const anyGroupDragging = cy.nodes('[topoViewerRole = "group"]').some(
    group => (group as NodeSingular).grabbed()
  );
  if (anyGroupDragging) {
    log.debug('[Reparent] Skipping - a group is being dragged');
    return true;
  }

  // Skip if node is a group or parent node
  if (node.data('topoViewerRole') === 'group' || node.isParent()) {
    return true;
  }

  // Skip if node's parent is being dragged
  const parent = node.parent().first() as NodeSingular;
  if (parent.length > 0 && parent.grabbed()) {
    log.debug(`[Reparent] Skipping - parent ${parent.id()} is being dragged`);
    return true;
  }

  return false;
}

/**
 * Create handler for grab event - stores old parent
 */
function createGrabHandler(
  oldParentRef: React.RefObject<Map<string, string | null>>
): (event: EventObject) => void {
  return (event: EventObject) => {
    const node = event.target as NodeSingular;
    if (!canBeReparented(node)) return;

    const parent = node.parent().first() as NodeSingular;
    const parentId = parent.length > 0 ? parent.id() : null;
    oldParentRef.current.set(node.id(), parentId);
  };
}

/**
 * Handle node dragged out of its group
 */
function handleNodeDraggedOut(
  cy: Core,
  node: NodeSingular,
  oldParentId: string,
  deleteGroup: (groupId: string) => void
): void {
  const oldParent = cy.getElementById(oldParentId) as NodeSingular;
  if (oldParent.length === 0 || !isGroupNode(oldParent)) return;

  // Check if node is still inside old parent - if so, keep it there
  if (isNodeInsideGroup(node, oldParent)) {
    log.debug(`[Reparent] Node ${node.id()} still inside old group ${oldParentId}`);
    return;
  }

  // Node was dragged out of the group
  node.move({ parent: null });
  node.data('parent', '');
  updateGroupEmptyStatus(oldParent);

  // Save the node's group membership (removed from group)
  saveNodeGroupMembership(node.id(), null);

  if (oldParent.children().length === 0) {
    log.info(`[Reparent] Deleting empty group ${oldParentId}`);
    deleteGroup(oldParentId);
  } else {
    log.info(`[Reparent] Node ${node.id()} removed from group ${oldParentId}`);
  }
}

/**
 * Handle node dragged into a group
 */
function handleNodeDraggedInto(
  cy: Core,
  node: NodeSingular,
  targetGroup: NodeSingular,
  deleteGroup: (groupId: string) => void
): void {
  // Never allow a group to be nested inside another group
  if (node.data('topoViewerRole') === 'group') {
    log.debug(`[Reparent] Skipping - cannot nest group ${node.id()} inside another group`);
    return;
  }

  const currentParent = node.parent().first() as NodeSingular;
  const currentParentId = currentParent.length > 0 ? currentParent.id() : null;

  // Only reparent if the target group is different
  if (targetGroup.id() === currentParentId) return;

  // Don't allow direct transfer from one group to another
  // Node must be dragged out of its current group first
  if (currentParentId) {
    log.debug(`[Reparent] Skipping - node ${node.id()} must be released from group ${currentParentId} first`);
    return;
  }

  // Move node to new group (only ungrouped nodes can be added)
  node.move({ parent: targetGroup.id() });
  node.data('parent', targetGroup.id());
  updateGroupEmptyStatus(targetGroup);
  log.info(`[Reparent] Node ${node.id()} moved to group ${targetGroup.id()}`);

  // Save the node's group membership
  saveNodeGroupMembership(node.id(), targetGroup.id());
}

/**
 * Create handler for dragfree event - handles reparenting
 */
function createDragFreeHandler(
  cy: Core,
  oldParentRef: React.RefObject<Map<string, string | null>>,
  deleteGroup: (groupId: string) => void
): (event: EventObject) => void {
  return (event: EventObject) => {
    const node = event.target as NodeSingular;
    if (shouldSkipReparent(cy, node)) return;

    const oldParentId = oldParentRef.current.get(node.id());
    const targetGroup = findTargetGroup(cy, node);

    if (oldParentId && !targetGroup) {
      handleNodeDraggedOut(cy, node, oldParentId, deleteGroup);
    } else if (targetGroup) {
      handleNodeDraggedInto(cy, node, targetGroup, deleteGroup);
    }

    oldParentRef.current.delete(node.id());
  };
}

/**
 * Hook to enable drag-to-reparent functionality for nodes
 */
export function useNodeReparent(
  cy: Core | null,
  options: UseNodeReparentOptions,
  deleteGroup: (groupId: string) => void
): void {
  const { mode, isLocked } = options;
  const oldParentRef = useRef<Map<string, string | null>>(new Map());

  const handleGrab = useCallback(
    (event: EventObject) => createGrabHandler(oldParentRef)(event),
    []
  );

  const handleDragFree = useCallback(
    (event: EventObject) => {
      if (!cy) return;
      createDragFreeHandler(cy, oldParentRef, deleteGroup)(event);
    },
    [cy, deleteGroup]
  );

  useEffect(() => {
    // Only enable reparent in edit mode when not locked
    if (!cy || mode !== 'edit' || isLocked) return;

    cy.on('grab', 'node', handleGrab);
    cy.on('dragfree', 'node', handleDragFree);
    log.info('[Reparent] Drag-to-reparent handlers registered');

    return () => {
      cy.off('grab', 'node', handleGrab);
      cy.off('dragfree', 'node', handleDragFree);
    };
  }, [cy, mode, isLocked, handleGrab, handleDragFree]);
}
