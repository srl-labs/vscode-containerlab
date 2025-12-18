/**
 * LinkPersistence - Re-exports from shared I/O module
 *
 * This file exists for backwards compatibility.
 * All link persistence functionality is now in the shared I/O layer.
 */

// Re-export types and functions from shared I/O
export {
  LinkSaveData,
  addLinkToDoc,
  editLinkInDoc,
  deleteLinkFromDoc,
} from '../../shared/io';

// Re-export SaveResult for backwards compatibility
export type { SaveResult } from '../../shared/io';
