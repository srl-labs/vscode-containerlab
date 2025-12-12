/**
 * Hook for drag-to-group functionality with overlay groups.
 * When a node is dragged and dropped inside a group overlay, it becomes a member.
 */
import { useEffect, useCallback, useRef } from 'react';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { isPointInsideGroup, parseGroupId, CMD_SAVE_NODE_GROUP_MEMBERSHIP } from './groupHelpers';
import { sendCommandToExtension } from '../../utils/extensionMessaging';

export interface UseNodeReparentOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
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

function findGroupForNode(node: NodeSingular, groups: GroupStyleAnnotation[]): GroupStyleAnnotation | null {
  const nodePos = node.position();
  const sorted = [...groups].sort((a, b) => (b.zIndex ?? 5) - (a.zIndex ?? 5));
  for (const group of sorted) {
    if (isPointInsideGroup(nodePos, group)) return group;
  }
  return null;
}

function saveNodeMembership(nodeId: string, groupId: string | null): void {
  const data = groupId
    ? { nodeId, ...parseGroupId(groupId) }
    : { nodeId, group: null, level: null };
  sendCommandToExtension(CMD_SAVE_NODE_GROUP_MEMBERSHIP, data);
}

function handleMembershipChange(
  nodeId: string,
  oldGroupId: string | null,
  newGroupId: string | null,
  actions: MembershipActions
): void {
  if (oldGroupId === newGroupId) return;

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
  const { mode, isLocked } = options;
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

    handleMembershipChange(nodeId, oldGroupId, newGroupId, { addNodeToGroup, removeNodeFromGroup });
  }, [groups, addNodeToGroup, removeNodeFromGroup]);

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
