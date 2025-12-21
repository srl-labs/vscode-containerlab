/**
 * Groups hooks barrel - exports all group-related hooks
 * Consolidated from: core/, interactions/, undo/, utils/ sub-directories
 */

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
export { useGroupLayer } from './useGroupLayer';
export { useGroupDragInteraction, useDragPositionOverrides } from './useGroupDrag';
export type { UseGroupDragInteractionOptions, UseGroupDragInteractionReturn, UseDragPositionOverridesReturn } from './useGroupDrag';
export { useGroupResize } from './useGroupResize';
export type { ResizeCorner, UseGroupResizeReturn } from './useGroupResize';

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
export { useGroupAnnotationApplier } from './useGroupAnnotationApplier';
export type { UseGroupAnnotationApplierReturn } from './useGroupAnnotationApplier';
export { useCombinedAnnotationApplier } from './useCombinedAnnotationApplier';
export type { UseCombinedAnnotationApplierReturn } from './useCombinedAnnotationApplier';
export { useGroupDragUndo } from './useGroupDragUndo';
export type { UseGroupDragUndoOptions, UseGroupDragUndoReturn } from './useGroupDragUndo';

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
  getGroupBoundingBox,
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
