/**
 * Hook for drag-to-group functionality with overlay groups.
 * When a node is dragged and dropped inside a group overlay, it becomes a member.
 */
import { useEffect, useCallback, useRef } from 'react';
import type { Core, NodeSingular, EventObject } from 'cytoscape';

import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';

import { saveNodeMembership } from './groupHelpers';
import { findDeepestGroupAtPosition } from './hierarchyUtils';

export interface UseNodeReparentOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  /** Callback fired when membership is about to change, before applying the change */
  onMembershipWillChange?: (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => void;
}

export interface UseNodeReparentDeps {
  groups: GroupStyleAnnotation[];
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
}

type MembershipActions = Pick<UseNodeReparentDeps, 'addNodeToGroup' | 'removeNodeFromGroup'>;

function canHaveGroupMembership(node: NodeSingular): boolean {
  const role = node.data('topoViewerRole');
  return role !== 'freeText' && role !== 'freeShape';
}

/**
 * Find the deepest group at the node's position.
 * For nested groups, returns the most deeply nested group containing the position.
 */
function findGroupForNode(node: NodeSingular, groups: GroupStyleAnnotation[]): GroupStyleAnnotation | null {
  const nodePos = node.position();
  return findDeepestGroupAtPosition(nodePos, groups);
}

function handleMembershipChange(
  nodeId: string,
  oldGroupId: string | null,
  newGroupId: string | null,
  actions: MembershipActions,
  onMembershipWillChange?: (nodeId: string, oldGroupId: string | null, newGroupId: string | null) => void
): void {
  if (oldGroupId === newGroupId) return;

  // Notify before applying change (for undo tracking)
  onMembershipWillChange?.(nodeId, oldGroupId, newGroupId);

  if (oldGroupId && !newGroupId) {
    actions.removeNodeFromGroup(nodeId);
    saveNodeMembership(nodeId, null);
    log.info(`[Reparent] Node ${nodeId} removed from group`);
    return;
  }

  if (!oldGroupId && newGroupId) {
    actions.addNodeToGroup(nodeId, newGroupId);
    saveNodeMembership(nodeId, newGroupId);
    log.info(`[Reparent] Node ${nodeId} added to group`);
    return;
  }

  if (oldGroupId && newGroupId) {
    actions.removeNodeFromGroup(nodeId);
    actions.addNodeToGroup(nodeId, newGroupId);
    saveNodeMembership(nodeId, newGroupId);
    log.info(`[Reparent] Node ${nodeId} moved between groups`);
  }
}

export function useNodeReparent(cy: Core | null, options: UseNodeReparentOptions, deps: UseNodeReparentDeps): void {
  const { mode, isLocked, onMembershipWillChange } = options;
  const { groups, addNodeToGroup, removeNodeFromGroup } = deps;
  const nodeGroupRef = useRef<Map<string, string | null>>(new Map());

  const handleGrab = useCallback((event: EventObject) => {
    const node = event.target as NodeSingular;
    if (!canHaveGroupMembership(node)) return;
    const currentGroup = findGroupForNode(node, groups);
    nodeGroupRef.current.set(node.id(), currentGroup?.id ?? null);
  }, [groups]);

  const handleDragFree = useCallback((event: EventObject) => {
    const node = event.target as NodeSingular;
    if (!canHaveGroupMembership(node)) return;

    const nodeId = node.id();
    const oldGroupId = nodeGroupRef.current.get(nodeId) ?? null;
    const newGroupId = findGroupForNode(node, groups)?.id ?? null;
    nodeGroupRef.current.delete(nodeId);

    handleMembershipChange(nodeId, oldGroupId, newGroupId, { addNodeToGroup, removeNodeFromGroup }, onMembershipWillChange);
  }, [groups, addNodeToGroup, removeNodeFromGroup, onMembershipWillChange]);

  useEffect(() => {
    if (!cy || mode !== 'edit' || isLocked) return;

    cy.on('grab', 'node', handleGrab);
    cy.on('dragfree', 'node', handleDragFree);
    log.info('[Reparent] Handlers registered');

    return () => {
      cy.off('grab', 'node', handleGrab);
      cy.off('dragfree', 'node', handleDragFree);
    };
  }, [cy, mode, isLocked, handleGrab, handleDragFree]);
}
