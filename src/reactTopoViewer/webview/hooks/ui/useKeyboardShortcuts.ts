/**
 * useKeyboardShortcuts - Hook for keyboard shortcuts
 */
import { useEffect, useCallback } from 'react';
import type { Core } from 'cytoscape';
import { log } from '../../utils/logger';

interface KeyboardShortcutsOptions {
  mode: 'edit' | 'view';
  selectedNode: string | null;
  selectedEdge: string | null;
  cyInstance: Core | null;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeselectAll: () => void;
  /** Undo handler (Ctrl+Z) */
  onUndo?: () => void;
  /** Redo handler (Ctrl+Y / Ctrl+Shift+Z) */
  onRedo?: () => void;
  /** Whether undo is available */
  canUndo?: boolean;
  /** Whether redo is available */
  canRedo?: boolean;
  /** Copy handler (Ctrl+C) */
  onCopy?: () => void;
  /** Paste handler (Ctrl+V) */
  onPaste?: () => void;
  /** Cut handler (Ctrl+X) */
  onCut?: () => void;
  /** Duplicate handler (Ctrl+D) */
  onDuplicate?: () => void;
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
 * Handle Ctrl+Z: Undo
 */
function handleUndo(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  canUndo: boolean,
  onUndo?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'z' || event.shiftKey) return false;
  if (!canUndo || !onUndo) return false;

  log.info('[Keyboard] Undo');
  onUndo();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+Y or Ctrl+Shift+Z: Redo
 */
function handleRedo(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  canRedo: boolean,
  onRedo?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (!canRedo || !onRedo) return false;

  // Ctrl+Y or Ctrl+Shift+Z
  const isCtrlY = event.key === 'y';
  const isCtrlShiftZ = event.key === 'z' && event.shiftKey;
  if (!isCtrlY && !isCtrlShiftZ) return false;

  log.info('[Keyboard] Redo');
  onRedo();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+C: Copy
 */
function handleCopy(
  event: KeyboardEvent,
  cyInstance: Core | null,
  onCopy?: () => void
): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'c') return false;
  if (!onCopy) return false;

  // Only copy if there's a selection
  if (!cyInstance || cyInstance.$(':selected').empty()) return false;

  log.info('[Keyboard] Copy');
  onCopy();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+V: Paste
 */
function handlePaste(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  onPaste?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'v') return false;
  if (!onPaste) return false;

  log.info('[Keyboard] Paste');
  onPaste();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+X: Cut
 */
function handleCut(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  cyInstance: Core | null,
  onCut?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'x') return false;
  if (!onCut) return false;

  // Only cut if there's a selection
  if (!cyInstance || cyInstance.$(':selected').empty()) return false;

  log.info('[Keyboard] Cut');
  onCut();
  event.preventDefault();
  return true;
}

/**
 * Handle Ctrl+D: Duplicate
 */
function handleDuplicate(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  cyInstance: Core | null,
  onDuplicate?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'd') return false;
  if (!onDuplicate) return false;

  // Only duplicate if there's a selection
  if (!cyInstance || cyInstance.$(':selected').empty()) return false;

  log.info('[Keyboard] Duplicate');
  onDuplicate();
  event.preventDefault();
  return true;
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
  const {
    mode,
    selectedNode,
    selectedEdge,
    cyInstance,
    onDeleteNode,
    onDeleteEdge,
    onDeselectAll,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    onCopy,
    onPaste,
    onCut,
    onDuplicate
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isInputElement(event.target)) return;

    // Undo/Redo must be checked before other shortcuts
    if (handleUndo(event, mode, canUndo, onUndo)) return;
    if (handleRedo(event, mode, canRedo, onRedo)) return;
    // Copy/Paste/Cut/Duplicate
    if (handleCopy(event, cyInstance, onCopy)) return;
    if (handlePaste(event, mode, onPaste)) return;
    if (handleCut(event, mode, cyInstance, onCut)) return;
    if (handleDuplicate(event, mode, cyInstance, onDuplicate)) return;
    // Other shortcuts
    if (handleSelectAll(event, cyInstance)) return;
    if (handleDelete(event, mode, selectedNode, selectedEdge, onDeleteNode, onDeleteEdge)) return;
    handleEscape(event, cyInstance, selectedNode, selectedEdge, onDeselectAll);
  }, [mode, selectedNode, selectedEdge, cyInstance, onDeleteNode, onDeleteEdge, onDeselectAll, onUndo, onRedo, canUndo, canRedo, onCopy, onPaste, onCut, onDuplicate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
