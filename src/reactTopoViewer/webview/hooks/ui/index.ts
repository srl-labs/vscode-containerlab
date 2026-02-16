// UI hooks barrel.

// Commands
export { useDeploymentCommands, usePanelVisibility } from "./usePanelCommands";
export type { DeploymentCommands, PanelVisibility } from "./usePanelCommands";

// Context Panel Content
export { useContextPanelContent } from "./useContextPanelContent";
export type { PanelView, PanelViewKind } from "./useContextPanelContent";

// Panel Tab Visibility
export { usePanelTabVisibility } from "./usePanelTabVisibility";
export type { PanelTabVisibility } from "./usePanelTabVisibility";

// Footer Refs
export { useFooterControlsRef } from "./useFooterControlsRef";
export type { FooterControlsRef } from "./useFooterControlsRef";

// Editor Button Handlers
export { useApplySaveHandlers } from "./useApplySaveHandlers";

// Shake Animation
export { useShakeAnimation } from "./useShakeAnimation";

// Keyboard & Shortcuts
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useShortcutDisplay } from "./useShortcutDisplay";

// App Handlers
export { useAppHandlers } from "./useAppHandlers";

// Click, Escape, Hover
export { useClickOutside, useEscapeKey, useDelayedHover } from "./useDomInteractions";
export type { UseDelayedHoverReturn } from "./useDomInteractions";

// Dropdown Hooks
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

// App State
export {
  useLayoutControls,
  useContextMenuHandlers,
  snapToGrid,
  DEFAULT_GRID_LINE_WIDTH,
  DEFAULT_GRID_STYLE
} from "./useAppState";
export type { CanvasRef, LayoutOption, GridStyle, NodeData, LinkData } from "./useAppState";
