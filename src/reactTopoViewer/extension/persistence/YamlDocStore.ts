/**
 * YamlDocStore - Re-exports from shared I/O module
 *
 * This file maintains backward compatibility by re-exporting
 * YAML document utilities from the shared I/O layer.
 */

import * as YAML from 'yaml';
import { NodeFsAdapter } from '../../shared/io';
import {
  SaveResult,
  createQuotedScalar,
  deepEqual,
  shouldPersist,
  setOrDelete,
  writeYamlFile as sharedWriteYamlFile,
  ERROR_NODES_NOT_MAP,
  ERROR_LINKS_NOT_SEQ,
  ERROR_SERVICE_NOT_INIT,
  ERROR_NO_YAML_PATH,
} from '../../shared/io';
import { log } from '../services/logger';

// Re-export types and utilities
export type { SaveResult };
export { createQuotedScalar, deepEqual, shouldPersist, setOrDelete };
export { ERROR_NODES_NOT_MAP, ERROR_LINKS_NOT_SEQ, ERROR_SERVICE_NOT_INIT, ERROR_NO_YAML_PATH };

// Create a shared fs adapter for the extension
const nodeFsAdapter = new NodeFsAdapter();

/**
 * Writes the YAML document to disk
 *
 * This is a thin wrapper around the shared writeYamlFile,
 * using the extension's file system adapter and logger.
 */
export async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  setInternalUpdate?: (updating: boolean) => void
): Promise<SaveResult> {
  return sharedWriteYamlFile(doc, yamlFilePath, {
    fs: nodeFsAdapter,
    setInternalUpdate,
    logger: {
      debug: log.debug.bind(log),
      info: log.info.bind(log),
      warn: log.warn.bind(log),
      error: log.error.bind(log),
    },
  });
}
