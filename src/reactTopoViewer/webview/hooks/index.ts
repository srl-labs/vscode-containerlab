/**
 * React TopoViewer hooks
 */

// Graph manipulation (for internal types, import from './graph')
export {
  useEdgeCreation,
  EDGE_CREATION_SCRATCH_KEY,
  useNodeCreation,
  useNetworkCreation,
  useNodeDragging,
  useCopyPaste
} from './graph';
export type { GraphChangeEntry } from './graph';

// State management (for internal types, import from './state')
export { useUndoRedo, useGraphUndoRedoHandlers, useCustomTemplateEditor } from './state';

// UI interactions (for types, import from './ui')
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

// Data fetching
export { useDockerImages, useSchema } from './data';

// Annotations (for types, import from './annotations')
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

// Groups (core hooks only - for utilities/types import from './groups')
export { useGroupState, useGroups, useAppGroups, useGroupLayer } from './groups';

// Panels (for types, import from './panels')
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

// Canvas (for internal hooks, import from './canvas')
export {
  useLinkLabelVisibility,
  useGeoMap,
  assignMissingGeoCoordinatesToAnnotations,
  assignMissingGeoCoordinatesToShapeAnnotations
} from './canvas';

// Clipboard (for types, import from './clipboard')
export { useUnifiedClipboard } from './clipboard';

// Root-level hooks (for types, import from './useAppState')
export {
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useLayoutControls,
  useContextMenuHandlers,
  DEFAULT_GRID_LINE_WIDTH
} from './useAppState';
