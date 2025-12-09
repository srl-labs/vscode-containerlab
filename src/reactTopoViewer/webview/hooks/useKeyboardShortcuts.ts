/**
 * useKeyboardShortcuts - Hook for keyboard shortcuts
 */
import { useEffect, useCallback } from 'react';
import type { Core } from 'cytoscape';
import { log } from '../utils/logger';

interface KeyboardShortcutsOptions {
  mode: 'edit' | 'view';
  selectedNode: string | null;
  selectedEdge: string | null;
  cyInstance: Core | null;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeselectAll: () => void;
}

/**
 * Check if target is an input field
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * Handle Ctrl+A: Select all nodes
 */
function handleSelectAll(event: KeyboardEvent, cyInstance: Core | null): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'a') return false;
  if (!cyInstance) return false;

  log.info('[Keyboard] Selecting all nodes');
  cyInstance.nodes().select();
  event.preventDefault();
  return true;
}

/**
 * Handle Delete/Backspace: Delete selected element
 */
function handleDelete(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteNode: (nodeId: string) => void,
  onDeleteEdge: (edgeId: string) => void
): boolean {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  if (mode !== 'edit') return false;

  if (selectedNode) {
    log.info(`[Keyboard] Deleting node: ${selectedNode}`);
    onDeleteNode(selectedNode);
    event.preventDefault();
    return true;
  }

  if (selectedEdge) {
    log.info(`[Keyboard] Deleting edge: ${selectedEdge}`);
    onDeleteEdge(selectedEdge);
    event.preventDefault();
    return true;
  }
  return false;
}

/**
 * Handle Escape: Deselect all / close panels
 */
function handleEscape(
  event: KeyboardEvent,
  cyInstance: Core | null,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeselectAll: () => void
): boolean {
  if (event.key !== 'Escape') return false;

  if (cyInstance) {
    cyInstance.elements().unselect();
  }
  if (selectedNode || selectedEdge) {
    log.debug('[Keyboard] Deselecting all');
    onDeselectAll();
    event.preventDefault();
    return true;
  }
  return false;
}

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions): void {
  const { mode, selectedNode, selectedEdge, cyInstance, onDeleteNode, onDeleteEdge, onDeselectAll } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isInputElement(event.target)) return;

    if (handleSelectAll(event, cyInstance)) return;
    if (handleDelete(event, mode, selectedNode, selectedEdge, onDeleteNode, onDeleteEdge)) return;
    handleEscape(event, cyInstance, selectedNode, selectedEdge, onDeselectAll);
  }, [mode, selectedNode, selectedEdge, cyInstance, onDeleteNode, onDeleteEdge, onDeselectAll]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
