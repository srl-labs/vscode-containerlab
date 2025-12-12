/**
 * Types for group management in React TopoViewer.
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
 * Default group style values.
 */
export const DEFAULT_GROUP_STYLE: Omit<GroupStyleAnnotation, 'id'> = {
  backgroundColor: '#d9d9d9',
  backgroundOpacity: 20,
  borderColor: '#dddddd',
  borderWidth: 0.5,
  borderStyle: 'solid',
  borderRadius: 0,
  color: '#ebecf0',
  labelPosition: 'top-center'
};

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
  groupStyles: GroupStyleAnnotation[];
  setGroupStyles: React.Dispatch<React.SetStateAction<GroupStyleAnnotation[]>>;
  editingGroup: GroupEditorData | null;
  setEditingGroup: React.Dispatch<React.SetStateAction<GroupEditorData | null>>;
  saveGroupStylesToExtension: (styles: GroupStyleAnnotation[]) => void;
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
  groupStyles: GroupStyleAnnotation[];
  editingGroup: GroupEditorData | null;
  createGroup: (selectedNodeIds?: string[]) => string | null;
  deleteGroup: (groupId: string) => void;
  editGroup: (groupId: string) => void;
  closeEditor: () => void;
  saveGroup: (data: GroupEditorData) => void;
  updateGroupStyle: (groupId: string, style: Partial<GroupStyleAnnotation>) => void;
  loadGroupStyles: (styles: GroupStyleAnnotation[]) => void;
  getUndoRedoAction: (
    before: GroupStyleAnnotation | null,
    after: GroupStyleAnnotation | null
  ) => GroupUndoAction;
  releaseNodeFromGroup: (nodeId: string) => void;
}
