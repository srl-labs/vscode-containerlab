/**
 * Main hook for overlay-based group management in React TopoViewer.
 * Groups are rendered as HTML overlays, not Cytoscape nodes.
 * Supports hierarchical nesting via parentId.
 */
import type React from "react";
import { useCallback, useMemo, useRef } from "react";

import type { CyCompatCore } from "../useCytoCompatInstance";

import type { GroupStyleAnnotation } from "../../../shared/types/topology";
import { log } from "../../utils/logger";
import { getAnnotationsIO, getTopologyIO, isServicesInitialized } from "../../services";
import { applyMembershipUpdates, type MembershipUpdateEntry } from "../shared/membershipHelpers";

import { useGroupState } from "./useGroupState";
// Note: saveNodeMembership is imported from groupHelpers for single node membership updates
import {
  generateGroupId,
  createDefaultGroup,
  findGroupAtPosition as findGroupAtPositionHelper,
  updateGroupInList,
  removeGroupFromList,
  calculateBoundingBox,
  saveNodeMembership
} from "./groupHelpers";
import {
  getDescendantGroups,
  getChildGroups as getChildGroupsUtil,
  getParentGroup as getParentGroupUtil,
  getGroupDepth as getGroupDepthUtil,
  findDeepestGroupAtPosition,
  validateNoCircularReference
} from "./hierarchyUtils";
import {
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  type UseGroupsOptions,
  type UseGroupsReturn,
  type GroupEditorData,
  type GroupUndoAction
} from "./groupTypes";

export interface UseGroupsHookOptions extends UseGroupsOptions {
  cy: CyCompatCore | null;
}

/**
 * Save multiple node memberships in a single batch operation
 */
function saveBatchMemberships(memberships: MembershipUpdateEntry[]): void {
  if (!isServicesInitialized()) {
    log.warn("[Groups] Services not initialized for batch membership save");
    return;
  }

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();

  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) {
    log.warn("[Groups] No YAML path for batch membership save");
    return;
  }

  annotationsIO
    .modifyAnnotations(yamlPath, (annotations) => {
      applyMembershipUpdates(annotations, memberships);
      return annotations;
    })
    .catch((err) => {
      log.error(`[Groups] Failed to save batch memberships: ${err}`);
    });
}

/**
 * Get node positions from Cytoscape for selected nodes.
 */
function getNodePositions(cy: CyCompatCore, nodeIds: string[]): { x: number; y: number }[] {
  return nodeIds
    .map((id) => {
      const node = cy.getElementById(id);
      if (node.length > 0) {
        return node.position();
      }
      return null;
    })
    .filter((pos): pos is { x: number; y: number } => pos !== null);
}

/**
 * Get the center of the viewport.
 */
function getViewportCenter(cy: CyCompatCore): { x: number; y: number } {
  const extent = cy.extent();
  return {
    x: (extent.x1 + extent.x2) / 2,
    y: (extent.y1 + extent.y2) / 2
  };
}

/**
 * Derive a default display name from a generated group ID.
 */
function getDefaultGroupName(groupId: string): string {
  const match = /^group-(\d+)$/.exec(groupId);
  if (match) {
    return `group${match[1]}`;
  }
  return groupId;
}

/**
 * Hook for creating a new group.
 */
function useCreateGroup(
  cy: CyCompatCore | null,
  mode: "edit" | "view",
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  groups: GroupStyleAnnotation[],
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void,
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>
) {
  const isGroupFullyInside = (
    child: Pick<GroupStyleAnnotation, "position" | "width" | "height">,
    parent: Pick<GroupStyleAnnotation, "position" | "width" | "height">,
    margin = 2
  ): boolean => {
    const childHalfW = child.width / 2;
    const childHalfH = child.height / 2;
    const parentHalfW = parent.width / 2;
    const parentHalfH = parent.height / 2;

    const childLeft = child.position.x - childHalfW;
    const childRight = child.position.x + childHalfW;
    const childTop = child.position.y - childHalfH;
    const childBottom = child.position.y + childHalfH;

    const parentLeft = parent.position.x - parentHalfW + margin;
    const parentRight = parent.position.x + parentHalfW - margin;
    const parentTop = parent.position.y - parentHalfH + margin;
    const parentBottom = parent.position.y + parentHalfH - margin;

    return (
      childLeft >= parentLeft &&
      childRight <= parentRight &&
      childTop >= parentTop &&
      childBottom <= parentBottom
    );
  };

  return useCallback(
    (
      selectedNodeIds?: string[],
      parentId?: string | null
    ): { groupId: string; group: GroupStyleAnnotation } | null => {
      // Only check isLocked - allows group creation in viewer mode when explicitly unlocked
      if (isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return null;
      }

      const groupId = generateGroupId(groups);
      const groupName = getDefaultGroupName(groupId);
      const groupLevel = "1";
      let position: { x: number; y: number };
      let width: number;
      let height: number;

      if (selectedNodeIds && selectedNodeIds.length > 0) {
        // Calculate bounding box around selected nodes
        const positions = getNodePositions(cy, selectedNodeIds);
        const bounds = calculateBoundingBox(positions);
        position = bounds.position;
        width = bounds.width;
        height = bounds.height;

        selectedNodeIds.forEach((nodeId) => {
          saveNodeMembership(nodeId, { id: groupId, name: groupName, level: groupLevel });
        });
      } else {
        // Create empty group at viewport center
        position = getViewportCenter(cy);
        width = DEFAULT_GROUP_WIDTH;
        height = DEFAULT_GROUP_HEIGHT;
      }

      const newGroup = createDefaultGroup(
        groupId,
        groupName,
        groupLevel,
        position,
        lastStyleRef.current
      );
      newGroup.width = width;
      newGroup.height = height;
      // Ensure newly created groups are on top by default, regardless of lastStyle zIndex.
      const maxZIndex = groups.reduce((max, g) => Math.max(max, g.zIndex ?? 0), 0);
      newGroup.zIndex = maxZIndex + 1;

      // Set parent if provided, otherwise infer from containment (nested groups).
      // We only infer a parent when the new group's full bounds are inside the candidate parent.
      const explicitParentId = parentId;
      if (explicitParentId === null) {
        // Explicitly force root group (no parent inference)
      } else if (explicitParentId) {
        // Explicit parent assignment (e.g., inferred from membership).
        // Do not require the parent group to exist in the current render's `groups` array,
        // since React state updates are async and tests/users can create nested groups quickly.
        newGroup.parentId = explicitParentId;
      } else {
        const candidateParent = findDeepestGroupAtPosition(position, groups);
        if (candidateParent && isGroupFullyInside(newGroup, candidateParent)) {
          newGroup.parentId = candidateParent.id;
        }
      }

      setGroups((prev) => {
        const updated = [...prev, newGroup];
        saveGroupsToExtension(updated);
        return updated;
      });

      const parentInfo = newGroup.parentId ? " (parent: " + newGroup.parentId + ")" : "";
      log.info("[Groups] Created overlay group: " + groupId + parentInfo);
      return { groupId, group: newGroup };
    },
    [cy, mode, isLocked, onLockedAction, groups, setGroups, saveGroupsToExtension, lastStyleRef]
  );
}

/**
 * Hook for deleting a group.
 * Promotes child groups to the deleted group's parent level.
 */
interface UseDeleteGroupOptions {
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: (() => void) | undefined;
  editingGroup: GroupEditorData | null;
  groups: GroupStyleAnnotation[];
  membership: Pick<UseGroupsReturn, "getGroupMembers" | "addNodeToGroup" | "removeNodeFromGroup">;
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>;
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>;
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void;
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string | null) => void;
}

function useDeleteGroup(options: UseDeleteGroupOptions) {
  const {
    mode,
    isLocked,
    onLockedAction,
    editingGroup,
    groups,
    membership,
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  } = options;
  return useCallback(
    (groupId: string): void => {
      // Only check isLocked - allows group deletion in viewer mode when explicitly unlocked
      if (isLocked) {
        onLockedAction?.();
        return;
      }

      const deletedGroup = groups.find((g) => g.id === groupId);
      if (!deletedGroup) return;

      const parentId = deletedGroup.parentId ?? null;
      const memberIds = membership.getGroupMembers(groupId);
      if (memberIds.length > 0) {
        if (parentId) {
          memberIds.forEach((nodeId) => membership.addNodeToGroup(nodeId, parentId));
        } else {
          memberIds.forEach((nodeId) => membership.removeNodeFromGroup(nodeId));
        }
      }

      // Promote annotation memberships to parent (or clear if no parent)
      onMigrateTextAnnotations?.(groupId, parentId);
      onMigrateShapeAnnotations?.(groupId, parentId);

      setGroups((prev) => {
        // Get the parent ID to promote children to
        const newParentId = deletedGroup.parentId;

        // Promote child groups to the deleted group's parent
        const updated = prev.map((g) => {
          if (g.parentId === groupId) {
            // This is a direct child - promote to grandparent
            return { ...g, parentId: newParentId };
          }
          return g;
        });

        // Remove the deleted group
        const final = removeGroupFromList(updated, groupId);
        saveGroupsToExtension(final);

        log.info(
          `[Groups] Deleted group ${groupId}, promoted children to parent: ${newParentId ?? "root"}`
        );
        return final;
      });

      if (editingGroup?.id === groupId) {
        setEditingGroup(null);
      }
    },
    [
      mode,
      isLocked,
      onLockedAction,
      editingGroup,
      groups,
      membership,
      setGroups,
      setEditingGroup,
      saveGroupsToExtension,
      onMigrateTextAnnotations,
      onMigrateShapeAnnotations
    ]
  );
}

/**
 * Hook for editing a group.
 */
function useEditGroup(
  mode: "edit" | "view",
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  groups: GroupStyleAnnotation[],
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>
) {
  return useCallback(
    (groupId: string): void => {
      // Only check isLocked - allows group editing in viewer mode when explicitly unlocked
      if (isLocked) {
        onLockedAction?.();
        return;
      }

      const group = groups.find((g) => g.id === groupId);
      if (!group) {
        log.warn(`[Groups] Group not found: ${groupId}`);
        return;
      }

      setEditingGroup({
        id: groupId,
        name: group.name,
        level: group.level,
        style: group
      });

      log.info(`[Groups] Editing group: ${groupId}`);
    },
    [mode, isLocked, onLockedAction, groups, setEditingGroup]
  );
}

/**
 * Hook for saving group edits.
 * Updates group styles and syncs member annotations when name/level changes.
 */
interface SaveGroupOptions {
  cy: CyCompatCore | null;
  mode: "edit" | "view";
  isLocked: boolean;
  onLockedAction: (() => void) | undefined;
  groups: GroupStyleAnnotation[];
  getGroupMembers: (groupId: string) => string[];
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>;
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>;
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void;
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>;
}

function useSaveGroup(options: SaveGroupOptions) {
  const {
    cy,
    mode,
    isLocked,
    onLockedAction,
    groups,
    getGroupMembers,
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef
  } = options;
  return useCallback(
    (data: GroupEditorData): void => {
      // Only check isLocked - allows group saving in viewer mode when explicitly unlocked
      if (isLocked) {
        onLockedAction?.();
        return;
      }

      const groupId = data.id;
      lastStyleRef.current = { ...data.style };

      const existing = groups.find((g) => g.id === groupId);
      if (!existing) {
        log.warn(`[Groups] Group not found: ${groupId}`);
        return;
      }
      const nameLevelChanged = existing.name !== data.name || existing.level !== data.level;

      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, {
          ...data.style,
          name: data.name,
          level: data.level
        });

        log.info(`[Groups] Updated group style: ${groupId}`);

        saveGroupsToExtension(updated);
        return updated;
      });

      if (nameLevelChanged) {
        const memberIds = getGroupMembers(groupId);
        if (memberIds.length > 0) {
          const updates = memberIds.map((nodeId) => ({
            nodeId,
            groupId,
            groupName: data.name,
            groupLevel: data.level
          }));
          saveBatchMemberships(updates);
        }

        if (cy) {
          memberIds.forEach((nodeId) => {
            const node = cy.getElementById(nodeId);
            if (node.length > 0) {
              const annotation = node.data("clabAnnotation") as
                | { group?: string; level?: string; groupId?: string }
                | undefined;
              if (annotation) {
                node.data("clabAnnotation", {
                  ...annotation,
                  groupId,
                  group: data.name,
                  level: data.level
                });
              }
            }
          });
        }
      }

      setEditingGroup(null);
    },
    [
      cy,
      mode,
      isLocked,
      onLockedAction,
      groups,
      getGroupMembers,
      setGroups,
      setEditingGroup,
      saveGroupsToExtension,
      lastStyleRef
    ]
  );
}

/**
 * Hook for updating group properties.
 */
function useUpdateGroup(
  mode: "edit" | "view",
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, updates: Partial<GroupStyleAnnotation>): void => {
      // Only check isLocked - allows group updates in viewer mode when explicitly unlocked
      if (isLocked) return;

      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, updates);
        saveGroupsToExtension(updated);
        return updated;
      });
    },
    [mode, isLocked, setGroups, saveGroupsToExtension]
  );
}

/**
 * Hook for updating group position.
 */
function useUpdateGroupPosition(
  mode: "edit" | "view",
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, position: { x: number; y: number }): void => {
      // Only check isLocked - allows position updates in viewer mode when explicitly unlocked
      if (isLocked) return;

      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, { position });
        saveGroupsToExtension(updated);
        return updated;
      });
    },
    [mode, isLocked, setGroups, saveGroupsToExtension]
  );
}

/**
 * Hook for updating group size.
 */
function useUpdateGroupSize(
  mode: "edit" | "view",
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, width: number, height: number): void => {
      // Only check isLocked - allows size updates in viewer mode when explicitly unlocked
      if (isLocked) return;

      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, { width, height });
        saveGroupsToExtension(updated);
        return updated;
      });
    },
    [mode, isLocked, setGroups, saveGroupsToExtension]
  );
}

/**
 * Hook for updating group geo position (for geomap mode).
 * Note: This doesn't check isLocked because geo coordinate assignment
 * is a system operation that should work regardless of lock state.
 */
function useUpdateGroupGeoPosition(
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, geoCoordinates: { lat: number; lng: number }): void => {
      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, { geoCoordinates });
        saveGroupsToExtension(updated);
        return updated;
      });
      log.info(`[Groups] Updated geo position for group ${groupId}`);
    },
    [setGroups, saveGroupsToExtension]
  );
}

/** Helper to add a node to a group */
function addNodeToGroupHelper(
  membershipRef: React.RefObject<Map<string, string>>,
  nodeId: string,
  groupId: string,
  group?: GroupStyleAnnotation
): void {
  // Note: We don't validate group existence here because this may be called
  // right after a group is added but before React re-renders.
  // The membership is stored immediately; the group will exist by the time
  // the UI needs to display it.
  membershipRef.current.set(nodeId, groupId);
  saveNodeMembership(
    nodeId,
    group ? { id: groupId, name: group.name, level: group.level } : { id: groupId }
  );
  log.info(`[Groups] Added node ${nodeId} to group ${groupId}`);
}

/** Helper to remove a node from its group */
function removeNodeFromGroupHelper(
  membershipRef: React.RefObject<Map<string, string>>,
  nodeId: string
): void {
  membershipRef.current.delete(nodeId);
  saveNodeMembership(nodeId, null);
  log.info(`[Groups] Removed node ${nodeId} from group`);
}

/**
 * Hook for managing node group membership.
 */
function useNodeGroupMembership(
  _mode: "edit" | "view",
  isLocked: boolean,
  groups: GroupStyleAnnotation[]
) {
  const findGroupAtPosition = useCallback(
    (position: { x: number; y: number }): GroupStyleAnnotation | null => {
      return findGroupAtPositionHelper(groups, position);
    },
    [groups]
  );

  const membershipRef = useRef<Map<string, string>>(new Map());
  const membershipDirtyUntilRef = useRef<number>(0);
  const markMembershipDirty = useCallback((ms = 4000): void => {
    membershipDirtyUntilRef.current = Date.now() + ms;
  }, []);

  const initializeMembership = useCallback(
    (memberships: Array<{ nodeId: string; groupId: string }>): void => {
      // Avoid clobbering local membership changes with stale topology refresh messages.
      // Saves are async/debounced; during that window, incoming nodeAnnotations can lag behind.
      if (Date.now() < membershipDirtyUntilRef.current) {
        log.info("[Groups] Skipped membership init (local changes pending)");
        return;
      }
      membershipRef.current.clear();
      for (const { nodeId, groupId } of memberships) {
        membershipRef.current.set(nodeId, groupId);
      }
      log.info(`[Groups] Initialized ${memberships.length} node memberships from annotations`);
    },
    []
  );

  const getGroupMembers = useCallback((groupId: string): string[] => {
    const members: string[] = [];
    membershipRef.current.forEach((gId, nodeId) => {
      if (gId === groupId) members.push(nodeId);
    });
    return members;
  }, []);

  const getNodeMembership = useCallback(
    (nodeId: string): string | null => membershipRef.current.get(nodeId) ?? null,
    []
  );

  const addNodeToGroup = useCallback(
    (nodeId: string, groupId: string): void => {
      // Only check isLocked - allows membership changes in viewer mode when explicitly unlocked
      if (isLocked) return;
      markMembershipDirty();
      const group = groups.find((g) => g.id === groupId);
      addNodeToGroupHelper(membershipRef, nodeId, groupId, group);
    },
    [isLocked, markMembershipDirty, groups]
  );

  /** Add node to group locally (in-memory only, no extension notification) */
  const addNodeToGroupLocal = useCallback(
    (nodeId: string, groupId: string): void => {
      markMembershipDirty();
      membershipRef.current.set(nodeId, groupId);
    },
    [markMembershipDirty]
  );

  const removeNodeFromGroup = useCallback(
    (nodeId: string): void => {
      // Only check isLocked - allows membership changes in viewer mode when explicitly unlocked
      if (isLocked) return;
      markMembershipDirty();
      removeNodeFromGroupHelper(membershipRef, nodeId);
    },
    [isLocked, markMembershipDirty]
  );

  /** Reassign all node memberships from one groupId to another (legacy migrations) */
  const migrateMemberships = useCallback(
    (oldGroupId: string, newGroupId: string): void => {
      markMembershipDirty();
      membershipRef.current.forEach((gId, nodeId) => {
        if (gId === oldGroupId) {
          membershipRef.current.set(nodeId, newGroupId);
        }
      });
      log.info(`[Groups] Migrated node memberships from ${oldGroupId} to ${newGroupId}`);
    },
    [markMembershipDirty]
  );

  return {
    findGroupAtPosition,
    getGroupMembers,
    getNodeMembership,
    addNodeToGroup,
    addNodeToGroupLocal,
    removeNodeFromGroup,
    initializeMembership,
    migrateMemberships
  };
}

/**
 * Main hook for overlay-based group management.
 */
export function useGroups(options: UseGroupsHookOptions): UseGroupsReturn {
  const {
    cy,
    mode,
    isLocked,
    onLockedAction,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  } = options;

  const state = useGroupState();
  const {
    groups,
    setGroups,
    editingGroup,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef,
    selectedGroupIds,
    selectGroup,
    toggleGroupSelection,
    boxSelectGroups,
    clearGroupSelection
  } = state;

  // Node membership management - must be before saveGroup for migration callbacks
  const membership = useNodeGroupMembership(mode, isLocked, groups);

  const createGroup = useCreateGroup(
    cy,
    mode,
    isLocked,
    onLockedAction,
    groups,
    setGroups,
    saveGroupsToExtension,
    lastStyleRef
  );

  const deleteGroup = useDeleteGroup({
    mode,
    isLocked,
    onLockedAction,
    editingGroup,
    groups,
    membership,
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  });

  const editGroup = useEditGroup(mode, isLocked, onLockedAction, groups, setEditingGroup);

  const closeEditor = useCallback((): void => {
    setEditingGroup(null);
    log.info("[Groups] Editor closed");
  }, [setEditingGroup]);

  // Wrap createGroup to also update in-memory membership when creating with nodes
  // This ensures getNodeMembership() returns correct results immediately after group creation
  const createGroupWithMembership = useCallback(
    (
      selectedNodeIds?: string[],
      parentId?: string | null
    ): { groupId: string; group: GroupStyleAnnotation } | null => {
      let effectiveParentId = parentId;

      if (effectiveParentId === undefined && selectedNodeIds && selectedNodeIds.length > 0) {
        const memberships = selectedNodeIds.map((nodeId) => membership.getNodeMembership(nodeId));
        const nonNullMemberships = memberships.filter((m): m is string => Boolean(m));
        const uniqueMemberships = new Set(nonNullMemberships);

        // If nodes come from different groups, force the new group to be root.
        // If all selected nodes are in the same group, create a nested subgroup under that group.
        if (uniqueMemberships.size > 1) {
          effectiveParentId = null;
        } else if (uniqueMemberships.size === 1) {
          const candidate = [...uniqueMemberships][0];
          if (nonNullMemberships.length === selectedNodeIds.length) {
            effectiveParentId = candidate;
          } else {
            effectiveParentId = null;
          }
        }
      }

      const result = createGroup(selectedNodeIds, effectiveParentId);
      if (result && selectedNodeIds && selectedNodeIds.length > 0) {
        // Update in-memory membership map (the extension is already notified by createGroup)
        selectedNodeIds.forEach((nodeId) => {
          // Directly set the membership ref without re-notifying extension
          // Note: createGroup already saved membership for each node
          membership.addNodeToGroupLocal?.(nodeId, result.groupId);
        });
      }
      return result;
    },
    [createGroup, membership]
  );

  const saveGroup = useSaveGroup({
    cy,
    mode,
    isLocked,
    onLockedAction,
    groups,
    getGroupMembers: membership.getGroupMembers,
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef
  });

  const updateGroup = useUpdateGroup(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupPosition = useUpdateGroupPosition(
    mode,
    isLocked,
    setGroups,
    saveGroupsToExtension
  );
  const updateGroupSize = useUpdateGroupSize(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupGeoPosition = useUpdateGroupGeoPosition(setGroups, saveGroupsToExtension);

  const loadGroups = useCallback(
    (
      loadedGroups:
        | GroupStyleAnnotation[]
        | ((prev: GroupStyleAnnotation[]) => GroupStyleAnnotation[]),
      persistToExtension = true
    ): void => {
      setGroups((prev) => {
        const next = typeof loadedGroups === "function" ? loadedGroups(prev) : loadedGroups;
        // Persist to extension unless this is initial data loading
        if (persistToExtension) {
          saveGroupsToExtension(next);
        }
        log.info(`[Groups] Loaded ${next.length} overlay groups`);
        return next;
      });
    },
    [setGroups, saveGroupsToExtension]
  );

  /** Add a single group (used by clipboard paste) */
  const addGroup = useCallback(
    (group: GroupStyleAnnotation): void => {
      setGroups((prev) => {
        const updated = [...prev, group];
        saveGroupsToExtension(updated);
        return updated;
      });
      log.info(`[Groups] Added group: ${group.id}`);
    },
    [setGroups, saveGroupsToExtension]
  );

  const getUndoRedoAction = useCallback(
    (before: GroupStyleAnnotation | null, after: GroupStyleAnnotation | null): GroupUndoAction => ({
      type: "annotation",
      annotationType: "group",
      before,
      after
    }),
    []
  );

  // Hierarchy methods
  const updateGroupParent = useCallback(
    (groupId: string, parentId: string | null): void => {
      // Only check isLocked - allows hierarchy changes in viewer mode when explicitly unlocked
      if (isLocked) return;

      // Validate no circular reference
      if (parentId && !validateNoCircularReference(groupId, parentId, groups)) {
        log.warn(`[Groups] Cannot set parent: would create circular reference`);
        return;
      }

      setGroups((prev) => {
        const updated = updateGroupInList(prev, groupId, { parentId: parentId ?? undefined });
        saveGroupsToExtension(updated);
        return updated;
      });

      log.info(`[Groups] Updated parent of ${groupId} to ${parentId ?? "root"}`);
    },
    [mode, isLocked, groups, setGroups, saveGroupsToExtension]
  );

  const getChildGroups = useCallback(
    (groupId: string): GroupStyleAnnotation[] => {
      return getChildGroupsUtil(groupId, groups);
    },
    [groups]
  );

  const getDescendantGroupsMethod = useCallback(
    (groupId: string): GroupStyleAnnotation[] => {
      return getDescendantGroups(groupId, groups);
    },
    [groups]
  );

  const getParentGroup = useCallback(
    (groupId: string): GroupStyleAnnotation | null => {
      return getParentGroupUtil(groupId, groups);
    },
    [groups]
  );

  const getGroupDepth = useCallback(
    (groupId: string): number => {
      return getGroupDepthUtil(groupId, groups);
    },
    [groups]
  );

  return useMemo(
    () => ({
      groups,
      editingGroup,
      createGroup: createGroupWithMembership,
      deleteGroup,
      editGroup,
      closeEditor,
      saveGroup,
      updateGroup,
      updateGroupPosition,
      updateGroupSize,
      updateGroupGeoPosition,
      loadGroups,
      addGroup,
      getUndoRedoAction,
      findGroupAtPosition: membership.findGroupAtPosition,
      getGroupMembers: membership.getGroupMembers,
      getNodeMembership: membership.getNodeMembership,
      addNodeToGroup: membership.addNodeToGroup,
      removeNodeFromGroup: membership.removeNodeFromGroup,
      initializeMembership: membership.initializeMembership,
      // Selection methods
      selectedGroupIds,
      selectGroup,
      toggleGroupSelection,
      boxSelectGroups,
      clearGroupSelection,
      // Hierarchy methods
      updateGroupParent,
      getChildGroups,
      getDescendantGroups: getDescendantGroupsMethod,
      getParentGroup,
      getGroupDepth
    }),
    [
      groups,
      editingGroup,
      createGroupWithMembership,
      deleteGroup,
      editGroup,
      closeEditor,
      saveGroup,
      updateGroup,
      updateGroupPosition,
      updateGroupSize,
      updateGroupGeoPosition,
      loadGroups,
      addGroup,
      getUndoRedoAction,
      membership,
      selectedGroupIds,
      selectGroup,
      toggleGroupSelection,
      boxSelectGroups,
      clearGroupSelection,
      updateGroupParent,
      getChildGroups,
      getDescendantGroupsMethod,
      getParentGroup,
      getGroupDepth
    ]
  );
}
