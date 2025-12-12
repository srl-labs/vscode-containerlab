/**
 * Main hook for overlay-based group management in React TopoViewer.
 * Groups are rendered as HTML overlays, not Cytoscape nodes.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
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
  CMD_SAVE_NODE_GROUP_MEMBERSHIP
} from './groupHelpers';
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
    (selectedNodeIds?: string[]): string | null => {
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
          sendCommandToExtension(CMD_SAVE_NODE_GROUP_MEMBERSHIP, {
            nodeId,
            group: name,
            level
          });
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

      setGroups(prev => {
        const updated = [...prev, newGroup];
        saveGroupsToExtension(updated);
        return updated;
      });

      log.info(`[Groups] Created overlay group: ${groupId}`);
      return groupId;
    },
    [cy, mode, isLocked, onLockedAction, groups, setGroups, saveGroupsToExtension, lastStyleRef]
  );
}

/**
 * Hook for deleting a group.
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
        const updated = removeGroupFromList(prev, groupId);
        saveGroupsToExtension(updated);
        return updated;
      });

      if (editingGroup?.id === groupId) {
        setEditingGroup(null);
      }

      log.info(`[Groups] Deleted overlay group: ${groupId}`);
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
 */
function useSaveGroup(
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>,
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void,
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>
) {
  return useCallback(
    (data: GroupEditorData): void => {
      if (mode === 'view' || isLocked) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const oldGroupId = data.id;
      const newGroupId = buildGroupId(data.name, data.level);
      lastStyleRef.current = { ...data.style };

      setGroups(prev => {
        const oldGroup = prev.find(g => g.id === oldGroupId);
        if (!oldGroup) {
          log.warn(`[Groups] Group not found: ${oldGroupId}`);
          return prev;
        }

        let updated: GroupStyleAnnotation[];
        if (oldGroupId !== newGroupId) {
          // Rename: remove old, add new with updated ID
          updated = removeGroupFromList(prev, oldGroupId);
          updated = [...updated, {
            ...data.style,
            id: newGroupId,
            name: data.name,
            level: data.level,
            position: oldGroup.position,
            width: oldGroup.width,
            height: oldGroup.height
          }];
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

      setEditingGroup(null);
    },
    [mode, isLocked, onLockedAction, setGroups, setEditingGroup, saveGroupsToExtension, lastStyleRef]
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

  // Track node memberships (node ID -> group ID)
  const membershipRef = useRef<Map<string, string>>(new Map());

  const getGroupMembers = useCallback(
    (groupId: string): string[] => {
      const members: string[] = [];
      membershipRef.current.forEach((gId, nodeId) => {
        if (gId === groupId) members.push(nodeId);
      });
      return members;
    },
    []
  );

  const addNodeToGroup = useCallback(
    (nodeId: string, groupId: string): void => {
      if (mode === 'view' || isLocked) return;

      const group = groups.find(g => g.id === groupId);
      if (!group) return;

      membershipRef.current.set(nodeId, groupId);
      const { name, level } = parseGroupId(groupId);
      sendCommandToExtension(CMD_SAVE_NODE_GROUP_MEMBERSHIP, {
        nodeId,
        group: name,
        level
      });
      log.info(`[Groups] Added node ${nodeId} to group ${groupId}`);
    },
    [mode, isLocked, groups]
  );

  const removeNodeFromGroup = useCallback(
    (nodeId: string): void => {
      if (mode === 'view' || isLocked) return;

      membershipRef.current.delete(nodeId);
      sendCommandToExtension(CMD_SAVE_NODE_GROUP_MEMBERSHIP, {
        nodeId,
        group: null,
        level: null
      });
      log.info(`[Groups] Removed node ${nodeId} from group`);
    },
    [mode, isLocked]
  );

  return { findGroupAtPosition, getGroupMembers, addNodeToGroup, removeNodeFromGroup };
}

/**
 * Main hook for overlay-based group management.
 */
export function useGroups(options: UseGroupsHookOptions): UseGroupsReturn {
  const { cy, mode, isLocked, onLockedAction } = options;

  const state = useGroupState();
  const {
    groups,
    setGroups,
    editingGroup,
    setEditingGroup,
    saveGroupsToExtension,
    lastStyleRef
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

  const saveGroup = useSaveGroup(
    mode, isLocked, onLockedAction, setGroups, setEditingGroup, saveGroupsToExtension, lastStyleRef
  );

  const updateGroup = useUpdateGroup(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupPosition = useUpdateGroupPosition(mode, isLocked, setGroups, saveGroupsToExtension);
  const updateGroupSize = useUpdateGroupSize(mode, isLocked, setGroups, saveGroupsToExtension);

  const loadGroups = useCallback(
    (loadedGroups: GroupStyleAnnotation[]): void => {
      setGroups(loadedGroups);
      log.info(`[Groups] Loaded ${loadedGroups.length} overlay groups`);
    },
    [setGroups]
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

  const membership = useNodeGroupMembership(mode, isLocked, groups);

  return useMemo(
    () => ({
      groups,
      editingGroup,
      createGroup,
      deleteGroup,
      editGroup,
      closeEditor,
      saveGroup,
      updateGroup,
      updateGroupPosition,
      updateGroupSize,
      loadGroups,
      getUndoRedoAction,
      findGroupAtPosition: membership.findGroupAtPosition,
      getGroupMembers: membership.getGroupMembers,
      addNodeToGroup: membership.addNodeToGroup,
      removeNodeFromGroup: membership.removeNodeFromGroup
    }),
    [
      groups, editingGroup, createGroup, deleteGroup, editGroup, closeEditor,
      saveGroup, updateGroup, updateGroupPosition, updateGroupSize, loadGroups,
      getUndoRedoAction, membership
    ]
  );
}
