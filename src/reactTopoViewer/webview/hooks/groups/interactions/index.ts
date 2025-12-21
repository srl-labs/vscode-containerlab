/**
 * Group interaction hooks for drag, resize, clipboard, and UI handling
 */

// Clipboard
export { useGroupClipboard } from '../useGroupClipboard';
export type { UseGroupClipboardOptions, UseGroupClipboardReturn } from '../useGroupClipboard';

// Node reparent
export { useNodeReparent } from '../useNodeReparent';
export type { UseNodeReparentOptions, UseNodeReparentDeps } from '../useNodeReparent';

// Layer
export { useGroupLayer } from '../useGroupLayer';

// Drag interaction
export { useGroupDragInteraction } from '../useGroupDrag';
export type { UseGroupDragInteractionOptions, UseGroupDragInteractionReturn } from '../useGroupDrag';

// Resize
export { useGroupResize } from '../useGroupResize';
export type { ResizeCorner, UseGroupResizeReturn } from '../useGroupResize';

// Item handlers
export { useGroupItemHandlers } from '../useGroupHandlers';
export type { UseGroupItemHandlersReturn } from '../useGroupHandlers';

// Position overrides
export { useDragPositionOverrides } from '../useDragPositionOverrides';
export type { UseDragPositionOverridesReturn } from '../useDragPositionOverrides';

// App-level hooks
export { useAppGroups } from '../useAppGroups';
export {
  useAppGroupUndoHandlers,
  useGroupPositionHandler,
  useGroupDragMoveHandler
} from '../useAppGroupHandlers';
export type {
  UseAppGroupUndoHandlersReturn,
  GroupPositionChangeHandler,
  GroupDragMoveHandler
} from '../useAppGroupHandlers';
