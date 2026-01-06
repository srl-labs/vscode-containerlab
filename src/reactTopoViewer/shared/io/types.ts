/**
 * Shared I/O types for both VS Code extension and dev server
 */

/**
 * Result of a save operation
 */
export interface SaveResult {
  success: boolean;
  error?: string;
  /** If a node was renamed, contains the old and new IDs */
  renamed?: { oldId: string; newId: string };
}

/**
 * Logger interface for I/O operations
 */
export interface IOLogger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * No-op logger for when logging is not needed
 */
export const noopLogger: IOLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * FileSystemAdapter - Abstraction for file system operations
 *
 * This allows the same I/O logic to work in both:
 * - VS Code extension (using Node.js fs.promises directly)
 * - Dev server (using session-based in-memory storage for test isolation)
 */
export interface FileSystemAdapter {
  /**
   * Read file as UTF-8 string.
   * @throws Error if file doesn't exist
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Write content to file (UTF-8).
   * Creates parent directories if needed.
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Delete file.
   * Should not throw if file doesn't exist.
   */
  unlink(filePath: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * Get directory path from file path
   */
  dirname(filePath: string): string;

  /**
   * Get filename from file path
   */
  basename(filePath: string): string;

  /**
   * Join path segments
   */
  join(...segments: string[]): string;
}

/** Common error messages */
export const ERROR_NODES_NOT_MAP = 'YAML topology.nodes is not a map';
export const ERROR_LINKS_NOT_SEQ = 'YAML topology.links is not a sequence';
export const ERROR_SERVICE_NOT_INIT = 'Service not initialized';
export const ERROR_NO_YAML_PATH = 'No YAML file path set';
