/**
 * UI interaction hooks
 */

export { useContextMenu, CONTEXT_MENU_SCRATCH_KEY } from './useContextMenu';
export type { ContextMenuOptions } from './useContextMenu';

export { useKeyboardShortcuts } from './useKeyboardShortcuts';

export { useShortcutDisplay } from './useShortcutDisplay';

export { useCustomNodeCommands } from './useCustomNodeCommands';
export type { CustomNodeCommands } from './useCustomNodeCommands';

export { useNavbarCommands } from './useNavbarCommands';
export type { NavbarCommands } from './useNavbarCommands';

export { usePanelVisibility } from './usePanelVisibility';
export type { PanelVisibility } from './usePanelVisibility';

export {
  useDeploymentCommands,
  useEditorPanelCommands,
  useFloatingPanelCommands
} from './usePanelCommands';
export type {
  DeploymentCommands,
  EditorPanelCommands,
  FloatingPanelCommands
} from './usePanelCommands';

export { useAppHandlers } from './useAppHandlers';
