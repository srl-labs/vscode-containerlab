/**
 * App hooks barrel export
 *
 * All hooks extracted from App.tsx to reduce complexity.
 */

// Clipboard handlers
export {
  useClipboardHandlers,
  type ClipboardHandlersConfig,
  type ClipboardHandlersReturn
} from "./useClipboardHandlers";

// Keyboard shortcuts
export {
  useAppKeyboardShortcuts,
  type AppKeyboardShortcutsConfig
} from "./useAppKeyboardShortcuts";

// Graph creation
export {
  useGraphCreation,
  type GraphCreationConfig,
  type GraphCreationReturn
} from "./useGraphCreation";

// App helpers (original hooks)
export {
  useCustomNodeCommands,
  useNavbarCommands,
  useE2ETestingExposure,
  type CustomNodeCommands,
  type NavbarCommands,
  type E2ETestingConfig
} from "./useAppHelpers";

// App content composition helpers
export { useAppAnnotations } from "./useAppAnnotations";
export { useAppDerivedData } from "./useAppDerivedData";
export { useAppEditorBindings } from "./useAppEditorBindings";
export { useAppE2EExposure } from "./useAppE2EExposure";
export { useAppGraphHandlers } from "./useAppGraphHandlers";
export { useAppToasts } from "./useAppToasts";
export { useUndoRedoControls } from "./useUndoRedoControls";
export type { InitialGraphData } from "./useInitialGraphData";

// App initialization & subscriptions
export {
  useStoreInitialization,
  useGraphMessageSubscription,
  useTopoViewerMessageSubscription,
  useTopologyHostInitialization,
  type StoreInitializationData
} from "./lifecycle";
