import * as fs from 'fs';
import * as path from 'path';
import { log } from '../logging/logger';
import { FreeTextAnnotation, GroupStyleAnnotation, TopologyAnnotations, CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';

/**
 * Manages free text annotations for a topology.
 * Annotations are saved in a .annotations.json file alongside the .clab.yaml file.
 */
export class AnnotationsManager {
  private cache: Map<string, { data: TopologyAnnotations; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 1000; // 1 second cache TTL
  private getAnnotationsFilePath(yamlFilePath: string): string {
    const dir = path.dirname(yamlFilePath);
    const basename = path.basename(yamlFilePath, '.clab.yaml');
    const filename = basename.endsWith('.clab')
      ? basename.replace(/\.clab$/, '') + '.annotations.json'
      : basename + '.annotations.json';
    return path.join(dir, filename);
  }

  /**
   * Load annotations from the annotations file with caching
   */
  public async loadAnnotations(yamlFilePath: string): Promise<TopologyAnnotations> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Check cache first
    const cached = this.cache.get(annotationsPath);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      log.debug(`Using cached annotations for ${annotationsPath}`);
      return cached.data;
    }

    try {
      if (await fs.promises.access(annotationsPath).then(() => true).catch(() => false)) {
        const content = await fs.promises.readFile(annotationsPath, 'utf8');
        const annotations = JSON.parse(content) as TopologyAnnotations;
        log.info(`Loaded annotations from ${annotationsPath}`);

        // Update cache
        this.cache.set(annotationsPath, { data: annotations, timestamp: Date.now() });

        return annotations;
      }
    } catch (error) {
      log.warn(`Failed to load annotations from ${annotationsPath}: ${error}`);
    }

    const emptyAnnotations = { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
    // Cache empty result too
    this.cache.set(annotationsPath, { data: emptyAnnotations, timestamp: Date.now() });
    return emptyAnnotations;
  }

  /**
   * Save annotations to the annotations file
   */
  public async saveAnnotations(
    yamlFilePath: string,
    annotations: TopologyAnnotations
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

    // Invalidate cache when saving
    this.cache.delete(annotationsPath);

    try {
      // Only save if there are annotations, otherwise delete the file
      const hasFreeText = annotations.freeTextAnnotations && annotations.freeTextAnnotations.length > 0;
      const hasGroupStyles = annotations.groupStyleAnnotations && annotations.groupStyleAnnotations.length > 0;
      const hasCloudNodes = annotations.cloudNodeAnnotations && annotations.cloudNodeAnnotations.length > 0;
      const hasNodeAnnotations = annotations.nodeAnnotations && annotations.nodeAnnotations.length > 0;
      if (hasFreeText || hasGroupStyles || hasCloudNodes || hasNodeAnnotations) {
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

  /**
   * Add or update a group style annotation
   */
  public addOrUpdateGroupStyle(
    annotations: TopologyAnnotations,
    style: GroupStyleAnnotation
  ): TopologyAnnotations {
    if (!annotations.groupStyleAnnotations) {
      annotations.groupStyleAnnotations = [];
    }
    const existingIndex = annotations.groupStyleAnnotations.findIndex(a => a.id === style.id);
    if (existingIndex >= 0) {
      annotations.groupStyleAnnotations[existingIndex] = style;
    } else {
      annotations.groupStyleAnnotations.push(style);
    }
    return annotations;
  }

  /**
   * Remove a group style annotation
   */
  public removeGroupStyle(
    annotations: TopologyAnnotations,
    styleId: string
  ): TopologyAnnotations {
    if (annotations.groupStyleAnnotations) {
      annotations.groupStyleAnnotations = annotations.groupStyleAnnotations.filter(a => a.id !== styleId);
    }
    return annotations;
  }

  /**
   * Add or update a cloud node annotation
   */
  public addOrUpdateCloudNode(
    annotations: TopologyAnnotations,
    cloudNode: CloudNodeAnnotation
  ): TopologyAnnotations {
    if (!annotations.cloudNodeAnnotations) {
      annotations.cloudNodeAnnotations = [];
    }
    const existingIndex = annotations.cloudNodeAnnotations.findIndex(a => a.id === cloudNode.id);
    if (existingIndex >= 0) {
      annotations.cloudNodeAnnotations[existingIndex] = cloudNode;
    } else {
      annotations.cloudNodeAnnotations.push(cloudNode);
    }
    return annotations;
  }

  /**
   * Remove a cloud node annotation
   */
  public removeCloudNode(
    annotations: TopologyAnnotations,
    cloudNodeId: string
  ): TopologyAnnotations {
    if (annotations.cloudNodeAnnotations) {
      annotations.cloudNodeAnnotations = annotations.cloudNodeAnnotations.filter(a => a.id !== cloudNodeId);
    }
    return annotations;
  }

  /**
   * Add or update a node annotation
   */
  public addOrUpdateNode(
    annotations: TopologyAnnotations,
    node: NodeAnnotation
  ): TopologyAnnotations {
    if (!annotations.nodeAnnotations) {
      annotations.nodeAnnotations = [];
    }
    const existingIndex = annotations.nodeAnnotations.findIndex(a => a.id === node.id);
    if (existingIndex >= 0) {
      annotations.nodeAnnotations[existingIndex] = node;
    } else {
      annotations.nodeAnnotations.push(node);
    }
    return annotations;
  }

  /**
   * Remove a node annotation
   */
  public removeNode(
    annotations: TopologyAnnotations,
    nodeId: string
  ): TopologyAnnotations {
    if (annotations.nodeAnnotations) {
      annotations.nodeAnnotations = annotations.nodeAnnotations.filter(a => a.id !== nodeId);
    }
    return annotations;
  }
}

export const annotationsManager = new AnnotationsManager();