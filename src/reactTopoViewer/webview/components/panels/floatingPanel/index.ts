/**
 * FloatingPanel module exports
 */
export { FloatingActionPanel } from './FloatingActionPanel';
export type { FloatingActionPanelHandle } from './FloatingActionPanel';
// Re-export panel position hooks from hooks/ui for backwards compatibility
export {
  useFloatingPanelDrag,
  useDrawerSide,
  useShakeAnimation,
  savePanelState,
  buildLockButtonClass,
  type Position
} from '../../../hooks/ui';
export { PanelButton, DrawerButton, DeployButtonGroup } from './DeployControls';
export { PanelButtonWithDropdown, useDropdownState, filterDropdownItems, buildMenuClass, buildItemClass, DropdownItem } from './DropdownMenu';
export type { DropdownMenuItem } from './DropdownMenu';
