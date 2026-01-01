/**
 * React TopoViewer hooks (internal barrel)
 *
 * This barrel is intentionally kept small (and under export-count limits).
 * For everything else, import from feature folders directly (e.g. `../graph`, `../annotations`).
 */

// Used by App.tsx wiring
export { useNodeDragging } from '../graph';
export type { GraphChange } from '../state';
export { useGraphHandlersWithContext, useCustomTemplateEditor } from '../state';
export {
  useContextMenu,
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers
} from '../ui';
export { useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers } from '../panels';
export { useEndpointLabelOffset, useLinkLabelVisibility, useGeoMap } from '../canvas';
export {
  useCytoscapeInstance,
  useSelectionData,
  useNavbarActions,
  useLayoutControls,
  useContextMenuHandlers
} from '../useAppState';
export {
  useCustomNodeCommands,
  useNavbarCommands,
  useShapeLayer,
  useTextLayer,
  useE2ETestingExposure,
  useGeoCoordinateSync,
  useAnnotationLayerProps,
  useClipboardHandlers,
  useAppKeyboardShortcuts,
  useGraphCreation
} from '../app';

// Used by AnnotationContext.tsx wiring
export {
  useAppFreeTextAnnotations,
  useAppFreeShapeAnnotations,
  useFreeTextAnnotationApplier,
  useFreeShapeAnnotationApplier,
  useFreeTextUndoRedoHandlers,
  useFreeShapeUndoRedoHandlers,
  useAnnotationEffects,
  useAddShapesHandler
} from '../annotations';

export { useAppGroups } from '../groups';

// External file change handling
export { useExternalFileChange } from '../useExternalFileChange';
