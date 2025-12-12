/**
 * Main hook for group management in React TopoViewer.
 */
import React, { useCallback, useMemo } from 'react';
import type { Core as CyCore, NodeSingular } from 'cytoscape';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import { log } from '../../utils/logger';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import { useGroupState } from './useGroupState';
import {
  generateGroupId,
  parseGroupId,
  buildGroupId,
  createDefaultGroupStyle,
  isGroupNode,
  canBeGrouped,
  updateGroupEmptyStatus,
  applyGroupStyleToNode,
  updateStyleInList,
  removeStyleFromList
} from './groupHelpers';
import type {
  UseGroupsOptions,
  UseGroupsReturn,
  GroupEditorData,
  GroupUndoAction
} from './groupTypes';

export interface UseGroupsHookOptions extends UseGroupsOptions {
  cy: CyCore | null;
}

/** Creates a new group node in Cytoscape. */
function createGroupNode(
  cy: CyCore,
  groupId: string,
  name: string,
  level: string
): NodeSingular {
  const extent = cy.extent();
  const position = {
    x: (extent.x1 + extent.x2) / 2,
    y: extent.y1 + 40
  };

  cy.add({
    group: 'nodes',
    data: {
      id: groupId,
      name,
      weight: '1000',
      topoViewerRole: 'group',
      parent: '',
      lat: '',
      lng: '',
      extraData: {
        clabServerUsername: 'asad',
        weight: '2',
        name: '',
        topoViewerGroup: name,
        topoViewerGroupLevel: level
      }
    },
    position,
    classes: 'empty-group'
  });

  return cy.getElementById(groupId) as NodeSingular;
}

/** Adds nodes to a group and saves their membership. */
function addNodesToGroup(
  cy: CyCore,
  groupId: string,
  nodeIds: string[]
): void {
  const { name, level } = parseGroupId(groupId);
  nodeIds.forEach(nodeId => {
    const node = cy.getElementById(nodeId) as NodeSingular;
    if (node.length > 0 && canBeGrouped(node)) {
      node.move({ parent: groupId });
      node.data('parent', groupId);
      // Save node's group membership
      sendCommandToExtension('save-node-group-membership', {
        nodeId,
        group: name,
        level
      });
    }
  });
}

/** Recreates a group with a new ID. */
function recreateGroupWithNewId(
  cy: CyCore,
  oldGroup: NodeSingular,
  newGroupId: string,
  name: string,
  level: string
): NodeSingular {
  const position = oldGroup.position();
  const classes = oldGroup.classes();

  // Store child IDs and orphan them BEFORE removing the group
  // This ensures children stay in the graph when the parent is removed
  const childIds: string[] = [];
  oldGroup.children().forEach(child => {
    childIds.push(child.id());
    child.move({ parent: null });
    child.data('parent', '');
  });

  oldGroup.remove();

  cy.add({
    group: 'nodes',
    data: {
      id: newGroupId,
      name,
      weight: '1000',
      topoViewerRole: 'group',
      parent: '',
      lat: '',
      lng: '',
      extraData: {
        clabServerUsername: 'asad',
        weight: '2',
        name: '',
        topoViewerGroup: name,
        topoViewerGroupLevel: level
      }
    },
    position,
    classes
  });

  const newGroup = cy.getElementById(newGroupId) as NodeSingular;

  // Re-parent children to the new group using stored IDs and update their annotations
  childIds.forEach(childId => {
    const child = cy.getElementById(childId) as NodeSingular;
    if (child.length > 0) {
      child.move({ parent: newGroupId });
      child.data('parent', newGroupId);
      // Save updated group membership
      sendCommandToExtension('save-node-group-membership', {
        nodeId: childId,
        group: name,
        level
      });
    }
  });

  return newGroup;
}

/** Hook for create group action. */
function useCreateGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>,
  setGroupStyles: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupStylesToExtension: (styles: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (selectedNodeIds?: string[]): string | null => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return null;
      }

      const groupId = generateGroupId(cy);
      const { name, level } = parseGroupId(groupId);
      const newGroup = createGroupNode(cy, groupId, name, level);

      if (selectedNodeIds && selectedNodeIds.length > 0) {
        addNodesToGroup(cy, groupId, selectedNodeIds);
        updateGroupEmptyStatus(newGroup);
      }

      const style = createDefaultGroupStyle(groupId, lastStyleRef.current);
      applyGroupStyleToNode(newGroup, style);

      setGroupStyles(prev => {
        const updated = [...prev, style];
        saveGroupStylesToExtension(updated);
        return updated;
      });

      log.info(`[Groups] Created group: ${groupId}`);
      return groupId;
    },
    [cy, mode, isLocked, onLockedAction, lastStyleRef, setGroupStyles, saveGroupStylesToExtension]
  );
}

/** Hook for delete group action. */
function useDeleteGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  editingGroup: GroupEditorData | null,
  setGroupStyles: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>,
  saveGroupStylesToExtension: (styles: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string): void => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const group = cy.getElementById(groupId) as NodeSingular;
      if (group.length === 0 || !isGroupNode(group)) {
        log.warn(`[Groups] Group not found: ${groupId}`);
        return;
      }

      group.children().forEach(child => child.move({ parent: null }));
      group.remove();

      setGroupStyles(prev => {
        const updated = removeStyleFromList(prev, groupId);
        saveGroupStylesToExtension(updated);
        return updated;
      });

      if (editingGroup?.id === groupId) {
        setEditingGroup(null);
      }

      log.info(`[Groups] Deleted group: ${groupId}`);
    },
    [cy, mode, isLocked, onLockedAction, editingGroup, setGroupStyles, setEditingGroup, saveGroupStylesToExtension]
  );
}

/** Hook for edit group action. */
function useEditGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  groupStyles: GroupStyleAnnotation[],
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>
) {
  return useCallback(
    (groupId: string): void => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const group = cy.getElementById(groupId) as NodeSingular;
      if (group.length === 0 || !isGroupNode(group)) {
        log.warn(`[Groups] Group not found: ${groupId}`);
        return;
      }

      const { name, level } = parseGroupId(groupId);
      const existingStyle = groupStyles.find(s => s.id === groupId);

      setEditingGroup({
        id: groupId,
        name,
        level,
        style: existingStyle || createDefaultGroupStyle(groupId)
      });

      log.info(`[Groups] Editing group: ${groupId}`);
    },
    [cy, mode, isLocked, onLockedAction, groupStyles, setEditingGroup]
  );
}

/** Hook for save group action. */
function useSaveGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>,
  setGroupStyles: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>,
  saveGroupStylesToExtension: (styles: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (data: GroupEditorData): void => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const oldGroupId = data.id;
      const newGroupId = buildGroupId(data.name, data.level);
      lastStyleRef.current = { ...data.style };

      const oldGroup = cy.getElementById(oldGroupId) as NodeSingular;
      if (oldGroup.length === 0) {
        log.warn(`[Groups] Group not found: ${oldGroupId}`);
        return;
      }

      if (oldGroupId !== newGroupId) {
        const newGroup = recreateGroupWithNewId(cy, oldGroup, newGroupId, data.name, data.level);
        applyGroupStyleToNode(newGroup, { ...data.style, id: newGroupId });
        updateGroupEmptyStatus(newGroup);

        setGroupStyles(prev => {
          const updated = removeStyleFromList(prev, oldGroupId);
          const withNew = [...updated, { ...data.style, id: newGroupId }];
          saveGroupStylesToExtension(withNew);
          return withNew;
        });

        log.info(`[Groups] Renamed group: ${oldGroupId} -> ${newGroupId}`);
      } else {
        applyGroupStyleToNode(oldGroup, data.style);

        setGroupStyles(prev => {
          const updated = updateStyleInList(prev, oldGroupId, data.style);
          saveGroupStylesToExtension(updated);
          return updated;
        });

        log.info(`[Groups] Updated group style: ${oldGroupId}`);
      }

      setEditingGroup(null);
    },
    [cy, mode, isLocked, onLockedAction, lastStyleRef, setGroupStyles, setEditingGroup, saveGroupStylesToExtension]
  );
}

/** Hook for update group style action. */
function useUpdateGroupStyle(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  groupStyles: GroupStyleAnnotation[],
  setGroupStyles: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>,
  saveGroupStylesToExtension: (styles: GroupStyleAnnotation[]) => void
) {
  return useCallback(
    (groupId: string, style: Partial<GroupStyleAnnotation>): void => {
      if (mode === 'view' || isLocked || !cy) {
        return;
      }

      const group = cy.getElementById(groupId) as NodeSingular;
      if (group.length > 0 && isGroupNode(group)) {
        const currentStyle = groupStyles.find(s => s.id === groupId) || createDefaultGroupStyle(groupId);
        applyGroupStyleToNode(group, { ...currentStyle, ...style });
      }

      setGroupStyles(prev => {
        const updated = updateStyleInList(prev, groupId, style);
        saveGroupStylesToExtension(updated);
        return updated;
      });
    },
    [cy, mode, isLocked, groupStyles, setGroupStyles, saveGroupStylesToExtension]
  );
}

/** Hook for release node from group action. */
function useReleaseNodeFromGroup(
  cy: CyCore | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onLockedAction: (() => void) | undefined,
  deleteGroup: (groupId: string) => void
) {
  return useCallback(
    (nodeId: string): void => {
      if (mode === 'view' || isLocked || !cy) {
        if (isLocked) onLockedAction?.();
        return;
      }

      const node = cy.getElementById(nodeId) as NodeSingular;
      if (node.length === 0) return;

      const parent = node.parent().first() as NodeSingular;
      if (parent.length === 0) return;

      node.move({ parent: null });
      updateGroupEmptyStatus(parent);

      if (parent.children().length === 0) {
        deleteGroup(parent.id());
      }

      log.info(`[Groups] Released node ${nodeId} from group ${parent.id()}`);
    },
    [cy, mode, isLocked, onLockedAction, deleteGroup]
  );
}

export function useGroups(options: UseGroupsHookOptions): UseGroupsReturn {
  const { cy, mode, isLocked, onLockedAction } = options;

  const state = useGroupState();
  const {
    groupStyles,
    setGroupStyles,
    editingGroup,
    setEditingGroup,
    saveGroupStylesToExtension,
    lastStyleRef
  } = state;

  const createGroup = useCreateGroup(
    cy, mode, isLocked, onLockedAction, lastStyleRef, setGroupStyles, saveGroupStylesToExtension
  );

  const deleteGroup = useDeleteGroup(
    cy, mode, isLocked, onLockedAction, editingGroup, setGroupStyles, setEditingGroup, saveGroupStylesToExtension
  );

  const editGroup = useEditGroup(cy, mode, isLocked, onLockedAction, groupStyles, setEditingGroup);

  const closeEditor = useCallback((): void => {
    setEditingGroup(null);
    log.info('[Groups] Editor closed');
  }, [setEditingGroup]);

  const saveGroup = useSaveGroup(
    cy, mode, isLocked, onLockedAction, lastStyleRef, setGroupStyles, setEditingGroup, saveGroupStylesToExtension
  );

  const updateGroupStyle = useUpdateGroupStyle(
    cy, mode, isLocked, groupStyles, setGroupStyles, saveGroupStylesToExtension
  );

  const loadGroupStyles = useCallback(
    (styles: GroupStyleAnnotation[]): void => {
      setGroupStyles(styles);
      if (cy) {
        styles.forEach(style => {
          const group = cy.getElementById(style.id) as NodeSingular;
          if (group.length > 0 && isGroupNode(group)) {
            applyGroupStyleToNode(group, style);
          }
        });
      }
      log.info(`[Groups] Loaded ${styles.length} group styles`);
    },
    [cy, setGroupStyles]
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

  const releaseNodeFromGroup = useReleaseNodeFromGroup(cy, mode, isLocked, onLockedAction, deleteGroup);

  return useMemo(
    () => ({
      groupStyles,
      editingGroup,
      createGroup,
      deleteGroup,
      editGroup,
      closeEditor,
      saveGroup,
      updateGroupStyle,
      loadGroupStyles,
      getUndoRedoAction,
      releaseNodeFromGroup
    }),
    [
      groupStyles, editingGroup, createGroup, deleteGroup, editGroup, closeEditor,
      saveGroup, updateGroupStyle, loadGroupStyles, getUndoRedoAction, releaseNodeFromGroup
    ]
  );
}
