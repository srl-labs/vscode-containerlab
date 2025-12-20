/**
 * ReactTopoViewerProvider - Main orchestrator for React TopoViewer
 *
 * This is a thin orchestrator that coordinates:
 * - Panel lifecycle (via PanelManager)
 * - Message routing (via MessageRouter)
 * - File/Docker watchers (via WatcherManager)
 * - Topology data loading (via TopologyAdapter)
 */

import * as vscode from 'vscode';

import { log } from './services/logger';
import { nodeFsAdapter, TopologyIO } from '../shared/io';
import { TopoViewerAdaptorClab } from './services/TopologyAdapter';
import { CyElement, ClabTopology } from '../shared/types/topology';
import { ClabLabTreeNode } from '../../treeView/common';
import { runningLabsProvider } from '../../extension';
import { deploymentStateChecker } from './services/DeploymentStateChecker';
import { annotationsIO, extensionLogger } from './services/adapters';

import {
  createPanel,
  generateWebviewHtml,
  PanelConfig
} from './panel/PanelManager';
import { MessageRouter, WebviewMessage } from './panel/MessageRouter';
import { WatcherManager } from './panel/Watchers';
import { buildBootstrapData } from './panel/BootstrapDataBuilder';
import { findInterfaceNode } from './services/TreeUtils';
import { extractEdgeInterfaceStats, computeEdgeClassFromStates } from '../shared/parsing';

/** Message type for topology data updates sent to webview */
const MSG_TOPOLOGY_DATA = 'topology-data';

/** Message type for incremental edge stats updates */
const MSG_EDGE_STATS_UPDATE = 'edge-stats-update';

/**
 * React TopoViewer class that manages the webview panel
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
  private watcherManager: WatcherManager;
  private messageRouter: MessageRouter | undefined;
  private topologyIO: TopologyIO;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
    this.watcherManager = new WatcherManager();
    this.topologyIO = new TopologyIO({
      fs: nodeFsAdapter,
      annotationsIO: annotationsIO,
      setInternalUpdate: (updating: boolean) => { this.isInternalUpdate = updating; },
      logger: extensionLogger,
    });
  }

  /**
   * Get ID prefix from node ID (for annotation migration)
   */
  private getIdPrefix(id: string): string {
    const match = /^([a-zA-Z]+)/.exec(id);
    return match ? match[1] : id;
  }

  /**
   * Reconcile annotations when nodes are renamed in YAML
   */
  private async reconcileAnnotationsForRenamedNodes(parsedTopo: ClabTopology | undefined): Promise<boolean> {
    if (!this.lastYamlFilePath || !parsedTopo?.topology?.nodes) {
      return false;
    }

    const yamlNodeIds = new Set(Object.keys(parsedTopo.topology.nodes));
    try {
      const annotations = await annotationsIO.loadAnnotations(this.lastYamlFilePath);
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
          await annotationsIO.saveAnnotations(this.lastYamlFilePath, annotations);
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
   * Initialize watchers for file changes and docker images
   */
  private initializeWatchers(panel: vscode.WebviewPanel): void {
    const updateController = { isInternalUpdate: () => this.isInternalUpdate };
    const postTopologyData = (data: unknown) => {
      panel.webview.postMessage({ type: MSG_TOPOLOGY_DATA, data });
    };

    this.watcherManager.setupFileWatcher(
      this.lastYamlFilePath,
      updateController,
      () => this.loadTopologyData(),
      postTopologyData
    );
    this.watcherManager.setupSaveListener(
      this.lastYamlFilePath,
      updateController,
      () => this.loadTopologyData(),
      postTopologyData
    );
    this.watcherManager.setupDockerImagesSubscription(panel);
  }

  /**
   * Set up panel event handlers
   */
  private setupPanelHandlers(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): void {
    panel.onDidDispose(() => {
      this.currentPanel = undefined;
      this.watcherManager.dispose();
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        if (this.messageRouter) {
          await this.messageRouter.handleMessage(message, panel);
        }
      },
      undefined,
      context.subscriptions
    );
  }

  /**
   * Initialize the deployment state and lab data
   */
  private async initializeLabState(labName: string): Promise<void> {
    try {
      this.deploymentState = await this.checkDeploymentState(labName, this.lastYamlFilePath);
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      this.deploymentState = 'unknown';
    }

    if (this.isViewMode) {
      try {
        this.cacheClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
      } catch (err) {
        log.warn(`Failed to load running lab data: ${err}`);
      }
    }
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

    if (this.currentPanel) {
      this.currentPanel.reveal(column);
      return;
    }

    const config: PanelConfig = {
      viewType: this.viewType,
      title: labName,
      column: column || vscode.ViewColumn.One,
      extensionUri: context.extensionUri
    };
    const panel = createPanel(config);
    this.currentPanel = panel;

    this.messageRouter = new MessageRouter({
      yamlFilePath: this.lastYamlFilePath,
      isViewMode: this.isViewMode,
      lastTopologyElements: this.lastTopologyElements,
      updateCachedElements: (elements) => { this.lastTopologyElements = elements; },
      loadTopologyData: () => this.loadTopologyData(),
      extensionContext: context,
      topologyIO: this.topologyIO,
    });

    this.initializeWatchers(panel);
    await this.initializeLabState(labName);

    let topologyData = null;
    try {
      topologyData = await this.loadTopologyData();
    } catch (err) {
      log.error(`Failed to load topology: ${err}`);
    }

    panel.webview.html = generateWebviewHtml({
      webview: panel.webview,
      extensionUri: context.extensionUri,
      topologyData
    });

    this.setupPanelHandlers(panel, context);
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
      const yamlContent = await nodeFsAdapter.readFile(this.lastYamlFilePath);
      let elements = await this.adaptor.clabYamlToCytoscapeElements(
        yamlContent,
        this.cacheClabTreeDataToTopoviewer,
        this.lastYamlFilePath
      );
      const annotationsUpdated = await this.reconcileAnnotationsForRenamedNodes(this.adaptor.currentClabTopo);
      if (annotationsUpdated) {
        elements = await this.adaptor.clabYamlToCytoscapeElements(
          yamlContent,
          this.cacheClabTreeDataToTopoviewer,
          this.lastYamlFilePath
        );
      }
      this.lastTopologyElements = elements;
      this.watcherManager.setLastYamlContent(yamlContent);

      // Update message router context
      if (this.messageRouter) {
        this.messageRouter.updateContext({ lastTopologyElements: elements });
      }

      // Initialize TopologyIO with the parsed document
      if (this.adaptor.currentClabDoc && !this.isViewMode) {
        this.topologyIO.initialize(
          this.adaptor.currentClabDoc,
          this.lastYamlFilePath
        );
      }

      // Load annotations (free text + free shapes + groups + nodes)
      const annotations = await annotationsIO.loadAnnotations(this.lastYamlFilePath);
      const freeTextAnnotations = annotations.freeTextAnnotations || [];
      const freeShapeAnnotations = annotations.freeShapeAnnotations || [];
      const groupStyleAnnotations = annotations.groupStyleAnnotations || [];
      const nodeAnnotations = annotations.nodeAnnotations || [];

      // Build and return bootstrap data for the webview
      return buildBootstrapData({
        elements,
        labName: this.currentLabName,
        isViewMode: this.isViewMode,
        deploymentState: this.deploymentState,
        extensionUri: this.context.extensionUri,
        freeTextAnnotations,
        freeShapeAnnotations,
        groupStyleAnnotations,
        nodeAnnotations
      });
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
   * Update panel HTML (compatibility method)
   */
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    if (!panel || !this.currentLabName) {
      return false;
    }

    try {
      const topologyData = await this.loadTopologyData();
      panel.webview.html = generateWebviewHtml({
        webview: panel.webview,
        extensionUri: this.context.extensionUri,
        topologyData
      });
      return true;
    } catch (err) {
      log.error(`Failed to update panel: ${err}`);
      return false;
    }
  }

  /**
   * Refresh after an external command (deploy/destroy) completes.
   * This is called by the command system after a lifecycle operation finishes.
   */
  public async refreshAfterExternalCommand(
    newDeploymentState: 'deployed' | 'undeployed'
  ): Promise<boolean> {
    if (!this.currentPanel) {
      return false;
    }

    try {
      // Update internal state
      this.deploymentState = newDeploymentState;
      this.isViewMode = newDeploymentState === 'deployed';

      // Update message router context
      if (this.messageRouter) {
        this.messageRouter.updateContext({ isViewMode: this.isViewMode });
      }

      // Reload running lab data if switching to view mode
      if (this.isViewMode) {
        try {
          this.cacheClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
        } catch (err) {
          log.warn(`Failed to load running lab data: ${err}`);
        }
      } else {
        this.cacheClabTreeDataToTopoviewer = undefined;
      }

      // Reload topology data
      const topologyData = await this.loadTopologyData();

      // Send topology data update to webview
      this.currentPanel.webview.postMessage({
        type: MSG_TOPOLOGY_DATA,
        data: topologyData
      });

      // Notify webview of mode change
      await this.notifyWebviewModeChanged();

      log.info(`[ReactTopoViewer] Refreshed after ${newDeploymentState === 'deployed' ? 'deploy' : 'destroy'}`);
      return true;
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh after external command: ${err}`);
      return false;
    }
  }

  /**
   * Notify the webview about a mode change
   */
  private async notifyWebviewModeChanged(): Promise<void> {
    if (!this.currentPanel) {
      return;
    }

    const mode = this.isViewMode ? 'viewer' : 'editor';

    this.currentPanel.webview.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode,
        deploymentState: this.deploymentState
      }
    });

    log.info(`[ReactTopoViewer] Mode changed to: ${mode}`);
  }

  /**
   * Refresh link states from running labs inspection data.
   * This is called periodically by the runningLabsProvider when tree data changes.
   * Updates edge elements with fresh interface stats (rxBps, txBps, etc.).
   */
  public async refreshLinkStatesFromInspect(
    labsData?: Record<string, ClabLabTreeNode>
  ): Promise<void> {
    if (!this.currentPanel || !this.isViewMode) {
      return;
    }

    try {
      // Update cached labs data
      this.cacheClabTreeDataToTopoviewer = labsData;

      // Build edge stats updates from cached elements
      const edgeUpdates = this.buildEdgeStatsUpdates(labsData);

      if (edgeUpdates.length > 0) {
        // Send only edge stats updates (not full topology)
        this.currentPanel.webview.postMessage({
          type: MSG_EDGE_STATS_UPDATE,
          data: { edgeUpdates }
        });
      }
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh link states: ${err}`);
    }
  }

  /**
   * Build edge stats updates from cached elements and fresh labs data.
   * Only updates the extraData fields related to stats and interface state.
   */
  private buildEdgeStatsUpdates(
    labs: Record<string, ClabLabTreeNode> | undefined
  ): Array<{ id: string; extraData: Record<string, unknown>; classes?: string }> {
    if (!labs || this.lastTopologyElements.length === 0) {
      return [];
    }

    const updates: Array<{ id: string; extraData: Record<string, unknown>; classes?: string }> = [];
    const topology = this.adaptor.currentClabTopo?.topology;

    for (const el of this.lastTopologyElements) {
      if (el.group !== 'edges') continue;
      const update = this.buildSingleEdgeUpdate(el, labs, topology);
      if (update) {
        updates.push(update);
      }
    }

    return updates;
  }

  /**
   * Build update for a single edge element.
   */
  private buildSingleEdgeUpdate(
    el: CyElement,
    labs: Record<string, ClabLabTreeNode>,
    topology: ClabTopology['topology'] | undefined
  ): { id: string; extraData: Record<string, unknown>; classes?: string } | null {
    const data = el.data as Record<string, unknown>;
    const edgeId = data.id as string;
    const extraData = (data.extraData ?? {}) as Record<string, unknown>;

    // Look up fresh interface data
    const { sourceIface, targetIface } = this.lookupEdgeInterfaces(data, extraData, labs);

    // Build updated extraData from interfaces
    const updatedExtraData = this.buildInterfaceExtraData(sourceIface, targetIface);

    // Compute edge class based on interface states
    const edgeClass = this.computeEdgeClassForUpdate(
      topology, extraData, data, sourceIface?.state, targetIface?.state
    );

    // Only return update if we have something to update
    if (Object.keys(updatedExtraData).length === 0) {
      return null;
    }

    return { id: edgeId, extraData: updatedExtraData, classes: edgeClass };
  }

  /**
   * Look up source and target interfaces for an edge.
   */
  private lookupEdgeInterfaces(
    data: Record<string, unknown>,
    extraData: Record<string, unknown>,
    labs: Record<string, ClabLabTreeNode>
  ): { sourceIface: ReturnType<typeof findInterfaceNode>; targetIface: ReturnType<typeof findInterfaceNode> } {
    const sourceIfaceName = this.normalizeInterfaceName(extraData.clabSourcePort, data.sourceEndpoint);
    const targetIfaceName = this.normalizeInterfaceName(extraData.clabTargetPort, data.targetEndpoint);

    const sourceIface = findInterfaceNode(
      labs, (extraData.clabSourceLongName as string) ?? '', sourceIfaceName, this.currentLabName
    );
    const targetIface = findInterfaceNode(
      labs, (extraData.clabTargetLongName as string) ?? '', targetIfaceName, this.currentLabName
    );

    return { sourceIface, targetIface };
  }

  /**
   * Build extraData object from interface data.
   */
  private buildInterfaceExtraData(
    sourceIface: ReturnType<typeof findInterfaceNode>,
    targetIface: ReturnType<typeof findInterfaceNode>
  ): Record<string, unknown> {
    const updatedExtraData: Record<string, unknown> = {};

    if (sourceIface) {
      this.applyInterfaceToExtraData(updatedExtraData, 'Source', sourceIface);
    }
    if (targetIface) {
      this.applyInterfaceToExtraData(updatedExtraData, 'Target', targetIface);
    }

    return updatedExtraData;
  }

  /**
   * Apply interface data to extraData object with given prefix.
   */
  private applyInterfaceToExtraData(
    extraData: Record<string, unknown>,
    prefix: 'Source' | 'Target',
    iface: NonNullable<ReturnType<typeof findInterfaceNode>>
  ): void {
    extraData[`clab${prefix}InterfaceState`] = iface.state || '';
    extraData[`clab${prefix}MacAddress`] = iface.mac ?? '';
    extraData[`clab${prefix}Mtu`] = iface.mtu ?? '';
    extraData[`clab${prefix}Type`] = iface.type ?? '';
    const stats = extractEdgeInterfaceStats(iface);
    if (stats) {
      extraData[`clab${prefix}Stats`] = stats;
    }
  }

  /**
   * Compute edge class for an update.
   */
  private computeEdgeClassForUpdate(
    topology: ClabTopology['topology'] | undefined,
    extraData: Record<string, unknown>,
    data: Record<string, unknown>,
    sourceState?: string,
    targetState?: string
  ): string | undefined {
    if (!topology) return undefined;
    const sourceNodeId = (extraData.yamlSourceNodeId as string) || (data.source as string);
    const targetNodeId = (extraData.yamlTargetNodeId as string) || (data.target as string);
    return computeEdgeClassFromStates(topology, sourceNodeId, targetNodeId, sourceState, targetState);
  }

  /**
   * Normalize interface name, using fallback if primary is empty.
   */
  private normalizeInterfaceName(value: unknown, fallback: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
    return '';
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
