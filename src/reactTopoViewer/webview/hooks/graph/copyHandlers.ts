/**
 * copyHandlers - Individual handler functions for copy/paste operations
 * Split from createCopyPasteHandlers to reduce aggregate complexity
 */
import type { Core } from 'cytoscape';
import {
  CopyData,
  collectCopyData,
  executeCopy
} from './copyPasteUtils';

/**
 * Handler functions for copy/paste operations
 */
export interface CopyPasteHandlers {
  handleCopy: () => void;
  handlePaste: () => void;
  handleDuplicate: () => void;
}

/**
 * Creates the copy handler
 */
export function createCopyHandler(
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
 * Creates the paste handler
 * Note: Paste is now handled by the unified clipboard system (useUnifiedClipboard)
 */
export function createPasteHandler(
  _cy: Core | null,
  _mode: 'edit' | 'view',
  _isLocked: boolean
): () => void {
  return () => {
    // Paste is handled by the unified clipboard system
    // This handler is kept for API compatibility
  };
}

/**
 * Creates the duplicate handler
 */
export function createDuplicateHandler(
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
