/**
 * Annotations manager for React TopoViewer.
 *
 * This is a thin wrapper around the shared AnnotationsIO module,
 * providing a singleton instance for the VS Code extension.
 */

import { AnnotationsIO, NodeFsAdapter, TopologyAnnotations } from '../../shared/io';
import { log } from './logger';

// Create shared AnnotationsIO with NodeFsAdapter
const sharedAnnotationsIO = new AnnotationsIO({
  fs: new NodeFsAdapter(),
  logger: {
    debug: log.debug.bind(log),
    info: log.info.bind(log),
    warn: log.warn.bind(log),
    error: log.error.bind(log),
  },
});

/**
 * Manages topology annotations (positions, styles, text, shapes).
 *
 * This class delegates to the shared AnnotationsIO module which provides:
 * - Caching with 1-second TTL
 * - Per-file save queues to prevent concurrent writes
 * - Per-file modification locks for atomic read-modify-write
 * - Content deduplication before writes
 */
export class AnnotationsManager {
  private io = sharedAnnotationsIO;

  /**
   * Get the annotations file path for a given YAML file.
   */
  getAnnotationsFilePath(yamlFilePath: string): string {
    return this.io.getAnnotationsFilePath(yamlFilePath);
  }

  /**
   * Atomically modify annotations with a serialized read-modify-write operation.
   */
  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    return this.io.modifyAnnotations(yamlFilePath, modifier);
  }

  /**
   * Load annotations from the annotations file with caching.
   */
  async loadAnnotations(yamlFilePath: string, skipCache = false): Promise<TopologyAnnotations> {
    return this.io.loadAnnotations(yamlFilePath, skipCache);
  }

  /**
   * Save annotations to the annotations file.
   */
  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    return this.io.saveAnnotations(yamlFilePath, annotations);
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.io.clearCache();
  }

  /**
   * Get the underlying AnnotationsIO instance.
   * Used by TopologyIO for unified I/O orchestration.
   */
  getAnnotationsIO(): AnnotationsIO {
    return this.io;
  }
}

// Export a singleton instance
export const annotationsManager = new AnnotationsManager();

// Re-export TopologyAnnotations for convenience
export type { TopologyAnnotations } from '../../shared/io';
