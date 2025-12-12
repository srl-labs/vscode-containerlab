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
import * as fs from 'fs';

import { log } from './services/logger';
import { TopoViewerAdaptorClab } from './services/TopologyAdapter';
import { CyElement, ClabTopology } from '../shared/types/topology';
import { ClabLabTreeNode } from '../../treeView/common';
import { runningLabsProvider } from '../../extension';
import { deploymentStateChecker } from './services/DeploymentStateChecker';
import { annotationsManager } from './services/AnnotationsManager';
import { saveTopologyService } from './services/SaveTopologyService';

import {
  createPanel,
  generateWebviewHtml,
  PanelConfig
} from './panel/PanelManager';
import { MessageRouter, WebviewMessage } from './panel/MessageRouter';
import { WatcherManager } from './panel/Watchers';
import { buildBootstrapData } from './panel/BootstrapDataBuilder';

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

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
    this.watcherManager = new WatcherManager();
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
   * Initialize watchers for file changes and docker images
   */
  private initializeWatchers(panel: vscode.WebviewPanel): void {
    const updateController = { isInternalUpdate: () => this.isInternalUpdate };
    const postTopologyData = (data: unknown) => {
      panel.webview.postMessage({ type: 'topology-data', data });
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
      title: `TopoViewer (React): ${labName}`,
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
      extensionContext: context
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
      const yamlContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
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

      // Initialize SaveTopologyService with the parsed document
      if (this.adaptor.currentClabDoc && !this.isViewMode) {
        saveTopologyService.initialize(
          this.adaptor.currentClabDoc,
          this.lastYamlFilePath,
          (updating: boolean) => { this.isInternalUpdate = updating; }
        );
      }

      // Load annotations (free text + free shapes + groups + nodes)
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
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
