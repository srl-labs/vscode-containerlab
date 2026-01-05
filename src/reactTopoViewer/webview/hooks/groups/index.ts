/**
 * Groups hooks barrel - exports all group-related hooks
 * Consolidated from: core/, interactions/, undo/, utils/ sub-directories
 */
/* eslint-disable import-x/max-dependencies -- Barrel file aggregates exports from many modules */

// Import from shared utilities to avoid duplication
import { getGroupBounds } from '../../utils/boundingBox';
// Re-export with alias for backwards compatibility
export { getGroupBounds as getGroupBoundingBox };

// ============================================================================
// Types and Constants
// ============================================================================
export {
  GROUP_LABEL_POSITIONS,
  DEFAULT_GROUP_STYLE,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  MIN_GROUP_SIZE
} from './groupTypes';
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
} from './groupTypes';

// ============================================================================
// Core State Hooks
// ============================================================================
export { useGroupState } from './useGroupState';
export { useGroups } from './useGroups';
export type { UseGroupsHookOptions } from './useGroups';
export { useGroupHierarchy } from './useGroupHierarchy';
export type { UseGroupHierarchyOptions, UseGroupHierarchyReturn } from './useGroupHierarchy';

// ============================================================================
// Interaction Hooks (drag, resize, clipboard, UI)
// ============================================================================
export { useGroupClipboard } from './useGroupClipboard';
export type { UseGroupClipboardOptions, UseGroupClipboardReturn } from './useGroupClipboard';
export { useNodeReparent } from './useNodeReparent';
export type { UseNodeReparentOptions, UseNodeReparentDeps } from './useNodeReparent';
export { useGroupDragInteraction, useDragPositionOverrides, useGroupResize } from './useGroupDrag';
export type { UseGroupDragInteractionOptions, UseGroupDragInteractionReturn, UseDragPositionOverridesReturn, ResizeCorner, UseGroupResizeReturn } from './useGroupDrag';

// ============================================================================
// App-level Hooks
// ============================================================================
export { useAppGroups } from './useAppGroups';
export {
  useAppGroupUndoHandlers,
  useGroupPositionHandler,
  useGroupDragMoveHandler
} from './useAppGroupHandlers';
export type {
  UseAppGroupUndoHandlersReturn,
  GroupPositionChangeHandler,
  GroupDragMoveHandler
} from './useAppGroupHandlers';

// ============================================================================
// Undo/Redo Hooks
// ============================================================================
export { useGroupUndoRedoHandlers } from './useGroupUndoRedoHandlers';
export type { UseGroupUndoRedoHandlersReturn } from './useGroupUndoRedoHandlers';
export { useGroupAnnotationApplier, useCombinedAnnotationApplier } from './useCombinedAnnotationApplier';
export type { UseGroupAnnotationApplierReturn, UseCombinedAnnotationApplierReturn } from './useCombinedAnnotationApplier';
export { useGroupDragUndo } from './useGroupDragUndo';
export type { UseGroupDragUndoOptions, UseGroupDragUndoReturn } from './useGroupDragUndo';
export { useGroupResizeUndo } from './useGroupResizeUndo';
export type { UseGroupResizeUndoOptions, UseGroupResizeUndoReturn } from './useGroupResizeUndo';

// ============================================================================
// Utility Functions
// ============================================================================
export {
  CMD_SAVE_NODE_GROUP_MEMBERSHIP,
  CMD_SAVE_GROUP_ANNOTATIONS,
  GROUP_SAVE_DEBOUNCE_MS,
  generateGroupId,
  parseGroupId,
  buildGroupId,
  createDefaultGroup,
  isPointInsideGroup,
  findGroupAtPosition,
  calculateBoundingBox,
  updateGroupInList,
  removeGroupFromList,
  isGroupInSelectionBox,
  getLabelPositionStyles
} from './groupHelpers';

export {
  buildGroupTree,
  getDescendantGroups,
  getDescendantGroupIds,
  getChildGroups,
  getChildGroupIds,
  getAncestorGroups,
  getParentGroup,
  getGroupDepth,
  findRootGroups,
  validateNoCircularReference,
  getAnnotationsInGroup,
  getAllAnnotationsInHierarchy,
  sortGroupsByDepthThenZIndex,
  getGroupCenter,
  getRelativePosition,
  getAbsolutePosition,
  isPositionInGroup,
  findDeepestGroupAtPosition,
  cloneGroup
} from './hierarchyUtils';
