/**
 * YamlDocStore - Handles YAML document parsing and file operations
 */

import * as fs from 'fs';
import * as YAML from 'yaml';
import { log } from '../services/logger';

/** Result of a save operation */
export interface SaveResult {
  success: boolean;
  error?: string;
  /** If a node was renamed, contains the old and new IDs */
  renamed?: { oldId: string; newId: string };
}

/**
 * Creates a YAML scalar with double quotes for endpoint values
 */
export function createQuotedScalar(doc: YAML.Document, value: string): YAML.Scalar {
  const scalar = doc.createNode(value) as YAML.Scalar;
  scalar.type = 'QUOTE_DOUBLE';
  return scalar;
}

/**
 * Checks if two objects are structurally equal (ignoring key order)
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Checks if a value should be persisted (not empty/undefined)
 */
export function shouldPersist(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/**
 * Sets or deletes a key in a YAML map based on the value
 */
export function setOrDelete(doc: YAML.Document, map: YAML.YAMLMap, key: string, value: unknown): void {
  if (!shouldPersist(value)) {
    if (map.has(key)) map.delete(key);
    return;
  }
  map.set(key, doc.createNode(value));
}

/**
 * Writes the YAML document to disk
 */
export async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  setInternalUpdate?: (updating: boolean) => void
): Promise<SaveResult> {
  try {
    const newContent = doc.toString();

    // Compare with existing content to avoid unnecessary writes
    const existingContent = await fs.promises.readFile(yamlFilePath, 'utf8').catch(() => '');
    if (existingContent === newContent) {
      log.info('[SaveTopology] No changes detected, skipping write');
      return { success: true };
    }

    // Write with internal update flag to prevent file watcher loops
    if (setInternalUpdate) {
      setInternalUpdate(true);
    }

    await fs.promises.writeFile(yamlFilePath, newContent, 'utf8');

    if (setInternalUpdate) {
      // Small delay before clearing flag
      await new Promise(resolve => setTimeout(resolve, 50));
      setInternalUpdate(false);
    }

    log.info(`[SaveTopology] Saved YAML to: ${yamlFilePath}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/** Common error messages */
export const ERROR_NODES_NOT_MAP = 'YAML topology.nodes is not a map';
export const ERROR_LINKS_NOT_SEQ = 'YAML topology.links is not a sequence';
export const ERROR_SERVICE_NOT_INIT = 'Service not initialized';
export const ERROR_NO_YAML_PATH = 'No YAML file path set';
