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

// App composition hooks - import directly from ../app/* to avoid circular deps
// (useAppContentViewModel imports from ../app sibling files directly)

// Annotation hooks live in ../annotations (import directly to avoid circular deps)

// External file change handling
export { useExternalFileChange } from "../useExternalFileChange";
