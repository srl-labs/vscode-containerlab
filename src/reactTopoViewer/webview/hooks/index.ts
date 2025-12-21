/**
 * React TopoViewer hooks
 */

// Graph manipulation
export {
  useEdgeCreation,
  EDGE_CREATION_SCRATCH_KEY,
  useNodeCreation,
  useNetworkCreation,
  useNodeDragging,
  useCopyPaste
} from './graph';
export type {
  NodeDraggingOptions,
  CopyPasteOptions,
  CopyPasteReturn,
  CopyData,
  GraphChangeEntry,
  CyElementJson,
  NetworkType
} from './graph';

// State management
export { useUndoRedo, useGraphUndoRedoHandlers, useCustomTemplateEditor } from './state';
export type {
  NodePositionEntry,
  MembershipEntry,
  GraphChange,
  UndoRedoActionMove,
  UndoRedoActionGraph,
  UndoRedoActionAnnotation,
  UndoRedoAction,
  UseUndoRedoOptions,
  UseUndoRedoReturn,
  CustomTemplateEditorHandlers,
  CustomTemplateEditorResult
} from './state';

// UI interactions
export {
  useContextMenu,
  useCustomNodeCommands,
  useNavbarCommands,
  useFloatingPanelCommands,
  usePanelVisibility,
  useKeyboardShortcuts,
  useShortcutDisplay,
  useAppHandlers
} from './ui';
export type { PendingMembershipChange } from './ui';

// Data fetching
export { useDockerImages, useSchema } from './data';

// Annotations
export {
  useAppFreeTextAnnotations,
  useFreeTextAnnotationApplier,
  useFreeTextUndoRedoHandlers,
  useAppFreeShapeAnnotations,
  useFreeShapeAnnotationApplier,
  useFreeShapeUndoRedoHandlers,
  useShapeLayer,
  useAnnotationEffects,
  useAddShapesHandler,
  generateAnnotationId
} from './annotations';
export type {
  FreeTextAnnotation,
  UseFreeTextAnnotationsReturn,
  FreeShapeAnnotation,
  UseFreeShapeAnnotationsReturn
} from './annotations';

// Groups
export {
  GROUP_MIN_SIZE,
  GROUP_RESIZE_HANDLE_SIZE,
  GROUP_SELECTION_PADDING,
  useAppGroups,
  useAppGroupUndoHandlers,
  useNodeReparent,
  useGroupLayer,
  useCombinedAnnotationApplier,
  useGroupDragUndo,
  useGroupUndoRedoHandlers,
  generateGroupId,
  isDescendant,
  buildGroupTree,
  flattenGroupTree,
  findGroupAtPosition,
  getGroupLevel,
  getGroupAtPosition
} from './groups';
export type {
  GroupStyleAnnotation,
  GroupStyle,
  GroupHierarchyNode,
  UseGroupsReturn,
  GroupsState,
  GroupData,
  UndoRedoActionGroup
} from './groups';

// Panels
export {
  usePanelResize,
  useBulkLinkPanel,
  useLabSettingsState,
  useIconSelectorState,
  useNodeEditorHandlers,
  useLinkEditorHandlers,
  useNetworkEditorHandlers,
  useNodeCreationHandlers,
  useMembershipCallbacks
} from './panels';
export type {
  UseLabSettingsStateResult,
  UseIconSelectorStateReturn,
  NodeCreationState,
  PendingMembershipChange as PanelPendingMembershipChange
} from './panels';

// Canvas (Cytoscape)
export {
  useElementsUpdate,
  useCytoscapeInitializer,
  useDelayedCytoscapeInit,
  useLinkLabelVisibility,
  useGeoMap,
  assignMissingGeoCoordinatesToAnnotations,
  assignMissingGeoCoordinatesToShapeAnnotations
} from './canvas';
export type { CytoscapeInitOptions } from './canvas';

// Clipboard
export { useUnifiedClipboard } from './clipboard';
export type {
  UnifiedClipboardData,
  PasteResult,
  UseUnifiedClipboardOptions,
  UseUnifiedClipboardReturn
} from './clipboard';

// Root-level hooks
export {
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useLayoutControls,
  useContextMenuHandlers,
  DEFAULT_GRID_LINE_WIDTH
} from './useAppState';
export type { LayoutOption, NodeData, LinkData } from './useAppState';
