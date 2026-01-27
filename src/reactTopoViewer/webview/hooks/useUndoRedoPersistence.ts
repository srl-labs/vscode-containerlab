/**
 * useUndoRedoPersistence - Hook to set up undo/redo persistence
 *
 * Connects the undoRedoStore to the persistence layer (snapshotPersistence).
 * Also manages the enabled state based on mode changes.
 */
import { useEffect } from "react";

import { persistSnapshotChange } from "./state/snapshotPersistence";
import { useGraphStore } from "../stores/graphStore";
import { useTopoViewerStore } from "../stores/topoViewerStore";
import {
  useUndoRedoStore,
  setPersistSnapshotCallback,
  type UndoRedoSnapshot
} from "../stores/undoRedoStore";

/**
 * Hook to set up undo/redo persistence and mode synchronization.
 * Should be called once at the app root.
 */
export function useUndoRedoPersistence(): void {
  const mode = useTopoViewerStore((state) => state.mode);

  // Enable/disable undo/redo based on mode
  useEffect(() => {
    const { setEnabled } = useUndoRedoStore.getState();
    setEnabled(mode === "edit");
  }, [mode]);

  // Set up persistence callback
  useEffect(() => {
    const persistCallback = (snapshot: UndoRedoSnapshot, direction: "undo" | "redo") => {
      // Get current nodes for annotation persistence
      const { nodes } = useGraphStore.getState();
      persistSnapshotChange(snapshot, direction, { getNodes: () => nodes });
    };

    setPersistSnapshotCallback(persistCallback);

    return () => {
      setPersistSnapshotCallback(null);
    };
  }, []);
}
