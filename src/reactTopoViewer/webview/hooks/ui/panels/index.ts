/**
 * Panel-related UI hooks
 */

// Panel visibility
export { usePanelVisibility } from '../usePanelVisibility';
export type { PanelVisibility } from '../usePanelVisibility';

// Panel drag and utilities
export {
  usePanelDrag,
  useDrawerSide,
  useShakeAnimation,
  buildLockButtonClass,
  savePanelState,
  PANEL_STORAGE_KEY
} from '../usePanelDrag';
export type { Position, UsePanelDragOptions, UsePanelDragReturn } from '../usePanelDrag';
