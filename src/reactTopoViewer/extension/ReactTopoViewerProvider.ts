import * as vscode from 'vscode';
import * as fs from 'fs';

import { log } from './services/logger';
import { TopoViewerAdaptorClab } from './services/TopologyAdapter';
import { CyElement, ClabTopology } from '../shared/types/topology';
import { ClabLabTreeNode } from '../../treeView/common';
import { runningLabsProvider } from '../../extension';
import { deploymentStateChecker } from './services/DeploymentStateChecker';
import { annotationsManager } from './services/AnnotationsManager';
import { labLifecycleService } from './services/LabLifecycleService';
import { nodeCommandService } from './services/NodeCommandService';
import { splitViewManager } from './services/SplitViewManager';
import { saveTopologyService, NodeSaveData, LinkSaveData } from './services/SaveTopologyService';

/**
 * Custom node template from configuration
 */
interface CustomNodeTemplate {
  name: string;
  kind: string;
  type?: string;
  image?: string;
  icon?: string;
  baseName?: string;
  interfacePattern?: string;
  setDefault?: boolean;
}

/**
 * Get custom nodes from VS Code configuration
 */
function getCustomNodesFromConfig(): CustomNodeTemplate[] {
  const config = vscode.workspace.getConfiguration('containerlab.editor');
  return config.get<CustomNodeTemplate[]>('customNodes', []);
}

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
interface NodePositionData {
  id: string;
  position: { x: number; y: number };
}

/**
 * Message interface for webview communication
 */
interface WebviewMessage {
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

const LIFECYCLE_COMMANDS = new Set([
  'deployLab',
  'destroyLab',
  'deployLabCleanup',
  'destroyLabCleanup',
  'redeployLab',
  'redeployLabCleanup'
]);

/**
 * React TopoViewer class that manages the webview panel
 * This is a simplified version focused on React rendering
 */
export class ReactTopoViewer {
  public currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'reactTopoViewer';
  private adaptor: TopoViewerAdaptorClab;
  public context: vscode.ExtensionContext;
  public lastYamlFilePath: string = '';
  public currentLabName: string = '';
  public isViewMode: boolean = false;
  public deploymentState: 'deployed' | 'undeployed' | 'unknown' = 'unknown';
  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;
  private isInternalUpdate = false;
  private lastTopologyElements: CyElement[] = [];
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private saveListener: vscode.Disposable | undefined;
  private lastYamlContent: string | undefined;
  private isRefreshingFromFile = false;
  private queuedRefresh = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
  }

  /**
  * Dispose file watchers/listeners
  */
  private disposeWatchers(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    if (this.saveListener) {
      this.saveListener.dispose();
      this.saveListener = undefined;
    }
  }

  /**
   * Set up filesystem watcher for YAML changes outside the webview
   */
  private setupFileWatcher(): void {
    if (!this.lastYamlFilePath) return;

    this.fileWatcher?.dispose();
    const fileUri = vscode.Uri.file(this.lastYamlFilePath);
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

    this.fileWatcher.onDidChange(() => {
      void this.handleExternalYamlChange('change');
    });
  }

  /**
   * Set up save listener for in-editor YAML edits
   */
  private setupSaveListener(): void {
    if (!this.lastYamlFilePath) return;

    this.saveListener?.dispose();
    this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.fsPath !== this.lastYamlFilePath) return;
      void this.handleExternalYamlChange('save');
    });
  }

  /**
   * Reload topology data after external YAML edits and push to webview
   */
  private async handleExternalYamlChange(trigger: 'change' | 'save'): Promise<void> {
    if (!this.lastYamlFilePath || !this.currentPanel) return;
    if (this.isInternalUpdate) {
      log.debug(`[ReactTopoViewer] Ignoring ${trigger} event during internal update`);
      return;
    }

    if (this.isRefreshingFromFile) {
      this.queuedRefresh = true;
      return;
    }

    this.isRefreshingFromFile = true;
    try {
      const currentContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
      if (this.lastYamlContent === currentContent) {
        log.debug(`[ReactTopoViewer] YAML ${trigger} detected but content unchanged, skipping refresh`);
        return;
      }

      log.info(`[ReactTopoViewer] YAML ${trigger} detected, refreshing topology`);
      const topologyData = await this.loadTopologyData();
      if (topologyData) {
        this.currentPanel.webview.postMessage({
          type: 'topology-data',
          data: topologyData
        });
      }
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh after YAML ${trigger}: ${err}`);
    } finally {
      this.isRefreshingFromFile = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        void this.handleExternalYamlChange(trigger);
      }
    }
  }

  /**
   * If a node was renamed in YAML, migrate its annotation (position/icon) to the new id.
   * Returns true if annotations were updated.
   */
  private getIdPrefix(id: string): string {
    const match = /^([a-zA-Z]+)/.exec(id);
    return match ? match[1] : id;
  }

  private async reconcileAnnotationsForRenamedNodes(parsedTopo: ClabTopology | undefined): Promise<boolean> {
    if (!this.lastYamlFilePath || !parsedTopo?.topology?.nodes) {
      return false;
    }

    const yamlNodeIds = new Set(Object.keys(parsedTopo.topology.nodes));
    try {
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      const nodeAnnotations = annotations.nodeAnnotations ?? [];
      const missingIds = [...yamlNodeIds].filter(id => !nodeAnnotations.some(n => n.id === id));
      const orphanAnnotations = nodeAnnotations.filter(n => !yamlNodeIds.has(n.id));

      if (missingIds.length === 1 && orphanAnnotations.length > 0) {
        const newId = missingIds[0];
        const newPrefix = this.getIdPrefix(newId);
        const prefixMatches = orphanAnnotations.filter(n => this.getIdPrefix(n.id) === newPrefix);
        const candidate = prefixMatches[0] || orphanAnnotations[0];
        if (candidate) {
          const oldId = candidate.id;
          candidate.id = newId;
          await annotationsManager.saveAnnotations(this.lastYamlFilePath, annotations);
          log.info(`[ReactTopoViewer] Migrated annotation id from ${oldId} to ${newId} after YAML rename`);
          return true;
        }
      }
    } catch (err) {
      log.warn(`[ReactTopoViewer] Failed to reconcile annotations on rename: ${err}`);
    }

    return false;
  }

  /**
   * Creates a new webview panel for the React TopoViewer
   */
  public async createWebviewPanel(
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri,
    labName: string,
    viewMode: boolean = false
  ): Promise<void> {
    this.currentLabName = labName;
    this.isViewMode = viewMode;

    if (fileUri?.fsPath) {
      this.lastYamlFilePath = fileUri.fsPath;
    }

    const column = vscode.window.activeTextEditor?.viewColumn;

    // Check if panel already exists
    if (this.currentPanel) {
      this.currentPanel.reveal(column);
      return;
    }

    // Create the webview panel
    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      `TopoViewer (React): ${labName}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'resources')
        ]
      }
    );

    this.currentPanel = panel;

    this.setupFileWatcher();
    this.setupSaveListener();

    // Check deployment state
    try {
      this.deploymentState = await this.checkDeploymentState(labName, this.lastYamlFilePath);
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      this.deploymentState = 'unknown';
    }

    // Load running lab data if in view mode
    if (this.isViewMode) {
      try {
        this.cacheClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
      } catch (err) {
        log.warn(`Failed to load running lab data: ${err}`);
      }
    }

    // Generate and load topology data
    let topologyData = null;
    try {
      topologyData = await this.loadTopologyData();
    } catch (err) {
      log.error(`Failed to load topology: ${err}`);
    }

    // Set the HTML content
    panel.webview.html = this.getWebviewContent(panel.webview, context.extensionUri, topologyData);

    // Handle disposal
    panel.onDidDispose(() => {
      this.currentPanel = undefined;
      this.disposeWatchers();
    }, null, context.subscriptions);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this.handleWebviewMessage(message, panel);
      },
      undefined,
      context.subscriptions
    );
  }

  /**
   * Load and convert topology data from YAML file
   */
  private async loadTopologyData(): Promise<unknown> {
    if (!this.lastYamlFilePath) {
      this.lastTopologyElements = [];
      return null;
    }

    try {
      const yamlContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
      let elements = await this.adaptor.clabYamlToCytoscapeElements(
        yamlContent,
        this.cacheClabTreeDataToTopoviewer,
        this.lastYamlFilePath
      );
      const annotationsUpdated = await this.reconcileAnnotationsForRenamedNodes(this.adaptor.currentClabTopo);
      if (annotationsUpdated) {
        // Rebuild elements to include updated annotations (positions/icons)
        elements = await this.adaptor.clabYamlToCytoscapeElements(
          yamlContent,
          this.cacheClabTreeDataToTopoviewer,
          this.lastYamlFilePath
        );
      }
      this.lastTopologyElements = elements;
      this.lastYamlContent = yamlContent;

      // Initialize SaveTopologyService with the parsed document
      if (this.adaptor.currentClabDoc && !this.isViewMode) {
        saveTopologyService.initialize(
          this.adaptor.currentClabDoc,
          this.lastYamlFilePath,
          (updating: boolean) => { this.isInternalUpdate = updating; }
        );
      }

      // Get custom nodes from configuration
      const customNodes = getCustomNodesFromConfig();
      const defaultNode = customNodes.find(n => n.setDefault)?.name || '';

      return {
        elements,
        labName: this.currentLabName,
        mode: this.isViewMode ? 'view' : 'edit',
        deploymentState: this.deploymentState,
        customNodes,
        defaultNode
      };
    } catch (err) {
      this.lastTopologyElements = [];
      log.error(`Error loading topology data: ${err}`);
      return null;
    }
  }

  /**
   * Check deployment state of the lab
   */
  private async checkDeploymentState(
    labName: string,
    topoFilePath: string | undefined
  ): Promise<'deployed' | 'undeployed' | 'unknown'> {
    return deploymentStateChecker.checkDeploymentState(
      labName,
      topoFilePath,
      (newName: string) => { this.currentLabName = newName; }
    );
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
    const raw = (message as any).nodeName ?? message.payload;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && typeof (raw as any).nodeName === 'string') {
      return (raw as any).nodeName;
    }
    return '';
  }

  private getNodeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as any) || message;
    const nodeId = (payload as any)?.nodeId ?? (payload as any)?.id;
    return typeof nodeId === 'string' ? nodeId : undefined;
  }

  private getEdgeIdFromMessage(message: WebviewMessage): string | undefined {
    const payload = (message.payload as any) || message;
    const edgeId = (payload as any)?.edgeId ?? (payload as any)?.id;
    return typeof edgeId === 'string' ? edgeId : undefined;
  }

  private findCachedNode(nodeId: string | undefined): CyElement | undefined {
    if (!nodeId) return undefined;
    return this.lastTopologyElements.find(el => el.group === 'nodes' && (el.data as any)?.id === nodeId);
  }

  private findCachedEdge(edgeId: string | undefined): CyElement | undefined {
    if (!edgeId) return undefined;
    return this.lastTopologyElements.find(el => el.group === 'edges' && (el.data as any)?.id === edgeId);
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

    // Save to YAML if in edit mode
    if (!this.isViewMode && saveTopologyService.isInitialized()) {
      const result = await saveTopologyService.deleteNode(nodeId);
      if (!result.success) {
        log.error(`[ReactTopoViewer] Failed to delete node from YAML: ${result.error}`);
      }
    } else {
      // Legacy: just remove from annotations
      await this.removeNodeFromAnnotations(nodeId);
    }

    // Update cached elements
    this.lastTopologyElements = this.lastTopologyElements.filter(el => {
      const data = el.data || {};
      if (el.group === 'nodes') return (data as any)?.id !== nodeId;
      if (el.group === 'edges') {
        const source = (data as any)?.source;
        const target = (data as any)?.target;
        return source !== nodeId && target !== nodeId;
      }
      return true;
    });
    this.postPanelAction(panel, 'delete-node', { nodeId });
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

    // Get link data from message (sent by webview) or fall back to cached edge
    const msgLinkData = (message as unknown as { linkData?: Record<string, unknown> }).linkData;
    const edge = this.findCachedEdge(edgeId);
    const edgeData = msgLinkData || (edge?.data as Record<string, unknown>);

    if (edgeData && !this.isViewMode && saveTopologyService.isInitialized()) {
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
    this.lastTopologyElements = this.lastTopologyElements.filter(
      el => !(el.group === 'edges' && (el.data as any)?.id === edgeId)
    );
    this.postPanelAction(panel, 'delete-link', { edgeId });
  }

  private async removeNodeFromAnnotations(nodeId: string): Promise<void> {
    if (!this.lastYamlFilePath) {
      return;
    }
    try {
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      const existing = annotations.nodeAnnotations || [];
      const updatedNodes = existing.filter((n: { id: string }) => n.id !== nodeId);
      if (updatedNodes.length !== existing.length) {
        annotations.nodeAnnotations = updatedNodes;
        await annotationsManager.saveAnnotations(this.lastYamlFilePath, annotations);
      }
    } catch (err) {
      log.warn(`[ReactTopoViewer] Failed to prune annotations for node ${nodeId}: ${err}`);
    }
  }

  /**
   * Handle create-node command from webview
   */
  private async handleCreateNode(message: WebviewMessage): Promise<void> {
    log.info(`[ReactTopoViewer] handleCreateNode called, isViewMode=${this.isViewMode}, isInitialized=${saveTopologyService.isInitialized()}`);

    if (this.isViewMode) {
      log.warn('[ReactTopoViewer] Cannot create node: in view mode');
      return;
    }

    if (!saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot create node: service not initialized');
      return;
    }

    // The payload is spread directly on the message, not in a 'payload' property
    const msg = message as unknown as { nodeId?: string; nodeData?: Record<string, unknown>; position?: { x: number; y: number } };
    if (!msg.nodeData) {
      log.warn('[ReactTopoViewer] Cannot create node: no node data provided');
      return;
    }

    log.info(`[ReactTopoViewer] Creating node: ${msg.nodeId}`);

    const nodeData: NodeSaveData = {
      id: msg.nodeId || String(msg.nodeData.id || ''),
      name: String(msg.nodeData.name || msg.nodeData.id || ''),
      extraData: msg.nodeData.extraData as NodeSaveData['extraData'],
      position: msg.position
    };

    const result = await saveTopologyService.addNode(nodeData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Created node: ${nodeData.name}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to create node: ${result.error}`);
    }
  }

  /**
   * Handle save-node-editor command from webview
   */
  private async handleSaveNodeEditor(message: WebviewMessage): Promise<void> {
    if (this.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot save node: not in edit mode or service not initialized');
      return;
    }

    // The payload is spread directly on the message
    const msg = message as unknown as { nodeData?: Record<string, unknown> };
    if (!msg.nodeData) {
      log.warn('[ReactTopoViewer] Cannot save node: no node data provided');
      return;
    }

    const nodeData: NodeSaveData = {
      id: String(msg.nodeData.id || ''),
      name: String(msg.nodeData.name || msg.nodeData.id || ''),
      extraData: msg.nodeData.extraData as NodeSaveData['extraData']
    };

    const result = await saveTopologyService.editNode(nodeData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Saved node: ${nodeData.name}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to save node: ${result.error}`);
    }
  }

  /**
   * Handle create-link command from webview
   */
  private async handleCreateLink(message: WebviewMessage): Promise<void> {
    if (this.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot create link: not in edit mode or service not initialized');
      return;
    }

    // The payload is spread directly on the message
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

  /**
   * Handle save-link-editor command from webview
   */
  private async handleSaveLinkEditor(message: WebviewMessage): Promise<void> {
    if (this.isViewMode || !saveTopologyService.isInitialized()) {
      log.warn('[ReactTopoViewer] Cannot save link: not in edit mode or service not initialized');
      return;
    }

    // The payload is spread directly on the message
    const msg = message as unknown as { linkData?: Record<string, unknown> };
    if (!msg.linkData) {
      log.warn('[ReactTopoViewer] Cannot save link: no link data provided');
      return;
    }

    const linkData: LinkSaveData = {
      id: String(msg.linkData.id || ''),
      source: String(msg.linkData.source || ''),
      target: String(msg.linkData.target || ''),
      sourceEndpoint: String(msg.linkData.sourceEndpoint || ''),
      targetEndpoint: String(msg.linkData.targetEndpoint || ''),
      extraData: msg.linkData.extraData as LinkSaveData['extraData']
    };

    const result = await saveTopologyService.editLink(linkData);
    if (result.success) {
      log.info(`[ReactTopoViewer] Saved link: ${linkData.source} <-> ${linkData.target}`);
    } else {
      log.error(`[ReactTopoViewer] Failed to save link: ${result.error}`);
    }
  }

  private async handleNodeCommand(command: string, message: WebviewMessage): Promise<boolean> {
    nodeCommandService.setYamlFilePath(this.lastYamlFilePath);
    const { result, error } = await nodeCommandService.handleNodeEndpoint(command, this.getNodeNamePayload(message));
    if (error) log.error(`[ReactTopoViewer] ${error}`);
    else if (result) log.info(`[ReactTopoViewer] ${result}`);
    return true;
  }

  private async handleLifecycleCommand(command: string): Promise<void> {
    if (!this.lastYamlFilePath) {
      log.warn(`[ReactTopoViewer] Cannot run ${command}: no YAML path available`);
      return;
    }
    const { result, error } = await labLifecycleService.handleLabLifecycleEndpoint(command, this.lastYamlFilePath);
    if (error) {
      log.error(`[ReactTopoViewer] ${error}`);
    } else if (result) {
      log.info(`[ReactTopoViewer] ${result}`);
    }
  }

  private async handleSplitViewCommand(panel: vscode.WebviewPanel): Promise<boolean> {
    try {
      const isOpen = await splitViewManager.toggleSplitView(this.lastYamlFilePath, panel);
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
        this.handleDeleteLink(panel, message);
        return true;
      default:
        return false;
    }
  }

  private handleNavbarUtilityCommand(command: string, message: WebviewMessage): boolean {
    const payload = (message.payload as any) || message;
    if (command === 'nav-geo-controls') {
      const mode = (payload as any)?.geoMode;
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
      'nav-open-lab-settings': 'Lab settings UI is not available in the React TopoViewer yet.',
      'nav-show-shortcuts': 'Keyboard shortcuts panel is not available in the React TopoViewer yet.',
      'nav-show-about': 'About panel is not available in the React TopoViewer yet.',
      'nav-find-node': 'Topology overview/search is coming soon in the React TopoViewer.',
      'nav-topology-overview': 'Topology overview/search is coming soon in the React TopoViewer.',
      'nav-capture-svg': 'SVG capture will be available in a future React TopoViewer update.',
      'nav-grid-settings': 'Grid settings are not implemented yet in the React TopoViewer.',
      'nav-geo-controls': 'Geo controls are not implemented yet in the React TopoViewer.',
      'panel-add-node': 'Node creation is not available in the React TopoViewer yet.',
      'panel-add-network': 'Network creation is not available in the React TopoViewer yet.',
      'panel-add-group': 'Group creation is not available in the React TopoViewer yet.',
      'panel-add-text': 'Text annotations are not available in the React TopoViewer yet.',
      'panel-add-shapes': 'Shape annotations are not available in the React TopoViewer yet.',
      'panel-add-bulk-link': 'Bulk link creation is not available in the React TopoViewer yet.'
    };

    const placeholderMessage = placeholderMessages[command];
    if (placeholderMessage) {
      void vscode.window.showInformationMessage(placeholderMessage);
      return true;
    }

    return false;
  }

  /**
   * Handle fire-and-forget command messages from the webview
   */
  private async handleCommandMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<boolean> {
    const { command } = message;
    if (!command) return false;

    // YAML save commands
    if (command === 'create-node') {
      await this.handleCreateNode(message);
      return true;
    }

    if (command === 'save-node-editor') {
      await this.handleSaveNodeEditor(message);
      return true;
    }

    if (command === 'create-link') {
      await this.handleCreateLink(message);
      return true;
    }

    if (command === 'save-link-editor') {
      await this.handleSaveLinkEditor(message);
      return true;
    }

    if (command === 'save-node-positions' && message.positions) {
      await this.handleSaveNodePositions(message.positions);
      return true;
    }

    if (NODE_COMMANDS.has(command)) {
      return this.handleNodeCommand(command, message);
    }

    if (LIFECYCLE_COMMANDS.has(command)) {
      await this.handleLifecycleCommand(command);
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
   * Handle messages from the webview
   */
  private async handleWebviewMessage(message: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    // Handle log messages
    if (this.handleLogCommand(message)) {
      return;
    }

    if (await this.handleCommandMessage(message, panel)) {
      return;
    }

    // Handle POST messages
    if (message.type === 'POST' && message.requestId && message.endpointName) {
      await this.handlePostMessage(message, panel);
    }
  }

  /**
   * Save node positions to annotations file
   */
  private async handleSaveNodePositions(positions: NodePositionData[]): Promise<void> {
    if (!this.lastYamlFilePath) {
      log.warn('[ReactTopoViewer] Cannot save positions: no YAML file path');
      return;
    }

    try {
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);

      // Update positions for each node
      for (const posData of positions) {
        const existingNode = annotations.nodeAnnotations?.find(n => n.id === posData.id);
        if (existingNode) {
          existingNode.position = posData.position;
        } else {
          // Create new node annotation
          if (!annotations.nodeAnnotations) {
            annotations.nodeAnnotations = [];
          }
          annotations.nodeAnnotations.push({
            id: posData.id,
            position: posData.position
          });
        }
      }

      // Save annotations
      await annotationsManager.saveAnnotations(this.lastYamlFilePath, annotations);
      log.info(`[ReactTopoViewer] Saved ${positions.length} node positions`);
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to save node positions: ${err}`);
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
        result = await this.loadTopologyData();
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
   * Generate the HTML content for the webview
   */
  private getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    topologyData: unknown
  ): string {
    // Get URIs for resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'reactTopoViewerWebview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'reactTopoViewerStyles.css')
    );

    // CSP nonce for security
    const nonce = this.getNonce();

    // Serialize initial data
    const initialDataJson = JSON.stringify(topologyData || {});

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>TopoViewer (React)</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VS Code API for webview communication
    window.vscode = acquireVsCodeApi();
    window.__INITIAL_DATA__ = ${initialDataJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP using crypto
   */
  private getNonce(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Update panel HTML (compatibility method)
   */
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    if (!panel || !this.currentLabName) {
      return false;
    }

    try {
      const topologyData = await this.loadTopologyData();
      panel.webview.html = this.getWebviewContent(panel.webview, this.context.extensionUri, topologyData);
      return true;
    } catch (err) {
      log.error(`Failed to update panel: ${err}`);
      return false;
    }
  }
}

/**
 * Provider class for React TopoViewer (singleton pattern)
 */
export class ReactTopoViewerProvider {
  private static instance: ReactTopoViewerProvider | undefined;
  private viewers: Map<string, ReactTopoViewer> = new Map();
  private context: vscode.ExtensionContext;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context: vscode.ExtensionContext): ReactTopoViewerProvider {
    if (!ReactTopoViewerProvider.instance) {
      ReactTopoViewerProvider.instance = new ReactTopoViewerProvider(context);
    }
    return ReactTopoViewerProvider.instance;
  }

  /**
   * Open or create a React TopoViewer for the given lab
   */
  public async openViewer(
    labPath: string,
    labName: string,
    isViewMode: boolean
  ): Promise<ReactTopoViewer> {
    // Check for existing viewer
    const existingViewer = this.viewers.get(labPath);
    if (existingViewer?.currentPanel) {
      existingViewer.currentPanel.reveal();
      return existingViewer;
    }

    // Create new viewer
    const viewer = new ReactTopoViewer(this.context);
    await viewer.createWebviewPanel(
      this.context,
      labPath ? vscode.Uri.file(labPath) : vscode.Uri.parse(''),
      labName,
      isViewMode
    );

    // Track the viewer
    this.viewers.set(labPath, viewer);

    // Clean up on disposal
    if (viewer.currentPanel) {
      viewer.currentPanel.onDidDispose(() => {
        this.viewers.delete(labPath);
      });
    }

    return viewer;
  }
}
