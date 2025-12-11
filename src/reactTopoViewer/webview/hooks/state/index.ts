/**
 * State management hooks
 */

export { useUndoRedo } from './useUndoRedo';
export type {
  NodePositionEntry,
  GraphChange,
  UndoRedoActionMove,
  UndoRedoActionGraph,
  UndoRedoAction,
  UseUndoRedoOptions,
  UseUndoRedoReturn
} from './useUndoRedo';

export { useGraphUndoRedoHandlers } from './useGraphUndoRedoHandlers';

export { useCustomTemplateEditor } from './useCustomTemplateEditor';
export type { CustomTemplateEditorHandlers, CustomTemplateEditorResult } from './useCustomTemplateEditor';
