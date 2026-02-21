/**
 * useUndoRedoControls - app-level undo/redo bindings.
 */
import React from "react";

import { executeTopologyCommand } from "../../services";

export interface UndoRedoControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedoControls(canUndo: boolean, canRedo: boolean): UndoRedoControls {
  const undo = React.useCallback(() => {
    void executeTopologyCommand({ command: "undo" });
  }, []);

  const redo = React.useCallback(() => {
    void executeTopologyCommand({ command: "redo" });
  }, []);

  return React.useMemo(
    () => ({
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [undo, redo, canUndo, canRedo]
  );
}
