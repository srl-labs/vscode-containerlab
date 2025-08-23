// file: annotationsManager.ts
// Handles reading, writing, and manipulating topology annotations.

import * as fs from 'fs';
import * as path from 'path';
import { log } from '../logging/logger';
import { FreeTextAnnotation, GroupStyleAnnotation, TopologyAnnotations, CloudNodeAnnotation, NodeAnnotation } from '../types/topoViewerGraph';

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
   * Load annotations from the annotations file.
   *
   * @param yamlFilePath - Path to the topology YAML file.
   * @returns Parsed annotations or empty defaults.
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

    return { freeTextAnnotations: [], groupStyleAnnotations: [], cloudNodeAnnotations: [], nodeAnnotations: [] };
  }

  /**
    * Save annotations to the annotations file.
    *
    * @param yamlFilePath - Path to topology YAML.
    * @param annotations - Annotations data to persist.
    * @returns Resolves when the file is written or removed.
    */
  public async saveAnnotations(
    yamlFilePath: string,
    annotations: TopologyAnnotations
  ): Promise<void> {
    const annotationsPath = this.getAnnotationsFilePath(yamlFilePath);

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
   * Add or update a free text annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param annotation - Annotation to add or update.
   * @returns Updated annotation collection.
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
   * Remove a free text annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param annotationId - ID of the annotation to remove.
   * @returns Updated annotation collection.
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
   * Add or update a group style annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param style - Style annotation to add or update.
   * @returns Updated annotation collection.
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
   * Remove a group style annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param styleId - ID of the style annotation to remove.
   * @returns Updated annotation collection.
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
   * Add or update a cloud node annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param cloudNode - Cloud node annotation to add or update.
   * @returns Updated annotation collection.
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
   * Remove a cloud node annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param cloudNodeId - ID of the cloud node to remove.
   * @returns Updated annotation collection.
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
   * Add or update a node annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param node - Node annotation to add or update.
   * @returns Updated annotation collection.
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
   * Remove a node annotation.
   *
   * @param annotations - Existing annotation collection.
   * @param nodeId - ID of the node annotation to remove.
   * @returns Updated annotation collection.
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