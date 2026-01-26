/**
 * Browser-safe I/O exports
 *
 * This module exports only the types and classes that can run in the browser.
 * Use this instead of './index' when importing from webview code.
 *
 * Excludes:
 * - NodeFsAdapter (requires Node.js fs/path)
 */

import type { TopologyAnnotations as _TopologyAnnotations } from "../types/topology";
import { createEmptyAnnotations as _createEmptyAnnotations } from "../annotations/types";

import type {
  FileSystemAdapter as _FileSystemAdapter,
  SaveResult as _SaveResult,
  IOLogger as _IOLogger
} from "./types";
import {
  noopLogger as _noopLogger,
  ERROR_NODES_NOT_MAP as _ERROR_NODES_NOT_MAP,
  ERROR_LINKS_NOT_SEQ as _ERROR_LINKS_NOT_SEQ,
  ERROR_SERVICE_NOT_INIT as _ERROR_SERVICE_NOT_INIT,
  ERROR_NO_YAML_PATH as _ERROR_NO_YAML_PATH
} from "./types";
import type { AnnotationsIOOptions as _AnnotationsIOOptions } from "./AnnotationsIO";
import { AnnotationsIO as _AnnotationsIO } from "./AnnotationsIO";
import type { TopologyIOOptions as _TopologyIOOptions } from "./TopologyIO";
import { TopologyIO as _TopologyIO } from "./TopologyIO";
import type {
  NodeSaveData as _NodeSaveData,
  NodeAnnotationData as _NodeAnnotationData
} from "./NodePersistenceIO";
import type { LinkSaveData as _LinkSaveData } from "./LinkPersistenceIO";

// Types (browser-safe)
export type FileSystemAdapter = _FileSystemAdapter;
export type SaveResult = _SaveResult;
export type IOLogger = _IOLogger;
export const noopLogger = _noopLogger;
export const ERROR_NODES_NOT_MAP = _ERROR_NODES_NOT_MAP;
export const ERROR_LINKS_NOT_SEQ = _ERROR_LINKS_NOT_SEQ;
export const ERROR_SERVICE_NOT_INIT = _ERROR_SERVICE_NOT_INIT;
export const ERROR_NO_YAML_PATH = _ERROR_NO_YAML_PATH;

// TopologyAnnotations
export type TopologyAnnotations = _TopologyAnnotations;

// Annotations I/O (browser-safe - uses FileSystemAdapter abstraction)
export type AnnotationsIOOptions = _AnnotationsIOOptions;
export const AnnotationsIO = _AnnotationsIO;
export const createEmptyAnnotations = _createEmptyAnnotations;

// Topology I/O orchestration (browser-safe - uses FileSystemAdapter abstraction)
export type TopologyIOOptions = _TopologyIOOptions;
export const TopologyIO = _TopologyIO;

// Node/link types
export type NodeSaveData = _NodeSaveData;
export type NodeAnnotationData = _NodeAnnotationData;
export type LinkSaveData = _LinkSaveData;
