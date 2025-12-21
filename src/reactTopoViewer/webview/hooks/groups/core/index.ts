/**
 * Core group types, constants, and state hooks
 */

// Group types and constants
export {
  GROUP_LABEL_POSITIONS,
  DEFAULT_GROUP_STYLE,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  MIN_GROUP_SIZE
} from '../groupTypes';
export type {
  GroupLabelPosition,
  GroupEditorData,
  UseGroupStateOptions,
  UseGroupStateReturn,
  GroupUndoAction,
  AnnotationMembership,
  GroupHierarchySnapshot,
  GroupClipboardData,
  PastedGroupResult,
  HierarchicalMoveUndoAction,
  GroupDeleteUndoAction,
  GroupPasteUndoAction,
  GroupDragOffset,
  UseGroupsOptions,
  UseGroupsReturn
} from '../groupTypes';

// Core state hooks
export { useGroupState } from '../useGroupState';
export { useGroups } from '../useGroups';
export type { UseGroupsHookOptions } from '../useGroups';
export { useGroupHierarchy } from '../useGroupHierarchy';
export type { UseGroupHierarchyOptions, UseGroupHierarchyReturn } from '../useGroupHierarchy';
