/**
 * Webview Services Initialization
 *
 * This module initializes the core I/O services (TopologyIO, AnnotationsIO)
 * with the appropriate FileSystemAdapter for the current environment.
 *
 * Environment detection:
 * - VS Code webview: Uses PostMessageFsAdapter
 * - Dev/standalone: Uses HttpFsAdapter
 */

import type { FileSystemAdapter, IOLogger } from '../../shared/io/types';
import { noopLogger } from '../../shared/io/types';
import { TopologyIO } from '../../shared/io/TopologyIO';
import { AnnotationsIO } from '../../shared/io/AnnotationsIO';

// Global service instances
let annotationsIO: AnnotationsIO | null = null;
let topologyIO: TopologyIO | null = null;
let fsAdapter: FileSystemAdapter | null = null;

// Error message constant
const ERROR_NOT_INITIALIZED = 'Services not initialized. Call initializeServices() first.';

/**
 * Browser console logger adapter
 */
const browserLogger: IOLogger = {
  debug: (msg: string) => console.debug(`[Services] ${msg}`),
  info: (msg: string) => console.info(`[Services] ${msg}`),
  warn: (msg: string) => console.warn(`[Services] ${msg}`),
  error: (msg: string) => console.error(`[Services] ${msg}`),
};

/**
 * Initialize the I/O services with a FileSystemAdapter.
 * Call this once at app startup.
 *
 * @param adapter - FileSystemAdapter implementation (PostMessageFsAdapter or HttpFsAdapter)
 * @param options - Optional configuration
 */
export function initializeServices(
  adapter: FileSystemAdapter,
  options: { verbose?: boolean } = {}
): void {
  const logger = options.verbose ? browserLogger : noopLogger;

  fsAdapter = adapter;

  annotationsIO = new AnnotationsIO({
    fs: adapter,
    logger,
  });

  topologyIO = new TopologyIO({
    fs: adapter,
    annotationsIO,
    logger,
  });

  logger.info('Services initialized');
}

/**
 * Get the FileSystemAdapter instance.
 * @throws Error if services not initialized
 */
export function getFsAdapter(): FileSystemAdapter {
  if (!fsAdapter) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return fsAdapter;
}

/**
 * Get the TopologyIO instance.
 * @throws Error if services not initialized
 */
export function getTopologyIO(): TopologyIO {
  if (!topologyIO) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return topologyIO;
}

/**
 * Get the AnnotationsIO instance.
 * @throws Error if services not initialized
 */
export function getAnnotationsIO(): AnnotationsIO {
  if (!annotationsIO) {
    throw new Error(ERROR_NOT_INITIALIZED);
  }
  return annotationsIO;
}

/**
 * Check if services have been initialized.
 */
export function isServicesInitialized(): boolean {
  return fsAdapter !== null && topologyIO !== null && annotationsIO !== null;
}

/**
 * Reset services (mainly for testing).
 */
export function resetServices(): void {
  fsAdapter = null;
  topologyIO = null;
  annotationsIO = null;
}
