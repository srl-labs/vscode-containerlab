/**
 * UI hooks barrel - exports all UI-related hooks
 * Consolidated from: commands/, panels/, interactions/ sub-directories
 */

// ============================================================================
// Context Menu & Commands
// ============================================================================
export { useContextMenu } from './useContextMenu';
export type { ContextMenuOptions, ContextMenuState, UseContextMenuReturn } from './useContextMenu';
export { useCustomNodeCommands } from './useCustomNodeCommands';
export type { CustomNodeCommands } from './useCustomNodeCommands';
export { useNavbarCommands } from './useNavbarCommands';
export type { NavbarCommands } from './useNavbarCommands';
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

// ============================================================================
// Panel Visibility & Drag
// ============================================================================
export { usePanelVisibility } from './usePanelVisibility';
export type { PanelVisibility } from './usePanelVisibility';
export {
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  buildLockButtonClass,
  savePanelState,
  PANEL_STORAGE_KEY
} from './usePanelDrag';
export type { Position, UsePanelDragOptions, UsePanelDragReturn } from './usePanelDrag';

// ============================================================================
// Keyboard & Shortcuts
// ============================================================================
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useShortcutDisplay } from './useShortcutDisplay';

// ============================================================================
// App Handlers
// ============================================================================
export { useAppHandlers } from './useAppHandlers';
export type { PendingMembershipChange } from './useAppHandlers';

// ============================================================================
// Click, Escape, Hover
// ============================================================================
export { useClickOutside } from './useClickOutside';
export { useEscapeKey } from './useEscapeKey';
export { useDelayedHover } from './useDelayedHover';
export type { UseDelayedHoverReturn } from './useDelayedHover';

// ============================================================================
// Dropdown Hooks
// ============================================================================
export {
  useDropdown,
  useDropdownState,
  useDropdownKeyboard,
  useFloatingDropdownKeyboard,
  useFocusOnOpen
} from './useDropdown';
export type {
  UseDropdownReturn,
  DropdownKeyboardActions,
  DropdownKeyboardState
} from './useDropdown';
export { useFilterableDropdown } from './useFilterableDropdown';
export type { FilterableDropdownOption, UseFilterableDropdownReturn } from './useFilterableDropdown';
