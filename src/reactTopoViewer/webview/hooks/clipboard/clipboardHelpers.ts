/**
 * Shared utilities for clipboard operations.
 */

import { useCallback } from 'react';
import type { RefObject } from 'react';

import { log } from '../../utils/logger';

/**
 * Creates a hasClipboardData callback for clipboard hooks.
 * @param clipboardRef - Reference to the clipboard data
 * @returns Callback that checks if clipboard has data
 */
export function createHasClipboardData<T>(clipboardRef: RefObject<T | null>) {
  return useCallback((): boolean => {
    return clipboardRef.current !== null;
  }, [clipboardRef]);
}

/**
 * Creates a clearClipboard callback for clipboard hooks.
 * @param clipboardRef - Reference to the clipboard data
 * @param pasteCounterRef - Reference to the paste counter
 * @param logPrefix - Prefix for log messages (e.g., 'UnifiedClipboard', 'GroupClipboard')
 * @returns Callback that clears clipboard data
 */
export function createClearClipboard<T>(
  clipboardRef: RefObject<T | null>,
  pasteCounterRef: RefObject<number>,
  logPrefix: string
) {
  return useCallback((): void => {
    clipboardRef.current = null;
    pasteCounterRef.current = 0;
    log.info(`[${logPrefix}] Clipboard cleared`);
  }, [clipboardRef, pasteCounterRef, logPrefix]);
}
