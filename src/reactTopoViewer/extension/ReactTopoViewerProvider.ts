/**
 * ReactTopoViewerProvider - Main orchestrator for React TopoViewer
 *
 * This is a thin orchestrator that coordinates:
 * - Panel lifecycle (via PanelManager)
 * - Message routing (via MessageRouter)
 * - File/Docker watchers (via WatcherManager)
 * - Topology data loading (via TopologyHost)
 */

import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";

import { runningLabsProvider } from "../../globals";
import type { ClabLabTreeNode } from "../../treeView/common";
import {
  MSG_EDGE_STATS_UPDATE,
  MSG_FIT_VIEWPORT,
  MSG_NODE_DATA_UPDATED,
  MSG_TOPO_MODE_CHANGE,
  TopologySessionCore as TopologyHostCore,
  buildRuntimeEdgeStatsUpdates,
  buildRuntimeNodeUpdates,
  createRuntimeContainerDataProvider,
  buildTopologySnapshotMessage,
  type TopoEdge,
  type TopologySnapshot
} from "@srl-labs/clab-ui/session";
import type { HostRuntimeContainer } from "@srl-labs/clab-ui/host";
import { nodeFsAdapter } from "./shared/io";

import { formatErrorMessage, log } from "./services/logger";
import { deploymentStateChecker } from "./services/DeploymentStateChecker";
import { SplitViewManager } from "./services/SplitViewManager";
import { labsToRuntimeContainers } from "./services/runtimeContainers";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClabLabTreeNodeValue(value: unknown): value is ClabLabTreeNode {
  if (!isRecord(value)) return false;
  if (!isRecord(value.labPath)) return false;
  return typeof value.labPath.absolute === "string";
}

function isTopologySnapshotValue(value: unknown): value is TopologySnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.revision === "number" &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    typeof value.labName === "string" &&
    typeof value.mode === "string" &&
    typeof value.deploymentState === "string"
  );
}

function toClabLabNodeRecord(value: unknown): Record<string, ClabLabTreeNode> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, ClabLabTreeNode> = {};
  for (const [labName, node] of Object.entries(value)) {
    if (!isClabLabTreeNodeValue(node)) continue;
    result[labName] = node;
  }
  return result;
}
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
  public deploymentState: "deployed" | "undeployed" | "unknown" = "unknown";
  /** Whether the on-disk topology diverged from the deployed runtime (apply pending). */
  private dirtyState: boolean | undefined;
  private runtimeContainers: HostRuntimeContainer[] = [];
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

  private async loadRunningLabRuntimeContainers(): Promise<HostRuntimeContainer[]> {
    try {
      const labsData = await runningLabsProvider.discoverInspectLabs();
      return labsToRuntimeContainers(toClabLabNodeRecord(labsData));
    } catch (err) {
      log.warn(`Failed to load running lab data: ${formatErrorMessage(err)}`);
      return [];
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
      if (!isTopologySnapshotValue(snapshot)) {
        return;
      }
      panel.webview.postMessage(buildTopologySnapshotMessage(snapshot, "external-change"));
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
        this.runtimeContainers = [];
        this.watcherManager.dispose();
      },
      null,
      context.subscriptions
    );

    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (this.messageRouter && isRecord(message)) {
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
      log.warn(`Failed to check deployment state: ${formatErrorMessage(err)}`);
      this.deploymentState = "unknown";
    }
    this.dirtyState = this.computeDirtyState();

    if (this.isDeployed) {
      this.runtimeContainers = await this.loadRunningLabRuntimeContainers();
    }
  }

  /** Whether the lab is running, i.e. runtime data should be attached. */
  public get isDeployed(): boolean {
    return this.deploymentState === "deployed";
  }

  /**
   * Compare the topology file against the lab state file containerlab writes on
   * deploy/apply (`clab-<lab>/.state.clab.yaml`, containerlab >= 0.77). A newer
   * topology file means `containerlab apply` has pending changes. Returns
   * `undefined` (unknown) when the lab is not running or the state file is
   * unavailable.
   */
  private computeDirtyState(): boolean | undefined {
    if (this.deploymentState !== "deployed") {
      return undefined;
    }
    const yamlPath = this.lastYamlFilePath;
    const labName = this.currentLabName;
    if (!yamlPath || !labName) {
      return undefined;
    }
    try {
      const stateFilePath = path.join(
        path.dirname(yamlPath),
        `clab-${labName}`,
        ".state.clab.yaml"
      );
      const yamlStat = fs.statSync(yamlPath);
      const stateStat = fs.statSync(stateFilePath);
      return yamlStat.mtimeMs > stateStat.mtimeMs;
    } catch {
      return undefined;
    }
  }

  /**
   * Creates a new webview panel for the React TopoViewer
   */
  public async createWebviewPanel(
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri,
    labName: string
  ): Promise<void> {
    this.currentLabName = labName;

    if (fileUri.fsPath.length > 0) {
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
      column: column ?? vscode.ViewColumn.One,
      extensionUri: context.extensionUri
    };
    const panel = createPanel(config);
    this.currentPanel = panel;

    await this.initializeLabState(labName);

    // The topology is always editable; runtime data attaches when deployed.
    this.topologyHost = new TopologyHostCore({
      fs: nodeFsAdapter,
      yamlFilePath: this.lastYamlFilePath,
      mode: "edit",
      deploymentState: this.deploymentState,
      dirty: this.dirtyState,
      containerDataProvider: this.isDeployed
        ? createRuntimeContainerDataProvider(this.runtimeContainers)
        : undefined,
      setInternalUpdate: (updating: boolean) => this.setInternalUpdate(updating),
      logger: log
    });

    this.messageRouter = new MessageRouter({
      yamlFilePath: this.lastYamlFilePath,
      splitViewManager: this.splitViewManager,
      topologyHost: this.topologyHost,
      setInternalUpdate: (updating: boolean) => this.setInternalUpdate(updating),
      onHostSnapshot: (snapshot) => {
        this.lastTopologyEdges = snapshot.edges;
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
      log.error(`Failed to update panel: ${formatErrorMessage(err)}`);
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
      // Deploy/apply/redeploy refresh the containerlab state file, so the mtime
      // comparison reflects the new baseline right after a lifecycle command.
      this.dirtyState = this.computeDirtyState();

      // Reload running lab data when the lab is (still) deployed
      this.runtimeContainers = this.isDeployed ? await this.loadRunningLabRuntimeContainers() : [];

      if (this.topologyHost) {
        this.topologyHost.updateContext({
          deploymentState: this.deploymentState,
          dirty: this.dirtyState,
          containerDataProvider: this.isDeployed
            ? createRuntimeContainerDataProvider(this.runtimeContainers)
            : undefined
        });
        const snapshot = await this.topologyHost.getSnapshot();
        this.lastTopologyEdges = snapshot.edges;
        this.currentPanel.webview.postMessage(buildTopologySnapshotMessage(snapshot, "resync"));
      }

      // Notify webview of mode change
      await this.notifyWebviewModeChanged();

      log.info(
        `[ReactTopoViewer] Refreshed after ${newDeploymentState === "deployed" ? "deploy" : "destroy"}`
      );
      return true;
    } catch (err) {
      log.error(
        `[ReactTopoViewer] Failed to refresh after external command: ${formatErrorMessage(err)}`
      );
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

    this.currentPanel.webview.postMessage({
      type: MSG_TOPO_MODE_CHANGE,
      data: {
        mode: "editor",
        deploymentState: this.deploymentState,
        ...(this.dirtyState !== undefined ? { dirty: this.dirtyState } : {})
      }
    });

    log.info(`[ReactTopoViewer] Deployment state changed to: ${this.deploymentState}`);
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
    if (!this.currentPanel || !this.isDeployed) {
      return;
    }

    try {
      const runtimeContainers = labsToRuntimeContainers(labsData);
      this.runtimeContainers = runtimeContainers;
      if (this.topologyHost) {
        this.topologyHost.updateContext({
          containerDataProvider: createRuntimeContainerDataProvider(runtimeContainers)
        });
      }

      const edgeUpdates = buildRuntimeEdgeStatsUpdates(this.lastTopologyEdges, runtimeContainers, {
        currentLabName: this.currentLabName,
        topology: this.topologyHost?.currentClabTopology?.topology
      });
      const nodeUpdates = buildRuntimeNodeUpdates(runtimeContainers, this.currentLabName);

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
      log.error(`[ReactTopoViewer] Failed to refresh link states: ${formatErrorMessage(err)}`);
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
    ReactTopoViewerProvider.instance ??= new ReactTopoViewerProvider(context);
    return ReactTopoViewerProvider.instance;
  }

  /**
   * Open or create a React TopoViewer for the given lab
   */
  public async openViewer(labPath: string, labName: string): Promise<ReactTopoViewer> {
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
      labName
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
