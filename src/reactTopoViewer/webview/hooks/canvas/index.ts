/**
 * Canvas & graph hooks (React Flow + annotations + groups)
 */
export {
  useDeleteHandlers,
  useLinkCreation,
  useSourceNodePosition,
  useKeyboardDeleteHandlers,
  useCanvasRefMethods
} from "./useReactFlowCanvasHooks";

// Canvas event handlers (React Flow integration)
export { useCanvasHandlers, snapToGrid, GRID_SIZE } from "./useCanvasHandlers";
export { useAnnotationCanvasHandlers } from "./useAnnotationCanvasHandlers";
export { useGeoMapLayout } from "./useGeoMapLayout";

// Annotation hooks
export { useAnnotations } from "./useAnnotations";
export type { AnnotationContextValue, AnnotationState, AnnotationActions } from "./annotationTypes";
export { useDerivedAnnotations } from "./useDerivedAnnotations";

// Graph creation hooks
export { useNodeCreation } from "./useNodeCreation";
export { useNetworkCreation } from "./useNetworkCreation";
export type { NetworkType } from "./useNetworkCreation";

// Group helpers
export type { GroupEditorData, UseGroupClipboardReturn, GroupStyle } from "./groupTypes";
export { groupToEditorData, editorDataToGroup, GROUP_LABEL_POSITIONS } from "./groupTypes";
export {
  findDeepestGroupAtPosition,
  findGroupForNodeAtPosition,
  findParentGroupForBounds,
  generateGroupId,
  handleNodeMembershipChange,
  isGroupInsideGroup,
  isPositionInsideGroup
} from "./groupUtils";
