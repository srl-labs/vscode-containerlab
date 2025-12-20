/**
 * Group management hooks for React TopoViewer
 */

// Group types
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

// Group helpers
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

// Hierarchy utilities
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

// Group state hooks
export { useGroupState } from './useGroupState';
export { useGroups } from './useGroups';
export type { UseGroupsHookOptions } from './useGroups';
export { useGroupHierarchy } from './useGroupHierarchy';
export type { UseGroupHierarchyOptions, UseGroupHierarchyReturn } from './useGroupHierarchy';

// Group undo/redo hooks
export { useGroupUndoRedoHandlers } from './useGroupUndoRedoHandlers';
export type { UseGroupUndoRedoHandlersReturn } from './useGroupUndoRedoHandlers';
export { useGroupAnnotationApplier } from './useGroupAnnotationApplier';
export type { UseGroupAnnotationApplierReturn } from './useGroupAnnotationApplier';
export { useCombinedAnnotationApplier } from './useCombinedAnnotationApplier';
export type { UseCombinedAnnotationApplierReturn } from './useCombinedAnnotationApplier';
export { useGroupDragUndo } from './useGroupDragUndo';
export type { UseGroupDragUndoOptions, UseGroupDragUndoReturn } from './useGroupDragUndo';

// Group interaction hooks
export { useGroupClipboard } from './useGroupClipboard';
export type { UseGroupClipboardOptions, UseGroupClipboardReturn } from './useGroupClipboard';
export { useNodeReparent } from './useNodeReparent';
export type { UseNodeReparentOptions, UseNodeReparentDeps } from './useNodeReparent';
export { useGroupLayer } from './useGroupLayer';
export { useGroupDragInteraction } from './useGroupDrag';
export type { UseGroupDragInteractionOptions, UseGroupDragInteractionReturn } from './useGroupDrag';
export { useGroupResize } from './useGroupResize';
export type { ResizeCorner, UseGroupResizeReturn } from './useGroupResize';
export { useGroupItemHandlers } from './useGroupHandlers';
export type { UseGroupItemHandlersReturn } from './useGroupHandlers';
export { useDragPositionOverrides } from './useDragPositionOverrides';
export type { UseDragPositionOverridesReturn } from './useDragPositionOverrides';

// App-level group hooks
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
