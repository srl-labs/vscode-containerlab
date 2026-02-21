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
export type { FileSystemAdapter, SaveResult, IOLogger } from "./types";
export {
  noopLogger,
  ERROR_NODES_NOT_MAP,
  ERROR_LINKS_NOT_SEQ,
  ERROR_SERVICE_NOT_INIT,
  ERROR_NO_YAML_PATH,
} from "./types";

// Re-export TopologyAnnotations from types module
export type { TopologyAnnotations } from "../types/topology";

// File system adapters
export { NodeFsAdapter, nodeFsAdapter } from "./NodeFsAdapter";
export { TransactionalFileSystemAdapter } from "./TransactionalFileSystemAdapter";

// YAML utilities
export type { YamlWriteOptions } from "./YamlDocumentIO";
export {
  createQuotedScalar,
  deepEqual,
  shouldPersist,
  setOrDelete,
  parseYamlDocument,
  stringifyYamlDocument,
  writeYamlFile,
} from "./YamlDocumentIO";

// Annotations I/O
export type { AnnotationsIOOptions } from "./AnnotationsIO";
export { AnnotationsIO } from "./AnnotationsIO";
export { createEmptyAnnotations } from "../annotations/types";

// Node persistence
export type { NodeSaveData, NodeAnnotationData } from "./NodePersistenceIO";
export {
  resolveInheritedConfig,
  addNodeToDoc,
  editNodeInDoc,
  deleteNodeFromDoc,
  applyAnnotationData,
  buildAnnotationProps,
} from "./NodePersistenceIO";

// Link persistence
export type { LinkSaveData } from "./LinkPersistenceIO";
export { addLinkToDoc, editLinkInDoc, deleteLinkFromDoc } from "./LinkPersistenceIO";

// Topology I/O orchestration
export type { TopologyIOOptions } from "./TopologyIO";
export { TopologyIO } from "./TopologyIO";
