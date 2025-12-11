/**
 * SaveTopologyService - Orchestrates saving topology changes to YAML files
 *
 * This service manages the persistence of node and link changes from the React TopoViewer
 * back to the Containerlab YAML configuration file. It delegates to specialized
 * persistence modules for YAML handling, node operations, and link operations.
 */

import * as YAML from 'yaml';
import { ClabTopology } from '../../shared/types/topology';
import { annotationsManager } from './AnnotationsManager';

import {
  SaveResult,
  writeYamlFile,
  ERROR_SERVICE_NOT_INIT,
  ERROR_NO_YAML_PATH
} from '../persistence/YamlDocStore';

import {
  NodeSaveData,
  addNode as addNodeToDoc,
  editNode as editNodeInDoc,
  deleteNode as deleteNodeFromDoc
} from '../persistence/NodePersistence';

import {
  LinkSaveData,
  addLink as addLinkToDoc,
  editLink as editLinkInDoc,
  deleteLink as deleteLinkFromDoc
} from '../persistence/LinkPersistence';

// Re-export types for external use
export type { NodeSaveData } from '../persistence/NodePersistence';
export type { LinkSaveData } from '../persistence/LinkPersistence';
export type { SaveResult } from '../persistence/YamlDocStore';

/**
 * Service for saving topology changes to YAML files
 */
export class SaveTopologyService {
  private doc: YAML.Document.Parsed | null = null;
  private yamlFilePath: string = '';
  private setInternalUpdate?: (updating: boolean) => void;
  private batchDepth = 0;
  private pendingSave = false;

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
   * Initializes the service with a YAML document
   */
  initialize(
    doc: YAML.Document.Parsed,
    yamlFilePath: string,
    setInternalUpdate?: (updating: boolean) => void
  ): void {
    this.doc = doc;
    this.yamlFilePath = yamlFilePath;
    this.setInternalUpdate = setInternalUpdate;
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.doc !== null && this.yamlFilePath !== '';
  }

  /**
   * Adds a new node and saves to YAML
   */
  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = await addNodeToDoc(this.doc, nodeData, this.yamlFilePath);
    if (result.success) {
      await this.saveMaybeDeferred();
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
    const result = editNodeInDoc(this.doc, nodeData, topoObj);
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
    const annotations = await annotationsManager.loadAnnotations(this.yamlFilePath);
    if (annotations.nodeAnnotations) {
      const nodeAnnotation = annotations.nodeAnnotations.find(n => n.id === oldId);
      if (nodeAnnotation) {
        nodeAnnotation.id = newId;
        await annotationsManager.saveAnnotations(this.yamlFilePath, annotations);
      }
    }
  }

  /**
   * Removes a node and saves to YAML
   */
  async deleteNode(nodeId: string): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = deleteNodeFromDoc(this.doc, nodeId);
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
    const annotations = await annotationsManager.loadAnnotations(this.yamlFilePath);
    if (annotations.nodeAnnotations) {
      annotations.nodeAnnotations = annotations.nodeAnnotations.filter(n => n.id !== nodeId);
      await annotationsManager.saveAnnotations(this.yamlFilePath, annotations);
    }
  }

  /**
   * Adds a new link and saves to YAML
   */
  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const result = addLinkToDoc(this.doc, linkData);
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

    const result = editLinkInDoc(this.doc, linkData);
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

    const result = deleteLinkFromDoc(this.doc, linkData);
    if (result.success) {
      await this.saveMaybeDeferred();
    }
    return result;
  }

  /**
   * Saves the current document to disk
   */
  async save(): Promise<SaveResult> {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }
    return writeYamlFile(this.doc, this.yamlFilePath, this.setInternalUpdate);
  }

  /**
   * Saves node positions to annotations file
   */
  async savePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<SaveResult> {
    if (!this.yamlFilePath) {
      return { success: false, error: ERROR_NO_YAML_PATH };
    }

    try {
      const annotations = await annotationsManager.loadAnnotations(this.yamlFilePath);

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

      await annotationsManager.saveAnnotations(this.yamlFilePath, annotations);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

// Singleton instance
export const saveTopologyService = new SaveTopologyService();
