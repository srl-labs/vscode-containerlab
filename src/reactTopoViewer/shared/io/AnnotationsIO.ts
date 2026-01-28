/**
 * AnnotationsIO - Core annotations I/O with caching, queuing, and locks
 *
 * Manages .annotations.json files alongside .clab.yaml topology files.
 * Environment-agnostic: works in both VS Code extension and dev server.
 */

// eslint-disable-next-line sonarjs/deprecation -- CloudNodeAnnotation needed for migration
import type {
  CloudNodeAnnotation,
  NetworkNodeAnnotation,
  TopologyAnnotations
} from "../types/topology";
import { createEmptyAnnotations } from "../annotations/types";

import type { FileSystemAdapter, IOLogger } from "./types";
import { noopLogger } from "./types";

/**
 * Options for creating an AnnotationsIO instance
 */
export interface AnnotationsIOOptions {
  fs: FileSystemAdapter;
  cacheTtlMs?: number;
  logger?: IOLogger;
}

/**
 * Migrate cloudNodeAnnotations to networkNodeAnnotations.
 * This provides backward compatibility - reads old format, writes new format.
 */
export function migrateAnnotations(annotations: TopologyAnnotations): TopologyAnnotations {
  // If networkNodeAnnotations already exists, no migration needed
  if (annotations.networkNodeAnnotations && annotations.networkNodeAnnotations.length > 0) {
    return annotations;
  }

  // If cloudNodeAnnotations exists, migrate to networkNodeAnnotations
  // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
  if (annotations.cloudNodeAnnotations && annotations.cloudNodeAnnotations.length > 0) {
    // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
    annotations.networkNodeAnnotations = annotations.cloudNodeAnnotations.map(
      (cloud: CloudNodeAnnotation): NetworkNodeAnnotation => ({
        id: cloud.id,
        type: cloud.type,
        label: cloud.label,
        position: cloud.position,
        group: cloud.group,
        level: cloud.level
      })
    );

    // Clear the old format (will be written as new format on next save)
    // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
    delete annotations.cloudNodeAnnotations;
  }

  return annotations;
}

/**
 * AnnotationsIO - Manages annotations file I/O with caching, queuing, and locks.
 *
 * Features:
 * - Caching with TTL to reduce disk I/O
 * - Per-file save queues to prevent concurrent writes
 * - Per-file modification locks for atomic read-modify-write
 * - Content deduplication before writes
 */
export class AnnotationsIO {
  private fs: FileSystemAdapter;
  private cache: Map<string, { data: TopologyAnnotations; timestamp: number }> = new Map();
  private readonly CACHE_TTL: number;
  private saveQueues: Map<string, Promise<void>> = new Map();
  private modificationLocks: Map<string, Promise<void>> = new Map();
  private logger: IOLogger;

  constructor(options: AnnotationsIOOptions) {
    this.fs = options.fs;
    this.CACHE_TTL = options.cacheTtlMs ?? 1000;
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Get the annotations file path for a given YAML file.
   */
  getAnnotationsFilePath(yamlFilePath: string): string {
    const dir = this.fs.dirname(yamlFilePath);
    const fullBasename = this.fs.basename(yamlFilePath);
    const filename = fullBasename + ".annotations.json";
    return this.fs.join(dir, filename);
  }

  /**
   * Atomically modify annotations with a serialized read-modify-write operation.
   * This prevents race conditions when multiple operations try to modify annotations concurrently.
   * @param yamlFilePath Path to the YAML file
   * @param modifier Function that receives current annotations and returns modified annotations
   */
  async modifyAnnotations(
    yamlFilePath: string,
    modifier: (annotations: TopologyAnnotations) => TopologyAnnotations
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Acquire modification lock for this file
    const currentLock = this.modificationLocks.get(annotationsPath) || Promise.resolve();
    let releaseLock: () => void;
    const newLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.modificationLocks.set(
      annotationsPath,
      currentLock.then(() => newLock)
    );

    // Wait for previous modification to complete
    await currentLock;

    try {
      // Load fresh data (skip cache since we're modifying)
      const annotations = await this.loadAnnotations(yamlFilePath, true);
      // Apply modification
      const modified = modifier(annotations);
      // Save the result
      await this.saveAnnotations(yamlFilePath, modified);
    } finally {
      // Release the lock
      releaseLock!();
    }
  }

  /**
   * Load annotations from the annotations file with caching.
   * Waits for any pending saves to complete first.
   * @param yamlFilePath Path to the YAML file
   * @param skipCache If true, bypasses cache (use for read-modify-write operations)
   */
  async loadAnnotations(yamlFilePath: string, skipCache = false): Promise<TopologyAnnotations> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Wait for any pending save to complete first
    const pendingSave = this.saveQueues.get(annotationsPath);
    if (pendingSave) {
      await pendingSave;
    }

    // Check cache first (unless skipping cache for modification operations)
    if (!skipCache) {
      const cached = this.cache.get(annotationsPath);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.logger.debug(`Using cached annotations for ${annotationsPath}`);
        return cached.data;
      }
    }

    try {
      const exists = await this.fs.exists(annotationsPath);
      if (exists) {
        const content = await this.fs.readFile(annotationsPath);
        let annotations = JSON.parse(content) as TopologyAnnotations;
        this.logger.info(`Loaded annotations from ${annotationsPath}`);

        // Migrate cloudNodeAnnotations to networkNodeAnnotations if needed
        annotations = migrateAnnotations(annotations);

        this.cache.set(annotationsPath, { data: annotations, timestamp: Date.now() });
        return annotations;
      }
    } catch (error) {
      this.logger.warn(`Failed to load annotations from ${annotationsPath}: ${error}`);
    }

    const emptyAnnotations = createEmptyAnnotations();
    this.cache.set(annotationsPath, { data: emptyAnnotations, timestamp: Date.now() });
    return emptyAnnotations;
  }

  /**
   * Save annotations to the annotations file (queued to prevent concurrent writes).
   */
  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Queue saves per file to prevent concurrent writes
    const currentQueue = this.saveQueues.get(annotationsPath) || Promise.resolve();
    const newQueue = currentQueue
      .then(async () => {
        this.cache.delete(annotationsPath);

        try {
          const shouldSave = this.shouldSaveAnnotations(annotations);
          if (shouldSave) {
            const content = JSON.stringify(annotations, null, 2);
            let shouldWrite = true;

            try {
              const existing = await this.fs.readFile(annotationsPath);
              if (existing === content) {
                shouldWrite = false;
                this.logger.debug(`Annotations unchanged, skipping save for ${annotationsPath}`);
              }
            } catch {
              // File might not exist, so we need to write
            }

            if (shouldWrite) {
              await this.fs.writeFile(annotationsPath, content);
              this.logger.info(`Saved annotations to ${annotationsPath}`);
            }
          } else {
            // Delete the file if no annotations exist
            await this.fs.unlink(annotationsPath);
            this.logger.info(`Removed empty annotations file ${annotationsPath}`);
          }
        } catch (error) {
          this.logger.error(`Failed to save annotations to ${annotationsPath}: ${error}`);
          throw error;
        }
      })
      .catch((err) => {
        this.logger.error(`Annotations save queue error: ${err}`);
      });

    this.saveQueues.set(annotationsPath, newQueue);
    return newQueue;
  }

  /**
   * Clear all caches and pending operations.
   * Useful for session reset in dev server.
   */
  clearCache(): void {
    this.cache.clear();
    this.saveQueues.clear();
    this.modificationLocks.clear();
  }

  /**
   * Check if array has content.
   */
  private hasContent(arr: unknown[] | undefined): boolean {
    return Array.isArray(arr) && arr.length > 0;
  }

  /**
   * Determine if annotations should be saved (has any content).
   */
  private shouldSaveAnnotations(annotations: TopologyAnnotations): boolean {
    if (this.hasContent(annotations.freeTextAnnotations)) return true;
    if (this.hasContent(annotations.freeShapeAnnotations)) return true;
    if (this.hasContent(annotations.groupStyleAnnotations)) return true;
    if (this.hasContent(annotations.networkNodeAnnotations)) return true;
    // Also check legacy format for backward compatibility during migration
    // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
    if (this.hasContent(annotations.cloudNodeAnnotations)) return true;
    if (this.hasContent(annotations.nodeAnnotations)) return true;
    if (this.hasContent(annotations.edgeAnnotations)) return true;
    if (this.hasContent(annotations.aliasEndpointAnnotations)) return true;
    if (annotations.viewerSettings && Object.keys(annotations.viewerSettings).length > 0)
      return true;
    return false;
  }
}
