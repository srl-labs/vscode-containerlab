import * as vscode from 'vscode';
import * as path from 'path';

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';

import { generateWebviewHtml, EditorTemplateParams, ViewerTemplateParams, TemplateMode } from '../htmlTemplateUtils';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabLabTreeNode, ClabContainerTreeNode } from "../../treeView/common";
import * as inspector from "../../treeView/inspector";
import { runningLabsProvider, refreshDockerImages } from "../../extension";

import { validateYamlContent } from '../utilities/yamlValidator';
import { saveViewport } from '../utilities/saveViewport';
import { annotationsManager } from '../utilities/annotationsManager';
import { perfMark, perfMeasure, perfSummary } from '../utilities/performanceMonitor';

// Common configuration section key used throughout this module
const CONFIG_SECTION = 'containerlab.editor';

interface WebviewMessage {
  type?: string;
  requestId?: string;
  endpointName?: string;
  payload?: string;
  command?: string;
  level?: string;
  message?: string;
  fileLine?: string;
}

/**
 * Class representing the TopoViewer Editor Webview Panel.
 * This class is responsible for creating and managing the webview panel
 * that displays the Cytoscape graph.
 */
export class TopoViewerEditor {
  public currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'topoViewerEditor';
  private adaptor: TopoViewerAdaptorClab;
  public context: vscode.ExtensionContext;
  public lastYamlFilePath: string = '';
  public lastFolderName: string | undefined;
  public targetDirPath: string | undefined;
  public createTopoYamlTemplateSuccess: boolean = false;
  public currentLabName: string = '';
  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private saveListener: vscode.Disposable | undefined;
  private isInternalUpdate: boolean = false; // Flag to prevent feedback loops
  private isUpdating: boolean = false; // Prevent duplicate updates
  private queuedUpdate: boolean = false; // Indicates an update is queued
  private queuedSaveAck: boolean = false; // If any queued update came from a manual save
  private skipInitialValidation: boolean = false; // Skip schema check for template
  public isViewMode: boolean = false; // Indicates if running in view-only mode
  public deploymentState: 'deployed' | 'undeployed' | 'unknown' = 'unknown';
  private isSwitchingMode: boolean = false; // Flag to prevent concurrent mode switches
  private isSplitViewOpen: boolean = false; // Track if YAML split view is open

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getContainerNode(nodeName: string): Promise<ClabContainerTreeNode | undefined> {
    const labs = await runningLabsProvider?.discoverInspectLabs();
    if (!labs) {
      return undefined;
    }
    for (const lab of Object.values(labs)) {
      const container = lab.containers?.find(
        (c) => c.name === nodeName || c.name_short === nodeName || (c.label as string) === nodeName
      );
      if (container) {
        return container;
      }
    }
    return undefined;
  }

  private async validateYaml(yamlContent: string): Promise<boolean> {
    return validateYamlContent(this.context, yamlContent);
  }

  private setupFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    if (this.lastYamlFilePath) {
      const fileUri = vscode.Uri.file(this.lastYamlFilePath);
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

      this.fileWatcher.onDidChange(async () => {
        // Prevent feedback loop
        if (this.isInternalUpdate) {
          return;
        }

        // Check if content actually changed
        try {
          const currentContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
          const cachedContent = this.context.workspaceState.get<string>(`cachedYaml_${this.currentLabName}`);

          // If content hasn't changed, don't do anything
          if (cachedContent === currentContent) {
            log.debug('File watcher: YAML content unchanged, ignoring');
            return;
          }
        } catch (err) {
          log.error(`Error checking YAML content in file watcher: ${err}`);
        }

        void this.triggerUpdate(false);
      });
    }
  }

  private setupSaveListener(): void {
    if (this.saveListener) {
      this.saveListener.dispose();
    }

    if (this.lastYamlFilePath) {
      this.saveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.fsPath !== this.lastYamlFilePath) {
          return;
        }

        if (this.isInternalUpdate) {
          return;
        }

        void this.handleManualSave();
      });
    }
  }

  private async handleManualSave(): Promise<void> {
    // Read the current file content
    try {
      const currentContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
      const cachedContent = this.context.workspaceState.get<string>(`cachedYaml_${this.currentLabName}`);

      // If the content hasn't changed, don't do anything at all
      if (cachedContent === currentContent) {
        log.debug('Save listener: YAML content unchanged, ignoring completely');
        return;
      }
    } catch (err) {
      log.error(`Error checking YAML content: ${err}`);
    }

    // Content has changed, proceed with normal update
    await this.triggerUpdate(true);
  }

  private async triggerUpdate(sendSaveAck: boolean): Promise<void> {
    if (this.isUpdating) {
      this.queuedUpdate = true;
      this.queuedSaveAck = this.queuedSaveAck || sendSaveAck;
      return;
    }

    if (this.isSwitchingMode) {
      return;
    }

    try {
      const success = await this.updatePanelHtml(this.currentPanel);
      if (success) {
        if ((sendSaveAck || this.queuedSaveAck) && this.currentPanel) {
          this.currentPanel.webview.postMessage({ type: 'yaml-saved' });
        }
      } else {
        // updatePanelHtml returns false for various reasons, not just validation
        // The actual error message (if any) has already been shown
        log.debug('Panel update returned false - see previous logs for details');
      }
    } catch (err) {
      log.error(`Error updating topology: ${err}`);
      vscode.window.showErrorMessage(`Error updating topology: ${err}`);
    }

    if (this.queuedUpdate) {
      const nextSaveAck = this.queuedSaveAck;
      this.queuedUpdate = false;
      this.queuedSaveAck = false;
      await this.triggerUpdate(nextSaveAck);
    }
  }

  /**
   * Creates the directory (if needed) and writes out the YAML template
   * to a file path, ensuring it ends with '.clab.yml'.
   *
    * @param requestedFileUri - The URI suggested by the user (e.g., from a save dialog).
    */
  public async createTemplateFile(requestedFileUri: vscode.Uri): Promise<void> {
    // Parse the requested file path
    const requestedPath = requestedFileUri.fsPath;
    const parsedPath = path.parse(requestedPath);

    // Extract the base name (without any extension)
    let baseNameWithoutExt = parsedPath.name;

    // Handle case where the name might include ".clab"
    if (baseNameWithoutExt.toLowerCase().endsWith('.clab')) {
      baseNameWithoutExt = baseNameWithoutExt.substring(0, baseNameWithoutExt.length - 5);
    }

    // Use the basename as the lab name
    this.currentLabName = baseNameWithoutExt;

    // Enforce the .clab.yml extension
    const finalFileName = baseNameWithoutExt + '.clab.yml';
    const finalPath = path.join(parsedPath.dir, finalFileName);
    // Local reference to the actual file URI that will be used for all
    // operations within this method.
    const targetFileUri = vscode.Uri.file(finalPath);

    // Use the derived lab name for folder storage
    this.lastFolderName = baseNameWithoutExt;

    // Build the template with the actual lab name - default topology with two SRL routers
    const templateContent = `
name: ${baseNameWithoutExt} # saved as ${targetFileUri.fsPath}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest

    srl2:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest

  links:
    # inter-switch link
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
    - endpoints: [ srl1:e1-2, srl2:e1-2 ]
`;

    try {
      // Ensure the directory exists using the final URI's directory
      const dirUri = targetFileUri.with({ path: path.dirname(targetFileUri.path) });
      await vscode.workspace.fs.createDirectory(dirUri);

      // Write the file using the final URI and mark as internal to
      // avoid triggering the file watcher.
      const data = Buffer.from(templateContent, 'utf8');
      this.isInternalUpdate = true;
      await vscode.workspace.fs.writeFile(targetFileUri, data);
      await this.sleep(50);
      this.isInternalUpdate = false;

      // Remember the actual path where it was written
      this.lastYamlFilePath = targetFileUri.fsPath;

      log.info(`Template file created at: ${targetFileUri.fsPath}`);

      // Notify the user with the actual path used
      this.createTopoYamlTemplateSuccess = true; // Indicate success
      this.skipInitialValidation = true; // Skip schema check on first load

      // No further processing here. The webview panel will handle
      // reading the YAML and generating the initial JSON data when
      // it is created. This avoids redundant conversions and file
      // writes triggered during template creation.

    } catch (err) {
      vscode.window.showErrorMessage(`Error creating template: ${err}`);
      this.createTopoYamlTemplateSuccess = false; // Indicate failure
      throw err; // Re-throw the error if needed
    }
  }
  /**
   * Internal method to update panel HTML without mode switch checks (used during panel creation)
   */
  private async updatePanelHtmlInternal(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    return this.updatePanelHtmlCore(panel, true);
  }

  /**
   * Force update panel HTML after command completion, bypassing all checks
   */
  public async forceUpdateAfterCommand(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    // Clear any mode switching flags that might block updates
    this.isSwitchingMode = false;
    this.isUpdating = false;

    // Force the update
    return this.updatePanelHtmlCore(panel, true);
  }

  /**
   * Updates the webview panel's HTML with the latest topology data.
   *
   * This method reads the YAML file, regenerates Cytoscape elements, updates JSON files,
   * and refreshes the webview content.
   *
   * @param panel - The active WebviewPanel to update.
   * @returns A promise that resolves when the panel has been updated.
   */
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    if (!this.currentLabName) {
      return false;
    }

    // Skip update if mode switching is in progress
    if (this.isSwitchingMode) {
      log.debug('Skipping updatePanelHtml - mode switch in progress');
      return false;
    }

    // Use the same queuing mechanism as triggerUpdate to prevent concurrent updates
    if (this.isUpdating) {
      log.debug('Panel HTML update already in progress, skipping');
      return false;
    }

    this.isUpdating = true;
    try {
      return await this.updatePanelHtmlCore(panel);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Core implementation of updating panel HTML
   */
  private async updatePanelHtmlCore(
    panel: vscode.WebviewPanel | undefined,
    isInitialLoad: boolean = false
  ): Promise<boolean> {
    if (!this.currentLabName) {
      return false;
    }

    if (isInitialLoad) {
      perfMark('updatePanelHtmlCore_start');
    }

    const folderName = this.currentLabName;
    const updatedTree = await this.getClabTreeData();
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    const yamlContent = await this.getYamlContentForUpdate();
    if (yamlContent === undefined) {
      return false;
    }

    if (this.shouldSkipUpdate(yamlContent, isInitialLoad)) {
      return true;
    }

    const cytoTopology = await this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedTree,
      this.lastYamlFilePath
    );

    const writeOk = await this.writeTopologyFiles(
      folderName,
      cytoTopology,
      yamlContent,
      isInitialLoad
    );
    if (!writeOk) {
      return false;
    }

    if (!panel) {
      log.error('Panel is undefined');
      return false;
    }

    await this.setPanelHtml(panel, folderName, isInitialLoad);
    return true;
  }

  private async getClabTreeData(): Promise<Record<string, ClabLabTreeNode> | undefined> {
    if (!this.isViewMode) {
      return undefined;
    }

    try {
      const labs = await runningLabsProvider.discoverInspectLabs();
      this.cacheClabTreeDataToTopoviewer = labs;
      return labs;
    } catch (err) {
      log.warn(`Failed to refresh running lab data: ${err}`);
      return this.cacheClabTreeDataToTopoviewer;
    }
  }

  private async getYamlContentForUpdate(): Promise<string | undefined> {
    return this.isViewMode
      ? this.getYamlContentViewMode()
      : this.getYamlContentEditMode();
  }

  private async getYamlContentViewMode(): Promise<string> {
    const yamlFilePath = this.lastYamlFilePath;
    let yamlContent = '';
    if (yamlFilePath) {
      try {
        yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
        log.info('Read YAML file in view mode, skipping validation');
      } catch (err) {
        log.warn(`Could not read YAML in view mode: ${err}`);
      }
    }

    if (!yamlContent) {
      yamlContent = `name: ${this.currentLabName}\ntopology:\n  nodes: {}\n  links: []`;
      log.info('Using minimal YAML for view mode');
    }
    return yamlContent;
  }

  private async getYamlContentEditMode(): Promise<string | undefined> {
    const yamlFilePath = this.lastYamlFilePath;
    if (!yamlFilePath) {
      log.error('No YAML file path in edit mode');
      return undefined;
    }

    let yamlContent: string;
    try {
      yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
    } catch (err) {
      log.error(`Failed to read YAML file: ${String(err)}`);
      vscode.window.showErrorMessage(`Failed to read YAML file: ${err}`);
      return undefined;
    }

    if (!yamlContent.trim()) {
      const baseName = path.basename(yamlFilePath);
      const labNameFromFile = baseName
        .replace(/\.clab\.(yml|yaml)$/i, '')
        .replace(/\.(yml|yaml)$/i, '');
      const defaultContent = `name: ${labNameFromFile}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest

    srl2:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest

  links:
    # inter-switch link
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
    - endpoints: [ srl1:e1-2, srl2:e1-2 ]
`;
      this.isInternalUpdate = true;
      await fs.promises.writeFile(yamlFilePath, defaultContent, 'utf8');
      await this.sleep(50);
      this.isInternalUpdate = false;
      yamlContent = defaultContent;
      log.info(`Populated empty YAML file with default topology: ${yamlFilePath}`);
    }

    if (!this.skipInitialValidation) {
      const isValid = await this.validateYaml(yamlContent);
      if (!isValid) {
        log.error('YAML validation failed. Aborting updatePanelHtml.');
        return undefined;
      }
    } else {
      this.skipInitialValidation = false;
    }

    return yamlContent;
  }

  private shouldSkipUpdate(yamlContent: string, isInitialLoad: boolean): boolean {
    if (isInitialLoad || this.isViewMode) {
      return false;
    }
    const cachedYaml = this.context.workspaceState.get<string>(`cachedYaml_${this.currentLabName}`);
    if (cachedYaml === yamlContent) {
      log.debug('Skipping topology regeneration - content unchanged');
      return true;
    }
    return false;
  }

  private async writeTopologyFiles(
    folderName: string,
    cytoTopology: any,
    yamlContent: string,
    isInitialLoad: boolean
  ): Promise<boolean> {
    try {
      const writePromise = this.adaptor.createFolderAndWriteJson(
        this.context,
        folderName,
        cytoTopology,
        yamlContent
      );
      if (isInitialLoad) {
        writePromise.catch(err => {
          log.error(`Background write failed: ${String(err)}`);
        });
      } else {
        await writePromise;
      }
      await this.context.workspaceState.update(`cachedYaml_${folderName}`, yamlContent);
      return true;
    } catch (err) {
      log.error(`Failed to write topology files: ${String(err)}`);
      if (!isInitialLoad) {
        vscode.window.showErrorMessage(`Failed to write topology files: ${err}`);
      }
      return false;
    }
  }

  private async setPanelHtml(
    panel: vscode.WebviewPanel,
    folderName: string,
    isInitialLoad: boolean
  ): Promise<void> {
    perfMark('generateHtml_start');
    const mode: TemplateMode = this.isViewMode ? 'viewer' : 'editor';
    const templateParams =
      mode === 'viewer'
        ? this.getViewerTemplateParams()
        : await this.getEditorTemplateParams();

    panel.webview.html = generateWebviewHtml(
      this.context,
      panel,
      mode,
      folderName,
      this.adaptor,
      templateParams
    );

    if (isInitialLoad) {
      perfMeasure('generateHtml', 'generateHtml_start');
      perfMeasure('updatePanelHtmlCore', 'updatePanelHtmlCore_start');
    }
  }

  private getViewerTemplateParams(): Partial<ViewerTemplateParams> {
    return {
      deploymentState: this.deploymentState,
      viewerMode: 'viewer',
      currentLabPath: this.lastYamlFilePath,
    };
  }

  private async getEditorTemplateParams(): Promise<Partial<EditorTemplateParams>> {
    await refreshDockerImages(this.context);
    const CONFIG_SECTION = 'containerlab.editor';
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const ifacePatternMapping = config.get<Record<string, string>>('interfacePatternMapping', {});
    const updateLinkEndpointsOnKindChange = config.get<boolean>(
      'updateLinkEndpointsOnKindChange',
      true
    );
    const customNodes = config.get<any[]>('customNodes', []);
    const { defaultNode, defaultKind, defaultType } = this.getDefaultCustomNode(customNodes);
    const imageMapping = this.buildImageMapping(customNodes);
    const dockerImages = (this.context.globalState.get<string[]>('dockerImages') || []) as string[];
    return {
      imageMapping,
      ifacePatternMapping,
      defaultKind,
      defaultType,
      updateLinkEndpointsOnKindChange,
      dockerImages,
      customNodes,
      defaultNode,
      currentLabPath: this.lastYamlFilePath,
      topologyDefaults: this.adaptor.currentClabTopo?.topology?.defaults || {},
      topologyKinds: this.adaptor.currentClabTopo?.topology?.kinds || {},
      topologyGroups: this.adaptor.currentClabTopo?.topology?.groups || {},
    };
  }

  private getDefaultCustomNode(customNodes: any[]): {
    defaultNode: string;
    defaultKind: string;
    defaultType: string;
  } {
    const defaultCustomNode = customNodes.find((node: any) => node.setDefault === true);
    return {
      defaultNode: defaultCustomNode?.name || '',
      defaultKind: defaultCustomNode?.kind || 'nokia_srlinux',
      defaultType: defaultCustomNode?.type || '',
    };
  }

  private buildImageMapping(customNodes: any[]): Record<string, string> {
    const imageMapping: Record<string, string> = {};
    customNodes.forEach((node: any) => {
      if (node.image && node.kind) {
        imageMapping[node.kind] = node.image;
      }
    });
    return imageMapping;
  }

  /**
   * Creates a new webview panel or reveals the current one.
   * @param context The extension context.
   */
  public async createWebviewPanel(
    context: vscode.ExtensionContext,
    fileUri: vscode.Uri,
    labName: string,
    viewMode: boolean = false
  ): Promise<void> {
    perfMark('createWebviewPanel_start');
    this.currentLabName = labName;
    this.isViewMode = viewMode;

    this.deploymentState = await this.checkDeploymentState(labName);
    if (this.lastYamlFilePath && fileUri.fsPath !== this.lastYamlFilePath) {
      fileUri = vscode.Uri.file(this.lastYamlFilePath);
      log.info(`Using corrected file path: ${fileUri.fsPath}`);
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (this.currentPanel) {
      this.currentPanel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      labName,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', labName),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'schema'),
        ],
        retainContextWhenHidden: true,
      }
    );

    const iconUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'resources',
      'containerlab.png'
    );
    panel.iconPath = iconUri;

    this.currentPanel = panel;

    try {
      await this.loadInitialYaml(fileUri, labName);
      if (this.isViewMode) {
        try {
          this.cacheClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
        } catch (err) {
          log.warn(`Failed to load running lab data: ${err}`);
        }
      }
    } catch (e) {
      if (!this.isViewMode) {
        vscode.window.showErrorMessage(`Failed to load topology: ${(e as Error).message}`);
        return;
      }
      log.warn(`Failed to load topology in view mode, continuing: ${(e as Error).message}`);
    }



    perfMark('updatePanelHtml_start');
    const updatePromise = this.updatePanelHtmlInternal(this.currentPanel);
    updatePromise
      .then(() => {
        perfMeasure('updatePanelHtml', 'updatePanelHtml_start');
        perfMeasure('createWebviewPanel_total', 'createWebviewPanel_start');
        perfSummary();
      })
      .catch(err => {
        log.error(`Failed to update panel HTML: ${err}`);
      });

    if (!this.isViewMode && this.lastYamlFilePath) {
      this.setupFileWatcher();
      this.setupSaveListener();
    }

    panel.onDidDispose(() => {
      this.currentPanel = undefined;
      if (this.fileWatcher) {
        this.fileWatcher.dispose();
        this.fileWatcher = undefined;
      }
      if (this.saveListener) {
        this.saveListener.dispose();
        this.saveListener = undefined;
      }
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      await this.handleWebviewMessage(msg, panel);
    });

  }

  private async loadInitialYaml(fileUri: vscode.Uri, labName: string): Promise<void> {
    if (this.isViewMode) {
      await this.loadYamlViewMode(fileUri, labName);
      return;
    }
    await this.loadYamlEditMode(fileUri);
  }

  private async loadYamlViewMode(fileUri: vscode.Uri, labName: string): Promise<void> {
    log.info(`Creating panel in view mode for lab: ${labName}`);
    if (fileUri?.fsPath) {
      try {
        await fs.promises.readFile(fileUri.fsPath, 'utf8');
        this.lastYamlFilePath = fileUri.fsPath;
        log.info('Read YAML file for view mode');
      } catch (err) {
        log.warn(`Could not read YAML in view mode: ${err}`);
        this.lastYamlFilePath = '';
      }
    }
    if (!this.lastYamlFilePath) log.info('Using minimal YAML for view mode');
    this.skipInitialValidation = true;
  }

  private async loadYamlEditMode(fileUri: vscode.Uri): Promise<void> {
    if (!fileUri?.fsPath) throw new Error('No file URI provided for edit mode');
    try {
      await vscode.workspace.fs.stat(fileUri);
      this.lastYamlFilePath = fileUri.fsPath;
    } catch {
      if (this.lastYamlFilePath) log.info(`Using cached file path: ${this.lastYamlFilePath}`);
      else throw new Error(`File not found: ${fileUri.fsPath}`);
    }
    let yaml = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
    if (!yaml.trim()) {
      const baseName = path.basename(this.lastYamlFilePath);
      const labNameFromFile = baseName.replace(/\.clab\.(yml|yaml)$/i, '').replace(/\.(yml|yaml)$/i, '');
      const defaultContent = `name: ${labNameFromFile}\n\n` +
`topology:\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n      type: ixrd1\n      image: ghcr.io/nokia/srlinux:latest\n\n    srl2:\n      kind: nokia_srlinux\n      type: ixrd1\n      image: ghcr.io/nokia/srlinux:latest\n\n  links:\n    # inter-switch link\n    - endpoints: [ srl1:e1-1, srl2:e1-1 ]\n    - endpoints: [ srl1:e1-2, srl2:e1-2 ]\n`;
      this.isInternalUpdate = true;
      await fs.promises.writeFile(this.lastYamlFilePath, defaultContent, 'utf8');
      await this.sleep(50);
      this.isInternalUpdate = false;
      yaml = defaultContent;
      log.info(`Populated empty YAML file with default topology: ${this.lastYamlFilePath}`);
    }
    if (!this.skipInitialValidation) {
      const isValid = await this.validateYaml(yaml);
      if (!isValid) throw new Error('YAML validation failed. Aborting createWebviewPanel.');
    }
  }

  private async handleWebviewMessage(msg: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      log.error('Invalid message received.');
      return;
    }

    if (msg.command === 'topoViewerLog') {
      this.processLogMessage(msg);
      return;
    }

    if (msg.type !== 'POST') {
      log.warn(`Unrecognized message type: ${msg.type}`);
      return;
    }

    await this.processPostMessage(msg, panel);
  }

  private processLogMessage(msg: WebviewMessage): void {
    const { level, message, fileLine } = msg;
    const text = fileLine ? `${fileLine} - ${message}` : message;
    switch (level) {
      case 'error':
        log.error(text);
        break;
      case 'warn':
        log.warn(text);
        break;
      case 'debug':
        log.debug(text);
        break;
      default:
        log.info(text);
    }
  }

  private async processPostMessage(msg: WebviewMessage, panel: vscode.WebviewPanel): Promise<void> {
    log.info(`Received POST message from frontEnd: ${JSON.stringify(msg, null, 2)}`);
    const { requestId, endpointName, payload } = msg;
    const payloadObj = payload ? JSON.parse(payload) : undefined;
    if (payloadObj !== undefined) {
      log.info(`Received POST message from frontEnd Pretty Payload:\n${JSON.stringify(payloadObj, null, 2)}`);
    }
    if (!requestId || !endpointName) {
      const missingFields: string[] = [];
      if (!requestId) missingFields.push('requestId');
      if (!endpointName) missingFields.push('endpointName');
      const errorMessage = `Missing required field(s): ${missingFields.join(', ')}`;
      log.error(errorMessage);
      panel.webview.postMessage({
        type: 'POST_RESPONSE',
        requestId: requestId ?? null,
        result: null,
        error: errorMessage,
      });
      return;
    }

    let result: unknown = null;
    let error: string | null = null;
    try {
      if (endpointName.startsWith('clab-node-')) {
        ({ result, error } = await this.handleNodeEndpoint(endpointName, payloadObj));
      } else if (
        endpointName.startsWith('clab-interface-') ||
        endpointName.startsWith('clab-link-')
      ) {
        ({ result, error } = await this.handleInterfaceEndpoint(endpointName, payloadObj));
      } else if (
        ['deployLab', 'destroyLab', 'deployLabCleanup', 'destroyLabCleanup', 'redeployLab', 'redeployLabCleanup'].includes(
          endpointName
        )
      ) {
        ({ result, error } = await this.handleLabLifecycleEndpoint(endpointName, payloadObj));
      } else {
        ({ result, error } = await this.handleGeneralEndpoint(endpointName, payload, payloadObj, panel));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log.error(`Error processing message for endpoint "${endpointName}": ${JSON.stringify(err, null, 2)}`);
    }

    log.info('########################################################### RESULT in RESPONSE');
    log.info(`${JSON.stringify(result, null, 2)}`);
    panel.webview.postMessage({
      type: 'POST_RESPONSE',
      requestId,
      result,
      error,
    });
  }

  private async updateLabSettings(settings: any): Promise<{ success: boolean; yamlContent?: string; error?: string }> {
    try {
      const yamlContent = await fsPromises.readFile(this.lastYamlFilePath, 'utf8');
      const doc = YAML.parseDocument(yamlContent);
      const { hadPrefix, hadMgmt } = this.applyExistingSettings(doc, settings);
      let updatedYaml = doc.toString();
      updatedYaml = this.insertMissingSettings(updatedYaml, settings, hadPrefix, hadMgmt);
      this.isInternalUpdate = true;
      await fsPromises.writeFile(this.lastYamlFilePath, updatedYaml, 'utf8');
      if (this.currentPanel) {
        this.currentPanel.webview.postMessage({
          type: 'yaml-content-updated',
          yamlContent: updatedYaml,
        });
      }
      this.isInternalUpdate = false;
      return { success: true, yamlContent: updatedYaml };
    } catch (err) {
      this.isInternalUpdate = false;
      log.error(`Error updating lab settings: ${err}`);
      vscode.window.showErrorMessage(`Failed to update lab settings: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  private applyExistingSettings(doc: YAML.Document, settings: any): { hadPrefix: boolean; hadMgmt: boolean } {
    if (settings.name !== undefined && settings.name !== '') {
      doc.set('name', settings.name);
    }
    const hadPrefix = doc.has('prefix');
    const hadMgmt = doc.has('mgmt');
    if (settings.prefix !== undefined && hadPrefix) {
      if (settings.prefix === null) {
        doc.delete('prefix');
      } else {
        doc.set('prefix', settings.prefix);
      }
    }
    if (settings.mgmt !== undefined && hadMgmt) {
      if (settings.mgmt === null || (typeof settings.mgmt === 'object' && Object.keys(settings.mgmt).length === 0)) {
        doc.delete('mgmt');
      } else {
        doc.set('mgmt', settings.mgmt);
      }
    }
    return { hadPrefix, hadMgmt };
  }

  private insertMissingSettings(
    updatedYaml: string,
    settings: any,
    hadPrefix: boolean,
    hadMgmt: boolean
  ): string {
    updatedYaml = this.maybeInsertPrefix(updatedYaml, settings, hadPrefix);
    updatedYaml = this.maybeInsertMgmt(updatedYaml, settings, hadMgmt);
    return updatedYaml;
  }

  private maybeInsertPrefix(updatedYaml: string, settings: any, hadPrefix: boolean): string {
    if (settings.prefix === undefined || settings.prefix === null || hadPrefix) return updatedYaml;
    const lines = updatedYaml.split('\n');
    const nameIndex = lines.findIndex(line => line.trim().startsWith('name:'));
    if (nameIndex === -1) return updatedYaml;
    const prefixValue = settings.prefix === '' ? '""' : settings.prefix;
    lines.splice(nameIndex + 1, 0, `prefix: ${prefixValue}`);
    return lines.join('\n');
  }

  private maybeInsertMgmt(updatedYaml: string, settings: any, hadMgmt: boolean): string {
    if (settings.mgmt === undefined || hadMgmt || !settings.mgmt || Object.keys(settings.mgmt).length === 0) {
      return updatedYaml;
    }
    const lines = updatedYaml.split('\n');
    let insertIndex = lines.findIndex(line => line.trim().startsWith('prefix:'));
    if (insertIndex === -1) insertIndex = lines.findIndex(line => line.trim().startsWith('name:'));
    if (insertIndex === -1) return updatedYaml;
    const mgmtYaml = YAML.stringify({ mgmt: settings.mgmt });
    const mgmtLines = mgmtYaml.split('\n').filter(line => line.trim());
    const nextLine = lines[insertIndex + 1];
    if (nextLine && nextLine.trim() !== '') lines.splice(insertIndex + 1, 0, '', ...mgmtLines);
    else lines.splice(insertIndex + 1, 0, ...mgmtLines);
    return lines.join('\n');
  }
  private async handleGeneralEndpoint(
    endpointName: string,
    payload: string | undefined,
    payloadObj: any,
    panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    let result: unknown = null;
    let error: string | null = null;

    const handlers: Record<string, () => Promise<void>> = {
      'topo-editor-reload-viewport': async () => {
        try {
          if (this.isSwitchingMode) {
            result = 'Reload skipped - mode switch in progress';
            log.debug(result);
            return;
          }
          this.deploymentState = await this.checkDeploymentState(this.currentLabName);
          const success = await this.updatePanelHtml(this.currentPanel);
          if (success) {
            result = `Endpoint "${endpointName}" executed successfully.`;
            log.info(result);
          } else {
            result = `Panel update failed - check logs for details`;
            log.debug('Panel update returned false during reload');
          }
        } catch (innerError) {
          result = `Error executing endpoint "${endpointName}".`;
          log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
        }
      },
      'topo-viewport-save': async () => {
        try {
          await saveViewport({
            yamlFilePath: this.lastYamlFilePath,
            payload: payload as string,
            mode: 'view'
          });
          result = `Saved viewport positions successfully.`;
          log.info(result);
        } catch (err) {
          log.error(`Error executing endpoint "topo-viewport-save": ${JSON.stringify(err, null, 2)}`);
        }
      },
      'lab-settings-get': async () => {
        try {
          const yamlContent = await fsPromises.readFile(this.lastYamlFilePath, 'utf8');
          const parsed = YAML.parse(yamlContent) as any;
          const settings = { name: parsed.name, prefix: parsed.prefix, mgmt: parsed.mgmt };
          result = { success: true, settings };
          log.info('Lab settings retrieved successfully');
        } catch (err) {
          result = { success: false, error: String(err) };
          log.error(`Error getting lab settings: ${err}`);
        }
      },
      'lab-settings-update': async () => {
        const settings = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const res = await this.updateLabSettings(settings);
        result = res.success ? { success: true, yamlContent: res.yamlContent } : { success: false, error: res.error };
      },
      'topo-editor-get-node-config': async () => {
        try {
          const nodeName = typeof payloadObj === 'string' ? payloadObj : payloadObj?.node || payloadObj?.nodeName;
          if (!nodeName) {
            throw new Error('Node name is required');
          }
          if (!this.lastYamlFilePath) {
            throw new Error('No lab YAML file loaded');
          }
          const yamlContent = await fsPromises.readFile(this.lastYamlFilePath, 'utf8');
          const topo = YAML.parse(yamlContent) as any;
          this.adaptor.currentClabTopo = topo;
          const nodeObj = topo.topology?.nodes?.[nodeName] || {};
          const mergedNode = resolveNodeConfig(topo as any, nodeObj || {});
          const nodePropKeys = new Set(Object.keys(nodeObj || {}));
          const inheritedProps = Object.keys(mergedNode).filter(k => !nodePropKeys.has(k));
          result = { ...mergedNode, inherited: inheritedProps };
          log.info(`Node config retrieved for ${nodeName}`);
        } catch (err) {
          error = `Failed to get node config: ${err instanceof Error ? err.message : String(err)}`;
          log.error(error);
        }
      },
      'show-error-message': async () => {
        const data = payload as any;
        if (data && data.message) {
          vscode.window.showErrorMessage(data.message);
        }
        result = { success: true };
      },
      'topo-editor-viewport-save': async () => {
        try {
          await saveViewport({
            adaptor: this.adaptor,
            yamlFilePath: this.lastYamlFilePath,
            payload: payload as string,
            mode: 'edit',
            setInternalUpdate: v => {
              this.isInternalUpdate = v;
            }
          });
          result = `Saved topology with preserved comments!`;
          log.info(result);
        } catch (err) {
          log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(err, null, 2)}`);
          this.isInternalUpdate = false;
        }
      },
      'topo-editor-viewport-save-suppress-notification': async () => {
        try {
          await saveViewport({
            adaptor: this.adaptor,
            yamlFilePath: this.lastYamlFilePath,
            payload: payload as string,
            mode: 'edit',
            setInternalUpdate: v => {
              this.isInternalUpdate = v;
            }
          });
        } catch (err) {
          result = `Error executing endpoint "topo-editor-viewport-save-suppress-notification".`;
          log.error(
            `Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(err, null, 2)}`
          );
          this.isInternalUpdate = false;
        }
      },
      'topo-editor-undo': async () => {
        try {
          const document = await vscode.workspace.openTextDocument(this.lastYamlFilePath);
          const currentActiveEditor = vscode.window.activeTextEditor;
          const existingEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.fsPath === document.uri.fsPath
          );
          if (existingEditor) {
            await vscode.window.showTextDocument(document, {
              viewColumn: existingEditor.viewColumn,
              preview: false,
              preserveFocus: false
            });
          } else {
            const targetColumn = vscode.ViewColumn.Beside;
            await vscode.window.showTextDocument(document, {
              viewColumn: targetColumn,
              preview: false,
              preserveFocus: false
            });
          }
          await this.sleep(50);
          await vscode.commands.executeCommand('undo');
          await document.save();
          if (currentActiveEditor && !existingEditor) {
            await vscode.window.showTextDocument(currentActiveEditor.document, {
              viewColumn: currentActiveEditor.viewColumn,
              preview: false,
              preserveFocus: false
            });
          }
          result = 'Undo operation completed successfully';
          log.info('Undo operation executed on YAML file');
        } catch (err) {
          result = `Error executing undo operation`;
          log.error(`Error executing undo operation: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-editor-show-vscode-message': async () => {
        try {
          const data = JSON.parse(payload as string) as {
            type: 'info' | 'warning' | 'error';
            message: string;
          };
          switch (data.type) {
            case 'info':
              await vscode.window.showInformationMessage(data.message);
              break;
            case 'warning':
              await vscode.window.showWarningMessage(data.message);
              break;
            case 'error':
              await vscode.window.showErrorMessage(data.message);
              break;
            default:
              log.error(`Unsupported message type: ${JSON.stringify(data.type, null, 2)}`);
          }
          result = `Displayed ${data.type} message: ${data.message}`;
          log.info(result);
        } catch (err) {
          result = `Error executing endpoint "clab-show-vscode-message".`;
          log.error(
            `Error executing endpoint "clab-show-vscode-message": ${JSON.stringify(err, null, 2)}`
          );
        }
      },
      'topo-switch-mode': async () => {
        try {
          if (this.isSwitchingMode) {
            error = 'Mode switch already in progress';
            log.debug('Mode switch already in progress');
            return;
          }
          log.debug(`Starting mode switch from ${this.isViewMode ? 'view' : 'edit'} mode`);
          this.isSwitchingMode = true;
          const data = payload ? JSON.parse(payload as string) : { mode: 'toggle' };
          if (data.mode === 'toggle') {
            this.isViewMode = !this.isViewMode;
          } else if (data.mode === 'view') {
            this.isViewMode = true;
          } else if (data.mode === 'edit') {
            this.isViewMode = false;
          }
          this.deploymentState = await this.checkDeploymentState(this.currentLabName);
          const success = await this.updatePanelHtmlInternal(this.currentPanel);
          if (success) {
            result = { mode: this.isViewMode ? 'view' : 'edit', deploymentState: this.deploymentState };
            log.info(`Switched to ${this.isViewMode ? 'view' : 'edit'} mode`);
          } else {
            error = 'Failed to switch mode';
          }
          await this.sleep(100);
        } catch (err) {
          error = `Error switching mode: ${err}`;
          log.error(`Error switching mode: ${JSON.stringify(err, null, 2)}`);
        } finally {
          this.isSwitchingMode = false;
          log.debug(`Mode switch completed, flag cleared`);
        }
      },
      'open-external': async () => {
        try {
          const url: string = JSON.parse(payload as string);
          await vscode.env.openExternal(vscode.Uri.parse(url));
          result = `Opened external URL: ${url}`;
          log.info(result);
        } catch (err) {
          result = `Error executing endpoint "open-external".`;
          log.error(`Error executing endpoint "open-external": ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-editor-load-annotations': async () => {
        try {
          const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
          result = {
            annotations: annotations.freeTextAnnotations || [],
            groupStyles: annotations.groupStyleAnnotations || []
          };
          log.info(
            `Loaded ${annotations.freeTextAnnotations?.length || 0} annotations and ${annotations.groupStyleAnnotations?.length || 0} group styles`
          );
        } catch (err) {
          result = { annotations: [], groupStyles: [] };
          log.error(`Error loading annotations: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-editor-save-annotations': async () => {
        try {
          const data = payloadObj;
          const existing = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
          await annotationsManager.saveAnnotations(this.lastYamlFilePath, {
            freeTextAnnotations: data.annotations,
            groupStyleAnnotations: data.groupStyles,
            cloudNodeAnnotations: existing.cloudNodeAnnotations,
            nodeAnnotations: existing.nodeAnnotations
          });
          result = { success: true };
          log.info(
            `Saved ${data.annotations?.length || 0} annotations and ${data.groupStyles?.length || 0} group styles`
          );
        } catch (err) {
          error = `Error saving annotations: ${err}`;
          log.error(`Error saving annotations: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-editor-save-custom-node': async () => {
        try {
          const data = payloadObj;
          const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
          let customNodes = config.get<any[]>('customNodes', []);
          if (data.setDefault) {
            customNodes = customNodes.map((n: any) => ({ ...n, setDefault: false }));
          }
          if (data.oldName) {
            const oldIndex = customNodes.findIndex((n: any) => n.name === data.oldName);
            if (oldIndex >= 0) {
              const nodeData = { ...data };
              delete nodeData.oldName;
              customNodes[oldIndex] = nodeData;
            } else {
              const nodeData = { ...data };
              delete nodeData.oldName;
              customNodes.push(nodeData);
            }
          } else {
            const existingIndex = customNodes.findIndex((n: any) => n.name === data.name);
            if (existingIndex >= 0) {
              customNodes[existingIndex] = data;
            } else {
              customNodes.push(data);
            }
          }
          await config.update('customNodes', customNodes, vscode.ConfigurationTarget.Global);
          const defaultCustomNode = customNodes.find((n: any) => n.setDefault === true);
          result = { customNodes, defaultNode: defaultCustomNode?.name || '' };
          log.info(`Saved custom node ${data.name}`);
        } catch (err) {
          error = `Error saving custom node: ${err}`;
          log.error(`Error saving custom node: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-editor-delete-custom-node': async () => {
        try {
          const data = payloadObj;
          const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
          const customNodes = config.get<any[]>('customNodes', []);
          const filteredNodes = customNodes.filter((n: any) => n.name !== data.name);
          await config.update('customNodes', filteredNodes, vscode.ConfigurationTarget.Global);
          const defaultCustomNode = filteredNodes.find((n: any) => n.setDefault === true);
          result = { customNodes: filteredNodes, defaultNode: defaultCustomNode?.name || '' };
          log.info(`Deleted custom node ${data.name}`);
        } catch (err) {
          error = `Error deleting custom node: ${err}`;
          log.error(`Error deleting custom node: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'showError': async () => {
        try {
          const message = payloadObj as string;
          await vscode.window.showErrorMessage(message);
          result = 'Error message displayed';
        } catch (err) {
          error = `Error showing error message: ${err}`;
          log.error(`Error showing error message: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'topo-toggle-split-view': async () => {
        try {
          await this.toggleSplitView();
          result = { splitViewOpen: this.isSplitViewOpen };
          log.info(`Split view toggled: ${this.isSplitViewOpen ? 'opened' : 'closed'}`);
        } catch (err) {
          error = `Error toggling split view: ${err}`;
          log.error(`Error toggling split view: ${JSON.stringify(err, null, 2)}`);
        }
      },
      'copyElements': async () => {
        this.context.globalState.update('topoClipboard', payloadObj);
        result = 'Elements copied';
      },
      'getCopiedElements': async () => {
        const clipboard = this.context.globalState.get('topoClipboard') || [];
        panel.webview.postMessage({ type: 'copiedElements', data: clipboard });
        result = 'Clipboard sent';
      }
    };

    const handler = handlers[endpointName];
    if (handler) {
      await handler();
    } else {
      error = `Unknown endpoint "${endpointName}".`;
      log.error(error);
    }

    return { result, error };
  }
  private async handleNodeEndpoint(endpointName: string, payloadObj: any): Promise<{ result: unknown; error: string | null }> {
    let result: unknown = null;
    let error: string | null = null;

    switch (endpointName) {
      case 'clab-node-connect-ssh': {
        try {
          const nodeName = payloadObj as string;
          const node = {
            label: nodeName,
            name: nodeName,
            name_short: nodeName,
            cID: nodeName,
            state: '',
            kind: '',
            image: '',
            interfaces: [],
            labPath: { absolute: '', relative: '' }
          } as any;
          await vscode.commands.executeCommand('containerlab.node.ssh', node);
          result = `SSH connection executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing SSH connection: ${innerError}`;
          log.error(`Error executing SSH connection: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case 'clab-node-attach-shell': {
        try {
          const nodeName = payloadObj as string;
          const node = (await this.getContainerNode(nodeName)) ?? {
            label: nodeName,
            name: nodeName,
            name_short: nodeName,
            cID: nodeName,
            state: '',
            kind: '',
            image: '',
            interfaces: [],
            labPath: { absolute: '', relative: '' }
          } as any;
          await vscode.commands.executeCommand('containerlab.node.attachShell', node);
          result = `Attach shell executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing attach shell: ${innerError}`;
          log.error(`Error executing attach shell: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case 'clab-node-view-logs': {
        try {
          const nodeName = payloadObj as string;
          const node = {
            label: nodeName,
            name: nodeName,
            name_short: nodeName,
            cID: nodeName,
            state: '',
            kind: '',
            image: '',
            interfaces: [],
            labPath: { absolute: '', relative: '' }
          } as any;
          await vscode.commands.executeCommand('containerlab.node.showLogs', node);
          result = `Show logs executed for ${nodeName}`;
        } catch (innerError) {
          error = `Error executing show logs: ${innerError}`;
          log.error(`Error executing show logs: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      default: {
        error = `Unknown endpoint "${endpointName}".`;
        log.error(error);
      }
    }

    return { result, error };
  }
  private async handleInterfaceEndpoint(endpointName: string, payloadObj: any): Promise<{ result: unknown; error: string | null }> {
    let result: unknown = null;
    let error: string | null = null;

    const resolveInterface = (nodeName: string, interfaceName: string) => this.resolveInterfaceName(nodeName, interfaceName);

    switch (endpointName) {
      case 'clab-interface-capture': {
        try {
          const data = payloadObj as { nodeName: string; interfaceName: string };
          const actualInterfaceName = await resolveInterface(data.nodeName, data.interfaceName);
          const iface = {
            label: actualInterfaceName,
            parentName: data.nodeName,
            cID: data.nodeName,
            name: actualInterfaceName,
            type: '',
            alias: data.interfaceName !== actualInterfaceName ? data.interfaceName : '',
            mac: '',
            mtu: 0,
            ifIndex: 0,
            state: ''
          } as any;
          await vscode.commands.executeCommand('containerlab.interface.capture', iface);
          result = `Capture executed for ${data.nodeName}/${actualInterfaceName}`;
        } catch (innerError) {
          error = `Error executing capture: ${innerError}`;
          log.error(`Error executing capture: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case 'clab-link-capture': {
        try {
          const data = payloadObj as { nodeName: string; interfaceName: string };
          const actualInterfaceName = await resolveInterface(data.nodeName, data.interfaceName);
          const iface = {
            label: actualInterfaceName,
            parentName: data.nodeName,
            cID: data.nodeName,
            name: actualInterfaceName,
            type: '',
            alias: data.interfaceName !== actualInterfaceName ? data.interfaceName : '',
            mac: '',
            mtu: 0,
            ifIndex: 0,
            state: ''
          } as any;
          await vscode.commands.executeCommand('containerlab.interface.captureWithEdgeshark', iface);
          result = `Capture executed for ${data.nodeName}/${actualInterfaceName}`;
        } catch (innerError) {
          error = `Error executing capture: ${innerError}`;
          log.error(`Error executing capture: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      case 'clab-link-capture-edgeshark-vnc': {
        try {
          const data = payloadObj as { nodeName: string; interfaceName: string };
          const actualInterfaceName = await resolveInterface(data.nodeName, data.interfaceName);
          const iface = {
            label: actualInterfaceName,
            parentName: data.nodeName,
            cID: data.nodeName,
            name: actualInterfaceName,
            type: '',
            alias: data.interfaceName !== actualInterfaceName ? data.interfaceName : '',
            mac: '',
            mtu: 0,
            ifIndex: 0,
            state: ''
          } as any;
          await vscode.commands.executeCommand('containerlab.interface.captureWithEdgesharkVNC', iface);
          result = `VNC capture executed for ${data.nodeName}/${actualInterfaceName}`;
        } catch (innerError) {
          error = `Error executing VNC capture: ${innerError}`;
          log.error(`Error executing VNC capture: ${JSON.stringify(innerError, null, 2)}`);
        }
        break;
      }

      default: {
        error = `Unknown endpoint "${endpointName}".`;
        log.error(error);
      }
    }

    return { result, error };
  }

  private async resolveInterfaceName(nodeName: string, interfaceName: string): Promise<string> {
    if (!runningLabsProvider) return interfaceName;
    const treeData = await runningLabsProvider.discoverInspectLabs();
    if (!treeData) return interfaceName;
    for (const lab of Object.values(treeData)) {
      const container = (lab as any).containers?.find((c: any) => c.name === nodeName || c.name_short === nodeName);
      const intf = container?.interfaces?.find((i: any) => i.name === interfaceName || i.alias === interfaceName);
      if (intf) return intf.name;
    }
    return interfaceName;
  }
  private async handleLabLifecycleEndpoint(
    endpointName: string,
    payloadObj: any
  ): Promise<{ result: unknown; error: string | null }> {
    const actions: Record<
      string,
      { command: string; resultMsg: string; errorMsg: string; noLabPath: string }
    > = {
      deployLab: {
        command: 'containerlab.lab.deploy',
        resultMsg: 'Lab deployment initiated',
        errorMsg: 'Error deploying lab',
        noLabPath: 'No lab path provided for deployment',
      },
      destroyLab: {
        command: 'containerlab.lab.destroy',
        resultMsg: 'Lab destruction initiated',
        errorMsg: 'Error destroying lab',
        noLabPath: 'No lab path provided for destruction',
      },
      deployLabCleanup: {
        command: 'containerlab.lab.deploy.cleanup',
        resultMsg: 'Lab deployment with cleanup initiated',
        errorMsg: 'Error deploying lab with cleanup',
        noLabPath: 'No lab path provided for deployment with cleanup',
      },
      destroyLabCleanup: {
        command: 'containerlab.lab.destroy.cleanup',
        resultMsg: 'Lab destruction with cleanup initiated',
        errorMsg: 'Error destroying lab with cleanup',
        noLabPath: 'No lab path provided for destruction with cleanup',
      },
      redeployLab: {
        command: 'containerlab.lab.redeploy',
        resultMsg: 'Lab redeploy initiated',
        errorMsg: 'Error redeploying lab',
        noLabPath: 'No lab path provided for redeploy',
      },
      redeployLabCleanup: {
        command: 'containerlab.lab.redeploy.cleanup',
        resultMsg: 'Lab redeploy with cleanup initiated',
        errorMsg: 'Error redeploying lab with cleanup',
        noLabPath: 'No lab path provided for redeploy with cleanup',
      },
    };

    const action = actions[endpointName];
    if (!action) {
      const error = `Unknown endpoint "${endpointName}".`;
      log.error(error);
      return { result: null, error };
    }

    const labPath = payloadObj as string;
    if (!labPath) {
      return { result: null, error: action.noLabPath };
    }

    try {
      const { ClabLabTreeNode } = await import('../../treeView/common');
      const tempNode = new ClabLabTreeNode(
        '',
        vscode.TreeItemCollapsibleState.None,
        { absolute: labPath, relative: '' }
      );
      vscode.commands.executeCommand(action.command, tempNode);
      return { result: `${action.resultMsg} for ${labPath}`, error: null };
    } catch (innerError) {
      const error = `${action.errorMsg}: ${innerError}`;
      log.error(`${action.errorMsg}: ${JSON.stringify(innerError, null, 2)}`);
      return { result: null, error };
    }
  }




  /**
   * Check if a mode switch operation is currently in progress
   */
  public get isModeSwitchInProgress(): boolean {
    return this.isSwitchingMode;
  }

  /**
   * Check if a lab is deployed by querying containerlab
   */
  public async checkDeploymentState(labName: string): Promise<'deployed' | 'undeployed' | 'unknown'> {
    try {
      await inspector.update();
      if (!inspector.rawInspectData) return 'unknown';
      if (this.labExistsByName(labName)) return 'deployed';
      if (this.lastYamlFilePath && this.updateLabNameFromTopoFileMatch()) return 'deployed';
      return 'undeployed';
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      return 'unknown';
    }
  }

  private labExistsByName(labName: string): boolean {
    return labName in (inspector.rawInspectData as any);
  }

  private updateLabNameFromTopoFileMatch(): boolean {
    const normalizedYamlPath = this.lastYamlFilePath!.replace(/\\/g, '/');
    for (const [deployedLabName, labData] of Object.entries(inspector.rawInspectData as any)) {
      const topo = (labData as any)['topo-file'];
      if (!topo) continue;
      const normalizedTopoFile = (topo as string).replace(/\\/g, '/');
      if (normalizedTopoFile === normalizedYamlPath) {
        if (this.currentLabName !== deployedLabName) {
          log.info(`Updating lab name from '${this.currentLabName}' to '${deployedLabName}' based on topo-file match`);
          this.currentLabName = deployedLabName;
        }
        return true;
      }
    }
    return false;
  }

  /**
 * Opens the specified file (usually the created YAML template) in a split editor.
 *
 * @param filePath - The absolute path to the file.
 */
  public async openTemplateFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);

      // First, open the YAML file in a split view
      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });

      // Wait for the editor to be fully rendered
      await this.sleep(100);

      // Set a custom layout with the topology editor taking 60% and YAML taking 40%
      // This provides a good balance - the topology editor has more space while
      // the YAML remains comfortably readable
      await vscode.commands.executeCommand('vscode.setEditorLayout', {
        orientation: 0,  // 0 = horizontal (left-right split)
        groups: [
          { size: 0.6 },  // Topology editor: 60%
          { size: 0.4 }   // YAML editor: 40%
        ]
      });

      // Mark split view as open
      this.isSplitViewOpen = true;

      // Return focus to the webview panel if it exists
      if (this.currentPanel) {
        this.currentPanel.reveal();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening template file: ${error}`);
    }
  }

  /**
   * Toggle the split view with YAML editor
   */
  public async toggleSplitView(): Promise<void> {
    try {
      if (!this.lastYamlFilePath) {
        vscode.window.showWarningMessage('No YAML file associated with this topology');
        return;
      }

      if (this.isSplitViewOpen) {
        // Close the YAML editor
        // Find the text editor showing the YAML file
        const yamlUri = vscode.Uri.file(this.lastYamlFilePath);
        const editors = vscode.window.visibleTextEditors;
        let yamlEditor: vscode.TextEditor | undefined;

        for (const editor of editors) {
          if (editor.document.uri.fsPath === yamlUri.fsPath) {
            yamlEditor = editor;
            break;
          }
        }

        if (yamlEditor) {
          // Make the YAML editor active, then close it
          await vscode.window.showTextDocument(yamlEditor.document, yamlEditor.viewColumn);
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }

        // Reset to single column layout
        await vscode.commands.executeCommand('vscode.setEditorLayout', {
          orientation: 0,
          groups: [{ size: 1 }]
        });

        this.isSplitViewOpen = false;

        // Ensure webview has focus
        if (this.currentPanel) {
          this.currentPanel.reveal();
        }
      } else {
        // Open the YAML editor in split view
        await this.openTemplateFile(this.lastYamlFilePath);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error toggling split view: ${error}`);
      log.error(`Error toggling split view: ${error}`);
    }
  }
}
