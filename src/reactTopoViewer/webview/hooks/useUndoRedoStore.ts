/**
 * useUndoRedoStore - Convenience hook for undo/redo store state + actions.
 *
 * Provides the same ergonomic surface previously exposed by compat hooks,
 * but backed directly by the Zustand undoRedoStore. Prefer useUndoRedoActions
 * when you only need mutation methods.
 */
import { useMemo } from "react";

import {
  useCanUndo,
  useCanRedo,
  useUndoCount,
  useRedoCount,
  useUndoRedoActions,
  type SnapshotCapture,
  type CaptureSnapshotOptions,
  type CommitChangeOptions
} from "../stores/undoRedoStore";

export interface UseUndoRedoStoreReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  captureSnapshot: (options?: CaptureSnapshotOptions) => SnapshotCapture;
  commitChange: (
    before: SnapshotCapture,
    description: string,
    options?: CommitChangeOptions
  ) => void;
  beginBatch: () => void;
  endBatch: () => void;
  isInBatch: () => boolean;
  setEnabled: (enabled: boolean) => void;
}

export function useUndoRedoStore(): UseUndoRedoStoreReturn {
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const undoCount = useUndoCount();
  const redoCount = useRedoCount();
  const actions = useUndoRedoActions();

  return useMemo(
    () => ({
      canUndo,
      canRedo,
      undoCount,
      redoCount,
      undo: actions.undo,
      redo: actions.redo,
      clearHistory: actions.clearHistory,
      captureSnapshot: actions.captureSnapshot,
      commitChange: actions.commitChange,
      beginBatch: actions.beginBatch,
      endBatch: actions.endBatch,
      isInBatch: actions.isInBatch,
      setEnabled: actions.setEnabled
    }),
    [actions, canUndo, canRedo, undoCount, redoCount]
  );
}
