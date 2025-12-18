/**
 * TopologyIO - Orchestration layer for topology persistence
 *
 * Combines YAML AST editing with annotations management.
 * Provides batch operations and save queueing.
 * Used by both VS Code extension and dev server.
 */

import * as YAML from 'yaml';
import { FileSystemAdapter, SaveResult, IOLogger, noopLogger, ERROR_SERVICE_NOT_INIT, ERROR_NO_YAML_PATH } from './types';
import { AnnotationsIO } from './AnnotationsIO';
import { writeYamlFile, parseYamlDocument } from './YamlDocumentIO';
import { NodeSaveData, addNodeToDoc, editNodeInDoc, deleteNodeFromDoc, NodeAnnotationData, buildAnnotationProps, applyAnnotationData } from './NodePersistenceIO';
import { LinkSaveData, addLinkToDoc, editLinkInDoc, deleteLinkFromDoc } from './LinkPersistenceIO';
import { ClabTopology } from '../types/topology';

// Re-export types for convenience
export type { NodeSaveData, NodeAnnotationData } from './NodePersistenceIO';
export type { LinkSaveData } from './LinkPersistenceIO';

/**
 * Options for creating a TopologyIO instance
 */
export interface TopologyIOOptions {
  fs: FileSystemAdapter;
  annotationsIO: AnnotationsIO;
  setInternalUpdate?: (updating: boolean) => void;
  logger?: IOLogger;
}

/**
 * TopologyIO - Orchestrates saving topology changes to YAML files
 *
 * Features:
 * - Batch operations (defers saves until endBatch)
 * - Save queueing to prevent concurrent writes
 * - Integrated annotations management
 */
export class TopologyIO {
  private fs: FileSystemAdapter;
  private annotationsIO: AnnotationsIO;
  private setInternalUpdate?: (updating: boolean) => void;
  private logger: IOLogger;

  // State
  private doc: YAML.Document.Parsed | null = null;
  private yamlFilePath: string = '';
  private batchDepth = 0;
  private pendingSave = false;
  private saveQueue: Promise<SaveResult> = Promise.resolve({ success: true });

  constructor(options: TopologyIOOptions) {
    this.fs = options.fs;
    this.annotationsIO = options.annotationsIO;
    this.setInternalUpdate = options.setInternalUpdate;
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Initializes the service with a YAML document
   */
  initialize(doc: YAML.Document.Parsed, yamlFilePath: string): void {
    this.doc = doc;
    this.yamlFilePath = yamlFilePath;
  }

  /**
   * Initializes the service by reading and parsing a YAML file
   */
  async initializeFromFile(yamlFilePath: string): Promise<SaveResult> {
    try {
      const content = await this.fs.readFile(yamlFilePath);
      const doc = parseYamlDocument(content);
      this.initialize(doc, yamlFilePath);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.doc !== null && this.yamlFilePath !== '';
  }

  /**
   * Gets the current YAML file path
   */
  getYamlFilePath(): string {
    return this.yamlFilePath;
  }

  /**
   * Gets the current YAML document
   */
  getDocument(): YAML.Document.Parsed | null {
    return this.doc;
  }

  /**
   * Begin a batch operation (defers saves until endBatch)
   */
  beginBatch(): void {
    this.batchDepth += 1;
  }

  /**
   * End a batch operation and flush pending saves
   */
  async endBatch(): Promise<SaveResult> {
    if (this.batchDepth > 0) {
      this.batchDepth -= 1;
    }
    if (this.batchDepth === 0 && this.pendingSave) {
      this.pendingSave = false;
      return this.save();
    }
    return { success: true };
  }

  /**
   * Save if not in batch mode, otherwise mark as pending
   */
  private async saveMaybeDeferred(): Promise<SaveResult> {
    if (this.batchDepth > 0) {
      this.pendingSave = true;
      return { success: true };
    }
    return this.save();
  }

  /**
   * Adds a new node and saves to YAML
   */
  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = addNodeToDoc(this.doc, nodeData, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();

      // Save position and annotation data to annotations if provided
      const nodeId = nodeData.name || nodeData.id;
      if (nodeData.position && nodeId) {
        const annotationData: NodeAnnotationData | undefined = nodeData.extraData ? {
          icon: nodeData.extraData.topoViewerRole as string | undefined,
          iconColor: nodeData.extraData.iconColor as string | undefined,
          iconCornerRadius: nodeData.extraData.iconCornerRadius as number | undefined,
          interfacePattern: nodeData.extraData.interfacePattern as string | undefined
        } : undefined;
        await this.saveNodePosition(nodeId, nodeData.position, annotationData);
      }
    }
    return result;
  }

  /**
   * Updates an existing node and saves to YAML
   */
  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const topoObj = this.doc.toJS() as ClabTopology;
    const result = editNodeInDoc(this.doc, nodeData, topoObj, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();

      // If node was renamed, update annotations
      if (result.renamed) {
        await this.renameNodeAnnotations(result.renamed.oldId, result.renamed.newId);
      }
    }
    return result;
  }

  /**
   * Renames a node's annotations from old ID to new ID
   */
  private async renameNodeAnnotations(oldId: string, newId: string): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      if (annotations.nodeAnnotations) {
        const nodeAnnotation = annotations.nodeAnnotations.find(n => n.id === oldId);
        if (nodeAnnotation) {
          nodeAnnotation.id = newId;
        }
      }
      return annotations;
    });
  }

  /**
   * Removes a node and saves to YAML
   */
  async deleteNode(nodeId: string): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = deleteNodeFromDoc(this.doc, nodeId, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();

      // Also remove from annotations
      await this.removeNodeAnnotations(nodeId);
    }
    return result;
  }

  /**
   * Removes a node's annotations
   */
  private async removeNodeAnnotations(nodeId: string): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      if (annotations.nodeAnnotations) {
        annotations.nodeAnnotations = annotations.nodeAnnotations.filter(n => n.id !== nodeId);
      }
      return annotations;
    });
  }

  /**
   * Adds a new link and saves to YAML
   */
  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = addLinkToDoc(this.doc, linkData, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();
    }
    return result;
  }

  /**
   * Updates an existing link and saves to YAML
   */
  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = editLinkInDoc(this.doc, linkData, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();
    }
    return result;
  }

  /**
   * Removes a link and saves to YAML
   */
  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = deleteLinkFromDoc(this.doc, linkData, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();
    }
    return result;
  }

  /**
   * Saves the current document to disk (queued to prevent concurrent writes)
   */
  async save(): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }
    // Queue saves to prevent concurrent writes that corrupt the file
    this.saveQueue = this.saveQueue.then(async () => {
      if (!this.doc) {
        return { success: false, error: ERROR_SERVICE_NOT_INIT };
      }
      return writeYamlFile(this.doc, this.yamlFilePath, {
        fs: this.fs,
        setInternalUpdate: this.setInternalUpdate,
        logger: this.logger,
      });
    }).catch(() => ({ success: false, error: 'Save queue error' }));
    return this.saveQueue;
  }

  /**
   * Saves a node's position and optional annotation data to the annotations file
   */
  async saveNodePosition(
    nodeId: string,
    position: { x: number; y: number },
    annotationData?: NodeAnnotationData
  ): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
      if (existing) {
        existing.position = position;
        applyAnnotationData(existing, annotationData);
      } else {
        annotations.nodeAnnotations.push({ id: nodeId, position, ...buildAnnotationProps(annotationData) });
      }

      return annotations;
    });
  }

  /**
   * Saves multiple node positions to annotations file
   */
  async savePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<SaveResult> {
    if (!this.yamlFilePath) {
      return { success: false, error: ERROR_NO_YAML_PATH };
    }

    try {
      await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
        if (!annotations.nodeAnnotations) {
          annotations.nodeAnnotations = [];
        }

        for (const { id, position } of positions) {
          const existing = annotations.nodeAnnotations.find(n => n.id === id);
          if (existing) {
            existing.position = position;
          } else {
            annotations.nodeAnnotations.push({ id, position });
          }
        }

        return annotations;
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Migrates interface patterns to annotations for nodes that don't have them.
   */
  async migrateInterfacePatterns(
    migrations: Array<{ nodeId: string; interfacePattern: string }>
  ): Promise<void> {
    if (migrations.length === 0) return;

    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      if (!annotations.nodeAnnotations) {
        annotations.nodeAnnotations = [];
      }

      let modified = false;
      for (const { nodeId, interfacePattern } of migrations) {
        const existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
        if (existing) {
          // Only update if not already set
          if (!existing.interfacePattern) {
            existing.interfacePattern = interfacePattern;
            modified = true;
          }
        } else {
          // Create new annotation with just the interface pattern
          annotations.nodeAnnotations.push({ id: nodeId, interfacePattern });
          modified = true;
        }
      }

      if (modified) {
        this.logger.info(`[TopologyIO] Migrated interface patterns for ${migrations.length} nodes`);
      }

      return annotations;
    });
  }
}
