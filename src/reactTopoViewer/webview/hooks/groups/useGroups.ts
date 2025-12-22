/**
 * Main hook for overlay-based group management in React TopoViewer.
 * Groups are rendered as HTML overlays, not Cytoscape nodes.
 * Supports hierarchical nesting via parentId.
 */
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';

import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { getAnnotationsIO, getTopologyIO, isServicesInitialized } from '../../services';
// Note: saveNodeMembership is imported from groupHelpers for single node membership updates

import { useGroupState } from './useGroupState';
import {
  generateGroupId,
  parseGroupId,
  buildGroupId,
  createDefaultGroup,
  findGroupAtPosition as findGroupAtPositionHelper,
  updateGroupInList,
  removeGroupFromList,
  calculateBoundingBox,
  saveNodeMembership
} from './groupHelpers';
import {
  getDescendantGroups,
  getChildGroups as getChildGroupsUtil,
  getParentGroup as getParentGroupUtil,
  getGroupDepth as getGroupDepthUtil,
  validateNoCircularReference
} from './hierarchyUtils';
import {
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  type UseGroupsOptions,
  type UseGroupsReturn,
  type GroupEditorData,
  type GroupUndoAction
} from './groupTypes';

export interface UseGroupsHookOptions extends UseGroupsOptions {
  cy: CyCore | null;
}

/**
 * Save multiple node memberships in a single batch operation
 */
function saveBatchMemberships(memberships: Array<{ nodeId: string; group: string; level: string }>): void {
  if (!isServicesInitialized()) {
    log.warn('[Groups] Services not initialized for batch membership save');
    return;
  }

  const annotationsIO = getAnnotationsIO();
  const topologyIO = getTopologyIO();

  const yamlPath = topologyIO.getYamlFilePath();
  if (!yamlPath) {
    log.warn('[Groups] No YAML path for batch membership save');
    return;
  }

  annotationsIO.modifyAnnotations(yamlPath, annotations => {
    if (!annotations.nodeAnnotations) {
      annotations.nodeAnnotations = [];
    }

    for (const { nodeId, group, level } of memberships) {
      const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
      if (existing) {
        existing.group = group;
        existing.level = level;
      } else {
        annotations.nodeAnnotations.push({ id: nodeId, group, level });
      }
    }

    return annotations;
  }).catch(err => {
    log.error(`[Groups] Failed to save batch memberships: ${err}`);
  });
}

/**
 * Get node positions from Cytoscape for selected nodes.
 */
function getNodePositions(cy: CyCore, nodeIds: string[]): { x: number; y: number }[] {
  return nodeIds
    .map(id => {
      const node = cy.getElementById(id) as NodeSingular;
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
function getViewportCenter(cy: CyCore): { x: number; y: number } {
  const extent = cy.extent();
  return {
    x: (extent.x1 + extent.x2) / 2,
    y: (extent.y1 + extent.y2) / 2
  };
}

/**
 * Hook for creating a new group.
 */
function useCreateGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  groups: GroupStyleAnnotation[],
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void,
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>
) {
  return useCallback(
    (selectedNodeIds?: string[], parentId?: string): { groupId: string; group: GroupStyleAnnotation } | null => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return null;
      }

      const groupId = generateGroupId(groups);
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

        // Save node membership
        const { name, level } = parseGroupId(groupId);
        selectedNodeIds.forEach(nodeId => {
          saveNodeMembership(nodeId, name, level);
        });
      } else {
        // Create empty group at viewport center
        position = getViewportCenter(cy);
        width = DEFAULT_GROUP_WIDTH;
        height = DEFAULT_GROUP_HEIGHT;
      }

      const newGroup = createDefaultGroup(groupId, position, lastStyleRef.current);
      newGroup.width = width;
      newGroup.height = height;

      // Set parent if provided
      if (parentId) {
        newGroup.parentId = parentId;
      }

      setGroups(prev => {
        const updated = [...prev, newGroup];
        saveGroupsToExtension(updated);
        return updated;
      });

      const parentInfo = parentId ? ' (parent: ' + parentId + ')' : '';
      log.info('[Groups] Created overlay group: ' + groupId + parentInfo);
      return { groupId, group: newGroup };
    },
    [cy, mode, isLocked, onLockedAction, groups, setGroups, saveGroupsToExtension, lastStyleRef]
  );
}

/**
 * Hook for deleting a group.
 * Promotes child groups to the deleted group's parent level.
 */
function useDeleteGroup(
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  editingGroup: GroupEditorData | null,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string): void => {
      if (mode === 'view' || isLocked) {
        if (isLocked) onLockedAction?.();
        return;
      }

      setGroups(prev => {
        // Find the group being deleted
        const deletedGroup = prev.find(g => g.id === groupId);
        if (!deletedGroup) return prev;

        // Get the parent ID to promote children to
        const newParentId = deletedGroup.parentId;

        // Promote child groups to the deleted group's parent
        const updated = prev.map(g => {
          if (g.parentId === groupId) {
            // This is a direct child - promote to grandparent
            return { ...g, parentId: newParentId };
          }
          return g;
        });

        // Remove the deleted group
        const final = removeGroupFromList(updated, groupId);
        saveGroupsToExtension(final);

        log.info(`[Groups] Deleted group ${groupId}, promoted children to parent: ${newParentId ?? 'root'}`);
        return final;
      });

      if (editingGroup?.id === groupId) {
        setEditingGroup(null);
      }
    },
    [mode, isLocked, onLockedAction, editingGroup, setGroups, setEditingGroup, saveGroupsToExtension]
  );
}

/**
 * Hook for editing a group.
 */
function useEditGroup(
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  groups: GroupStyleAnnotation[],
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>
) {
  return useCallback(
    (groupId: string): void => {
      if (mode === 'view' || isLocked) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const group = groups.find(g => g.id === groupId);
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
 * Handles migration of child groups, node memberships, and annotation groupIds when group is renamed.
 */
interface SaveGroupOptions {
  cy: CyCore | null;
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction: (() => void) | undefined;
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>;
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>;
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void;
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>;
  onMigrateNodeMemberships: (oldGroupId: string, newGroupId: string) => void;
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string) => void;
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string) => void;
}

function useSaveGroup(options: SaveGroupOptions) {
  const {
    cy,
    mode,
    isLocked,
    onLockedAction,
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef,
    onMigrateNodeMemberships,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  } = options;
  return useCallback(
    (data: GroupEditorData): void => {
      if (mode === 'view' || isLocked) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const oldGroupId = data.id;
      const newGroupId = buildGroupId(data.name, data.level);
      lastStyleRef.current = { ...data.style };

      // Track if we're doing a rename so we can trigger annotation migration after state update
      const isRename = oldGroupId !== newGroupId;

      setGroups(prev => {
        const oldGroup = prev.find(g => g.id === oldGroupId);
        if (!oldGroup) {
          log.warn(`[Groups] Group not found: ${oldGroupId}`);
          return prev;
        }

        let updated: GroupStyleAnnotation[];
        if (isRename) {
          // Rename: remove old, add new with updated ID
          updated = removeGroupFromList(prev, oldGroupId);
          updated = [...updated, {
            ...data.style,
            id: newGroupId,
            name: data.name,
            level: data.level,
            position: oldGroup.position,
            width: oldGroup.width,
            height: oldGroup.height,
            parentId: oldGroup.parentId  // Preserve parentId
          }];

          // MIGRATION 1: Update child group parentIds to point to new ID
          updated = updated.map(g => {
            if (g.parentId === oldGroupId) {
              return { ...g, parentId: newGroupId };
            }
            return g;
          });

          // MIGRATION 2: Update node memberships
          const { name: oldName, level: oldLevel } = parseGroupId(oldGroupId);

          // Update the membership map (this is what getGroupMembers uses)
          onMigrateNodeMemberships(oldGroupId, newGroupId);

          // Update Cytoscape node data and persist
          if (cy) {
            const migratedNodes: Array<{ nodeId: string; group: string; level: string }> = [];
            cy.nodes().forEach(node => {
              const annotation = node.data('clabAnnotation') as { group?: string; level?: string } | undefined;
              if (annotation?.group === oldName && annotation?.level === oldLevel) {
                node.data('clabAnnotation', {
                  ...annotation,
                  group: data.name,
                  level: data.level
                });
                migratedNodes.push({ nodeId: node.id(), group: data.name, level: data.level });
              }
            });
            // Persist node membership changes
            if (migratedNodes.length > 0) {
              saveBatchMemberships(migratedNodes);
              log.info(`[Groups] Migrated ${migratedNodes.length} node memberships to new group ID`);
            }
          }

          log.info(`[Groups] Renamed group: ${oldGroupId} -> ${newGroupId}`);
        } else {
          // Just update style
          updated = updateGroupInList(prev, oldGroupId, {
            ...data.style,
            name: data.name,
            level: data.level
          });
          log.info(`[Groups] Updated group style: ${oldGroupId}`);
        }

        saveGroupsToExtension(updated);
        return updated;
      });

      // MIGRATION 3: Update annotation groupIds (after state update)
      if (isRename) {
        onMigrateTextAnnotations?.(oldGroupId, newGroupId);
        onMigrateShapeAnnotations?.(oldGroupId, newGroupId);
      }

      setEditingGroup(null);
    },
    [cy, mode, isLocked, onLockedAction, setGroups, setEditingGroup, saveGroupsToExtension, lastStyleRef, onMigrateNodeMemberships, onMigrateTextAnnotations, onMigrateShapeAnnotations]
  );
}

/**
 * Hook for updating group properties.
 */
function useUpdateGroup(
  mode: 'edit' | 'view',
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, updates: Partial<GroupStyleAnnotation>): void => {
      if (mode === 'view' || isLocked) return;

      setGroups(prev => {
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
  mode: 'edit' | 'view',
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, position: { x: number; y: number }): void => {
      if (mode === 'view' || isLocked) return;

      setGroups(prev => {
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
  mode: 'edit' | 'view',
  isLocked: boolean,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, width: number, height: number): void => {
      if (mode === 'view' || isLocked) return;

      setGroups(prev => {
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
      setGroups(prev => {
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
  groupId: string
): void {
  // Note: We don't validate group existence here because this may be called
  // right after a group is added but before React re-renders.
  // The membership is stored immediately; the group will exist by the time
  // the UI needs to display it.
  membershipRef.current.set(nodeId, groupId);
  const { name, level } = parseGroupId(groupId);
  saveNodeMembership(nodeId, name, level);
  log.info(`[Groups] Added node ${nodeId} to group ${groupId}`);
}

/** Helper to remove a node from its group */
function removeNodeFromGroupHelper(
  membershipRef: React.RefObject<Map<string, string>>,
  nodeId: string
): void {
  membershipRef.current.delete(nodeId);
  saveNodeMembership(nodeId, null, null);
  log.info(`[Groups] Removed node ${nodeId} from group`);
}

/**
 * Hook for managing node group membership.
 */
function useNodeGroupMembership(
  mode: 'edit' | 'view',
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

  const initializeMembership = useCallback(
    (memberships: Array<{ nodeId: string; groupId: string }>): void => {
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
    membershipRef.current.forEach((gId, nodeId) => { if (gId === groupId) members.push(nodeId); });
    return members;
  }, []);

  const getNodeMembership = useCallback((nodeId: string): string | null => membershipRef.current.get(nodeId) ?? null, []);

  const addNodeToGroup = useCallback((nodeId: string, groupId: string): void => {
    if (mode === 'view' || isLocked) return;
    addNodeToGroupHelper(membershipRef, nodeId, groupId);
  }, [mode, isLocked]);

  /** Add node to group locally (in-memory only, no extension notification) */
  const addNodeToGroupLocal = useCallback((nodeId: string, groupId: string): void => {
    membershipRef.current.set(nodeId, groupId);
  }, []);

  const removeNodeFromGroup = useCallback((nodeId: string): void => {
    if (mode === 'view' || isLocked) return;
    removeNodeFromGroupHelper(membershipRef, nodeId);
  }, [mode, isLocked]);

  /** Migrate all node memberships from one groupId to another (used when group is renamed) */
  const migrateMemberships = useCallback((oldGroupId: string, newGroupId: string): void => {
    membershipRef.current.forEach((gId, nodeId) => {
      if (gId === oldGroupId) {
        membershipRef.current.set(nodeId, newGroupId);
      }
    });
    log.info(`[Groups] Migrated node memberships from ${oldGroupId} to ${newGroupId}`);
  }, []);

  return { findGroupAtPosition, getGroupMembers, getNodeMembership, addNodeToGroup, addNodeToGroupLocal, removeNodeFromGroup, initializeMembership, migrateMemberships };
}

/**
 * Main hook for overlay-based group management.
 */
export function useGroups(options: UseGroupsHookOptions): UseGroupsReturn {
  const { cy, mode, isLocked, onLockedAction, onMigrateTextAnnotations, onMigrateShapeAnnotations } = options;

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

  const createGroup = useCreateGroup(
    cy, mode, isLocked, onLockedAction, groups, setGroups, saveGroupsToExtension, lastStyleRef
  );

  const deleteGroup = useDeleteGroup(
    mode, isLocked, onLockedAction, editingGroup, setGroups, setEditingGroup, saveGroupsToExtension
  );

  const editGroup = useEditGroup(mode, isLocked, onLockedAction, groups, setEditingGroup);

  const closeEditor = useCallback((): void => {
    setEditingGroup(null);
    log.info('[Groups] Editor closed');
  }, [setEditingGroup]);

  // Node membership management - must be before saveGroup for migration callbacks
  const membership = useNodeGroupMembership(mode, isLocked, groups);

  // Wrap createGroup to also update in-memory membership when creating with nodes
  // This ensures getNodeMembership() returns correct results immediately after group creation
  const createGroupWithMembership = useCallback(
    (selectedNodeIds?: string[], parentId?: string): { groupId: string; group: GroupStyleAnnotation } | null => {
      const result = createGroup(selectedNodeIds, parentId);
      if (result && selectedNodeIds && selectedNodeIds.length > 0) {
        // Update in-memory membership map (the extension is already notified by createGroup)
        selectedNodeIds.forEach(nodeId => {
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
    setGroups,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef,
    onMigrateNodeMemberships: membership.migrateMemberships,
    onMigrateTextAnnotations,
    onMigrateShapeAnnotations
  });

  const updateGroup = useUpdateGroup(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupPosition = useUpdateGroupPosition(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupSize = useUpdateGroupSize(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupGeoPosition = useUpdateGroupGeoPosition(setGroups, saveGroupsToExtension);

  const loadGroups = useCallback(
    (loadedGroups: GroupStyleAnnotation[], persistToExtension = true): void => {
      setGroups(loadedGroups);
      // Persist to extension unless this is initial data loading
      if (persistToExtension) {
        saveGroupsToExtension(loadedGroups);
      }
      log.info(`[Groups] Loaded ${loadedGroups.length} overlay groups`);
    },
    [setGroups, saveGroupsToExtension]
  );

  /** Add a single group (used by clipboard paste) */
  const addGroup = useCallback(
    (group: GroupStyleAnnotation): void => {
      setGroups(prev => {
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
      type: 'annotation',
      annotationType: 'group',
      before,
      after
    }),
    []
  );

  // Hierarchy methods
  const updateGroupParent = useCallback(
    (groupId: string, parentId: string | null): void => {
      if (mode === 'view' || isLocked) return;

      // Validate no circular reference
      if (parentId && !validateNoCircularReference(groupId, parentId, groups)) {
        log.warn(`[Groups] Cannot set parent: would create circular reference`);
        return;
      }

      setGroups(prev => {
        const updated = updateGroupInList(prev, groupId, { parentId: parentId ?? undefined });
        saveGroupsToExtension(updated);
        return updated;
      });

      log.info(`[Groups] Updated parent of ${groupId} to ${parentId ?? 'root'}`);
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
      groups, editingGroup, createGroupWithMembership, deleteGroup, editGroup, closeEditor,
      saveGroup, updateGroup, updateGroupPosition, updateGroupSize, updateGroupGeoPosition, loadGroups,
      addGroup, getUndoRedoAction, membership, selectedGroupIds, selectGroup, toggleGroupSelection,
      boxSelectGroups, clearGroupSelection, updateGroupParent, getChildGroups, getDescendantGroupsMethod,
      getParentGroup, getGroupDepth
    ]
  );
}
