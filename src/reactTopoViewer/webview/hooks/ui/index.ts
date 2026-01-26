/**
 * UI hooks barrel - exports all UI-related hooks
 * Consolidated from: commands/, panels/, interactions/ sub-directories
 */

// ============================================================================
// Commands
// ============================================================================
export {
  useDeploymentCommands,
  useEditorPanelCommands,
  useFloatingPanelCommands,
  usePanelVisibility
} from "./usePanelCommands";
export type {
  DeploymentCommands,
  EditorPanelCommands,
  FloatingPanelCommands,
  PanelVisibility
} from "./usePanelCommands";

// ============================================================================
// Panel Visibility & Drag
// ============================================================================
export {
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  buildLockButtonClass,
  savePanelState,
  PANEL_STORAGE_KEY
} from "./usePanelDrag";
export type { Position, UsePanelDragOptions, UsePanelDragReturn } from "./usePanelDrag";

// ============================================================================
// Keyboard & Shortcuts
// ============================================================================
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useShortcutDisplay } from "./useShortcutDisplay";

// ============================================================================
// App Handlers
// ============================================================================
export { useAppHandlers } from "./useAppHandlers";

// ============================================================================
// Click, Escape, Hover
// ============================================================================
export { useClickOutside, useEscapeKey, useDelayedHover } from "./useDomInteractions";
export type { UseDelayedHoverReturn } from "./useDomInteractions";

// ============================================================================
// Dropdown Hooks
// ============================================================================
export {
  useDropdown,
  useDropdownState,
  useDropdownKeyboard,
  useFloatingDropdownKeyboard,
  useFocusOnOpen
} from "./useDropdown";
export type {
  UseDropdownReturn,
  DropdownKeyboardActions,
  DropdownKeyboardState
} from "./useDropdown";
export { useFilterableDropdown } from "./useFilterableDropdown";
export type {
  FilterableDropdownOption,
  UseFilterableDropdownReturn
} from "./useFilterableDropdown";

// ============================================================================
// App State (Layout & Context Menu)
// ============================================================================
export {
  useLayoutControls,
  useContextMenuHandlers,
  snapToGrid,
  DEFAULT_GRID_LINE_WIDTH
} from "./useAppState";
export type { CanvasRef, LayoutOption, NodeData, LinkData } from "./useAppState";
