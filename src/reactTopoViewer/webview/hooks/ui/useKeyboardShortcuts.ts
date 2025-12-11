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
  /** Selected annotation IDs */
  selectedAnnotationIds?: Set<string>;
  /** Copy annotations handler */
  onCopyAnnotations?: () => void;
  /** Paste annotations handler */
  onPasteAnnotations?: () => void;
  /** Cut annotations handler */
  onCutAnnotations?: () => void;
  /** Duplicate annotations handler */
  onDuplicateAnnotations?: () => void;
  /** Delete selected annotations handler */
  onDeleteAnnotations?: () => void;
  /** Clear annotation selection */
  onClearAnnotationSelection?: () => void;
  /** Check if annotation clipboard has content */
  hasAnnotationClipboard?: () => boolean;
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
 * Handle Ctrl+C: Copy (nodes/edges and/or annotations)
 */
function handleCopy(
  event: KeyboardEvent,
  cyInstance: Core | null,
  onCopy?: () => void,
  selectedAnnotationIds?: Set<string>,
  onCopyAnnotations?: () => void
): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'c') return false;

  let handled = false;

  // Copy annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onCopyAnnotations) {
    log.info('[Keyboard] Copy annotations');
    onCopyAnnotations();
    handled = true;
  }

  // Also copy graph elements if any are selected
  if (onCopy && cyInstance && !cyInstance.$(':selected').empty()) {
    log.info('[Keyboard] Copy graph elements');
    onCopy();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+V: Paste (nodes/edges and/or annotations)
 */
function handlePaste(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  onPaste?: () => void,
  onPasteAnnotations?: () => void,
  hasAnnotationClipboard?: () => boolean,
  hasGraphClipboard?: () => boolean
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'v') return false;

  let handled = false;

  // Paste annotations if clipboard has any
  if (onPasteAnnotations && hasAnnotationClipboard && hasAnnotationClipboard()) {
    log.info('[Keyboard] Paste annotations');
    onPasteAnnotations();
    handled = true;
  }

  // Also paste graph elements if clipboard has any
  if (onPaste && (!hasGraphClipboard || hasGraphClipboard())) {
    log.info('[Keyboard] Paste graph elements');
    onPaste();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+X: Cut (nodes/edges and/or annotations)
 */
function handleCut(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  cyInstance: Core | null,
  onCut?: () => void,
  selectedAnnotationIds?: Set<string>,
  onCutAnnotations?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'x') return false;

  let handled = false;

  // Cut annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onCutAnnotations) {
    log.info('[Keyboard] Cut annotations');
    onCutAnnotations();
    handled = true;
  }

  // Also cut graph elements if any are selected
  if (onCut && cyInstance && !cyInstance.$(':selected').empty()) {
    log.info('[Keyboard] Cut graph elements');
    onCut();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Ctrl+D: Duplicate (nodes/edges and/or annotations)
 */
function handleDuplicate(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  cyInstance: Core | null,
  onDuplicate?: () => void,
  selectedAnnotationIds?: Set<string>,
  onDuplicateAnnotations?: () => void
): boolean {
  if (mode !== 'edit') return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.key !== 'd') return false;

  let handled = false;

  // Duplicate annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onDuplicateAnnotations) {
    log.info('[Keyboard] Duplicate annotations');
    onDuplicateAnnotations();
    handled = true;
  }

  // Also duplicate graph elements if any are selected
  if (onDuplicate && cyInstance && !cyInstance.$(':selected').empty()) {
    log.info('[Keyboard] Duplicate graph elements');
    onDuplicate();
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
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
 * Handle Delete/Backspace: Delete selected element (nodes/edges and/or annotations)
 */
function handleDelete(
  event: KeyboardEvent,
  mode: 'edit' | 'view',
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeleteNode: (nodeId: string) => void,
  onDeleteEdge: (edgeId: string) => void,
  selectedAnnotationIds?: Set<string>,
  onDeleteAnnotations?: () => void
): boolean {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
  if (mode !== 'edit') return false;

  let handled = false;

  // Delete annotations if any are selected
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onDeleteAnnotations) {
    log.info(`[Keyboard] Deleting ${selectedAnnotationIds.size} annotations`);
    onDeleteAnnotations();
    handled = true;
  }

  // Also delete selected node
  if (selectedNode) {
    log.info(`[Keyboard] Deleting node: ${selectedNode}`);
    onDeleteNode(selectedNode);
    handled = true;
  }

  // Also delete selected edge
  if (selectedEdge) {
    log.info(`[Keyboard] Deleting edge: ${selectedEdge}`);
    onDeleteEdge(selectedEdge);
    handled = true;
  }

  if (handled) {
    event.preventDefault();
  }
  return handled;
}

/**
 * Handle Escape: Deselect all / close panels
 */
function handleEscape(
  event: KeyboardEvent,
  cyInstance: Core | null,
  selectedNode: string | null,
  selectedEdge: string | null,
  onDeselectAll: () => void,
  selectedAnnotationIds?: Set<string>,
  onClearAnnotationSelection?: () => void
): boolean {
  if (event.key !== 'Escape') return false;

  // Clear annotation selection
  if (selectedAnnotationIds && selectedAnnotationIds.size > 0 && onClearAnnotationSelection) {
    log.debug('[Keyboard] Clearing annotation selection');
    onClearAnnotationSelection();
    event.preventDefault();
    return true;
  }

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
    onDuplicate,
    selectedAnnotationIds,
    onCopyAnnotations,
    onPasteAnnotations,
    onCutAnnotations,
    onDuplicateAnnotations,
    onDeleteAnnotations,
    onClearAnnotationSelection,
    hasAnnotationClipboard
  } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isInputElement(event.target)) return;

    // Undo/Redo must be checked before other shortcuts
    if (handleUndo(event, mode, canUndo, onUndo)) return;
    if (handleRedo(event, mode, canRedo, onRedo)) return;
    // Copy/Paste/Cut/Duplicate (with annotation support)
    if (handleCopy(event, cyInstance, onCopy, selectedAnnotationIds, onCopyAnnotations)) return;
    if (handlePaste(event, mode, onPaste, onPasteAnnotations, hasAnnotationClipboard)) return;
    if (handleCut(event, mode, cyInstance, onCut, selectedAnnotationIds, onCutAnnotations)) return;
    if (handleDuplicate(event, mode, cyInstance, onDuplicate, selectedAnnotationIds, onDuplicateAnnotations)) return;
    // Other shortcuts
    if (handleSelectAll(event, cyInstance)) return;
    if (handleDelete(event, mode, selectedNode, selectedEdge, onDeleteNode, onDeleteEdge, selectedAnnotationIds, onDeleteAnnotations)) return;
    handleEscape(event, cyInstance, selectedNode, selectedEdge, onDeselectAll, selectedAnnotationIds, onClearAnnotationSelection);
  }, [
    mode, selectedNode, selectedEdge, cyInstance, onDeleteNode, onDeleteEdge, onDeselectAll,
    onUndo, onRedo, canUndo, canRedo, onCopy, onPaste, onCut, onDuplicate,
    selectedAnnotationIds, onCopyAnnotations, onPasteAnnotations, onCutAnnotations,
    onDuplicateAnnotations, onDeleteAnnotations, onClearAnnotationSelection, hasAnnotationClipboard
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
