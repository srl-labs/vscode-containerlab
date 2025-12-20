/**
 * Browser-safe I/O exports
 *
 * This module exports only the types and classes that can run in the browser.
 * Use this instead of './index' when importing from webview code.
 *
 * Excludes:
 * - NodeFsAdapter (requires Node.js fs/path)
 */

// Types (browser-safe) - use 'export type' for interfaces
export type { FileSystemAdapter, SaveResult, IOLogger } from './types';
export { noopLogger, ERROR_NODES_NOT_MAP, ERROR_LINKS_NOT_SEQ, ERROR_SERVICE_NOT_INIT, ERROR_NO_YAML_PATH } from './types';

// Re-export TopologyAnnotations from types module
export type { TopologyAnnotations } from '../types/topology';

// Annotations I/O (browser-safe - uses FileSystemAdapter abstraction)
export type { AnnotationsIOOptions } from './AnnotationsIO';
export { AnnotationsIO, createEmptyAnnotations, migrateAnnotations } from './AnnotationsIO';

// Topology I/O orchestration (browser-safe - uses FileSystemAdapter abstraction)
export type { TopologyIOOptions } from './TopologyIO';
export { TopologyIO } from './TopologyIO';

// Re-export node/link types for convenience
export type { NodeSaveData, NodeAnnotationData } from './NodePersistenceIO';
export type { LinkSaveData } from './LinkPersistenceIO';
