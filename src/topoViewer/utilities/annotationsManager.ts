import * as fs from 'fs';
import * as path from 'path';
import { log } from '../logging/logger';
import { FreeTextAnnotation, TopologyAnnotations } from '../types/topoViewerGraph';

/**
 * Manages free text annotations for a topology.
 * Annotations are saved in a .annotations.json file alongside the .clab.yaml file.
 */
export class AnnotationsManager {
  private getAnnotationsFilePath(yamlFilePath: string): string {
    const dir = path.dirname(yamlFilePath);
    const basename = path.basename(yamlFilePath, '.clab.yaml');
    const filename = basename.endsWith('.clab')
      ? basename.replace(/\.clab$/, '') + '.annotations.json'
      : basename + '.annotations.json';
    return path.join(dir, filename);
  }

  /**
   * Load annotations from the annotations file
   */
  public async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    try {
      if (await fs.promises.access(annotationsPath).then(() => true).catch(() => false)) {
        const content = await fs.promises.readFile(annotationsPath, 'utf8');
        const annotations = JSON.parse(content) as TopologyAnnotations;
        log.info(`Loaded annotations from ${annotationsPath}`);
        return annotations;
      }
    } catch (error) {
      log.warn(`Failed to load annotations from ${annotationsPath}: ${error}`);
    }

    return { freeTextAnnotations: [] };
  }

  /**
   * Save annotations to the annotations file
   */
  public async saveAnnotations(
    yamlFilePath: string,
    annotations: TopologyAnnotations
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    try {
      // Only save if there are annotations, otherwise delete the file
      if (annotations.freeTextAnnotations && annotations.freeTextAnnotations.length > 0) {
        const content = JSON.stringify(annotations, null, 2);
        await fs.promises.writeFile(annotationsPath, content, 'utf8');
        log.info(`Saved annotations to ${annotationsPath}`);
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
   * Add or update a free text annotation
   */
  public addOrUpdateFreeTextAnnotation(
    annotations: TopologyAnnotations,
    annotation: FreeTextAnnotation
  ): TopologyAnnotations {
    if (!annotations.freeTextAnnotations) {
      annotations.freeTextAnnotations = [];
    }

    const existingIndex = annotations.freeTextAnnotations.findIndex(
      a => a.id === annotation.id
    );

    if (existingIndex >= 0) {
      annotations.freeTextAnnotations[existingIndex] = annotation;
    } else {
      annotations.freeTextAnnotations.push(annotation);
    }

    return annotations;
  }

  /**
   * Remove a free text annotation
   */
  public removeFreeTextAnnotation(
    annotations: TopologyAnnotations,
    annotationId: string
  ): TopologyAnnotations {
    if (annotations.freeTextAnnotations) {
      annotations.freeTextAnnotations = annotations.freeTextAnnotations.filter(
        a => a.id !== annotationId
      );
    }
    return annotations;
  }
}

export const annotationsManager = new AnnotationsManager();