/**
 * Groups hooks barrel - re-exports from sub-barrels
 */

// Core types and state
export {
  GROUP_MIN_SIZE,
  GROUP_RESIZE_HANDLE_SIZE,
  GROUP_SELECTION_PADDING
} from './core';
export type {
  GroupStyleAnnotation,
  GroupStyle,
  GroupHierarchyNode,
  UseGroupsReturn,
  GroupsState,
  GroupData,
  UndoRedoActionGroup
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
  generateGroupId,
  isDescendant,
  buildGroupTree,
  flattenGroupTree,
  findGroupAtPosition,
  getGroupLevel,
  getGroupAtPosition
} from './utils';
