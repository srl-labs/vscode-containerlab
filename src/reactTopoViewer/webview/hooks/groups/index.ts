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

// Utils (common utilities - for full set import from './utils')
export {
  generateGroupId,
  createDefaultGroup,
  findGroupAtPosition,
  buildGroupTree,
  getDescendantGroups,
  getChildGroups,
  getParentGroup,
  getGroupDepth,
  isPointInsideGroup,
  findDeepestGroupAtPosition
} from './utils';
