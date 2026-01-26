/**
 * State management hooks
 */

export { useUndoRedo } from "./useUndoRedo";
export type {
  NodeSnapshot,
  EdgeSnapshot,
  SnapshotEntry,
  SnapshotMeta,
  UndoRedoSnapshot,
  SnapshotCapture,
  CaptureSnapshotOptions,
  UseUndoRedoOptions,
  UseUndoRedoReturn
} from "./useUndoRedo";

export { useGraphHandlersWithContext } from "./useGraphUndoRedoHandlers";

export { useCustomTemplateEditor } from "./useCustomTemplateEditor";
export type {
  CustomTemplateEditorHandlers,
  CustomTemplateEditorResult
} from "./useCustomTemplateEditor";
