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

// App content view-model + initial data
export { useAppContentViewModel } from "./useAppContentViewModel";
export { useInitialGraphData } from "./useInitialGraphData";
