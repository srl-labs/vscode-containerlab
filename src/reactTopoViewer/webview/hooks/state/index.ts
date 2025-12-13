/**
 * State management hooks
 *
 * [MIGRATION] Migrate to @xyflow/react - deleted Cytoscape-specific hooks:
 * - useGraphUndoRedoHandlers
 */

export { useUndoRedo } from './useUndoRedo';
export type {
  NodePositionEntry,
  GraphChange,
  UndoRedoActionMove,
  UndoRedoActionGraph,
  UndoRedoActionAnnotation,
  UndoRedoAction,
  UseUndoRedoOptions,
  UseUndoRedoReturn
} from './useUndoRedo';

export { useCustomTemplateEditor } from './useCustomTemplateEditor';
export type { CustomTemplateEditorHandlers, CustomTemplateEditorResult } from './useCustomTemplateEditor';
