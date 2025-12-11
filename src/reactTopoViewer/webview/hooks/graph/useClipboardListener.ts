/**
 * useClipboardListener - Hook for listening to clipboard messages from extension
 * Split from useCopyPaste to reduce aggregate complexity
 */
import { useEffect } from 'react';
import type { Core } from 'cytoscape';
import { log } from '../../utils/logger';
import type { CopyData } from './copyPasteUtils';

/**
 * Hook that listens for clipboard data messages from the extension
 * and invokes the paste callback when data is received
 */
export function useClipboardListener(
  cy: Core | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  onPaste: ((copyData: CopyData) => void) | null
): void {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.type !== 'copiedElements') return;
      if (!cy || mode !== 'edit' || isLocked) return;

      const copyData = message.data as CopyData;
      if (!copyData?.elements?.length) {
        log.info('[CopyPaste] No elements in clipboard');
        return;
      }

      onPaste?.(copyData);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cy, mode, isLocked, onPaste]);
}
