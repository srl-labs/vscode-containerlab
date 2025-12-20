import { useCallback, useEffect, useRef } from 'react';

import { log } from '../../utils/logger';

export interface UseDebouncedSaveReturn<T> {
  saveDebounced: (items: T[]) => void;
  saveImmediate: (items: T[]) => void;
}

export function useDebouncedSave<T>(
  save: (items: T[]) => Promise<void>,
  logPrefix: string,
  debounceMs: number
): UseDebouncedSaveReturn<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const saveDebounced = useCallback((items: T[]) => {
    clear();
    timeoutRef.current = setTimeout(() => {
      save(items).catch((err) => {
        log.error(`[${logPrefix}] Failed to save annotations: ${err}`);
      });
      log.info(`[${logPrefix}] Saved ${items.length} annotations`);
    }, debounceMs);
  }, [clear, debounceMs, logPrefix, save]);

  const saveImmediate = useCallback((items: T[]) => {
    clear();
    save(items).catch((err) => {
      log.error(`[${logPrefix}] Failed to save annotations: ${err}`);
    });
    log.info(`[${logPrefix}] Saved ${items.length} annotations (immediate)`);
  }, [clear, logPrefix, save]);

  useEffect(() => clear, [clear]);

  return { saveDebounced, saveImmediate };
}

