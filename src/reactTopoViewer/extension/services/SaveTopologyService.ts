/**
 * SaveTopologyService - Orchestrates saving topology changes to YAML files
 *
 * This service is a thin wrapper around the shared TopologyIO module,
 * providing a singleton instance for the VS Code extension with proper logging.
 */

import * as YAML from 'yaml';
import { TopologyIO, NodeSaveData, LinkSaveData, SaveResult, NodeFsAdapter } from '../../shared/io';
import { annotationsManager } from './AnnotationsManager';
import { log } from './logger';

// Re-export types for external use
export type { NodeSaveData } from '../../shared/io';
export type { LinkSaveData } from '../../shared/io';
export type { SaveResult } from '../../shared/io';

// Create a shared fs adapter for the extension
const nodeFsAdapter = new NodeFsAdapter();

// Create logger adapter for extension
const extensionLogger = {
  debug: log.debug.bind(log),
  info: log.info.bind(log),
  warn: log.warn.bind(log),
  error: log.error.bind(log),
};

// Error messages
const ERROR_NOT_INITIALIZED = 'Service not initialized';

/**
 * Service for saving topology changes to YAML files
 *
 * Delegates to TopologyIO for unified orchestration:
 * - Save queueing (prevents concurrent writes)
 * - Batch deferral (groups rapid edits)
 * - Content deduplication (skips no-op writes)
 * - Annotation lifecycle management (auto-rename, auto-delete)
 */
export class SaveTopologyService {
  private topologyIO: TopologyIO | null = null;

  /**
   * Initializes the service with a YAML document
   */
  initialize(
    doc: YAML.Document.Parsed,
    yamlFilePath: string,
    setInternalUpdate?: (updating: boolean) => void
  ): void {
    this.topologyIO = new TopologyIO({
      fs: nodeFsAdapter,
      annotationsIO: annotationsManager.getAnnotationsIO(),
      setInternalUpdate,
      logger: extensionLogger,
    });
    this.topologyIO.initialize(doc, yamlFilePath);
  }

  /**
   * Checks if the service is initialized
   */
  isInitialized(): boolean {
    return this.topologyIO?.isInitialized() ?? false;
  }

  /**
   * Gets the YAML file path
   */
  getYamlFilePath(): string {
    return this.topologyIO?.getYamlFilePath() ?? '';
  }

  /**
   * Gets the YAML document
   */
  getDocument(): YAML.Document.Parsed | null {
    return this.topologyIO?.getDocument() ?? null;
  }

  /**
   * Begin a batch operation (defers saves until endBatch)
   */
  beginBatch(): void {
    this.topologyIO?.beginBatch();
  }

  /**
   * End a batch operation and flush pending saves
   */
  async endBatch(): Promise<SaveResult> {
    return this.topologyIO?.endBatch() ?? { success: true };
  }

  /**
   * Adds a new node and saves to YAML
   */
  async addNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.addNode(nodeData);
  }

  /**
   * Updates an existing node and saves to YAML
   */
  async editNode(nodeData: NodeSaveData): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.editNode(nodeData);
  }

  /**
   * Removes a node and saves to YAML
   */
  async deleteNode(nodeId: string): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.deleteNode(nodeId);
  }

  /**
   * Adds a new link and saves to YAML
   */
  async addLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.addLink(linkData);
  }

  /**
   * Updates an existing link and saves to YAML
   */
  async editLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.editLink(linkData);
  }

  /**
   * Removes a link and saves to YAML
   */
  async deleteLink(linkData: LinkSaveData): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.deleteLink(linkData);
  }

  /**
   * Saves the current document to disk (queued to prevent concurrent writes)
   */
  async save(): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.save();
  }

  /**
   * Saves node positions to annotations file
   */
  async savePositions(positions: Array<{ id: string; position: { x: number; y: number } }>): Promise<SaveResult> {
    if (!this.topologyIO) {
      return { success: false, error: ERROR_NOT_INITIALIZED };
    }
    return this.topologyIO.savePositions(positions);
  }

  /**
   * Saves a single node's position and annotation data
   */
  async saveNodePosition(
    nodeId: string,
    position: { x: number; y: number },
    annotationData?: {
      icon?: string;
      iconColor?: string;
      iconCornerRadius?: number;
      interfacePattern?: string;
    }
  ): Promise<void> {
    if (!this.topologyIO) {
      return;
    }
    return this.topologyIO.saveNodePosition(nodeId, position, annotationData);
  }

  /**
   * Migrates interface patterns to annotations for nodes that don't have them.
   */
  async migrateInterfacePatterns(
    migrations: Array<{ nodeId: string; interfacePattern: string }>
  ): Promise<void> {
    if (!this.topologyIO) {
      return;
    }
    return this.topologyIO.migrateInterfacePatterns(migrations);
  }
}

// Singleton instance
export const saveTopologyService = new SaveTopologyService();
