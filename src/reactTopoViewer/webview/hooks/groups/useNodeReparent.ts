/**
 * Hook for drag-to-group functionality with overlay groups.
 * When a node is dragged and dropped inside a group overlay, it becomes a member.
 */
import { useEffect, useRef } from "react";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import type { TopoNode } from "../../../shared/types/graph";
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

function canHaveGroupMembership(role: string | undefined): boolean {
  return role !== "freeText" && role !== "freeShape";
}

// Note: findGroupForNode was previously used for event-based reparenting.
// Now that we use ReactFlow events, use findGroupForNodeAtPosition instead.

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
  _nodes: TopoNode[],
  options: UseNodeReparentOptions,
  deps: UseNodeReparentDeps
): void {
  const { mode, isLocked, onMembershipWillChange } = options;
  const { groups, addNodeToGroup, removeNodeFromGroup } = deps;
  // Note: nodeGroupRef was used for tracking node group state during Cytoscape drag events.
  // It's kept for potential future use but currently unused as ReactFlow handles events differently.
  const _nodeGroupRef = useRef<Map<string, string | null>>(new Map());

  // Use refs to avoid recreating callbacks when these values change
  // This prevents the useEffect from re-running on every groups update
  const groupsRef = useRef(groups);
  const actionsRef = useRef({ addNodeToGroup, removeNodeFromGroup, onMembershipWillChange });
  // Keep refs for potential future event handling
  void _nodeGroupRef;

  // Keep refs up to date
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    actionsRef.current = { addNodeToGroup, removeNodeFromGroup, onMembershipWillChange };
  }, [addNodeToGroup, removeNodeFromGroup, onMembershipWillChange]);

  useEffect(() => {
    // ReactFlow handles node drag events through its own onNodeDragStart/onNodeDragStop props
    void mode;
    void isLocked;
  }, [mode, isLocked]);

  // Expose helper functions for external use (e.g., from ReactFlow event handlers)
  // The actual reparenting logic is now called from ReactFlow's onNodeDragStop handler
}

/**
 * Check if a node can have group membership based on its role.
 * Exported for use in ReactFlow event handlers.
 */
export function checkCanHaveGroupMembership(role: string | undefined): boolean {
  return canHaveGroupMembership(role);
}

/**
 * Find group for a node at a given position.
 * Exported for use in ReactFlow event handlers.
 */
export function findGroupForNodeAtPosition(
  position: { x: number; y: number },
  groups: GroupStyleAnnotation[]
): GroupStyleAnnotation | null {
  return findDeepestGroupAtPosition(position, groups);
}

/**
 * Handle membership change when a node is dropped.
 * Exported for use in ReactFlow event handlers.
 */
export function handleNodeMembershipChange(
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
  handleMembershipChange(nodeId, oldGroupId, newGroupId, newGroup, actions, onMembershipWillChange);
}
