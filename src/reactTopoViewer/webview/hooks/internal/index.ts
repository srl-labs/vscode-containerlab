/**
 * React TopoViewer hooks (internal barrel)
 *
 * This barrel is intentionally kept small (and under export-count limits).
 * For everything else, import from feature folders directly (e.g. `../graph`, `../annotations`).
 */

// Used by App.tsx wiring
export { useGraphHandlersWithContext, useCustomTemplateEditor } from "../state";
export {
  useFloatingPanelCommands,
  usePanelVisibility,
  useShortcutDisplay,
  useAppHandlers
} from "../ui";
export { useNodeEditorHandlers, useLinkEditorHandlers, useNetworkEditorHandlers } from "../panels";
export { useLayoutControls, useContextMenuHandlers } from "../ui/useAppState";

// App composition hooks
export {
  useCustomNodeCommands,
  useNavbarCommands,
  useE2ETestingExposure,
  useClipboardHandlers,
  useAppKeyboardShortcuts,
  useGraphCreation
} from "../app";

// Annotation hooks removed during ReactFlow migration cleanup

// External file change handling
export { useExternalFileChange } from "../useExternalFileChange";
