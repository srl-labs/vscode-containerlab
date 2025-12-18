/**
 * Shared I/O module for both VS Code extension and dev server
 *
 * This module provides a unified I/O layer for:
 * - Annotations JSON files (with caching, queuing, locks)
 * - YAML topology files (AST-based editing to preserve comments)
 *
 * Usage:
 * - VS Code extension: Use NodeFsAdapter for direct file operations
 * - Dev server: Use SessionFsAdapter for session-based test isolation
 */

// Types
export {
  FileSystemAdapter,
  SaveResult,
  IOLogger,
  noopLogger,
  TopologyAnnotations,
  ERROR_NODES_NOT_MAP,
  ERROR_LINKS_NOT_SEQ,
  ERROR_SERVICE_NOT_INIT,
  ERROR_NO_YAML_PATH,
} from './types';

// File system adapters
export { NodeFsAdapter, nodeFsAdapter } from './NodeFsAdapter';

// YAML utilities
export {
  createQuotedScalar,
  deepEqual,
  shouldPersist,
  setOrDelete,
  parseYamlDocument,
  stringifyYamlDocument,
  writeYamlFile,
  YamlWriteOptions,
} from './YamlDocumentIO';

// Annotations I/O
export {
  AnnotationsIO,
  AnnotationsIOOptions,
  createEmptyAnnotations,
  migrateAnnotations,
} from './AnnotationsIO';

// Node persistence
export {
  NodeSaveData,
  NodeAnnotationData,
  resolveInheritedConfig,
  addNodeToDoc,
  editNodeInDoc,
  deleteNodeFromDoc,
  applyAnnotationData,
  buildAnnotationProps,
} from './NodePersistenceIO';

// Link persistence
export {
  LinkSaveData,
  addLinkToDoc,
  editLinkInDoc,
  deleteLinkFromDoc,
} from './LinkPersistenceIO';

// Topology I/O orchestration
export {
  TopologyIO,
  TopologyIOOptions,
} from './TopologyIO';
