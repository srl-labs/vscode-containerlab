/**
 * MessageHandlerBase - Shared message routing logic
 *
 * This class contains the core routing logic used by both the VS Code extension's
 * MessageRouter and the dev mock's MessageHandler. The actual service implementations
 * are injected via the MessageHandlerServices interface.
 */

import { getCommandCategory, isLogCommand } from './CommandRegistry';
import {
  MessageHandlerServices,
  WebviewMessage,
  NodePositionData,
  NodeSaveData,
  LinkSaveData,
} from './MessageServiceInterfaces';
import { NetworkNodeAnnotation } from '../types/topology';
import { convertEditorDataToYaml } from '../utilities/nodeEditorConversions';

// ============================================================================
// MessageHandlerBase Class
// ============================================================================

/**
 * Base class for message handling with shared routing logic.
 * Subclasses provide environment-specific service implementations.
 */
export class MessageHandlerBase {
  protected services: MessageHandlerServices;

  constructor(services: MessageHandlerServices) {
    this.services = services;
  }

  // --------------------------------------------------------------------------
  // Main Entry Point
  // --------------------------------------------------------------------------

  /**
   * Handle a message from the webview.
   * @returns true if the message was handled, false otherwise
   */
  async handleMessage(message: WebviewMessage): Promise<boolean> {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const command = message.command || message.type || '';

    // Skip log messages - let caller handle them
    if (isLogCommand(command)) {
      return false;
    }

    return this.routeByCategory(getCommandCategory(command), command, message);
  }

  /**
   * Route message to handler based on command category
   */
  private async routeByCategory(
    category: string | null,
    command: string,
    message: WebviewMessage
  ): Promise<boolean> {
    switch (category) {
      case 'batch':
        return this.handleBatchCommand(command);
      case 'lifecycle':
        await this.handleLifecycleCommand(command);
        return true;
      case 'node':
        return this.handleNodeCommand(command, message);
      case 'interface':
        await this.handleInterfaceCommand(command, message);
        return true;
      case 'editor':
        return this.handleEditorCommand(command, message);
      case 'panel':
        return this.handlePanelCommand(command, message);
      case 'annotation':
        return this.handleAnnotationCommand(command, message);
      case 'customNode':
        return this.handleCustomNodeCommand(command, message);
      case 'clipboard':
        return this.handleClipboardCommand(command, message);
      case 'misc':
        return this.handleMiscCommand(command, message);
      default:
        return false;
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  protected getNodeNamePayload(message: WebviewMessage): string {
    const raw = message.nodeName ?? message.payload;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).nodeName === 'string') {
      return (raw as Record<string, unknown>).nodeName as string;
    }
    return '';
  }

  protected getNodeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as Record<string, unknown>) || message;
    const nodeId = payload?.nodeId ?? payload?.id;
    return typeof nodeId === 'string' ? nodeId : undefined;
  }

  protected getEdgeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as Record<string, unknown>) || message;
    const edgeId = payload?.edgeId ?? payload?.id;
    return typeof edgeId === 'string' ? edgeId : undefined;
  }

  protected isNetworkNode(nodeId: string): boolean {
    const node = this.services.context.findCachedNode(nodeId);
    return node?.data?.topoViewerRole === 'cloud';
  }

  protected getNetworkType(nodeId: string): NetworkNodeAnnotation['type'] {
    const cachedNode = this.services.context.findCachedNode(nodeId);
    const extraData = cachedNode?.data?.extraData as { kind?: string } | undefined;
    return (extraData?.kind || 'host') as NetworkNodeAnnotation['type'];
  }

  // --------------------------------------------------------------------------
  // Batch Commands
  // --------------------------------------------------------------------------

  protected async handleBatchCommand(command: string): Promise<boolean> {
    if (command === 'begin-graph-batch') {
      this.services.persistence.beginBatch();
      this.services.logger.info('[MessageHandler] Started graph batch');
      return true;
    }
    if (command === 'end-graph-batch') {
      const result = await this.services.persistence.endBatch();
      if (!result.success) {
        this.services.logger.error(`[MessageHandler] Failed to flush graph batch: ${result.error}`);
      } else {
        this.services.logger.info('[MessageHandler] Finished graph batch');
      }
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Node Commands (SSH, Logs, Shell)
  // --------------------------------------------------------------------------

  protected async handleNodeCommand(command: string, message: WebviewMessage): Promise<boolean> {
    const nodeName = this.getNodeNamePayload(message);
    const { result, error } = await this.services.nodeCommands.handleNodeCommand(command, nodeName);
    if (error) this.services.logger.error(`[MessageHandler] ${error}`);
    else if (result) this.services.logger.info(`[MessageHandler] ${result}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Interface Commands (Capture)
  // --------------------------------------------------------------------------

  protected async handleInterfaceCommand(command: string, message: WebviewMessage): Promise<void> {
    const payload = message as unknown as { nodeName?: string; interfaceName?: string };
    if (!payload.nodeName || !payload.interfaceName) {
      this.services.logger.warn(`[MessageHandler] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const { result, error } = await this.services.nodeCommands.handleInterfaceCommand(
      command,
      { nodeName: payload.nodeName, interfaceName: payload.interfaceName }
    );
    if (error) this.services.logger.error(`[MessageHandler] ${error}`);
    else if (result) this.services.logger.info(`[MessageHandler] ${result}`);
  }

  // --------------------------------------------------------------------------
  // Lifecycle Commands (Deploy, Destroy, Redeploy)
  // --------------------------------------------------------------------------

  protected async handleLifecycleCommand(command: string): Promise<void> {
    const { yamlFilePath } = this.services.context;
    if (!yamlFilePath) {
      this.services.logger.warn(`[MessageHandler] Cannot run ${command}: no YAML path available`);
      return;
    }
    const { result, error } = await this.services.lifecycle.handleLifecycleCommand(command, yamlFilePath);
    if (error) {
      this.services.logger.error(`[MessageHandler] ${error}`);
    } else if (result) {
      this.services.logger.info(`[MessageHandler] ${result}`);
    }
  }

  // --------------------------------------------------------------------------
  // Editor Commands (Create/Save Node, Create/Save Link, Lab Settings)
  // --------------------------------------------------------------------------

  protected async handleEditorCommand(command: string, message: WebviewMessage): Promise<boolean> {
    switch (command) {
      case 'create-node':
        await this.handleCreateNode(message);
        return true;
      case 'save-node-editor':
      case 'apply-node-editor':
        await this.handleSaveNodeEditor(message);
        return true;
      case 'undo-rename-node':
        await this.handleUndoRenameNode(message);
        return true;
      case 'create-link':
        await this.handleCreateLink(message);
        return true;
      case 'save-link-editor':
      case 'apply-link-editor':
        await this.handleSaveLinkEditor(message);
        return true;
      case 'save-lab-settings':
        await this.handleSaveLabSettings(message);
        return true;
      default:
        return false;
    }
  }

  protected async handleCreateNode(message: WebviewMessage): Promise<void> {
    const { context, persistence, logger } = this.services;

    logger.info(`[MessageHandler] handleCreateNode called, isViewMode=${context.isViewMode}, isInitialized=${persistence.isInitialized()}`);

    if (context.isViewMode) {
      logger.warn('[MessageHandler] Cannot create node: in view mode');
      return;
    }

    if (!persistence.isInitialized()) {
      logger.warn('[MessageHandler] Cannot create node: service not initialized');
      return;
    }

    const msg = message as unknown as { nodeId?: string; nodeData?: Record<string, unknown>; position?: { x: number; y: number } };
    if (!msg.nodeData) {
      logger.warn('[MessageHandler] Cannot create node: no node data provided');
      return;
    }

    logger.info(`[MessageHandler] Creating node: ${msg.nodeId}`);

    // Extract icon data from top level of nodeData (set by custom node templates)
    const iconData = {
      topoViewerRole: msg.nodeData.topoViewerRole as string | undefined,
      iconColor: msg.nodeData.iconColor as string | undefined,
      iconCornerRadius: msg.nodeData.iconCornerRadius as number | undefined
    };

    const nodeData: NodeSaveData = {
      id: msg.nodeId || String(msg.nodeData.id || ''),
      name: String(msg.nodeData.name || msg.nodeData.id || ''),
      extraData: {
        ...(msg.nodeData.extraData as NodeSaveData['extraData']),
        ...(iconData.topoViewerRole && { topoViewerRole: iconData.topoViewerRole }),
        ...(iconData.iconColor && { iconColor: iconData.iconColor }),
        ...(iconData.iconCornerRadius !== undefined && { iconCornerRadius: iconData.iconCornerRadius })
      },
      position: msg.position
    };

    const result = await persistence.addNode(nodeData);
    if (result.success) {
      logger.info(`[MessageHandler] Created node: ${nodeData.name}`);
    } else {
      logger.error(`[MessageHandler] Failed to create node: ${result.error}`);
    }
  }

  protected async handleSaveNodeEditor(message: WebviewMessage): Promise<void> {
    const { context, persistence, messaging, logger } = this.services;

    if (context.isViewMode || !persistence.isInitialized()) {
      logger.warn('[MessageHandler] Cannot save node: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { nodeData?: Record<string, unknown> };
    if (!msg.nodeData) {
      logger.warn('[MessageHandler] Cannot save node: no node data provided');
      return;
    }

    const extraData = convertEditorDataToYaml(msg.nodeData);

    // Include icon data for annotation persistence
    if (msg.nodeData.icon) {
      extraData.topoViewerRole = String(msg.nodeData.icon);
    }
    if (msg.nodeData.iconColor) {
      extraData.iconColor = String(msg.nodeData.iconColor);
    }
    if (msg.nodeData.iconCornerRadius !== undefined) {
      extraData.iconCornerRadius = Number(msg.nodeData.iconCornerRadius);
    }

    const nodeData: NodeSaveData = {
      id: String(msg.nodeData.id || ''),
      name: String(msg.nodeData.name || msg.nodeData.id || ''),
      extraData
    };

    logger.info(`[MessageHandler] Saving node - id: "${nodeData.id}", name: "${nodeData.name}"`);

    const result = await persistence.editNode(nodeData);
    if (result.success) {
      const renameInfo = result.renamed ? ` (renamed from ${result.renamed.oldId})` : '';
      logger.info(`[MessageHandler] Saved node: ${nodeData.name}${renameInfo}`);

      // If a node was renamed, send targeted message for in-place update
      if (result.renamed) {
        logger.info(`[MessageHandler] Node renamed from "${result.renamed.oldId}" to "${result.renamed.newId}"`);
        messaging.postMessage({
          type: 'node-renamed',
          data: { oldId: result.renamed.oldId, newId: result.renamed.newId }
        });
      }

      // Send node-data-updated message
      const finalNodeId = result.renamed?.newId || nodeData.id;
      messaging.postMessage({
        type: 'node-data-updated',
        data: { nodeId: finalNodeId, extraData }
      });
    } else {
      logger.error(`[MessageHandler] Failed to save node: ${result.error}`);
    }
  }

  protected async handleUndoRenameNode(message: WebviewMessage): Promise<void> {
    const { context, persistence, messaging, logger } = this.services;

    if (context.isViewMode || !persistence.isInitialized()) {
      logger.warn('[MessageHandler] Cannot undo rename: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as {
      currentName?: string;
      targetName?: string;
      nodeData?: Record<string, unknown>;
    };

    if (!msg.currentName || !msg.targetName || !msg.nodeData) {
      logger.warn('[MessageHandler] Cannot undo rename: missing data');
      return;
    }

    const { currentName, targetName, nodeData } = msg;
    logger.info(`[MessageHandler] Undo rename: ${currentName} -> ${targetName}`);

    const extraData = convertEditorDataToYaml(nodeData);

    const saveData: NodeSaveData = {
      id: currentName,
      name: targetName,
      extraData
    };

    const result = await persistence.editNode(saveData);
    if (result.success) {
      logger.info(`[MessageHandler] Undo rename successful: ${currentName} -> ${targetName}`);

      if (result.renamed) {
        logger.info(`[MessageHandler] Undo rename: "${result.renamed.oldId}" -> "${result.renamed.newId}"`);
        messaging.postMessage({
          type: 'node-renamed',
          data: { oldId: result.renamed.oldId, newId: result.renamed.newId }
        });
      }

      const finalNodeId = result.renamed?.newId || targetName;
      messaging.postMessage({
        type: 'node-data-updated',
        data: { nodeId: finalNodeId, extraData }
      });
    } else {
      logger.error(`[MessageHandler] Failed to undo rename: ${result.error}`);
    }
  }

  protected async handleCreateLink(message: WebviewMessage): Promise<void> {
    const { context, persistence, logger } = this.services;

    if (context.isViewMode || !persistence.isInitialized()) {
      logger.warn('[MessageHandler] Cannot create link: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { linkData?: Record<string, unknown> };
    if (!msg.linkData) {
      logger.warn('[MessageHandler] Cannot create link: no link data provided');
      return;
    }

    logger.info(`[MessageHandler] Received link data: ${JSON.stringify(msg.linkData)}`);

    const linkData: LinkSaveData = {
      id: String(msg.linkData.id || ''),
      source: String(msg.linkData.source || ''),
      target: String(msg.linkData.target || ''),
      sourceEndpoint: String(msg.linkData.sourceEndpoint || ''),
      targetEndpoint: String(msg.linkData.targetEndpoint || ''),
      extraData: msg.linkData.extraData as LinkSaveData['extraData']
    };

    logger.info(`[MessageHandler] Creating link with endpoints: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`);

    const result = await persistence.addLink(linkData);
    if (result.success) {
      logger.info(`[MessageHandler] Created link: ${linkData.source} <-> ${linkData.target}`);
    } else {
      logger.error(`[MessageHandler] Failed to create link: ${result.error}`);
    }
  }

  protected async handleSaveLinkEditor(message: WebviewMessage): Promise<void> {
    const { context, persistence, logger } = this.services;

    if (context.isViewMode || !persistence.isInitialized()) {
      logger.warn('[MessageHandler] Cannot save link: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { linkData?: Record<string, unknown> };
    if (!msg.linkData) {
      logger.warn('[MessageHandler] Cannot save link: no link data provided');
      return;
    }

    const extraData: LinkSaveData['extraData'] = {
      extType: msg.linkData.type as string | undefined,
      extMtu: msg.linkData.mtu as string | number | undefined,
      extSourceMac: msg.linkData.sourceMac as string | undefined,
      extTargetMac: msg.linkData.targetMac as string | undefined,
      extVars: msg.linkData.vars as Record<string, unknown> | undefined,
      extLabels: msg.linkData.labels as Record<string, unknown> | undefined,
    };

    const linkData: LinkSaveData = {
      id: String(msg.linkData.id || ''),
      source: String(msg.linkData.source || ''),
      target: String(msg.linkData.target || ''),
      sourceEndpoint: String(msg.linkData.sourceEndpoint || ''),
      targetEndpoint: String(msg.linkData.targetEndpoint || ''),
      extraData,
      originalSource: msg.linkData.originalSource as string | undefined,
      originalTarget: msg.linkData.originalTarget as string | undefined,
      originalSourceEndpoint: msg.linkData.originalSourceEndpoint as string | undefined,
      originalTargetEndpoint: msg.linkData.originalTargetEndpoint as string | undefined,
    };

    logger.info(`[MessageHandler] Saving link with extraData: ${JSON.stringify(extraData)}`);

    const result = await persistence.editLink(linkData);
    if (result.success) {
      logger.info(`[MessageHandler] Saved link: ${linkData.source} <-> ${linkData.target}`);
    } else {
      logger.error(`[MessageHandler] Failed to save link: ${result.error}`);
    }
  }

  protected async handleSaveLabSettings(message: WebviewMessage): Promise<void> {
    const { context, labSettings, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.error('[MessageHandler] handleSaveLabSettings: No YAML file path');
      return;
    }

    try {
      const msgData = message as Record<string, unknown>;
      const settings = (msgData.settings as { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }) || {};

      logger.info(`[MessageHandler] Saving lab settings: ${JSON.stringify(settings)}`);

      await labSettings.saveLabSettings(context.yamlFilePath, settings);
      logger.info('[MessageHandler] Lab settings saved successfully');
    } catch (err) {
      logger.error(`[MessageHandler] Error saving lab settings: ${err}`);
    }
  }

  // --------------------------------------------------------------------------
  // Panel Commands
  // --------------------------------------------------------------------------

  protected async handlePanelCommand(command: string, message: WebviewMessage): Promise<boolean> {
    switch (command) {
      case 'panel-node-info':
        this.handleNodePanelAction(message, 'node-info');
        return true;
      case 'panel-edit-node':
        this.handleNodePanelAction(message, 'edit-node');
        return true;
      case 'panel-delete-node':
        await this.handleDeleteNode(message);
        return true;
      case 'panel-start-link':
        this.handleStartLink(message);
        return true;
      case 'panel-link-info':
        this.handleLinkPanelAction(message, 'link-info');
        return true;
      case 'panel-edit-link':
        this.handleLinkPanelAction(message, 'edit-link');
        return true;
      case 'panel-delete-link':
        await this.handleDeleteLink(message);
        return true;
      default:
        return false;
    }
  }

  protected handleNodePanelAction(message: WebviewMessage, action: 'node-info' | 'edit-node'): void {
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;
    const node = this.services.context.findCachedNode(nodeId);
    this.services.messaging.postPanelAction(action, { nodeId, nodeData: node?.data });
  }

  protected handleLinkPanelAction(message: WebviewMessage, action: 'link-info' | 'edit-link'): void {
    const edgeId = this.getEdgeIdFromMessage(message);
    if (!edgeId) return;
    const edge = this.services.context.findCachedEdge(edgeId);
    this.services.messaging.postPanelAction(action, { edgeId, edgeData: edge?.data });
  }

  protected handleStartLink(message: WebviewMessage): void {
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;
    this.services.messaging.postPanelAction('start-link', { nodeId });
  }

  protected async handleDeleteNode(message: WebviewMessage): Promise<void> {
    const { context, persistence, messaging, logger } = this.services;
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;

    // Try to delete from YAML if in edit mode
    if (!context.isViewMode && persistence.isInitialized()) {
      if (this.isNetworkNode(nodeId)) {
        // Network nodes are defined by links - delete connected links
        await this.deleteConnectedLinks(nodeId);
      } else {
        const result = await persistence.deleteNode(nodeId);
        if (!result.success) {
          logger.error(`[MessageHandler] Failed to delete node from YAML: ${result.error}`);
        }
      }
    }

    // Remove from annotations
    await this.removeNodeFromAnnotations(nodeId);

    // Update cached elements
    const updatedElements = context.getCachedElements().filter(el => {
      const data = el.data || {};
      if (el.group === 'nodes') return (data as Record<string, unknown>)?.id !== nodeId;
      if (el.group === 'edges') {
        const source = (data as Record<string, unknown>)?.source;
        const target = (data as Record<string, unknown>)?.target;
        return source !== nodeId && target !== nodeId;
      }
      return true;
    });
    context.updateCachedElements(updatedElements);
    messaging.postPanelAction('delete-node', { nodeId });
  }

  protected async deleteConnectedLinks(networkNodeId: string): Promise<void> {
    const { context, persistence, logger } = this.services;
    const connectedEdges = context.getCachedElements().filter(el => {
      if (el.group !== 'edges') return false;
      const data = el.data || {};
      const source = (data as Record<string, unknown>)?.source;
      const target = (data as Record<string, unknown>)?.target;
      return source === networkNodeId || target === networkNodeId;
    });

    for (const edge of connectedEdges) {
      const data = edge.data as Record<string, unknown>;
      const linkData: LinkSaveData = {
        id: data.id as string,
        source: data.source as string,
        target: data.target as string,
        sourceEndpoint: data.sourceEndpoint as string | undefined,
        targetEndpoint: data.targetEndpoint as string | undefined
      };
      const result = await persistence.deleteLink(linkData);
      if (!result.success) {
        logger.error(`[MessageHandler] Failed to delete link ${linkData.id}: ${result.error}`);
      } else {
        logger.info(`[MessageHandler] Deleted link connected to network node: ${linkData.id}`);
      }
    }
  }

  protected async removeNodeFromAnnotations(nodeId: string): Promise<void> {
    const { context, annotations, logger } = this.services;
    if (!context.yamlFilePath) return;

    try {
      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        // Remove from nodeAnnotations
        const existingNodes = ann.nodeAnnotations || [];
        ann.nodeAnnotations = existingNodes.filter((n: { id: string }) => n.id !== nodeId);

        // Remove from networkNodeAnnotations
        const existingNetworks = ann.networkNodeAnnotations || [];
        ann.networkNodeAnnotations = existingNetworks.filter((n: { id: string }) => n.id !== nodeId);

        return ann;
      });
    } catch (err) {
      logger.warn(`[MessageHandler] Failed to prune annotations for node ${nodeId}: ${err}`);
    }
  }

  protected async handleDeleteLink(message: WebviewMessage): Promise<void> {
    const { context, persistence, messaging, logger } = this.services;
    const edgeId = this.getEdgeIdFromMessage(message);
    if (!edgeId) return;

    const msgLinkData = (message as unknown as { linkData?: Record<string, unknown> }).linkData;
    const edge = context.findCachedEdge(edgeId);
    const edgeData = msgLinkData || (edge?.data as Record<string, unknown>);

    if (edgeData && !context.isViewMode && persistence.isInitialized()) {
      const linkData: LinkSaveData = {
        id: edgeId,
        source: String(edgeData.source || ''),
        target: String(edgeData.target || ''),
        sourceEndpoint: String(edgeData.sourceEndpoint || ''),
        targetEndpoint: String(edgeData.targetEndpoint || '')
      };
      logger.info(`[MessageHandler] Deleting link: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`);
      const result = await persistence.deleteLink(linkData);
      if (!result.success) {
        logger.error(`[MessageHandler] Failed to delete link from YAML: ${result.error}`);
      }
    }

    // Update cached elements
    const updatedElements = context.getCachedElements().filter(
      el => !(el.group === 'edges' && (el.data as Record<string, unknown>)?.id === edgeId)
    );
    context.updateCachedElements(updatedElements);
    messaging.postPanelAction('delete-link', { edgeId });
  }

  // --------------------------------------------------------------------------
  // Annotation Commands
  // --------------------------------------------------------------------------

  protected async handleAnnotationCommand(command: string, message: WebviewMessage): Promise<boolean> {
    switch (command) {
      case 'save-node-positions':
        if (message.positions) {
          await this.handleSaveNodePositions(message.positions);
        }
        return true;
      case 'save-network-position':
        await this.handleSaveNetworkPosition(message);
        return true;
      case 'save-free-text-annotations':
        await this.handleSaveFreeTextAnnotations(message);
        return true;
      case 'save-free-shape-annotations':
        await this.handleSaveFreeShapeAnnotations(message);
        return true;
      case 'save-group-style-annotations':
        await this.handleSaveGroupStyleAnnotations(message);
        return true;
      case 'save-node-group-membership':
        await this.handleSaveNodeGroupMembership(message);
        return true;
      case 'panel-add-text':
        this.services.logger.info('[MessageHandler] Add text mode requested');
        return true;
      case 'panel-add-shapes':
        this.services.logger.info('[MessageHandler] Add shapes mode requested');
        return true;
      default:
        return false;
    }
  }

  protected async handleSaveNodePositions(positions: NodePositionData[]): Promise<void> {
    const { context, persistence, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save positions: no YAML file path');
      return;
    }

    try {
      // Separate network nodes from regular nodes
      const networkPositions = positions.filter(p => this.isNetworkNode(p.id));
      const regularPositions = positions.filter(p => !this.isNetworkNode(p.id));

      // Regular nodes through persistence service
      if (regularPositions.length > 0 && persistence.isInitialized()) {
        const result = await persistence.savePositions(regularPositions);
        if (!result.success) {
          logger.error(`[MessageHandler] Failed to save regular node positions: ${result.error}`);
        }
      }

      // Network nodes through annotations
      if (networkPositions.length > 0) {
        await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
          if (!ann.networkNodeAnnotations) {
            ann.networkNodeAnnotations = [];
          }

          for (const posData of networkPositions) {
            const existing = ann.networkNodeAnnotations.find(n => n.id === posData.id);
            if (existing) {
              existing.position = posData.position;
            } else {
              const cachedNode = context.findCachedNode(posData.id);
              const networkType = this.getNetworkType(posData.id);
              const label = typeof cachedNode?.data?.name === 'string' ? cachedNode.data.name : undefined;
              ann.networkNodeAnnotations.push({
                id: posData.id,
                type: networkType,
                label,
                position: posData.position
              });
            }
          }

          return ann;
        });
      }

      logger.info(`[MessageHandler] Saved ${positions.length} node positions (${regularPositions.length} regular, ${networkPositions.length} network)`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save node positions: ${err}`);
    }
  }

  protected async handleSaveNetworkPosition(message: WebviewMessage): Promise<void> {
    const { context, persistence, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save network position: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as {
        networkId?: string;
        position?: { x: number; y: number };
        networkType?: string;
        networkLabel?: string;
      };

      if (!payload.networkId || !payload.position) {
        logger.warn('[MessageHandler] Cannot save network position: missing networkId or position');
        return;
      }

      // For bridge and ovs-bridge, also add to YAML
      const isBridgeType = payload.networkType === 'bridge' || payload.networkType === 'ovs-bridge';
      if (isBridgeType && !context.isViewMode && persistence.isInitialized()) {
        const nodeData: NodeSaveData = {
          id: payload.networkId,
          name: payload.networkId,
          extraData: {
            kind: payload.networkType
          },
          position: payload.position
        };

        const result = await persistence.addNode(nodeData);
        if (result.success) {
          logger.info(`[MessageHandler] Added ${payload.networkType} node to YAML: ${payload.networkId}`);
        } else if (!result.error?.includes('already exists')) {
          logger.error(`[MessageHandler] Failed to add ${payload.networkType} node to YAML: ${result.error}`);
        }
      }

      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        if (!ann.networkNodeAnnotations) {
          ann.networkNodeAnnotations = [];
        }

        const existing = ann.networkNodeAnnotations.find(n => n.id === payload.networkId);
        if (existing) {
          existing.position = payload.position!;
          if (payload.networkLabel) existing.label = payload.networkLabel;
        } else {
          ann.networkNodeAnnotations.push({
            id: payload.networkId!,
            type: (payload.networkType || 'host') as NetworkNodeAnnotation['type'],
            label: payload.networkLabel,
            position: payload.position!
          });
        }

        return ann;
      });

      logger.info(`[MessageHandler] Saved network position for ${payload.networkId}`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save network position: ${err}`);
    }
  }

  protected async handleSaveFreeTextAnnotations(message: WebviewMessage): Promise<void> {
    const { context, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save free text annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const freeTextAnnotations = payload.annotations || [];

      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        ann.freeTextAnnotations = freeTextAnnotations as typeof ann.freeTextAnnotations;
        return ann;
      });

      logger.info(`[MessageHandler] Saved ${freeTextAnnotations.length} free text annotations`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save free text annotations: ${err}`);
    }
  }

  protected async handleSaveFreeShapeAnnotations(message: WebviewMessage): Promise<void> {
    const { context, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save free shape annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const freeShapeAnnotations = payload.annotations || [];

      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        ann.freeShapeAnnotations = freeShapeAnnotations as typeof ann.freeShapeAnnotations;
        return ann;
      });

      logger.info(`[MessageHandler] Saved ${freeShapeAnnotations.length} free shape annotations`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save free shape annotations: ${err}`);
    }
  }

  protected async handleSaveGroupStyleAnnotations(message: WebviewMessage): Promise<void> {
    const { context, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save group style annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const groupStyleAnnotations = payload.annotations || [];

      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        ann.groupStyleAnnotations = groupStyleAnnotations as typeof ann.groupStyleAnnotations;
        return ann;
      });

      logger.info(`[MessageHandler] Saved ${groupStyleAnnotations.length} group style annotations`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save group style annotations: ${err}`);
    }
  }

  protected async handleSaveNodeGroupMembership(message: WebviewMessage): Promise<void> {
    const { context, annotations, logger } = this.services;

    if (!context.yamlFilePath) {
      logger.warn('[MessageHandler] Cannot save node group membership: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as {
        nodeId?: string;
        group?: string | null;
        level?: string | null;
      };

      if (!payload.nodeId) {
        logger.warn('[MessageHandler] Cannot save node group membership: no node ID');
        return;
      }

      await annotations.modifyAnnotations(context.yamlFilePath, (ann) => {
        if (!ann.nodeAnnotations) {
          ann.nodeAnnotations = [];
        }

        const existing = ann.nodeAnnotations.find(n => n.id === payload.nodeId);
        if (existing) {
          if (payload.group) {
            existing.group = payload.group;
            existing.level = payload.level || '1';
          } else {
            delete existing.group;
            delete existing.level;
          }
        } else if (payload.group) {
          ann.nodeAnnotations.push({
            id: payload.nodeId!,
            group: payload.group,
            level: payload.level || '1'
          });
        }

        return ann;
      });

      logger.info(`[MessageHandler] Saved group membership for node ${payload.nodeId}: ${payload.group || 'none'}`);
    } catch (err) {
      logger.error(`[MessageHandler] Failed to save node group membership: ${err}`);
    }
  }

  // --------------------------------------------------------------------------
  // Custom Node Commands
  // --------------------------------------------------------------------------

  protected async handleCustomNodeCommand(command: string, message: WebviewMessage): Promise<boolean> {
    switch (command) {
      case 'delete-custom-node':
        await this.handleDeleteCustomNode(message);
        return true;
      case 'set-default-custom-node':
        await this.handleSetDefaultCustomNode(message);
        return true;
      case 'save-custom-node':
        await this.handleSaveCustomNode(message);
        return true;
      default:
        return false;
    }
  }

  private async handleDeleteCustomNode(message: WebviewMessage): Promise<void> {
    const { customNodes, logger } = this.services;
    const nodeName = (message as Record<string, unknown>).name as string | undefined;
    if (!nodeName) {
      logger.warn('[MessageHandler] Cannot delete custom node: no name provided');
      return;
    }
    const result = await customNodes.deleteCustomNode(nodeName);
    this.processCustomNodeResult(result, `Deleted custom node: ${nodeName}`, 'Failed to delete custom node');
  }

  private async handleSetDefaultCustomNode(message: WebviewMessage): Promise<void> {
    const { customNodes, logger } = this.services;
    const nodeName = (message as Record<string, unknown>).name as string | undefined;
    if (!nodeName) {
      logger.warn('[MessageHandler] Cannot set default custom node: no name provided');
      return;
    }
    const result = await customNodes.setDefaultCustomNode(nodeName);
    this.processCustomNodeResult(result, `Set default custom node: ${nodeName}`, 'Failed to set default custom node');
  }

  private async handleSaveCustomNode(message: WebviewMessage): Promise<void> {
    const { customNodes, logger } = this.services;
    const msgData = message as Record<string, unknown>;
    if (!msgData.name || typeof msgData.name !== 'string') {
      logger.warn('[MessageHandler] Cannot save custom node: no name provided');
      return;
    }
    const sanitizedPayload = this.sanitizeCustomNodePayload(msgData);
    const result = await customNodes.saveCustomNode(sanitizedPayload as { name: string; [key: string]: unknown });
    this.processCustomNodeResult(result, `Saved custom node: ${msgData.name}`, 'Failed to save custom node');
  }

  private processCustomNodeResult(
    result: { result?: { customNodes: unknown[]; defaultNode: string }; error?: string },
    successMsg: string,
    errorPrefix: string
  ): void {
    const { logger } = this.services;
    if (result.error) {
      logger.error(`[MessageHandler] ${errorPrefix}: ${result.error}`);
    } else if (result.result) {
      this.sendCustomNodesUpdate(result.result);
      logger.info(`[MessageHandler] ${successMsg}`);
    }
  }

  protected sendCustomNodesUpdate(result: { customNodes: unknown[]; defaultNode: string }): void {
    this.services.messaging.postMessage({
      type: 'custom-nodes-updated',
      customNodes: result.customNodes,
      defaultNode: result.defaultNode
    });
  }

  protected sanitizeCustomNodePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const optionalStringFields = ['type', 'image', 'icon', 'iconColor', 'baseName', 'interfacePattern'];

    for (const [key, value] of Object.entries(payload)) {
      if (key === 'command') continue;
      if (optionalStringFields.includes(key) && value === '') continue;
      sanitized[key] = value;
    }

    return sanitized;
  }

  // --------------------------------------------------------------------------
  // Clipboard Commands
  // --------------------------------------------------------------------------

  protected async handleClipboardCommand(command: string, message: WebviewMessage): Promise<boolean> {
    const { clipboard, messaging, logger } = this.services;

    if (command === 'copyElements') {
      const payload = (message as Record<string, unknown>).payload;
      if (!payload) {
        logger.warn('[MessageHandler] copyElements: no payload provided');
        return true;
      }
      await clipboard.copy(payload);
      logger.info(`[MessageHandler] Elements copied to clipboard: ${JSON.stringify(payload).slice(0, 100)}...`);
      return true;
    }

    if (command === 'getCopiedElements') {
      const data = await clipboard.paste();
      logger.info(`[MessageHandler] getCopiedElements: clipboard has data=${!!data}`);
      messaging.postMessage({ type: 'copiedElements', data });
      logger.info('[MessageHandler] Clipboard sent to webview');
      return true;
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Misc Commands (Split View, Lock State, Nav controls)
  // --------------------------------------------------------------------------

  protected async handleMiscCommand(command: string, message: WebviewMessage): Promise<boolean> {
    switch (command) {
      case 'topo-toggle-split-view':
        return this.handleToggleSplitView();
      case 'toggle-lock-state':
        return this.handleToggleLockState(message);
      case 'nav-geo-controls':
        return this.handleNavGeoControls(message);
      case 'nav-layout-toggle':
        this.services.logger.info('[MessageHandler] Layout toggle requested from navbar');
        return true;
      case 'nav-grid-settings':
        this.services.logger.info('[MessageHandler] Grid settings requested (not implemented)');
        return true;
      default:
        return false;
    }
  }

  private async handleToggleSplitView(): Promise<boolean> {
    const { context, splitView, logger } = this.services;
    try {
      const isOpen = await splitView.toggle(context.yamlFilePath);
      logger.info(`[MessageHandler] Split view toggled: ${isOpen ? 'opened' : 'closed'}`);
    } catch (error) {
      logger.error(`[MessageHandler] Failed to toggle split view: ${error}`);
    }
    return true;
  }

  private handleToggleLockState(message: WebviewMessage): boolean {
    const payload = message.payload as { isLocked?: boolean } | undefined;
    const locked = (message as { isLocked?: boolean }).isLocked ?? payload?.isLocked;
    const stateLabel = this.getLockStateLabel(locked);
    this.services.logger.info(`[MessageHandler] Lock state changed: ${stateLabel}`);
    return true;
  }

  private getLockStateLabel(locked: boolean | undefined): string {
    if (locked === true) return 'locked';
    if (locked === false) return 'unlocked';
    return 'unknown';
  }

  private handleNavGeoControls(message: WebviewMessage): boolean {
    const payload = (message.payload as Record<string, unknown>) || message;
    const mode = (payload as Record<string, unknown>)?.geoMode;
    this.services.logger.info(`[MessageHandler] Geo controls mode: ${mode ?? 'unknown'}`);
    return true;
  }
}
