/**
 * ReactTopoViewerProvider - Main orchestrator for React TopoViewer
 *
 * This is a thin orchestrator that coordinates:
 * - Panel lifecycle (via PanelManager)
 * - Message routing (via MessageRouter)
 * - File/Docker watchers (via WatcherManager)
 * - Topology data loading (via TopologyAdapter)
 */

import * as path from "path";

import * as vscode from "vscode";

import { nodeFsAdapter } from "../shared/io";
import type { ClabTopology } from "../shared/types/topology";
import type { TopoEdge } from "../shared/types/graph";
import type { ClabLabTreeNode } from "../../treeView/common";
import { runningLabsProvider } from "../../globals";

import { log } from "./services/logger";
import { TopoViewerAdaptorClab } from "./services/TopologyAdapter";
import { deploymentStateChecker } from "./services/DeploymentStateChecker";
import { annotationsIO } from "./services/annotations";
import { buildEdgeStatsUpdates } from "./services/EdgeStatsBuilder";
import { SplitViewManager } from "./services/SplitViewManager";
import {
  createPanel,
  generateWebviewHtml,
  type PanelConfig,
  MessageRouter,
  WatcherManager,
  buildBootstrapData
} from "./panel";

/** Message type for topology data updates sent to webview */
const MSG_TOPOLOGY_DATA = "topology-data";

/** Message type for incremental edge stats updates */
const MSG_EDGE_STATS_UPDATE = "edge-stats-update";

/**
 * React TopoViewer class that manages the webview panel
 */
export class ReactTopoViewer {
  public currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = "reactTopoViewer";
  private adaptor: TopoViewerAdaptorClab;
  public context: vscode.ExtensionContext;
  public lastYamlFilePath: string = "";
  public currentLabName: string = "";
  public isViewMode: boolean = false;
  public deploymentState: "deployed" | "undeployed" | "unknown" = "unknown";
  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;
  private lastTopologyEdges: TopoEdge[] = [];
  private watcherManager: WatcherManager;
  private messageRouter: MessageRouter | undefined;
  private splitViewManager: SplitViewManager = new SplitViewManager();
  private internalUpdateDepth = 0;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
    this.watcherManager = new WatcherManager();
  }

  private setInternalUpdate(updating: boolean): void {
    if (updating) {
      this.internalUpdateDepth += 1;
      return;
    }
    this.internalUpdateDepth = Math.max(0, this.internalUpdateDepth - 1);
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
  private async reconcileAnnotationsForRenamedNodes(
    parsedTopo: ClabTopology | undefined
  ): Promise<boolean> {
    if (!this.lastYamlFilePath || !parsedTopo?.topology?.nodes) {
      return false;
    }

    const yamlNodeIds = new Set(Object.keys(parsedTopo.topology.nodes));
    try {
      const annotations = await annotationsIO.loadAnnotations(this.lastYamlFilePath);
      const nodeAnnotations = annotations.nodeAnnotations ?? [];
      const missingIds = [...yamlNodeIds].filter((id) => !nodeAnnotations.some((n) => n.id === id));
      const orphanAnnotations = nodeAnnotations.filter((n) => !yamlNodeIds.has(n.id));

      if (missingIds.length === 1 && orphanAnnotations.length > 0) {
        const newId = missingIds[0];
        const newPrefix = this.getIdPrefix(newId);
        const prefixMatches = orphanAnnotations.filter((n) => this.getIdPrefix(n.id) === newPrefix);
        const candidate = prefixMatches[0] || orphanAnnotations[0];
        if (candidate) {
          const oldId = candidate.id;
          candidate.id = newId;
          await annotationsIO.saveAnnotations(this.lastYamlFilePath, annotations);
          log.info(
            `[ReactTopoViewer] Migrated annotation id from ${oldId} to ${newId} after YAML rename`
          );
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
    const updateController = { isInternalUpdate: () => this.internalUpdateDepth > 0 };
    const postTopologyData = (data: unknown) => {
      panel.webview.postMessage({ type: MSG_TOPOLOGY_DATA, data });
    };
    const notifyExternalChange = () => {
      panel.webview.postMessage({ type: "external-file-change" });
    };

    this.watcherManager.setupFileWatcher(
      this.lastYamlFilePath,
      updateController,
      () => this.loadTopologyData(),
      postTopologyData,
      notifyExternalChange
    );
    this.watcherManager.setupSaveListener(
      this.lastYamlFilePath,
      updateController,
      () => this.loadTopologyData(),
      postTopologyData,
      notifyExternalChange
    );
    this.watcherManager.setupDockerImagesSubscription(panel);
  }

  /**
   * Set up panel event handlers
   */
  private setupPanelHandlers(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): void {
    panel.onDidDispose(
      () => {
        this.currentPanel = undefined;
        this.internalUpdateDepth = 0;
        this.watcherManager.dispose();
      },
      null,
      context.subscriptions
    );

    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (this.messageRouter) {
          await this.messageRouter.handleMessage(message as Record<string, unknown>, panel);
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
      this.deploymentState = "unknown";
    }

    if (this.isViewMode) {
      try {
        this.cacheClabTreeDataToTopoviewer = (await runningLabsProvider.discoverInspectLabs()) as
          | Record<string, ClabLabTreeNode>
          | undefined;
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
      loadTopologyData: () => this.loadTopologyData(),
      splitViewManager: this.splitViewManager,
      setInternalUpdate: (updating: boolean) => this.setInternalUpdate(updating),
      onInternalFileWritten: (filePath: string, content: string) => {
        if (path.resolve(filePath) === path.resolve(this.lastYamlFilePath)) {
          this.watcherManager.setLastYamlContent(content);
        }
      }
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
      this.lastTopologyEdges = [];
      return null;
    }

    try {
      const yamlContent = await nodeFsAdapter.readFile(this.lastYamlFilePath);
      let topologyData = await this.adaptor.parseTopology(
        yamlContent,
        this.cacheClabTreeDataToTopoviewer,
        this.lastYamlFilePath
      );
      const annotationsUpdated = await this.reconcileAnnotationsForRenamedNodes(
        this.adaptor.currentClabTopo
      );
      if (annotationsUpdated) {
        topologyData = await this.adaptor.parseTopology(
          yamlContent,
          this.cacheClabTreeDataToTopoviewer,
          this.lastYamlFilePath
        );
      }
      this.lastTopologyEdges = topologyData.edges;
      this.watcherManager.setLastYamlContent(yamlContent);

      // Load annotations (free text + free shapes + groups + nodes)
      const annotations = await annotationsIO.loadAnnotations(this.lastYamlFilePath);
      const freeTextAnnotations = annotations.freeTextAnnotations || [];
      const freeShapeAnnotations = annotations.freeShapeAnnotations || [];
      const groupStyleAnnotations = annotations.groupStyleAnnotations || [];
      const nodeAnnotations = annotations.nodeAnnotations || [];
      const edgeAnnotations = annotations.edgeAnnotations || [];
      const viewerSettings = annotations.viewerSettings;

      // Use lab name from parsed YAML (source of truth), fallback to stored name
      const parsedLabName = this.adaptor.currentClabName || this.currentLabName;

      // Update stored name if it changed in the YAML
      if (parsedLabName && parsedLabName !== this.currentLabName) {
        this.currentLabName = parsedLabName;
        // Update panel title to reflect the new name
        if (this.currentPanel) {
          this.currentPanel.title = parsedLabName;
        }
      }

      // Build and return bootstrap data for the webview
      return buildBootstrapData({
        nodes: topologyData.nodes,
        edges: topologyData.edges,
        labName: parsedLabName,
        isViewMode: this.isViewMode,
        deploymentState: this.deploymentState,
        extensionUri: this.context.extensionUri,
        yamlFilePath: this.lastYamlFilePath,
        freeTextAnnotations,
        freeShapeAnnotations,
        groupStyleAnnotations,
        nodeAnnotations,
        edgeAnnotations,
        viewerSettings
      });
    } catch (err) {
      this.lastTopologyEdges = [];
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
  ): Promise<"deployed" | "undeployed" | "unknown"> {
    return deploymentStateChecker.checkDeploymentState(labName, topoFilePath, (newName: string) => {
      this.currentLabName = newName;
    });
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
    newDeploymentState: "deployed" | "undeployed"
  ): Promise<boolean> {
    if (!this.currentPanel) {
      return false;
    }

    try {
      // Update internal state
      this.deploymentState = newDeploymentState;
      this.isViewMode = newDeploymentState === "deployed";

      // Update message router context
      if (this.messageRouter) {
        this.messageRouter.updateContext({ isViewMode: this.isViewMode });
      }

      // Reload running lab data if switching to view mode
      if (this.isViewMode) {
        try {
          this.cacheClabTreeDataToTopoviewer = (await runningLabsProvider.discoverInspectLabs()) as
            | Record<string, ClabLabTreeNode>
            | undefined;
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

      log.info(
        `[ReactTopoViewer] Refreshed after ${newDeploymentState === "deployed" ? "deploy" : "destroy"}`
      );
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

    const mode = this.isViewMode ? "viewer" : "editor";

    this.currentPanel.webview.postMessage({
      type: "topo-mode-changed",
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

      // Build edge stats updates from cached edges using extracted builder
      const edgeUpdates = buildEdgeStatsUpdates(this.lastTopologyEdges, labsData, {
        currentLabName: this.currentLabName,
        topology: this.adaptor.currentClabTopo?.topology
      });

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
      labPath ? vscode.Uri.file(labPath) : vscode.Uri.parse(""),
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
