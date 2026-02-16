/**
 * ReactTopoViewerProvider - Main orchestrator for React TopoViewer
 *
 * This is a thin orchestrator that coordinates:
 * - Panel lifecycle (via PanelManager)
 * - Message routing (via MessageRouter)
 * - File/Docker watchers (via WatcherManager)
 * - Topology data loading (via TopologyHost)
 */

import * as vscode from "vscode";

import { runningLabsProvider } from "../../globals";
import type { ClabLabTreeNode } from "../../treeView/common";
import { TopologyHostCore } from "../shared/host/TopologyHostCore";
import { nodeFsAdapter } from "../shared/io";
import {
  MSG_EDGE_STATS_UPDATE,
  MSG_FIT_VIEWPORT,
  MSG_NODE_DATA_UPDATED,
  MSG_TOPO_MODE_CHANGE
} from "../shared/messages/webview";
import type { TopoEdge } from "../shared/types/graph";
import { TOPOLOGY_HOST_PROTOCOL_VERSION } from "../shared/types/messages";

import { log } from "./services/logger";
import { ContainerDataAdapter } from "./services/ContainerDataAdapter";
import { deploymentStateChecker } from "./services/DeploymentStateChecker";
import { buildEdgeStatsUpdates, buildNodeRuntimeUpdates } from "./services/EdgeStatsBuilder";
import { SplitViewManager } from "./services/SplitViewManager";
import {
  createPanel,
  generateWebviewHtml,
  type PanelConfig,
  MessageRouter,
  WatcherManager,
  buildBootstrapData
} from "./panel";

const INTERNAL_UPDATE_GRACE_MS = 250;
const INTERNAL_UPDATE_CACHE_SYNC_DELAY_MS = 50;
/**
 * React TopoViewer class that manages the webview panel
 */
export class ReactTopoViewer {
  public currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = "reactTopoViewer";
  private topologyHost: TopologyHostCore | undefined;
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
  private internalUpdateGraceUntil = 0;
  private internalUpdateGraceTimer: ReturnType<typeof setTimeout> | undefined;
  private internalUpdateCacheSyncTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.watcherManager = new WatcherManager();
  }

  /**
   * Track internal updates and provide a short grace window for file watchers.
   * This prevents internal writes from being treated as external changes.
   */
  private setInternalUpdate(updating: boolean): void {
    if (updating) {
      // Clear any pending timers when starting a new internal update
      if (this.internalUpdateGraceTimer) {
        clearTimeout(this.internalUpdateGraceTimer);
        this.internalUpdateGraceTimer = undefined;
      }
      if (this.internalUpdateCacheSyncTimer) {
        clearTimeout(this.internalUpdateCacheSyncTimer);
        this.internalUpdateCacheSyncTimer = undefined;
      }
      this.internalUpdateDepth += 1;
      return;
    }

    this.internalUpdateDepth = Math.max(0, this.internalUpdateDepth - 1);
    if (this.internalUpdateDepth > 0) return;

    // Grace window to ignore delayed file watcher events from internal writes.
    this.internalUpdateGraceUntil = Date.now() + INTERNAL_UPDATE_GRACE_MS;
    if (this.internalUpdateGraceTimer) {
      clearTimeout(this.internalUpdateGraceTimer);
    }
    this.internalUpdateGraceTimer = setTimeout(() => {
      this.internalUpdateGraceUntil = 0;
      this.internalUpdateGraceTimer = undefined;
    }, INTERNAL_UPDATE_GRACE_MS);

    // Refresh caches after internal writes settle.
    if (this.internalUpdateCacheSyncTimer) {
      clearTimeout(this.internalUpdateCacheSyncTimer);
    }
    this.internalUpdateCacheSyncTimer = setTimeout(() => {
      if (this.lastYamlFilePath) {
        void this.watcherManager.refreshContentCaches(this.lastYamlFilePath);
      }
      this.internalUpdateCacheSyncTimer = undefined;
    }, INTERNAL_UPDATE_CACHE_SYNC_DELAY_MS);
  }

  private async loadRunningLabsData(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    try {
      return (await runningLabsProvider.discoverInspectLabs()) as
        | Record<string, ClabLabTreeNode>
        | undefined;
    } catch (err) {
      log.warn(`Failed to load running lab data: ${err}`);
      return undefined;
    }
  }

  /**
   * Initialize watchers for file changes and docker images
   */
  private initializeWatchers(panel: vscode.WebviewPanel): void {
    const updateController = {
      isInternalUpdate: () =>
        this.internalUpdateDepth > 0 || Date.now() < this.internalUpdateGraceUntil
    };
    const postSnapshot = (snapshot: unknown) => {
      panel.webview.postMessage({
        type: "topology-host:snapshot",
        protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
        snapshot,
        reason: "external-change"
      });
    };

    this.watcherManager.setupFileWatcher(
      this.lastYamlFilePath,
      updateController,
      () => this.topologyHost?.onExternalChange() ?? Promise.resolve(null),
      postSnapshot
    );
    this.watcherManager.setupSaveListener(
      this.lastYamlFilePath,
      updateController,
      () => this.topologyHost?.onExternalChange() ?? Promise.resolve(null),
      postSnapshot
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
        this.internalUpdateGraceUntil = 0;
        if (this.internalUpdateGraceTimer) {
          clearTimeout(this.internalUpdateGraceTimer);
          this.internalUpdateGraceTimer = undefined;
        }
        if (this.internalUpdateCacheSyncTimer) {
          clearTimeout(this.internalUpdateCacheSyncTimer);
          this.internalUpdateCacheSyncTimer = undefined;
        }
        this.topologyHost?.dispose();
        this.topologyHost = undefined;
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
      this.cacheClabTreeDataToTopoviewer = await this.loadRunningLabsData();
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

    await this.initializeLabState(labName);

    const containerDataProvider = this.isViewMode
      ? new ContainerDataAdapter(this.cacheClabTreeDataToTopoviewer)
      : undefined;

    this.topologyHost = new TopologyHostCore({
      fs: nodeFsAdapter,
      yamlFilePath: this.lastYamlFilePath,
      mode: this.isViewMode ? "view" : "edit",
      deploymentState: this.deploymentState,
      containerDataProvider,
      setInternalUpdate: (updating: boolean) => this.setInternalUpdate(updating),
      logger: log
    });

    this.messageRouter = new MessageRouter({
      yamlFilePath: this.lastYamlFilePath,
      isViewMode: this.isViewMode,
      splitViewManager: this.splitViewManager,
      topologyHost: this.topologyHost,
      setInternalUpdate: (updating: boolean) => this.setInternalUpdate(updating),
      onHostSnapshot: (snapshot) => {
        if (!snapshot) return;
        this.lastTopologyEdges = snapshot.edges ?? [];
        if (snapshot.labName && snapshot.labName !== this.currentLabName) {
          this.currentLabName = snapshot.labName;
          if (this.currentPanel) {
            this.currentPanel.title = snapshot.labName;
          }
        }
      }
    });

    this.initializeWatchers(panel);

    const bootstrapData = await buildBootstrapData({
      extensionUri: this.context.extensionUri,
      yamlFilePath: this.lastYamlFilePath
    });

    panel.webview.html = generateWebviewHtml({
      webview: panel.webview,
      extensionUri: context.extensionUri,
      bootstrapData
    });

    this.setupPanelHandlers(panel, context);
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
      const bootstrapData = await buildBootstrapData({
        extensionUri: this.context.extensionUri,
        yamlFilePath: this.lastYamlFilePath
      });
      panel.webview.html = generateWebviewHtml({
        webview: panel.webview,
        extensionUri: this.context.extensionUri,
        bootstrapData
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
      this.cacheClabTreeDataToTopoviewer = this.isViewMode
        ? await this.loadRunningLabsData()
        : undefined;

      if (this.topologyHost) {
        const containerDataProvider = this.isViewMode
          ? new ContainerDataAdapter(this.cacheClabTreeDataToTopoviewer)
          : undefined;
        this.topologyHost.updateContext({
          mode: this.isViewMode ? "view" : "edit",
          deploymentState: this.deploymentState,
          containerDataProvider
        });
        const snapshot = await this.topologyHost.getSnapshot();
        this.lastTopologyEdges = snapshot.edges ?? [];
        this.currentPanel.webview.postMessage({
          type: "topology-host:snapshot",
          protocolVersion: TOPOLOGY_HOST_PROTOCOL_VERSION,
          snapshot,
          reason: "resync"
        });
      }

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
      type: MSG_TOPO_MODE_CHANGE,
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
   * Updates edge elements with fresh interface stats (rxBps, txBps, etc.)
   * and topology node runtime state (running/stopped/paused).
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
      if (this.topologyHost && this.isViewMode) {
        this.topologyHost.updateContext({
          containerDataProvider: new ContainerDataAdapter(labsData)
        });
      }

      // Build edge stats updates from cached edges using extracted builder
      const edgeUpdates = buildEdgeStatsUpdates(this.lastTopologyEdges, labsData, {
        currentLabName: this.currentLabName,
        topology: this.topologyHost?.currentClabTopology?.topology
      });
      const nodeUpdates = buildNodeRuntimeUpdates(labsData, this.currentLabName);

      if (edgeUpdates.length > 0) {
        // Send only edge stats updates (not full topology)
        this.currentPanel.webview.postMessage({
          type: MSG_EDGE_STATS_UPDATE,
          data: { edgeUpdates }
        });
      }

      if (nodeUpdates.length > 0) {
        this.currentPanel.webview.postMessage({
          type: MSG_NODE_DATA_UPDATED,
          data: { nodeUpdates }
        });
      }
    } catch (err) {
      log.error(`[ReactTopoViewer] Failed to refresh link states: ${err}`);
    }
  }

  public requestFitViewport(): void {
    if (!this.currentPanel) {
      return;
    }
    this.currentPanel.webview.postMessage({ type: MSG_FIT_VIEWPORT });
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
