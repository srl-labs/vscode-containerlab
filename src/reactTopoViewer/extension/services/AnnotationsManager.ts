/**
 * Annotations manager for React TopoViewer.
 * Manages .annotations.json files alongside .clab.yaml topology files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { TopologyAnnotations } from '../../shared/types/topology';

/**
 * Manages topology annotations (positions, styles, text, shapes).
 * Annotations are saved in a .annotations.json file alongside the .clab.yaml file.
 */
export class AnnotationsManager {
  private cache: Map<string, { data: TopologyAnnotations; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 1000; // 1 second cache TTL

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
   * Load annotations from the annotations file with caching.
   */
  async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Check cache first
    const cached = this.cache.get(annotationsPath);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      log.debug(`Using cached annotations for ${annotationsPath}`);
      return cached.data;
    }

    try {
      const exists = await fs.promises.access(annotationsPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.promises.readFile(annotationsPath, 'utf8');
        const annotations = JSON.parse(content) as TopologyAnnotations;
        log.info(`Loaded annotations from ${annotationsPath}`);
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
      cloudNodeAnnotations: [],
      nodeAnnotations: [],
      aliasEndpointAnnotations: []
    };
    this.cache.set(annotationsPath, { data: emptyAnnotations, timestamp: Date.now() });
    return emptyAnnotations;
  }

  /**
   * Save annotations to the annotations file.
   */
  async saveAnnotations(yamlFilePath: string, annotations: TopologyAnnotations): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);
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
    if (this.hasContent(annotations.cloudNodeAnnotations)) return true;
    if (this.hasContent(annotations.nodeAnnotations)) return true;
    if (this.hasContent(annotations.aliasEndpointAnnotations)) return true;
    if (annotations.viewerSettings && Object.keys(annotations.viewerSettings).length > 0) return true;
    return false;
  }
}

// Export a singleton instance
export const annotationsManager = new AnnotationsManager();
