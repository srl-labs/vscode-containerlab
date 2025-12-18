/**
 * NodePersistence - Re-exports from shared I/O module
 *
 * This file exists for backwards compatibility.
 * All node persistence functionality is now in the shared I/O layer.
 */

// Re-export types and functions from shared I/O
export {
  NodeSaveData,
  NodeAnnotationData,
  resolveInheritedConfig,
  applyAnnotationData,
  buildAnnotationProps,
  addNodeToDoc,
  editNodeInDoc,
  deleteNodeFromDoc,
} from '../../shared/io';

// Re-export SaveResult for backwards compatibility
export type { SaveResult } from '../../shared/io';
