/**
 * useCopyPaste - Hook for copy, paste, and duplicate operations
 * Migrated from legacy topoViewer CopyPasteManager with React hooks pattern
 *
 * Consolidated from three files:
 * - useCopyPaste.ts (main hook)
 * - useClipboardListener.ts (clipboard message listener)
 * - copyHandlers.ts (handler factory functions)
 */
import { useRef, useEffect, useMemo, useCallback } from 'react';
import type { Core } from 'cytoscape';

import { log } from '../../utils/logger';
import { subscribeToWebviewMessages, type TypedMessageEvent } from '../../utils/webviewMessageBus';

import type { CopyData, GraphChangeEntry} from './copyPasteUtils';
import { collectCopyData, executeCopy, executePaste } from './copyPasteUtils';

// Types are exported from the index.ts file

/**
 * Options for the useCopyPaste hook
 */
export interface CopyPasteOptions {
  mode: 'edit' | 'view';
  isLocked: boolean;
  recordGraphChanges?: (before: GraphChangeEntry[], after: GraphChangeEntry[]) => void;
}

/**
 * Handler functions for copy/paste operations
 */
export interface CopyPasteHandlers {
  handleCopy: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
}

/**
 * Return type for the useCopyPaste hook
 */
export type CopyPasteReturn = CopyPasteHandlers;

interface CopiedElementsMessage {
  type: 'copiedElements';
  data: CopyData;
}

/**
 * Creates the copy handler
 */
function createCopyHandler(
  cy: Core | null,
  resetPasteState: () => void
): () => void {
  return () => {
    if (!cy) return;
    if (executeCopy(cy)) {
      resetPasteState();
    }
  };
}

/**
 * Creates the duplicate handler
 */
function createDuplicateHandler(
  cy: Core | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  performPaste: (copyData: CopyData) => void
): () => void {
  return () => {
    if (!cy || mode !== 'edit' || isLocked) return;
    const copyData = collectCopyData(cy);
    if (copyData) {
      performPaste(copyData);
    }
  };
}

/**
 * Hook that listens for clipboard data messages from the extension
 * and invokes the paste callback when data is received
 */
function useClipboardListener(
  cy: Core | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onPaste: ((copyData: CopyData) => void) | null
): void {
  useEffect(() => {
    const handleMessage = (event: TypedMessageEvent) => {
      const message = event.data;
      if (!message || message.type !== 'copiedElements') return;
      if (!cy || mode !== 'edit' || isLocked) return;

      const copiedMessage = message as unknown as CopiedElementsMessage;
      const copyData = copiedMessage.data;
      if (!copyData?.elements?.length) {
        log.info('[CopyPaste] No elements in clipboard');
        return;
      }

      onPaste?.(copyData);
    };

    return subscribeToWebviewMessages(handleMessage, (e) => e.data?.type === 'copiedElements');
  }, [cy, mode, isLocked, onPaste]);
}

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
  return useMemo<CopyPasteReturn>(() => ({
    handleCopy: createCopyHandler(cy, resetPasteState),
    handlePaste: () => {
      // Paste is handled by the unified clipboard system
      // This handler is kept for API compatibility
    },
    handleDuplicate: createDuplicateHandler(cy, mode, isLocked, performPaste)
  }), [cy, mode, isLocked, resetPasteState, performPaste]);
}
