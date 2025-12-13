/**
 * UI interaction hooks
 *
 * [MIGRATION] Migrate to @xyflow/react - deleted Cytoscape-specific hooks:
 * - useContextMenu (ReactFlow has its own context menu approach)
 */

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

// Panel position hooks (moved from components/panels/floatingPanel/)
export {
  useFloatingPanelDrag,
  useDrawerSide,
  useShakeAnimation,
  loadInitialPosition,
  savePanelState,
  buildLockButtonClass
} from './usePanelPosition';
export type { Position } from './usePanelPosition';

// Panel drag/resize hooks (moved from components/shared/editor/)
export { usePanelDrag } from './usePanelDrag';
export { usePanelResize } from './usePanelResize';
