/**
 * YamlDocumentIO - YAML AST utilities for document manipulation
 *
 * Provides functions for working with YAML documents using the yaml library's
 * Document.Parsed AST, which preserves comments and formatting.
 */

import * as YAML from "yaml";

import type { FileSystemAdapter, SaveResult, IOLogger } from "./types";
import { noopLogger } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Creates a YAML scalar with double quotes for endpoint values
 */
export function createQuotedScalar(doc: YAML.Document, value: string): YAML.Scalar {
  const scalar = doc.createNode(value) as YAML.Scalar;
  scalar.type = "QUOTE_DOUBLE";
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

  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Checks if a value should be persisted (not empty/undefined)
 */
export function shouldPersist(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Sets or deletes a key in a YAML map based on the value
 */
export function setOrDelete(
  doc: YAML.Document,
  map: YAML.YAMLMap,
  key: string,
  value: unknown
): void {
  if (!shouldPersist(value)) {
    if (map.has(key)) map.delete(key);
    return;
  }
  map.set(key, doc.createNode(value));
}

/**
 * Parse YAML content to AST Document
 */
export function parseYamlDocument(content: string): YAML.Document.Parsed {
  return YAML.parseDocument(content);
}

/**
 * Stringify YAML AST to string (preserves comments and formatting)
 */
export function stringifyYamlDocument(doc: YAML.Document.Parsed): string {
  return doc.toString();
}

/**
 * Options for writing YAML files
 */
export interface YamlWriteOptions {
  fs: FileSystemAdapter;
  setInternalUpdate?: (updating: boolean) => void;
  logger?: IOLogger;
}

/**
 * Write YAML document to file with deduplication and internal update flag
 */
export async function writeYamlFile(
  doc: YAML.Document.Parsed,
  yamlFilePath: string,
  options: YamlWriteOptions
): Promise<SaveResult> {
  const { fs, setInternalUpdate, logger = noopLogger } = options;

  try {
    const newContent = doc.toString();

    // Compare with existing content to avoid unnecessary writes
    try {
      const existingContent = await fs.readFile(yamlFilePath);
      if (existingContent === newContent) {
        logger.info("[SaveTopology] No changes detected, skipping write");
        return { success: true };
      }
    } catch {
      // File might not exist, which is fine
    }

    // Write with internal update flag to prevent file watcher loops
    if (setInternalUpdate) {
      setInternalUpdate(true);
    }

    await fs.writeFile(yamlFilePath, newContent);

    if (setInternalUpdate) {
      // Small delay before clearing flag
      await new Promise((resolve) => setTimeout(resolve, 50));
      setInternalUpdate(false);
    }

    logger.info(`[SaveTopology] Saved YAML to: ${yamlFilePath}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
