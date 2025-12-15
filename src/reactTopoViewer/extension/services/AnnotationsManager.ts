/**
 * Annotations manager for React TopoViewer.
 * Manages .annotations.json files alongside .clab.yaml topology files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
// eslint-disable-next-line sonarjs/deprecation -- CloudNodeAnnotation needed for migration
import { TopologyAnnotations, CloudNodeAnnotation, NetworkNodeAnnotation } from '../../shared/types/topology';

/**
 * Manages topology annotations (positions, styles, text, shapes).
 * Annotations are saved in a .annotations.json file alongside the .clab.yaml file.
 */
export class AnnotationsManager {
  private cache: Map<string, { data: TopologyAnnotations; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 1000; // 1 second cache TTL
  /** Per-file save queues to prevent concurrent writes */
  private saveQueues: Map<string, Promise<void>> = new Map();
  /** Per-file modification locks to serialize read-modify-write operations */
  private modificationLocks: Map<string, Promise<void>> = new Map();

  /**
   * Migrate cloudNodeAnnotations to networkNodeAnnotations.
   * This provides backward compatibility - reads old format, writes new format.
   */
  private migrateCloudToNetworkAnnotations(annotations: TopologyAnnotations): TopologyAnnotations {
    // If networkNodeAnnotations already exists, no migration needed
    if (annotations.networkNodeAnnotations && annotations.networkNodeAnnotations.length > 0) {
      return annotations;
    }

    // If cloudNodeAnnotations exists, migrate to networkNodeAnnotations
    // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
    if (annotations.cloudNodeAnnotations && annotations.cloudNodeAnnotations.length > 0) {
      // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
      log.info(`Migrating ${annotations.cloudNodeAnnotations.length} cloudNodeAnnotations to networkNodeAnnotations`);

      // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
      annotations.networkNodeAnnotations = annotations.cloudNodeAnnotations.map((cloud: CloudNodeAnnotation): NetworkNodeAnnotation => ({
        id: cloud.id,
        type: cloud.type,
        label: cloud.label,
        position: cloud.position,
        group: cloud.group,
        level: cloud.level
      }));

      // Clear the old format (will be written as new format on next save)
      // eslint-disable-next-line sonarjs/deprecation -- Intentional use of deprecated field for migration
      delete annotations.cloudNodeAnnotations;
    }

    return annotations;
  }

  /**
   * Get the annotations file path for a given YAML file.
   */
  private getAnnotationsFilePath(yamlFilePath: string): string {
    const dir = path.dirname(yamlFilePath);
    const fullBasename = path.basename(yamlFilePath);
    const filename = fullBasename + '.annotations.json';
    return path.join(dir, filename);
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
    const newLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.modificationLocks.set(annotationsPath, currentLock.then(() => newLock));

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
        log.debug(`Using cached annotations for ${annotationsPath}`);
        return cached.data;
      }
    }

    try {
      const exists = await fs.promises.access(annotationsPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.promises.readFile(annotationsPath, 'utf8');
        let annotations = JSON.parse(content) as TopologyAnnotations;
        log.info(`Loaded annotations from ${annotationsPath}`);

        // Migrate cloudNodeAnnotations to networkNodeAnnotations if needed
        annotations = this.migrateCloudToNetworkAnnotations(annotations);

        this.cache.set(annotationsPath, { data: annotations, timestamp: Date.now() });
        return annotations;
      }
    } catch (error) {
      log.warn(`Failed to load annotations from ${annotationsPath}: ${error}`);
    }

    const emptyAnnotations: TopologyAnnotations = {
      freeTextAnnotations: [],
      freeShapeAnnotations: [],
      groupStyleAnnotations: [],
      networkNodeAnnotations: [],
      nodeAnnotations: [],
      aliasEndpointAnnotations: []
    };
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
    const newQueue = currentQueue.then(async () => {
      this.cache.delete(annotationsPath);

      try {
        const shouldSave = this.shouldSaveAnnotations(annotations);
        if (shouldSave) {
          const content = JSON.stringify(annotations, null, 2);
          let shouldWrite = true;

          try {
            const existing = await fs.promises.readFile(annotationsPath, 'utf8');
            if (existing === content) {
              shouldWrite = false;
              log.debug(`Annotations unchanged, skipping save for ${annotationsPath}`);
            }
          } catch {
            // File might not exist, so we need to write
          }

          if (shouldWrite) {
            await fs.promises.writeFile(annotationsPath, content, 'utf8');
            log.info(`Saved annotations to ${annotationsPath}`);
          }
        } else {
          // Delete the file if no annotations exist
          try {
            await fs.promises.unlink(annotationsPath);
            log.info(`Removed empty annotations file ${annotationsPath}`);
          } catch {
            // File may not exist, which is fine
          }
        }
      } catch (error) {
        log.error(`Failed to save annotations to ${annotationsPath}: ${error}`);
        throw error;
      }
    }).catch(err => {
      log.error(`Annotations save queue error: ${err}`);
    });

    this.saveQueues.set(annotationsPath, newQueue);
    return newQueue;
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
    if (this.hasContent(annotations.aliasEndpointAnnotations)) return true;
    if (annotations.viewerSettings && Object.keys(annotations.viewerSettings).length > 0) return true;
    return false;
  }
}

// Export a singleton instance
export const annotationsManager = new AnnotationsManager();
