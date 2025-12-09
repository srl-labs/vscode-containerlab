/**
 * useKeyboardShortcuts - Hook for keyboard shortcuts
 */
import { useEffect, useCallback } from 'react';
import { log } from '../utils/logger';

interface KeyboardShortcutsOptions {
  mode: 'edit' | 'view';
  selectedNode: string | null;
  selectedEdge: string | null;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeselectAll: () => void;
}

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const { mode, selectedNode, selectedEdge, onDeleteNode, onDeleteEdge, onDeselectAll } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Only handle shortcuts when in edit mode and not in an input field
    const target = event.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (isInputField) return;

    // Delete/Backspace: Delete selected element
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (mode !== 'edit') return;

      if (selectedNode) {
        log.info(`[Keyboard] Deleting node: ${selectedNode}`);
        onDeleteNode(selectedNode);
        event.preventDefault();
        return;
      }

      if (selectedEdge) {
        log.info(`[Keyboard] Deleting edge: ${selectedEdge}`);
        onDeleteEdge(selectedEdge);
        event.preventDefault();
        return;
      }
    }

    // Escape: Deselect all / close panels
    if (event.key === 'Escape') {
      if (selectedNode || selectedEdge) {
        log.debug('[Keyboard] Deselecting all');
        onDeselectAll();
        event.preventDefault();
        return;
      }
    }
  }, [mode, selectedNode, selectedEdge, onDeleteNode, onDeleteEdge, onDeselectAll]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
