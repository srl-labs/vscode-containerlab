/**
 * MessageRouter - Handles webview message routing for ReactTopoViewer
 */
/* eslint-disable max-lines */

import * as vscode from 'vscode';
import { log } from '../services/logger';
import { nodeCommandService } from '../services/NodeCommandService';
import { labLifecycleService } from '../services/LabLifecycleService';
import { splitViewManager } from '../services/SplitViewManager';
import { saveTopologyService, NodeSaveData, LinkSaveData } from '../services/SaveTopologyService';
import { annotationsManager } from '../services/AnnotationsManager';
import { convertEditorDataToYaml } from '../../shared/utilities/nodeEditorConversions';
import { CyElement, TopologyAnnotations, NetworkNodeAnnotation } from '../../shared/types/topology';
import { customNodeConfigManager } from '../../../topoViewer/extension/services/CustomNodeConfigManager';
import { yamlSettingsManager } from '../../../topoViewer/extension/services/YamlSettingsManager';
import * as YAML from 'yaml';
import * as fsPromises from 'fs/promises';

// Create output channel for React TopoViewer logs
let reactTopoViewerLogChannel: vscode.LogOutputChannel | undefined;

function getLogChannel(): vscode.LogOutputChannel {
  if (!reactTopoViewerLogChannel) {
    reactTopoViewerLogChannel = vscode.window.createOutputChannel('TopoViewer React', { log: true });
  }
  return reactTopoViewerLogChannel;
}

function logToChannel(level: string, message: string, fileLine?: string): void {
  const channel = getLogChannel();
  const text = fileLine ? `${fileLine} - ${message}` : message;
  switch (level) {
    case 'error': channel.error(text); break;
    case 'warn': channel.warn(text); break;
    case 'debug': channel.debug(text); break;
    default: channel.info(text);
  }
}

/**
 * Node position data from webview
 */
export interface NodePositionData {
  id: string;
  position: { x: number; y: number };
}

/**
 * Message interface for webview communication
 */
export interface WebviewMessage {
  type?: string;
  requestId?: string;
  endpointName?: string;
  payload?: unknown;
  command?: string;
  level?: string;
  message?: string;
  positions?: NodePositionData[];
}

const NODE_COMMANDS = new Set([
  'clab-node-connect-ssh',
  'clab-node-attach-shell',
  'clab-node-view-logs'
]);

const INTERFACE_COMMANDS = new Set([
  'clab-interface-capture'
]);

const LIFECYCLE_COMMANDS = new Set([
  'deployLab',
  'destroyLab',
  'deployLabCleanup',
  'destroyLabCleanup',
  'redeployLab',
  'redeployLabCleanup'
]);

/**
 * Context required by the message router
 */
export interface MessageRouterContext {
  yamlFilePath: string;
  isViewMode: boolean;
  lastTopologyElements: CyElement[];
  updateCachedElements: (elements: CyElement[]) => void;
  loadTopologyData: () => Promise<unknown>;
  extensionContext?: vscode.ExtensionContext;
}

/**
 * Handles routing and processing of webview messages
 */
export class MessageRouter {
  private context: MessageRouterContext;

  constructor(context: MessageRouterContext) {
    this.context = context;
  }

  /**
   * Update the router context
   */
  updateContext(context: Partial<MessageRouterContext>): void {
    Object.assign(this.context, context);
  }

  /**
   * Handle log command messages
   */
  private handleLogCommand(message: WebviewMessage): boolean {
    if (message.command === 'reactTopoViewerLog') {
      const { level, message: logMsg, fileLine } = message as WebviewMessage & { fileLine?: string };
      logToChannel(level || 'info', logMsg || '', fileLine);
      return true;
    }
    if (message.command === 'topoViewerLog') {
      const { level, message: logMessage } = message;
      if (level === 'error') { log.error(logMessage); }
      else if (level === 'warn') { log.warn(logMessage); }
      else if (level === 'debug') { log.debug(logMessage); }
      else { log.info(logMessage); }
      return true;
    }
    return false;
  }

  /**
   * Extract node name payload from incoming message
   */
  private getNodeNamePayload(message: WebviewMessage): string {
    const raw = (message as Record<string, unknown>).nodeName ?? message.payload;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).nodeName === 'string') {
      return (raw as Record<string, unknown>).nodeName as string;
    }
    return '';
  }

  private getNodeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as Record<string, unknown>) || message;
    const nodeId = (payload as Record<string, unknown>)?.nodeId ?? (payload as Record<string, unknown>)?.id;
    return typeof nodeId === 'string' ? nodeId : undefined;
  }

  private getEdgeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as Record<string, unknown>) || message;
    const edgeId = (payload as Record<string, unknown>)?.edgeId ?? (payload as Record<string, unknown>)?.id;
    return typeof edgeId === 'string' ? edgeId : undefined;
  }

  private findCachedNode(nodeId: string | undefined): CyElement | undefined {
    if (!nodeId) return undefined;
    return this.context.lastTopologyElements.find(
      el => el.group === 'nodes' && (el.data as Record<string, unknown>)?.id === nodeId
    );
  }

  private findCachedEdge(edgeId: string | undefined): CyElement | undefined {
    if (!edgeId) return undefined;
    return this.context.lastTopologyElements.find(
      el => el.group === 'edges' && (el.data as Record<string, unknown>)?.id === edgeId
    );
  }

  private postPanelAction(panel: vscode.WebviewPanel, action: string, data: Record<string, unknown>): void {
    panel.webview.postMessage({
      type: 'panel-action',
      action,
      ...data
    });
  }

  private handleNodePanelAction(
    panel: vscode.WebviewPanel,
    message: WebviewMessage,
    action: 'node-info' | 'edit-node'
  ): void {
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;
    const node = this.findCachedNode(nodeId);
    this.postPanelAction(panel, action, { nodeId, nodeData: node?.data });
  }

  private async handleDeleteNode(panel: vscode.WebviewPanel, message: WebviewMessage): Promise<void> {
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;

    // Try to delete from YAML if in edit mode
    if (!this.context.isViewMode && saveTopologyService.isInitialized()) {
      if (this.isNetworkNode(nodeId)) {
        // Network nodes are defined by links - delete connected links instead
        await this.deleteConnectedLinks(nodeId);
      } else {
        const result = await saveTopologyService.deleteNode(nodeId);
        if (!result.success) {
          log.error(`[ReactTopoViewer] Failed to delete node from YAML: ${result.error}`);
        }
      }
    }

    // Always remove from annotations (network nodes aren't in YAML nodes section)
    await this.removeNodeFromAnnotations(nodeId);

    // Update cached elements
    const updatedElements = this.context.lastTopologyElements.filter(el => {
      const data = el.data || {};
      if (el.group === 'nodes') return (data as Record<string, unknown>)?.id !== nodeId;
      if (el.group === 'edges') {
        const source = (data as Record<string, unknown>)?.source;
        const target = (data as Record<string, unknown>)?.target;
        return source !== nodeId && target !== nodeId;
      }
      return true;
    });
    this.context.updateCachedElements(updatedElements);
    this.postPanelAction(panel, 'delete-node', { nodeId });
  }

  /**
   * Delete all links connected to a network node
   */
  private async deleteConnectedLinks(networkNodeId: string): Promise<void> {
    const connectedEdges = this.context.lastTopologyElements.filter(el => {
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
      const result = await saveTopologyService.deleteLink(linkData);
      if (!result.success) {
        log.error(`[ReactTopoViewer] Failed to delete link ${linkData.id}: ${result.error}`);
      } else {
        log.info(`[ReactTopoViewer] Deleted link connected to network node: ${linkData.id}`);
      }
    }
  }

  private handleStartLink(panel: vscode.WebviewPanel, message: WebviewMessage): void {
    const nodeId = this.getNodeIdFromMessage(message);
    if (!nodeId) return;
    this.postPanelAction(panel, 'start-link', { nodeId });
  }

  private handleLinkPanelAction(
    panel: vscode.WebviewPanel,
    message: WebviewMessage,
    action: 'link-info' | 'edit-link'
  ): void {
    const edgeId = this.getEdgeIdFromMessage(message);
    if (!edgeId) return;
    const edge = this.findCachedEdge(edgeId);
    this.postPanelAction(panel, action, { edgeId, edgeData: edge?.data });
  }

  private async handleDeleteLink(panel: vscode.WebviewPanel, message: WebviewMessage): Promise<void> {
    const edgeId = this.getEdgeIdFromMessage(message);
    if (!edgeId) return;

    const msgLinkData = (message as unknown as { linkData?: Record<string, unknown> }).linkData;
    const edge = this.findCachedEdge(edgeId);
    const edgeData = msgLinkData || (edge?.data as Record<string, unknown>);

    if (edgeData && !this.context.isViewMode && saveTopologyService.isInitialized()) {
      const linkData: LinkSaveData = {
        id: edgeId,
        source: String(edgeData.source || ''),
        target: String(edgeData.target || ''),
        sourceEndpoint: String(edgeData.sourceEndpoint || ''),
        targetEndpoint: String(edgeData.targetEndpoint || '')
      };
      log.info(`[ReactTopoViewer] Deleting link: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`);
      const result = await saveTopologyService.deleteLink(linkData);
      if (!result.success) {
        log.error(`[ReactTopoViewer] Failed to delete link from YAML: ${result.error}`);
      }
    }

    // Update cached elements
    const updatedElements = this.context.lastTopologyElements.filter(
      el => !(el.group === 'edges' && (el.data as Record<string, unknown>)?.id === edgeId)
    );
    this.context.updateCachedElements(updatedElements);
    this.postPanelAction(panel, 'delete-link', { edgeId });
  }

  private async removeNodeFromAnnotations(nodeId: string): Promise<void> {
    if (!this.context.yamlFilePath) return;
    try {
      const annotations = await annotationsManager.loadAnnotations(this.context.yamlFilePath);
      let changed = false;

      // Remove from nodeAnnotations
      const existingNodes = annotations.nodeAnnotations || [];
      const updatedNodes = existingNodes.filter((n: { id: string }) => n.id !== nodeId);
      if (updatedNodes.length !== existingNodes.length) {
        annotations.nodeAnnotations = updatedNodes;
        changed = true;
      }

      // Remove from networkNodeAnnotations (for network/cloud nodes)
      const existingNetworks = annotations.networkNodeAnnotations || [];
      const updatedNetworks = existingNetworks.filter((n: { id: string }) => n.id !== nodeId);
      if (updatedNetworks.length !== existingNetworks.length) {
        annotations.networkNodeAnnotations = updatedNetworks;
        changed = true;
      }

      if (changed) {
        await annotationsManager.saveAnnotations(this.context.yamlFilePath, annotations);
      }
    } catch (err) {
      log.warn(`[ReactTopoViewer] Failed to prune annotations for node ${nodeId}: ${err}`);
    }
  }

  private async handleCreateNode(message: WebviewMessage): Promise<void> {
    log.info(`[ReactTopoViewer] handleCreateNode called, isViewMode=${this.context.isViewMode}, isInitialized=${saveTopologyService.isInitialized()}`);

    if (this.context.isViewMode) {
      log.warn('[ReactTopoViewer] Cannot create node: in view mode');
      return;
    }

    if (!saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot create node: service not initialized');
      return;
    }

    const msg = message as unknown as { nodeId?: string; nodeData?: Record<string, unknown>; position?: { x: number; y: number } };
    if (!msg.nodeData) {
      log.warn('[ReactTopoViewer] Cannot create node: no node data provided');
      return;
    }

    log.info(`[ReactTopoViewer] Creating node: ${msg.nodeId}`);

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
        // Include icon data in extraData for persistence
        ...(iconData.topoViewerRole && { topoViewerRole: iconData.topoViewerRole }),
        ...(iconData.iconColor && { iconColor: iconData.iconColor }),
        ...(iconData.iconCornerRadius !== undefined && { iconCornerRadius: iconData.iconCornerRadius })
      },
      position: msg.position
    };

    const result = await saveTopologyService.addNode(nodeData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Created node: ${nodeData.name}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to create node: ${result.error}`);
    }
  }

  private async handleSaveNodeEditor(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (this.context.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot save node: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { nodeData?: Record<string, unknown> };
    if (!msg.nodeData) {
      log.warn('[ReactTopoViewer] Cannot save node: no node data provided');
      return;
    }

    const extraData = convertEditorDataToYaml(msg.nodeData);

    // Include icon data for annotation persistence (not saved to YAML, but to annotations file)
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

    log.info(`[ReactTopoViewer] Saving node - id: "${nodeData.id}", name: "${nodeData.name}"`);

    const result = await saveTopologyService.editNode(nodeData);
    if (result.success) {
      const renameInfo = result.renamed ? ` (renamed from ${result.renamed.oldId})` : '';
      log.info(`[ReactTopoViewer] Saved node: ${nodeData.name}${renameInfo}`);

      // If a node was renamed, send targeted message for in-place update (no flash)
      if (result.renamed) {
        log.info(`[ReactTopoViewer] Node renamed from "${result.renamed.oldId}" to "${result.renamed.newId}"`);
        panel.webview.postMessage({
          type: 'node-renamed',
          data: { oldId: result.renamed.oldId, newId: result.renamed.newId }
        });
      }
    } else {
      log.error(`[ReactTopoViewer] Failed to save node: ${result.error}`);
    }
  }

  /**
   * Handle undo/redo of node rename - robustly finds and renames the node
   */
  private async handleUndoRenameNode(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (this.context.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot undo rename: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as {
      currentName?: string;
      targetName?: string;
      nodeData?: Record<string, unknown>;
    };

    if (!msg.currentName || !msg.targetName || !msg.nodeData) {
      log.warn('[ReactTopoViewer] Cannot undo rename: missing data');
      return;
    }

    const { currentName, targetName, nodeData } = msg;
    log.info(`[ReactTopoViewer] Undo rename: ${currentName} -> ${targetName}`);

    const extraData = convertEditorDataToYaml(nodeData);

    // Use currentName as id (to find the node) and targetName as name (the new name)
    const saveData: NodeSaveData = {
      id: currentName,
      name: targetName,
      extraData
    };

    const result = await saveTopologyService.editNode(saveData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Undo rename successful: ${currentName} -> ${targetName}`);

      // Send targeted message for in-place update after undo/redo rename (no flash)
      if (result.renamed) {
        log.info(`[ReactTopoViewer] Undo rename: "${result.renamed.oldId}" -> "${result.renamed.newId}"`);
        panel.webview.postMessage({
          type: 'node-renamed',
          data: { oldId: result.renamed.oldId, newId: result.renamed.newId }
        });
      }
    } else {
      log.error(`[ReactTopoViewer] Failed to undo rename: ${result.error}`);
    }
  }

  private async handleCreateLink(message: WebviewMessage): Promise<void> {
    if (this.context.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot create link: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { linkData?: Record<string, unknown> };
    if (!msg.linkData) {
      log.warn('[ReactTopoViewer] Cannot create link: no link data provided');
      return;
    }

    log.info(`[ReactTopoViewer] Received link data: ${JSON.stringify(msg.linkData)}`);

    const linkData: LinkSaveData = {
      id: String(msg.linkData.id || ''),
      source: String(msg.linkData.source || ''),
      target: String(msg.linkData.target || ''),
      sourceEndpoint: String(msg.linkData.sourceEndpoint || ''),
      targetEndpoint: String(msg.linkData.targetEndpoint || ''),
      extraData: msg.linkData.extraData as LinkSaveData['extraData']
    };

    log.info(`[ReactTopoViewer] Creating link with endpoints: ${linkData.source}:${linkData.sourceEndpoint} <-> ${linkData.target}:${linkData.targetEndpoint}`);

    const result = await saveTopologyService.addLink(linkData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Created link: ${linkData.source} <-> ${linkData.target}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to create link: ${result.error}`);
    }
  }

  private async handleSaveLinkEditor(message: WebviewMessage): Promise<void> {
    if (this.context.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot save link: not in edit mode or service not initialized');
      return;
    }

    const msg = message as unknown as { linkData?: Record<string, unknown> };
    if (!msg.linkData) {
      log.warn('[ReactTopoViewer] Cannot save link: no link data provided');
      return;
    }

    // Convert link editor data to the format expected by LinkPersistence
    // The webview sends: type, mtu, sourceMac, targetMac, vars, labels at the top level
    // LinkPersistence expects: extType, extMtu, extSourceMac, etc. in extraData
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
      // Pass original values for finding the link when endpoints change
      originalSource: msg.linkData.originalSource as string | undefined,
      originalTarget: msg.linkData.originalTarget as string | undefined,
      originalSourceEndpoint: msg.linkData.originalSourceEndpoint as string | undefined,
      originalTargetEndpoint: msg.linkData.originalTargetEndpoint as string | undefined,
    };

    log.info(`[ReactTopoViewer] Saving link with extraData: ${JSON.stringify(extraData)}`);

    const result = await saveTopologyService.editLink(linkData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Saved link: ${linkData.source} <-> ${linkData.target}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to save link: ${result.error}`);
    }
  }

  private async handleNodeCommand(command: string, message: WebviewMessage): Promise<boolean> {
    nodeCommandService.setYamlFilePath(this.context.yamlFilePath);
    const { result, error } = await nodeCommandService.handleNodeEndpoint(command, this.getNodeNamePayload(message));
    if (error) log.error(`[ReactTopoViewer] ${error}`);
    else if (result) log.info(`[ReactTopoViewer] ${result}`);
    return true;
  }

  private async handleInterfaceCommand(command: string, message: WebviewMessage): Promise<void> {
    nodeCommandService.setYamlFilePath(this.context.yamlFilePath);
    const payload = message as unknown as { nodeName?: string; interfaceName?: string };
    if (!payload.nodeName || !payload.interfaceName) {
      log.warn(`[ReactTopoViewer] Invalid interface command payload: ${JSON.stringify(message)}`);
      return;
    }
    const { result, error } = await nodeCommandService.handleInterfaceEndpoint(
      command,
      { nodeName: payload.nodeName, interfaceName: payload.interfaceName }
    );
    if (error) log.error(`[ReactTopoViewer] ${error}`);
    else if (result) log.info(`[ReactTopoViewer] ${result}`);
  }

  private async handleLifecycleCommand(command: string, _panel: vscode.WebviewPanel): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn(`[ReactTopoViewer] Cannot run ${command}: no YAML path available`);
      return;
    }
    const { result, error } = await labLifecycleService.handleLabLifecycleEndpoint(command, this.context.yamlFilePath);
    if (error) {
      log.error(`[ReactTopoViewer] ${error}`);
    } else if (result) {
      log.info(`[ReactTopoViewer] ${result}`);
    }
    // NOTE: Do NOT send lab-lifecycle-status here!
    // The command is executed asynchronously via vscode.commands.executeCommand().
    // The actual completion notification comes from graph.ts via notifyCurrentTopoViewerOfCommandSuccess()
    // which calls refreshAfterExternalCommand() and postLifecycleStatus().
  }

  private async handleSplitViewCommand(panel: vscode.WebviewPanel): Promise<boolean> {
    try {
      const isOpen = await splitViewManager.toggleSplitView(this.context.yamlFilePath, panel);
      log.info(`[ReactTopoViewer] Split view toggled: ${isOpen ? 'opened' : 'closed'}`);
    } catch (error) {
      log.error(`[ReactTopoViewer] Failed to toggle split view: ${error}`);
    }
    return true;
  }

  private handleLockState(message: WebviewMessage): boolean {
    const payload = message.payload as { isLocked?: boolean } | undefined;
    const locked = (message as { isLocked?: boolean }).isLocked ?? payload?.isLocked;
    let stateLabel = 'unknown';
    if (locked === true) {
      stateLabel = 'locked';
    } else if (locked === false) {
      stateLabel = 'unlocked';
    }
    log.info(`[ReactTopoViewer] Lock state changed: ${stateLabel}`);
    return true;
  }

  private async handlePanelCommand(
    command: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    switch (command) {
      case 'panel-node-info':
        this.handleNodePanelAction(panel, message, 'node-info');
        return true;
      case 'panel-edit-node':
        this.handleNodePanelAction(panel, message, 'edit-node');
        return true;
      case 'panel-delete-node':
        await this.handleDeleteNode(panel, message);
        return true;
      case 'panel-start-link':
        this.handleStartLink(panel, message);
        return true;
      case 'panel-link-info':
        this.handleLinkPanelAction(panel, message, 'link-info');
        return true;
      case 'panel-edit-link':
        this.handleLinkPanelAction(panel, message, 'edit-link');
        return true;
      case 'panel-delete-link':
        await this.handleDeleteLink(panel, message);
        return true;
      default:
        return false;
    }
  }

  private handleNavbarUtilityCommand(command: string, message: WebviewMessage): boolean {
    const payload = (message.payload as Record<string, unknown>) || message;
    if (command === 'nav-geo-controls') {
      const mode = (payload as Record<string, unknown>)?.geoMode;
      log.info(`[ReactTopoViewer] Geo controls mode: ${mode ?? 'unknown'}`);
      return true;
    }
    return false;
  }

  private handlePlaceholderCommand(command: string): boolean {
    if (command === 'nav-layout-toggle') {
      log.info('[ReactTopoViewer] Layout toggle requested from navbar');
      return true;
    }

    const placeholderMessages: Record<string, string> = {
      'nav-grid-settings': 'Grid settings are not implemented yet in the React TopoViewer.',
      'nav-geo-controls': 'Geo controls are not implemented yet in the React TopoViewer.'
    };

    const placeholderMessage = placeholderMessages[command];
    if (placeholderMessage) {
      void vscode.window.showInformationMessage(placeholderMessage);
      return true;
    }

    return false;
  }

  private async handleGraphBatchCommand(command: string): Promise<boolean> {
    if (command === 'begin-graph-batch') {
      saveTopologyService.beginBatch();
      log.info('[ReactTopoViewer] Started graph batch');
      return true;
    }
    if (command === 'end-graph-batch') {
      const result = await saveTopologyService.endBatch();
      if (!result.success) {
        log.error(`[ReactTopoViewer] Failed to flush graph batch: ${result.error}`);
      } else {
        log.info('[ReactTopoViewer] Finished graph batch');
      }
      return true;
    }
    return false;
  }

  /**
   * Handle clipboard commands (copy/paste)
   */
  private async handleClipboardCommand(
    command: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    const ctx = this.context.extensionContext;
    if (!ctx) {
      log.warn('[ReactTopoViewer] Cannot handle clipboard: no extension context');
      return false;
    }

    if (command === 'copyElements') {
      // Store clipboard data in VS Code global state
      const payload = (message as Record<string, unknown>).payload;
      if (!payload) {
        log.warn('[ReactTopoViewer] copyElements: no payload provided');
        return true;
      }
      await ctx.globalState.update('topoClipboard', payload);
      log.info(`[ReactTopoViewer] Elements copied to clipboard: ${JSON.stringify(payload).slice(0, 100)}...`);
      return true;
    }

    if (command === 'getCopiedElements') {
      // Retrieve clipboard data and send to webview
      const clipboard = ctx.globalState.get('topoClipboard') || null;
      log.info(`[ReactTopoViewer] getCopiedElements: clipboard has data=${!!clipboard}`);
      panel.webview.postMessage({ type: 'copiedElements', data: clipboard });
      log.info('[ReactTopoViewer] Clipboard sent to webview');
      return true;
    }

    return false;
  }

  /**
   * Handle editor save/apply commands (both node and link editors)
   * Returns true if the command was handled, false otherwise
   */
  private async handleEditorCommand(command: string, message: WebviewMessage, panel: vscode.WebviewPanel): Promise<boolean> {
    switch (command) {
      case 'create-node':
        await this.handleCreateNode(message);
        return true;
      case 'save-node-editor':
      case 'apply-node-editor':
        await this.handleSaveNodeEditor(message, panel);
        return true;
      case 'undo-rename-node':
        await this.handleUndoRenameNode(message, panel);
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

  /**
   * Handle saving lab settings (name, prefix, mgmt) to the YAML file
   */
  private async handleSaveLabSettings(message: WebviewMessage): Promise<void> {
    const ctx = this.context;
    if (!ctx) {
      log.error('[ReactTopoViewer] handleSaveLabSettings: No context available');
      return;
    }

    try {
      const msgData = message as Record<string, unknown>;
      const settings = (msgData.settings as { name?: string; prefix?: string | null; mgmt?: Record<string, unknown> | null }) || {};

      log.info(`[ReactTopoViewer] Saving lab settings: ${JSON.stringify(settings)}`);

      const yamlContent = await fsPromises.readFile(ctx.yamlFilePath, 'utf8');
      const doc = YAML.parseDocument(yamlContent);

      const { hadPrefix, hadMgmt } = yamlSettingsManager.applyExistingSettings(doc, settings);
      let updatedYaml = doc.toString();
      updatedYaml = yamlSettingsManager.insertMissingSettings(updatedYaml, settings, hadPrefix, hadMgmt);

      await fsPromises.writeFile(ctx.yamlFilePath, updatedYaml, 'utf8');
      log.info('[ReactTopoViewer] Lab settings saved successfully');

      void vscode.window.showInformationMessage('Lab settings saved successfully');
    } catch (err) {
      log.error(`[ReactTopoViewer] Error saving lab settings: ${err}`);
      void vscode.window.showErrorMessage(`Failed to save lab settings: ${err}`);
    }
  }

  /** Message type constant for custom nodes update */
  private static readonly CUSTOM_NODES_UPDATED_TYPE = 'custom-nodes-updated';

  /** Send custom nodes updated message to webview */
  private sendCustomNodesUpdate(
    panel: vscode.WebviewPanel,
    result: { customNodes: unknown[]; defaultNode: string }
  ): void {
    panel.webview.postMessage({
      type: MessageRouter.CUSTOM_NODES_UPDATED_TYPE,
      customNodes: result.customNodes,
      defaultNode: result.defaultNode
    });
  }

  /**
   * Handle custom node template operations (delete, set-default, save)
   * Returns true if the command was handled, false otherwise
   */
  private async handleCustomNodeCommand(
    command: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<boolean> {
    // Extract payload from message - sendCommandToExtension spreads data directly onto message
    // so we cast and access properties directly
    const msgData = message as Record<string, unknown>;
    const nodeName = msgData.name as string | undefined;

    if (command === 'delete-custom-node') {
      await this.handleDeleteCustomNode(nodeName, panel);
      return true;
    }
    if (command === 'set-default-custom-node') {
      await this.handleSetDefaultCustomNode(nodeName, panel);
      return true;
    }
    if (command === 'save-custom-node') {
      await this.handleSaveCustomNode(msgData, panel);
      return true;
    }
    return false;
  }

  private async handleDeleteCustomNode(nodeName: string | undefined, panel: vscode.WebviewPanel): Promise<void> {
    if (!nodeName) {
      log.warn('[ReactTopoViewer] Cannot delete custom node: no name provided');
      return;
    }
    const result = await customNodeConfigManager.deleteCustomNode(nodeName);
    if (result.error) {
      log.error(`[ReactTopoViewer] Failed to delete custom node: ${result.error}`);
    } else {
      this.sendCustomNodesUpdate(panel, result.result as { customNodes: unknown[]; defaultNode: string });
      log.info(`[ReactTopoViewer] Deleted custom node: ${nodeName}`);
    }
  }

  private async handleSetDefaultCustomNode(nodeName: string | undefined, panel: vscode.WebviewPanel): Promise<void> {
    if (!nodeName) {
      log.warn('[ReactTopoViewer] Cannot set default custom node: no name provided');
      return;
    }
    const result = await customNodeConfigManager.setDefaultCustomNode(nodeName);
    if (result.error) {
      log.error(`[ReactTopoViewer] Failed to set default custom node: ${result.error}`);
    } else {
      this.sendCustomNodesUpdate(panel, result.result as { customNodes: unknown[]; defaultNode: string });
      log.info(`[ReactTopoViewer] Set default custom node: ${nodeName}`);
    }
  }

  /**
   * Sanitize custom node payload for saving
   * Removes command property and converts empty strings to undefined for optional fields
   */
  private sanitizeCustomNodePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const optionalStringFields = ['type', 'image', 'icon', 'iconColor', 'baseName', 'interfacePattern'];

    for (const [key, value] of Object.entries(payload)) {
      // Skip the command property - it's not part of the custom node data
      if (key === 'command') continue;

      // Convert empty strings to undefined for optional fields
      if (optionalStringFields.includes(key) && value === '') {
        continue; // Skip empty optional fields
      }

      sanitized[key] = value;
    }

    return sanitized;
  }

  private async handleSaveCustomNode(payload: Record<string, unknown>, panel: vscode.WebviewPanel): Promise<void> {
    if (!payload.name || typeof payload.name !== 'string') {
      log.warn('[ReactTopoViewer] Cannot save custom node: no name provided');
      return;
    }

    const sanitizedPayload = this.sanitizeCustomNodePayload(payload);
    // Type assertion is safe because we verified name exists and sanitizeCustomNodePayload preserves it
    const result = await customNodeConfigManager.saveCustomNode(sanitizedPayload as { name: string; [key: string]: unknown });
    if (result.error) {
      log.error(`[ReactTopoViewer] Failed to save custom node: ${result.error}`);
    } else {
      this.sendCustomNodesUpdate(panel, result.result as { customNodes: unknown[]; defaultNode: string });
      log.info(`[ReactTopoViewer] Saved custom node: ${payload.name}`);
    }
  }

  /**
   * Handle fire-and-forget command messages from the webview
   */
  private async handleCommandMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<boolean> {
    const { command } = message;
    if (!command) return false;

    if (await this.handleGraphBatchCommand(command)) return true;

    if (await this.handleClipboardCommand(command, message, panel)) return true;

    if (await this.handleEditorCommand(command, message, panel)) return true;

    if (await this.handleCustomNodeCommand(command, message, panel)) return true;

    if (await this.handleAnnotationCommand(command, message)) return true;

    if (NODE_COMMANDS.has(command)) {
      return this.handleNodeCommand(command, message);
    }

    if (INTERFACE_COMMANDS.has(command)) {
      await this.handleInterfaceCommand(command, message);
      return true;
    }

    if (LIFECYCLE_COMMANDS.has(command)) {
      await this.handleLifecycleCommand(command, panel);
      return true;
    }

    if (command === 'topo-toggle-split-view') {
      return this.handleSplitViewCommand(panel);
    }

    if (command === 'toggle-lock-state') {
      return this.handleLockState(message);
    }

    const panelHandled = await this.handlePanelCommand(command, message, panel);
    if (panelHandled) {
      return true;
    }

    if (this.handleNavbarUtilityCommand(command, message)) {
      return true;
    }

    return this.handlePlaceholderCommand(command);
  }

  /**
   * Handle annotation-related commands
   */
  private async handleAnnotationCommand(command: string, message: WebviewMessage): Promise<boolean> {
    if (command === 'save-node-positions' && message.positions) {
      await this.handleSaveNodePositions(message.positions);
      return true;
    }
    if (command === 'save-network-position') {
      await this.handleSaveNetworkPosition(message);
      return true;
    }
    if (command === 'save-free-text-annotations') {
      await this.handleSaveFreeTextAnnotations(message);
      return true;
    }
    if (command === 'save-free-shape-annotations') {
      await this.handleSaveFreeShapeAnnotations(message);
      return true;
    }
    if (command === 'save-group-style-annotations') {
      await this.handleSaveGroupStyleAnnotations(message);
      return true;
    }
    if (command === 'save-node-group-membership') {
      await this.handleSaveNodeGroupMembership(message);
      return true;
    }
    if (command === 'panel-add-text') {
      log.info('[ReactTopoViewer] Add text mode requested');
      return true;
    }
    if (command === 'panel-add-shapes') {
      log.info('[ReactTopoViewer] Add shapes mode requested');
      return true;
    }
    return false;
  }

  /**
   * Check if a node is a network node by looking at cached elements
   */
  private isNetworkNode(nodeId: string): boolean {
    const node = this.findCachedNode(nodeId);
    return node?.data?.topoViewerRole === 'cloud';
  }

  /**
   * Get network type from cached node element
   */
  private getNetworkType(nodeId: string): NetworkNodeAnnotation['type'] {
    const cachedNode = this.findCachedNode(nodeId);
    const extraData = cachedNode?.data?.extraData as { kind?: string } | undefined;
    return (extraData?.kind || 'host') as NetworkNodeAnnotation['type'];
  }

  /**
   * Save a network node position to networkNodeAnnotations
   */
  private saveNetworkNodePosition(
    annotations: TopologyAnnotations,
    posData: NodePositionData
  ): void {
    if (!annotations.networkNodeAnnotations) {
      annotations.networkNodeAnnotations = [];
    }
    const existing = annotations.networkNodeAnnotations.find(n => n.id === posData.id);
    if (existing) {
      existing.position = posData.position;
    } else {
      annotations.networkNodeAnnotations.push({
        id: posData.id,
        type: this.getNetworkType(posData.id),
        position: posData.position
      });
    }
  }

  /**
   * Save a regular node position to nodeAnnotations
   */
  private saveRegularNodePosition(
    annotations: TopologyAnnotations,
    posData: NodePositionData
  ): void {
    if (!annotations.nodeAnnotations) {
      annotations.nodeAnnotations = [];
    }
    const existing = annotations.nodeAnnotations.find(n => n.id === posData.id);
    if (existing) {
      existing.position = posData.position;
    } else {
      annotations.nodeAnnotations.push({
        id: posData.id,
        position: posData.position
      });
    }
  }

  /**
   * Save node positions to annotations file
   */
  private async handleSaveNodePositions(positions: NodePositionData[]): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save positions: no YAML file path');
      return;
    }

    try {
      const annotations = await annotationsManager.loadAnnotations(this.context.yamlFilePath);

      for (const posData of positions) {
        if (this.isNetworkNode(posData.id)) {
          this.saveNetworkNodePosition(annotations, posData);
        } else {
          this.saveRegularNodePosition(annotations, posData);
        }
      }

      await annotationsManager.saveAnnotations(this.context.yamlFilePath, annotations);
      log.info(`[ReactTopoViewer] Saved ${positions.length} node positions`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save node positions: ${err}`);
    }
  }

  /**
   * Save network node position to annotations file.
   * For bridge and ovs-bridge types, also adds the node to topology.nodes in the YAML.
   */
  private async handleSaveNetworkPosition(message: WebviewMessage): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save network position: no YAML file path');
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
        log.warn('[ReactTopoViewer] Cannot save network position: missing networkId or position');
        return;
      }

      // For bridge and ovs-bridge, also add to YAML topology.nodes
      const isBridgeType = payload.networkType === 'bridge' || payload.networkType === 'ovs-bridge';
      if (isBridgeType && !this.context.isViewMode && saveTopologyService.isInitialized()) {
        const nodeData: NodeSaveData = {
          id: payload.networkId,
          name: payload.networkId,
          extraData: {
            kind: payload.networkType  // 'bridge' or 'ovs-bridge'
          },
          position: payload.position
        };

        const result = await saveTopologyService.addNode(nodeData);
        if (result.success) {
          log.info(`[ReactTopoViewer] Added ${payload.networkType} node to YAML: ${payload.networkId}`);
        } else if (!result.error?.includes('already exists')) {
          // Only log error if it's not a duplicate (which is fine for re-saves)
          log.error(`[ReactTopoViewer] Failed to add ${payload.networkType} node to YAML: ${result.error}`);
        }
      }

      await annotationsManager.modifyAnnotations(this.context.yamlFilePath, (annotations) => {
        if (!annotations.networkNodeAnnotations) {
          annotations.networkNodeAnnotations = [];
        }

        const existing = annotations.networkNodeAnnotations.find(n => n.id === payload.networkId);
        if (existing) {
          existing.position = payload.position!;
          if (payload.networkLabel) existing.label = payload.networkLabel;
        } else {
          annotations.networkNodeAnnotations.push({
            id: payload.networkId!,
            type: (payload.networkType || 'host') as 'host' | 'mgmt-net' | 'macvlan' | 'vxlan' | 'vxlan-stitch' | 'dummy' | 'bridge' | 'ovs-bridge',
            label: payload.networkLabel,
            position: payload.position!
          });
        }

        return annotations;
      });

      log.info(`[ReactTopoViewer] Saved network position for ${payload.networkId}`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save network position: ${err}`);
    }
  }

  /**
   * Save free text annotations to annotations file
   */
  private async handleSaveFreeTextAnnotations(message: WebviewMessage): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save free text annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const freeTextAnnotations = payload.annotations || [];

      await annotationsManager.modifyAnnotations(this.context.yamlFilePath, (annotations) => {
        annotations.freeTextAnnotations = freeTextAnnotations as typeof annotations.freeTextAnnotations;
        return annotations;
      });

      log.info(`[ReactTopoViewer] Saved ${freeTextAnnotations.length} free text annotations`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save free text annotations: ${err}`);
    }
  }

  /**
   * Save free shape annotations to annotations file
   */
  private async handleSaveFreeShapeAnnotations(message: WebviewMessage): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save free shape annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const freeShapeAnnotations = payload.annotations || [];

      await annotationsManager.modifyAnnotations(this.context.yamlFilePath, (annotations) => {
        annotations.freeShapeAnnotations = freeShapeAnnotations as typeof annotations.freeShapeAnnotations;
        return annotations;
      });

      log.info(`[ReactTopoViewer] Saved ${freeShapeAnnotations.length} free shape annotations`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save free shape annotations: ${err}`);
    }
  }

  /**
   * Save group style annotations to annotations file
   */
  private async handleSaveGroupStyleAnnotations(message: WebviewMessage): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save group style annotations: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as { annotations?: unknown[] };
      const groupStyleAnnotations = payload.annotations || [];

      await annotationsManager.modifyAnnotations(this.context.yamlFilePath, (annotations) => {
        annotations.groupStyleAnnotations = groupStyleAnnotations as typeof annotations.groupStyleAnnotations;
        return annotations;
      });

      log.info(`[ReactTopoViewer] Saved ${groupStyleAnnotations.length} group style annotations`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save group style annotations: ${err}`);
    }
  }

  /**
   * Save node's group membership to annotations file
   */
  private async handleSaveNodeGroupMembership(message: WebviewMessage): Promise<void> {
    if (!this.context.yamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save node group membership: no YAML file path');
      return;
    }

    try {
      const payload = message as unknown as {
        nodeId?: string;
        group?: string | null;
        level?: string | null;
      };

      if (!payload.nodeId) {
        log.warn('[ReactTopoViewer] Cannot save node group membership: no node ID');
        return;
      }

      await annotationsManager.modifyAnnotations(this.context.yamlFilePath, (annotations) => {
        if (!annotations.nodeAnnotations) {
          annotations.nodeAnnotations = [];
        }

        const existing = annotations.nodeAnnotations.find(n => n.id === payload.nodeId);
        if (existing) {
          // Update existing annotation
          if (payload.group) {
            existing.group = payload.group;
            existing.level = payload.level || '1';
          } else {
            // Remove group membership
            delete existing.group;
            delete existing.level;
          }
        } else if (payload.group) {
          // Create new annotation with group membership
          annotations.nodeAnnotations.push({
            id: payload.nodeId!,
            group: payload.group,
            level: payload.level || '1'
          });
        }

        return annotations;
      });

      log.info(`[ReactTopoViewer] Saved group membership for node ${payload.nodeId}: ${payload.group || 'none'}`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save node group membership: ${err}`);
    }
  }

  /**
   * Handle POST request messages
   */
  private async handlePostMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    const { requestId, endpointName } = message;
    let result: unknown = null;
    let error: string | null = null;

    try {
      if (endpointName === 'get-topology-data') {
        result = await this.context.loadTopologyData();
      } else {
        error = `Unknown endpoint: ${endpointName}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    panel.webview.postMessage({
      type: 'POST_RESPONSE',
      requestId,
      result,
      error
    });
  }

  /**
   * Handle messages from the webview
   */
  async handleMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (this.handleLogCommand(message)) {
      return;
    }

    if (await this.handleCommandMessage(message, panel)) {
      return;
    }

    if (message.type === 'POST' && message.requestId && message.endpointName) {
      await this.handlePostMessage(message, panel);
    }
  }
}
