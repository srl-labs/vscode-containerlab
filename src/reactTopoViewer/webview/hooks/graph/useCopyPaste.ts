/**
 * useCopyPaste - Hook for copy, paste, cut, and duplicate operations
 * Migrated from legacy topoViewer CopyPasteManager with React hooks pattern
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import type { Core } from 'cytoscape';
import { CopyData, GraphChangeEntry, executePaste } from './copyPasteUtils';
import { useClipboardListener } from './useClipboardListener';
import {
  CopyPasteHandlers,
  createCopyHandler,
  createPasteHandler,
  createCutHandler,
  createDuplicateHandler
} from './copyHandlers';

// Re-export types for consumers
export type { CopyData, GraphChangeEntry };
export type { CyElementJson } from './copyPasteUtils';

/**
 * Options for the useCopyPaste hook
 */
export interface CopyPasteOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void;
}

/**
 * Return type for the useCopyPaste hook
 */
export type CopyPasteReturn = CopyPasteHandlers;

/**
 * Hook for copy, paste, cut, and duplicate operations
 */
export function useCopyPaste(
  cy: Core | null,
  options: CopyPasteOptions
): CopyPasteReturn {
  const { mode, isLocked, recordGraphChanges } = options;

  const pasteCounterRef = useRef(0);
  const lastPasteCenterRef = useRef<{ x: number; y: number } | null>(null);

  const resetPasteState = useCallback(() => {
    pasteCounterRef.current = 0;
    lastPasteCenterRef.current = null;
  }, []);

  const performPaste = useCallback((copyData: CopyData) => {
    if (!cy) return;
    const result = executePaste(
      cy,
      copyData,
      pasteCounterRef.current,
      lastPasteCenterRef.current,
      recordGraphChanges
    );
    if (result.newCenter) {
      lastPasteCenterRef.current = result.newCenter;
    }
    pasteCounterRef.current++;
  }, [cy, recordGraphChanges]);

  // Store performPaste in ref for clipboard listener
  const performPasteRef = useRef(performPaste);
  useEffect(() => {
    performPasteRef.current = performPaste;
  }, [performPaste]);

  // Stable callback for clipboard listener
  const onClipboardPaste = useCallback((copyData: CopyData) => {
    performPasteRef.current(copyData);
  }, []);

  // Listen for clipboard data from extension
  useClipboardListener(cy, mode, isLocked, onClipboardPaste);

  // Create handlers using individual factories
  const handlers = useMemo<CopyPasteReturn>(() => ({
    handleCopy: createCopyHandler(cy, resetPasteState),
    handlePaste: createPasteHandler(cy, mode, isLocked),
    handleCut: createCutHandler(cy, mode, isLocked, recordGraphChanges, resetPasteState),
    handleDuplicate: createDuplicateHandler(cy, mode, isLocked, performPaste)
  }), [cy, mode, isLocked, recordGraphChanges, resetPasteState, performPaste]);

  return handlers;
}
