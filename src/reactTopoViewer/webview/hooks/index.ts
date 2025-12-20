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

// UI interactions - re-export all from ui/index.ts
export {
  useContextMenu,
  useCustomNodeCommands,
  useNavbarCommands,
  useDeploymentCommands,
  useEditorPanelCommands,
  useFloatingPanelCommands,
  usePanelVisibility,
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  buildLockButtonClass,
  savePanelState,
  PANEL_STORAGE_KEY,
  useDropdownKeyboard,
  useFilterableDropdown,
  useDropdownState,
  useFloatingDropdownKeyboard,
  useFocusOnOpen,
  useDropdown,
  useKeyboardShortcuts,
  useShortcutDisplay,
  useAppHandlers,
  useClickOutside,
  useEscapeKey,
  useDelayedHover
} from './ui';
export type {
  ContextMenuOptions,
  ContextMenuState,
  UseContextMenuReturn,
  CustomNodeCommands,
  NavbarCommands,
  DeploymentCommands,
  EditorPanelCommands,
  FloatingPanelCommands,
  PanelVisibility,
  Position,
  UsePanelDragOptions,
  UsePanelDragReturn,
  DropdownKeyboardActions,
  DropdownKeyboardState,
  FilterableDropdownOption,
  UseFilterableDropdownReturn,
  UseDropdownReturn,
  PendingMembershipChange,
  UseDelayedHoverReturn
} from './ui';

// Data fetching
export { useDockerImages, useSchema } from './data';

// Annotations - re-export from annotations/index.ts
export {
  useFreeTextAnnotations,
  useAppFreeTextAnnotations,
  useFreeTextUndoRedoHandlers,
  useFreeTextAnnotationApplier,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_COLOR,
  DEFAULT_BACKGROUND_COLOR,
  useFreeTextState,
  useFreeTextActions,
  modelToRendered,
  renderedToModel,
  modelToRenderedGeo,
  getCursorStyle,
  getBorderRadius,
  computeAnnotationStyle,
  useFreeShapeAnnotations,
  useAppFreeShapeAnnotations,
  useFreeShapeUndoRedoHandlers,
  useFreeShapeAnnotationApplier,
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_LINE_LENGTH,
  DEFAULT_FILL_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_STYLE,
  DEFAULT_ARROW_SIZE,
  DEFAULT_CORNER_RADIUS,
  MIN_SHAPE_SIZE,
  getLineCenter,
  updateAnnotationEndPosition,
  useFreeShapeState,
  useFreeShapeActions,
  useAnnotationDrag,
  useRotationDrag,
  useResizeDrag,
  useLineResizeDrag,
  useAnnotationClickHandlers,
  useLayerClickHandler,
  useAnnotationBoxSelection,
  useAnnotationInteractions,
  useShapeLayer,
  useAnnotationListSelection,
  getSelectedByIds,
  useAnnotationListCopyPaste,
  useCombinedAnnotationShortcuts,
  useAnnotationGroupMove,
  useAnnotationBackgroundClear,
  useAddShapesHandler,
  useAnnotationEffects,
  useAnnotationReparent,
  generateAnnotationId,
  useDebouncedSave
} from './annotations';
export type {
  UseFreeTextAnnotationsOptions,
  UseFreeTextAnnotationsReturn,
  AnnotationUndoAction,
  UseAppFreeTextAnnotationsReturn,
  UseFreeTextAnnotationApplierReturn,
  UseFreeTextUndoRedoHandlersReturn,
  FreeTextAnnotation,
  UseFreeTextStateReturn,
  UseFreeTextActionsOptions,
  UseFreeTextActionsReturn,
  RenderedPosition,
  UseFreeShapeAnnotationsOptions,
  UseFreeShapeAnnotationsReturn,
  UseFreeShapeUndoRedoHandlersReturn,
  UseFreeShapeAnnotationApplierReturn,
  UseFreeShapeStateReturn,
  UseFreeShapeActionsOptions,
  UseFreeShapeActionsReturn,
  AnnotationWithId,
  UseAnnotationListSelectionReturn,
  UseAnnotationListCopyPasteReturn,
  UseCombinedAnnotationShortcutsReturn,
  GroupClipboardOptions,
  UseAnnotationReparentOptions,
  UseAnnotationReparentReturn,
  UseDebouncedSaveReturn
} from './annotations';

// Groups
export {
  GROUP_LABEL_POSITIONS,
  DEFAULT_GROUP_STYLE,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  MIN_GROUP_SIZE,
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
  cloneGroup,
  useGroupState,
  useGroups,
  useGroupHierarchy,
  useGroupUndoRedoHandlers,
  useGroupAnnotationApplier,
  useCombinedAnnotationApplier,
  useGroupDragUndo,
  useGroupClipboard,
  useNodeReparent,
  useGroupLayer,
  useGroupDragInteraction,
  useGroupResize,
  useGroupItemHandlers,
  useDragPositionOverrides,
  useAppGroups,
  useAppGroupUndoHandlers,
  useGroupPositionHandler,
  useGroupDragMoveHandler
} from './groups';
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
  UseGroupHierarchyReturn,
  UseGroupUndoRedoHandlersReturn,
  UseGroupAnnotationApplierReturn,
  UseCombinedAnnotationApplierReturn,
  UseGroupDragUndoOptions,
  UseGroupDragUndoReturn,
  UseGroupClipboardOptions,
  UseGroupClipboardReturn,
  UseNodeReparentOptions,
  UseNodeReparentDeps,
  UseGroupDragInteractionOptions,
  UseGroupDragInteractionReturn,
  ResizeCorner,
  UseGroupResizeReturn,
  UseGroupItemHandlersReturn,
  UseDragPositionOverridesReturn,
  UseAppGroupUndoHandlersReturn,
  GroupPositionChangeHandler,
  GroupDragMoveHandler
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
