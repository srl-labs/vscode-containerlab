/**
 * copyHandlers - Individual handler functions for copy/paste operations
 * Split from createCopyPasteHandlers to reduce aggregate complexity
 */
import type { Core } from 'cytoscape';
import { sendCommandToExtension } from '../../utils/extensionMessaging';
import {
  CopyData,
  GraphChangeEntry,
  collectCopyData,
  executeCopy,
  executeCut
} from './copyPasteUtils';

/**
 * Handler functions for copy/paste operations
 */
export interface CopyPasteHandlers {
  handleCopy: () => void;
  handlePaste: () => void;
  handleCut: () => void;
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
 */
export function createPasteHandler(
  cy: Core | null,
  mode: 'edit' | 'view',
  isLocked: boolean
): () => void {
  return () => {
    if (!cy || mode !== 'edit' || isLocked) return;
    sendCommandToExtension('getCopiedElements');
  };
}

/**
 * Creates the cut handler
 */
export function createCutHandler(
  cy: Core | null,
  mode: 'edit' | 'view',
  isLocked: boolean,
  recordGraphChanges: ((before: GraphChangeEntry[], after: GraphChangeEntry[]) => void) | undefined,
  resetPasteState: () => void
): () => void {
  return () => {
    if (!cy || mode !== 'edit' || isLocked) return;
    if (executeCut(cy, recordGraphChanges)) {
      resetPasteState();
    }
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
