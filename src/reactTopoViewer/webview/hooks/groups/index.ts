/**
 * Group hooks barrel export
 */

// Types
export type { GroupEditorData, UseGroupClipboardReturn, GroupStyle } from "./groupTypes";
export { groupToEditorData, editorDataToGroup, GROUP_LABEL_POSITIONS } from "./groupTypes";

// Utilities
export {
  findDeepestGroupAtPosition,
  findGroupForNodeAtPosition,
  generateGroupId,
  handleNodeMembershipChange,
  isPositionInsideGroup
} from "./groupUtils";

// Legacy group hooks removed during ReactFlow migration cleanup
