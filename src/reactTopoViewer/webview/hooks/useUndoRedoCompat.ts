/**
 * useUndoRedoCompat - Compatibility hook bridging old UndoRedoContext API to Zustand stores
 *
 * This hook provides the same interface as the old useUndoRedoContext/useUndoRedoActions
 * hooks but is backed by the undoRedoStore.
 */
import { useMemo } from "react";

import {
  useUndoRedoStore,
  type UndoRedoSnapshot,
  type SnapshotCapture,
  type CaptureSnapshotOptions,
  type CommitChangeOptions
} from "../stores/undoRedoStore";

// ============================================================================
// Types (matching old UndoRedoContext types)
// ============================================================================

export interface UseUndoRedoReturn {
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
}

interface UndoRedoContextValue {
  undoRedo: UseUndoRedoReturn;
}

// ============================================================================
// Compatibility Hooks
// ============================================================================

/**
 * Hook to access undo/redo context
 * Compatible with old useUndoRedoContext() API
 */
export function useUndoRedoContext(): UndoRedoContextValue {
  const enabled = useUndoRedoStore((s) => s.enabled);
  const pastLength = useUndoRedoStore((s) => s.past.length);
  const futureLength = useUndoRedoStore((s) => s.future.length);
  const store = useUndoRedoStore.getState();

  const undoRedo = useMemo<UseUndoRedoReturn>(
    () => ({
      canUndo: enabled && pastLength > 0,
      canRedo: enabled && futureLength > 0,
      undoCount: pastLength,
      redoCount: futureLength,
      undo: store.undo,
      redo: store.redo,
      clearHistory: store.clearHistory,
      captureSnapshot: store.captureSnapshot,
      commitChange: store.commitChange,
      beginBatch: store.beginBatch,
      endBatch: store.endBatch,
      isInBatch: store.isInBatch
    }),
    [enabled, pastLength, futureLength, store]
  );

  return useMemo(() => ({ undoRedo }), [undoRedo]);
}

/**
 * Hook to just get the undoRedo object (convenience)
 * Compatible with old useUndoRedoActions() API
 */
export function useUndoRedoActions(): UseUndoRedoReturn {
  return useUndoRedoContext().undoRedo;
}

// Re-export types for compatibility
export type { UndoRedoSnapshot, SnapshotCapture, CaptureSnapshotOptions, CommitChangeOptions };
