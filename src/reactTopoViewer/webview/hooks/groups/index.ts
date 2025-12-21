/**
 * Groups hooks barrel - re-exports from sub-barrels
 */

// Core types and state
export {
  GROUP_LABEL_POSITIONS,
  DEFAULT_GROUP_STYLE,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  MIN_GROUP_SIZE,
  useGroupState,
  useGroups,
  useGroupHierarchy
} from './core';
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
  UseGroupsReturn,
  UseGroupsHookOptions,
  UseGroupHierarchyOptions,
  UseGroupHierarchyReturn
} from './core';

// Interactions
export {
  useAppGroups,
  useAppGroupUndoHandlers,
  useNodeReparent,
  useGroupLayer
} from './interactions';

// Undo/redo
export {
  useCombinedAnnotationApplier,
  useGroupDragUndo,
  useGroupUndoRedoHandlers
} from './undo';

// Utils
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
  getLabelPositionStyles,
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
} from './utils';
