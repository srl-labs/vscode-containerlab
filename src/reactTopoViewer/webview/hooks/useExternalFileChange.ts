/**
 * useExternalFileChange - Hook to handle external file modifications
 *
 * When the YAML file is modified externally (e.g., user edits in text editor),
 * this hook clears the undo/redo history and shows a notification.
 */
import { useEffect } from "react";

import { subscribeToWebviewMessages } from "../utils/webviewMessageBus";
import { MSG_EXTERNAL_FILE_CHANGE } from "../../shared/messages/webview";

import type { UseUndoRedoReturn } from "./state/useUndoRedo";

interface UseExternalFileChangeOptions {
  undoRedo: UseUndoRedoReturn;
  addToast: (message: string, type?: "info" | "success" | "warning" | "error") => void;
  enabled?: boolean;
}

/**
 * Listens for external file change messages and clears undo history
 */
export function useExternalFileChange({
  undoRedo,
  addToast,
  enabled = true
}: UseExternalFileChangeOptions): void {
  useEffect(() => {
    if (!enabled) return;

    return subscribeToWebviewMessages(
      (event) => {
        const message = event.data;
        if (message?.type === MSG_EXTERNAL_FILE_CHANGE) {
          // Only clear and notify if there was history to clear
          if (undoRedo.undoCount > 0 || undoRedo.redoCount > 0) {
            undoRedo.clearHistory();
            addToast("File modified externally. Undo history cleared.", "info");
          }
        }
      },
      (event) => event.data?.type === MSG_EXTERNAL_FILE_CHANGE
    );
  }, [undoRedo, addToast, enabled]);
}
