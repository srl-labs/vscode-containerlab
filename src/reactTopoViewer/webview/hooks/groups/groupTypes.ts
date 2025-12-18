/**
 * Types for group management in React TopoViewer.
 * Groups are rendered as overlay annotations (not Cytoscape nodes).
 * Groups support hierarchical nesting via parentId.
 */
import React from 'react';
import type {
  GroupStyleAnnotation,
  FreeTextAnnotation,
  FreeShapeAnnotation
} from '../../../shared/types/topology';
import type { NodePositionEntry } from '../state/useUndoRedo';

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
  // Selection state and methods
  selectedGroupIds: Set<string>;
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  clearGroupSelection: () => void;
}

/**
 * Undo action type for groups.
 */
export interface GroupUndoAction {
  type: 'annotation';
  annotationType: 'group';
  before: GroupStyleAnnotation | null;
  after: GroupStyleAnnotation | null;
  [key: string]: unknown;
}

// ============================================================================
// Hierarchy Types
// ============================================================================

/**
 * Tracks an annotation's membership in a group.
 */
export interface AnnotationMembership {
  annotationId: string;
  annotationType: 'freeText' | 'freeShape';
  groupId: string;
}

/**
 * Complete snapshot of a group hierarchy for undo/redo operations.
 */
export interface GroupHierarchySnapshot {
  groups: GroupStyleAnnotation[];
  nodeMemberships: Array<{ nodeId: string; groupId: string }>;
  textAnnotations: FreeTextAnnotation[];
  shapeAnnotations: FreeShapeAnnotation[];
}

/**
 * Represents a group with all its descendants for copy/paste operations.
 */
export interface GroupClipboardData {
  rootGroup: GroupStyleAnnotation;
  descendantGroups: GroupStyleAnnotation[];
  memberNodes: Array<{
    nodeId: string;
    groupId: string;
    relativePosition: { x: number; y: number };
  }>;
  textAnnotations: Array<FreeTextAnnotation & { relativePosition: { x: number; y: number } }>;
  shapeAnnotations: Array<FreeShapeAnnotation & { relativePosition: { x: number; y: number } }>;
}

/**
 * Result of pasting a group hierarchy.
 */
export interface PastedGroupResult {
  newGroups: GroupStyleAnnotation[];
  newTextAnnotations: FreeTextAnnotation[];
  newShapeAnnotations: FreeShapeAnnotation[];
  idMapping: Map<string, string>; // old ID -> new ID
}

/**
 * Undo action for hierarchical group moves.
 */
export interface HierarchicalMoveUndoAction {
  type: 'hierarchical-move';
  rootGroupId: string;
  groupsBefore: GroupStyleAnnotation[];
  groupsAfter: GroupStyleAnnotation[];
  nodesBefore: NodePositionEntry[];
  nodesAfter: NodePositionEntry[];
  textAnnotationsBefore: FreeTextAnnotation[];
  textAnnotationsAfter: FreeTextAnnotation[];
  shapeAnnotationsBefore: FreeShapeAnnotation[];
  shapeAnnotationsAfter: FreeShapeAnnotation[];
}

/**
 * Undo action for group deletion with child promotion.
 */
export interface GroupDeleteUndoAction {
  type: 'group-delete';
  deletedGroup: GroupStyleAnnotation;
  promotedGroups: Array<{ groupId: string; previousParentId: string | null }>;
  promotedAnnotations: Array<{
    id: string;
    type: 'freeText' | 'freeShape';
    previousGroupId: string;
  }>;
  promotedNodes: Array<{ nodeId: string; previousGroupId: string }>;
}

/**
 * Undo action for pasting a group hierarchy.
 */
export interface GroupPasteUndoAction {
  type: 'group-paste';
  createdGroups: GroupStyleAnnotation[];
  createdTextAnnotations: FreeTextAnnotation[];
  createdShapeAnnotations: FreeShapeAnnotation[];
}

/**
 * Drag offsets for groups currently being dragged.
 * Used to offset child groups and annotations during parent drag.
 */
export interface GroupDragOffset {
  groupId: string;
  dx: number;
  dy: number;
}

/**
 * Options for useGroups hook.
 */
export interface UseGroupsOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  onLockedAction?: () => void;
  // For group rename migration - when group ID changes, these callbacks update references
  onMigrateTextAnnotations?: (oldGroupId: string, newGroupId: string) => void;
  onMigrateShapeAnnotations?: (oldGroupId: string, newGroupId: string) => void;
}

/**
 * Return type for useGroups hook.
 */
export interface UseGroupsReturn {
  groups: GroupStyleAnnotation[];
  editingGroup: GroupEditorData | null;
  createGroup: (selectedNodeIds?: string[], parentId?: string) => { groupId: string; group: GroupStyleAnnotation } | null;
  deleteGroup: (groupId: string) => void;
  editGroup: (groupId: string) => void;
  closeEditor: () => void;
  saveGroup: (data: GroupEditorData) => void;
  updateGroup: (groupId: string, updates: Partial<GroupStyleAnnotation>) => void;
  updateGroupPosition: (groupId: string, position: { x: number; y: number }) => void;
  updateGroupSize: (groupId: string, width: number, height: number) => void;
  updateGroupGeoPosition: (groupId: string, geoCoordinates: { lat: number; lng: number }) => void;
  loadGroups: (groups: GroupStyleAnnotation[], persistToExtension?: boolean) => void;
  addGroup: (group: GroupStyleAnnotation) => void;
  getUndoRedoAction: (
    before: GroupStyleAnnotation | null,
    after: GroupStyleAnnotation | null
  ) => GroupUndoAction;
  findGroupAtPosition: (position: { x: number; y: number }) => GroupStyleAnnotation | null;
  getGroupMembers: (groupId: string) => string[];
  getNodeMembership: (nodeId: string) => string | null;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  removeNodeFromGroup: (nodeId: string) => void;
  initializeMembership: (memberships: Array<{ nodeId: string; groupId: string }>) => void;
  // Selection methods
  selectedGroupIds: Set<string>;
  selectGroup: (id: string) => void;
  toggleGroupSelection: (id: string) => void;
  boxSelectGroups: (ids: string[]) => void;
  clearGroupSelection: () => void;
  // Hierarchy methods
  updateGroupParent: (groupId: string, parentId: string | null) => void;
  getChildGroups: (groupId: string) => GroupStyleAnnotation[];
  getDescendantGroups: (groupId: string) => GroupStyleAnnotation[];
  getParentGroup: (groupId: string) => GroupStyleAnnotation | null;
  getGroupDepth: (groupId: string) => number;
}
