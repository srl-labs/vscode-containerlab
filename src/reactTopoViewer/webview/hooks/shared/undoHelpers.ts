/**
 * Shared helpers for undo/redo operations across different annotation types.
 */
import type React from 'react';

import type { UndoRedoAction } from '../state/useUndoRedo';

/**
 * Common interface for undo/redo API
 */
export interface UndoRedoApi {
  pushAction: (action: UndoRedoAction) => void;
}

/**
 * Execute an update operation with undo recording.
 * Handles the common pattern of: clone -> transform -> push undo -> apply
 *
 * @param id - Item ID to update
 * @param items - Array of items to search
 * @param cloneFn - Function to clone an item (with deep copy of position etc.)
 * @param transformFn - Function to create the "after" state from before and new value
 * @param pushUndoFn - Function to push the undo action
 * @param applyFn - Function to apply the actual change
 */
export function updateWithUndo<T extends { id: string }, V>(
  id: string,
  items: T[],
  cloneFn: (item: T | undefined) => T | null,
  transformFn: (before: T, value: V) => T,
  pushUndoFn: (before: T, after: T) => void,
  applyFn: (id: string, value: V) => void,
  value: V
): void {
  const beforeCopy = cloneFn(items.find(item => item.id === id));
  if (beforeCopy) {
    const after = transformFn(beforeCopy, value);
    pushUndoFn(beforeCopy, after);
  }
  applyFn(id, value);
}

/**
 * Create a push undo function that checks isApplying ref
 */
export function createPushUndoFn<T>(
  undoRedo: UndoRedoApi,
  getUndoRedoAction: (before: T | null, after: T | null) => UndoRedoAction,
  isApplyingRef: React.RefObject<boolean>
): (before: T, after: T) => void {
  return (before: T, after: T): void => {
    if (isApplyingRef.current) return;
    undoRedo.pushAction(getUndoRedoAction(before, after));
  };
}
