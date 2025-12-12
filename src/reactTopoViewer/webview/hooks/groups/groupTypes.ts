/**
 * Types for group management in React TopoViewer.
 * Groups are rendered as overlay annotations (not Cytoscape nodes).
 */
import React from 'react';
import type { GroupStyleAnnotation } from '../../../shared/types/topology';
import type { UndoRedoActionAnnotation } from '../state/useUndoRedo';

/**
 * Label position options for groups.
 */
export const GROUP_LABEL_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const;

export type GroupLabelPosition = typeof GROUP_LABEL_POSITIONS[number];

/**
 * Default group style values (excluding required fields that vary per group).
 */
export const DEFAULT_GROUP_STYLE = {
  backgroundColor: '#d9d9d9',
  backgroundOpacity: 20,
  borderColor: '#dddddd',
  borderWidth: 0.5,
  borderStyle: 'solid' as const,
  borderRadius: 0,
  labelColor: '#ebecf0',
  labelPosition: 'top-center',
  zIndex: 5
};

/** Default group dimensions */
export const DEFAULT_GROUP_WIDTH = 150;
export const DEFAULT_GROUP_HEIGHT = 100;
export const MIN_GROUP_SIZE = 100;

/**
 * Group editor data structure.
 */
export interface GroupEditorData {
  id: string;
  name: string;
  level: string;
  style: GroupStyleAnnotation;
}

/**
 * Options for useGroupState hook.
 */
export interface UseGroupStateOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

/**
 * Return type for useGroupState hook.
 */
export interface UseGroupStateReturn {
  groups: GroupStyleAnnotation[];
  setGroups: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>;
  editingGroup: GroupEditorData | null;
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>;
  saveGroupsToExtension: (groups: GroupStyleAnnotation[]) => void;
  lastStyleRef: React.RefObject<Partial<GroupStyleAnnotation>>;
}

/**
 * Undo action type for groups.
 */
export interface GroupUndoAction extends Omit<UndoRedoActionAnnotation, 'annotationType'> {
  annotationType: 'group';
}

/**
 * Options for useGroups hook.
 */
export interface UseGroupsOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
}

/**
 * Return type for useGroups hook.
 */
export interface UseGroupsReturn {
  groups: GroupStyleAnnotation[];
  editingGroup: GroupEditorData | null;
  createGroup: (selectedNodeIds?: string[]) => string | null;
  deleteGroup: (groupId: string) => void;
  editGroup: (groupId: string) => void;
  closeEditor: () => void;
  saveGroup: (data: GroupEditorData) => void;
  updateGroup: (groupId: string, updates: Partial<GroupStyleAnnotation>) => void;
  updateGroupPosition: (groupId: string, position: { x: number; y: number }) => void;
  updateGroupSize: (groupId: string, width: number, height: number) => void;
  loadGroups: (groups: GroupStyleAnnotation[]) => void;
  getUndoRedoAction: (
    before: GroupStyleAnnotation | null,
    after: GroupStyleAnnotation | null
  ) => GroupUndoAction;
  findGroupAtPosition: (position: { x: number; y: number }) => GroupStyleAnnotation | null;
  getGroupMembers: (groupId: string) => string[];
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
}
