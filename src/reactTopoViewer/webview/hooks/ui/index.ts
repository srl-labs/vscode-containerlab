/**
 * UI interaction hooks
 */

export { useContextMenu } from './useContextMenu';
export type { ContextMenuOptions, ContextMenuState, UseContextMenuReturn } from './useContextMenu';

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
export type { PendingMembershipChange } from './useAppHandlers';

export { useClickOutside } from './useClickOutside';

export { useDropdownKeyboard } from './useDropdownKeyboard';
export type { DropdownKeyboardActions, DropdownKeyboardState } from './useDropdownKeyboard';

export { useFilterableDropdown } from './useFilterableDropdown';
export type { FilterableDropdownOption, UseFilterableDropdownReturn } from './useFilterableDropdown';

// Panel drag hooks (consolidated)
export {
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  buildLockButtonClass,
  loadInitialPosition,
  savePanelState,
  PANEL_STORAGE_KEY
} from './usePanelDrag';
export type { Position, UsePanelDragOptions, UsePanelDragReturn } from './usePanelDrag';

// Dropdown state hooks
export { useDropdownState, useFloatingDropdownKeyboard, useFocusOnOpen } from './useDropdownState';

// Simple dropdown hook
export { useDropdown } from './useDropdown';
export type { UseDropdownReturn } from './useDropdown';

// Escape key hook
export { useEscapeKey } from './useEscapeKey';

// Delayed hover hook
export { useDelayedHover } from './useDelayedHover';
export type { UseDelayedHoverReturn } from './useDelayedHover';

// Easter egg hooks
export { useEasterEgg } from './useEasterEgg';
export type { EasterEggMode, EasterEggState, UseEasterEggOptions, UseEasterEggReturn } from './useEasterEgg';

export { useNightcallAudio } from './useNightcallAudio';
export type { UseNightcallAudioReturn } from './useNightcallAudio';

export { useStickerbushAudio } from './useStickerbushAudio';
export type { UseStickerbushAudioReturn } from './useStickerbushAudio';

export { useAquaticAmbienceAudio } from './useAquaticAmbienceAudio';
export type { UseAquaticAmbienceAudioReturn } from './useAquaticAmbienceAudio';

export { useVaporwaveAudio } from './useVaporwaveAudio';
export type { UseVaporwaveAudioReturn } from './useVaporwaveAudio';
