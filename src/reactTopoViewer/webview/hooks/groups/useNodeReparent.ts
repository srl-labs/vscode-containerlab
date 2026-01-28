/**
 * Hook for drag-to-group functionality with overlay groups.
 * When a node is dragged and dropped inside a group overlay, it becomes a member.
 */
import { useEffect, useRef } from "react";
import type { Core, NodeSingular, EventObject } from "cytoscape";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import { log } from "../../utils/logger";

import { saveNodeMembership } from "./groupHelpers";
import { findDeepestGroupAtPosition } from "./hierarchyUtils";

export interface UseNodeReparentOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  /** Callback fired when membership is about to change, before applying the change */
  onMembershipWillChange?: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void;
}

export interface UseNodeReparentDeps {
  groups: GroupStyleAnnotation[];
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
}

type MembershipActions = Pick<UseNodeReparentDeps, "addNodeToGroup" | "removeNodeFromGroup">;

function canHaveGroupMembership(node: NodeSingular): boolean {
  const role = node.data("topoViewerRole") as string | undefined;
  return role !== "freeText" && role !== "freeShape";
}

/**
 * Find the deepest group at the node's position.
 * For nested groups, returns the most deeply nested group containing the position.
 */
function findGroupForNode(
  node: NodeSingular,
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  const nodePos = node.position();
  return findDeepestGroupAtPosition(nodePos, groups);
}

function handleMembershipChange(
  nodeId: string,
  oldGroupId: string | null,
  newGroupId: string | null,
  newGroup: GroupStyleAnnotation | null,
  actions: MembershipActions,
  onMembershipWillChange?: (
    nodeId: string,
    oldGroupId: string | null,
    newGroupId: string | null
  ) => void
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
    saveNodeMembership(nodeId, newGroup);
    log.info(`[Reparent] Node ${nodeId} added to group`);
    return;
  }

  if (oldGroupId && newGroupId) {
    actions.removeNodeFromGroup(nodeId);
    actions.addNodeToGroup(nodeId, newGroupId);
    saveNodeMembership(nodeId, newGroup);
    log.info(`[Reparent] Node ${nodeId} moved between groups`);
  }
}

export function useNodeReparent(
  cy: Core | null,
  options: UseNodeReparentOptions,
  deps: UseNodeReparentDeps
): void {
  const { mode, isLocked, onMembershipWillChange } = options;
  const { groups, addNodeToGroup, removeNodeFromGroup } = deps;
  const nodeGroupRef = useRef<Map<string, string | null>>(new Map());

  // Use refs to avoid recreating callbacks when these values change
  // This prevents the useEffect from re-running on every groups update
  const groupsRef = useRef(groups);
  const actionsRef = useRef({ addNodeToGroup, removeNodeFromGroup, onMembershipWillChange });

  // Keep refs up to date
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    actionsRef.current = { addNodeToGroup, removeNodeFromGroup, onMembershipWillChange };
  }, [addNodeToGroup, removeNodeFromGroup, onMembershipWillChange]);

  useEffect(() => {
    if (!cy || mode !== "edit" || isLocked) return;

    const handleGrab = (event: EventObject) => {
      const node = event.target as NodeSingular;
      if (!canHaveGroupMembership(node)) return;
      const currentGroup = findGroupForNode(node, groupsRef.current);
      nodeGroupRef.current.set(node.id(), currentGroup?.id ?? null);
    };

    const handleDragFree = (event: EventObject) => {
      const node = event.target as NodeSingular;
      if (!canHaveGroupMembership(node)) return;

      const nodeId = node.id();
      const oldGroupId = nodeGroupRef.current.get(nodeId) ?? null;
      const newGroup = findGroupForNode(node, groupsRef.current);
      const newGroupId = newGroup?.id ?? null;
      nodeGroupRef.current.delete(nodeId);

      const {
        addNodeToGroup: add,
        removeNodeFromGroup: remove,
        onMembershipWillChange: onChange
      } = actionsRef.current;
      handleMembershipChange(
        nodeId,
        oldGroupId,
        newGroupId,
        newGroup,
        { addNodeToGroup: add, removeNodeFromGroup: remove },
        onChange
      );
    };

    cy.on("grab", "node", handleGrab);
    cy.on("dragfree", "node", handleDragFree);
    log.info("[Reparent] Handlers registered");

    return () => {
      cy.off("grab", "node", handleGrab);
      cy.off("dragfree", "node", handleDragFree);
    };
  }, [cy, mode, isLocked]);
}
