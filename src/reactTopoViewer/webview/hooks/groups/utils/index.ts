/**
 * Group utility functions for helpers and hierarchy operations
 */

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
} from '../groupHelpers';

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
} from '../hierarchyUtils';
