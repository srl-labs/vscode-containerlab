/**
 * TopologyIO - Orchestration layer for topology persistence
 *
 * Combines YAML AST editing with annotations management.
 * Provides batch operations and save queueing.
 * Used by both VS Code extension and dev server.
 */

import * as YAML from 'yaml';

import type { ClabTopology, NodeAnnotation, TopologyAnnotations } from '../types/topology';
import { applyInterfacePatternMigrations } from '../utilities';

import type { FileSystemAdapter, SaveResult, IOLogger} from './types';
import { noopLogger, ERROR_SERVICE_NOT_INIT, ERROR_NO_YAML_PATH } from './types';
import type { AnnotationsIO } from './AnnotationsIO';
import { writeYamlFile, parseYamlDocument } from './YamlDocumentIO';
import type { NodeSaveData, NodeAnnotationData} from './NodePersistenceIO';
import { addNodeToDoc, editNodeInDoc, deleteNodeFromDoc, applyAnnotationData } from './NodePersistenceIO';
import type { LinkSaveData} from './LinkPersistenceIO';
import { addLinkToDoc, editLinkInDoc, deleteLinkFromDoc } from './LinkPersistenceIO';

// Types are available from ./NodePersistenceIO and ./LinkPersistenceIO directly

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

      // Save icon/annotation data if provided
      const nodeId = result.renamed?.newId || nodeData.name || nodeData.id;
      if (nodeData.extraData && nodeId) {
        const annotationData: NodeAnnotationData = {
          icon: nodeData.extraData.topoViewerRole as string | undefined,
          iconColor: nodeData.extraData.iconColor as string | undefined,
          iconCornerRadius: nodeData.extraData.iconCornerRadius as number | undefined,
          interfacePattern: nodeData.extraData.interfacePattern as string | undefined
        };
        // Only save if there's actual annotation data to save
        if (annotationData.icon || annotationData.iconColor || annotationData.iconCornerRadius !== undefined || annotationData.interfacePattern) {
          await this.saveNodeAnnotations(nodeId, annotationData);
        }
      }
    }
    return result;
  }

  /**
   * Helper to find or create a node annotation entry
   */
  private ensureNodeAnnotation(
    annotations: TopologyAnnotations,
    nodeId: string
  ): NodeAnnotation {
    if (!annotations.nodeAnnotations) {
      annotations.nodeAnnotations = [];
    }

    let existing = annotations.nodeAnnotations.find(n => n.id === nodeId);
    if (!existing) {
      existing = { id: nodeId };
      annotations.nodeAnnotations.push(existing);
    }
    return existing;
  }

  /**
   * Saves annotation data for a node (icon, color, etc.) without changing position
   */
  private async saveNodeAnnotations(nodeId: string, annotationData: NodeAnnotationData): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      const node = this.ensureNodeAnnotation(annotations, nodeId);
      applyAnnotationData(node, annotationData);
      return annotations;
    });
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

    // Try to delete as a regular YAML node first
    const result = deleteNodeFromDoc(this.doc, nodeId, this.logger);
    if (result.success) {
      await this.saveMaybeDeferred();
      // Also remove from annotations
      await this.removeNodeAnnotations(nodeId);
      return result;
    }

    // If not found as a regular node, try to delete as a network node (cloud node)
    // Network nodes (host, vxlan, dummy, etc.) are represented as links, not nodes
    const networkResult = this.deleteNetworkNode(nodeId);
    if (networkResult.success) {
      await this.saveMaybeDeferred();
    }
    // Always try to remove network node annotations, even if no links were found.
    // Network nodes can exist in annotations before any links are created.
    await this.removeNetworkNodeAnnotations(nodeId);
    // Return success if either links were deleted OR annotations were potentially removed
    return { success: true };
  }

  /**
   * Deletes a network node by removing all links that reference it.
   * Network nodes have IDs like:
   * - host:eth0 (from host-interface property)
   * - vxlan:vxlan0, vxlan-stitch:vxlan0
   * - mgmt-net:net0
   * - macvlan:0
   * - dummy0
   */
  private deleteNetworkNode(nodeId: string): SaveResult {
    if (!this.doc) {
      return { success: false, error: ERROR_SERVICE_NOT_INIT };
    }

    const linksSeq = this.doc.getIn(['topology', 'links'], true) as YAML.YAMLSeq | undefined;
    if (!linksSeq || !YAML.isSeq(linksSeq)) {
      return { success: false, error: `Network node '${nodeId}' not found (no links in topology)` };
    }

    const initialCount = linksSeq.items.length;
    linksSeq.items = linksSeq.items.filter(item => !this.linkMatchesNetworkNode(item, nodeId));

    const deleted = initialCount - linksSeq.items.length;
    if (deleted === 0) {
      return { success: false, error: `Network node '${nodeId}' not found in topology links` };
    }

    this.logger.info(`[SaveTopology] Deleted ${deleted} links for network node: ${nodeId}`);
    return { success: true };
  }

  /**
   * Checks if a link item matches a network node ID.
   */
  private linkMatchesNetworkNode(item: unknown, nodeId: string): boolean {
    if (!YAML.isMap(item)) return false;
    const linkMap = item as YAML.YAMLMap;

    const linkType = linkMap.get('type');
    if (!linkType) return false;
    const typeStr = YAML.isScalar(linkType) ? String(linkType.value) : String(linkType);

    const expectedId = this.buildExpectedCloudNodeId(typeStr, linkMap, nodeId);
    return expectedId === nodeId;
  }

  /**
   * Builds the expected cloud node ID for a link based on its type.
   */
  private buildExpectedCloudNodeId(typeStr: string, linkMap: YAML.YAMLMap, nodeId: string): string | null {
    if (typeStr === 'host') {
      const hostInterface = linkMap.get('host-interface');
      if (hostInterface) {
        const ifaceStr = YAML.isScalar(hostInterface) ? String(hostInterface.value) : String(hostInterface);
        return `host:${ifaceStr}`;
      }
      return null;
    }

    // For counter-based types, match by prefix
    const prefixMatches: Record<string, string> = {
      'mgmt-net': 'mgmt-net:',
      'macvlan': 'macvlan:',
      'vxlan': 'vxlan:',
      'vxlan-stitch': 'vxlan-stitch:',
      'dummy': 'dummy'
    };

    const prefix = prefixMatches[typeStr];
    if (prefix && nodeId.startsWith(prefix)) {
      return nodeId;
    }

    return null;
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
   * Removes a network node's annotations
   */
  private async removeNetworkNodeAnnotations(nodeId: string): Promise<void> {
    await this.annotationsIO.modifyAnnotations(this.yamlFilePath, annotations => {
      if (annotations.networkNodeAnnotations) {
        annotations.networkNodeAnnotations = annotations.networkNodeAnnotations.filter(n => n.id !== nodeId);
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
      const node = this.ensureNodeAnnotation(annotations, nodeId);
      node.position = position;
      applyAnnotationData(node, annotationData);
      return annotations;
    });
  }

  /**
   * Saves multiple node positions to annotations file.
   * Network nodes are saved to networkNodeAnnotations, regular nodes to nodeAnnotations.
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
          // Check if this is a network node (exists in networkNodeAnnotations)
          const networkNode = annotations.networkNodeAnnotations?.find(n => n.id === id);
          if (networkNode) {
            // Update position in networkNodeAnnotations
            networkNode.position = position;
          } else {
            // Update or add to nodeAnnotations
            const existing = annotations.nodeAnnotations.find(n => n.id === id);
            if (existing) {
              existing.position = position;
            } else {
              annotations.nodeAnnotations.push({ id, position });
            }
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
      const result = applyInterfacePatternMigrations(annotations, migrations);

      if (result.modified) {
        this.logger.info(`[TopologyIO] Migrated interface patterns for ${migrations.length} nodes`);
      }

      return result.annotations;
    });
  }
}
