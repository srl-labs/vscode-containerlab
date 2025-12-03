import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';

import { log } from '../../webview/platform/logging/logger';
import { generateWebviewHtml, EditorTemplateParams, ViewerTemplateParams, TemplateMode } from '../html/HtmlGenerator';
import { TopoViewerAdaptorClab } from '../services/TopologyAdapter';
import { ClabTopology, CyElement } from '../../shared/types/topoViewerType';
import { ClabLabTreeNode } from "../../../treeView/common";
import { runningLabsProvider } from "../../../extension";
import * as utils from "../../../utils/index";
import { validateYamlContent } from '../services/YamlValidator';
import { perfMark, perfMeasure, perfSummary } from '../../shared/utilities/PerformanceMonitor';
import { sleep } from '../../shared/utilities/AsyncUtils';
import { nodeCommandService } from '../services/NodeCommandService';
import { LinkStateManager, ViewModeCache } from '../services/LinkStateManager';
import { labLifecycleService } from '../services/LabLifecycleService';
import { splitViewManager } from '../services/SplitViewManager';
import { deploymentStateChecker } from '../services/DeploymentStateChecker';
import { editorEndpointHandlers, EndpointHandlerContext } from '../services/EditorEndpointHandlers';
import { webviewTabManager } from '../services/WebviewTabManager';

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
  private dockerImagesSubscription: vscode.Disposable | undefined;
  private viewModeCache: ViewModeCache | undefined;
  private linkStateManager: LinkStateManager;
  /* eslint-disable no-unused-vars */

  private readonly generalEndpointHandlers: Record<
    string,
    (
      _payload: string | undefined,
      _payloadObj: any,
      _panel: vscode.WebviewPanel
    ) => Promise<{ result: unknown; error: string | null }>
  > = {
      'topo-viewport-save': (p) => editorEndpointHandlers.handleViewportSaveEndpoint(p, this.getHandlerContext()),
      'lab-settings-get': () => editorEndpointHandlers.handleLabSettingsGetEndpoint(this.getHandlerContext()),
      'lab-settings-update': (p, o) => editorEndpointHandlers.handleLabSettingsUpdateEndpoint(p, o, this.getHandlerContext()),
      'topo-editor-get-node-config': (_p, o) => editorEndpointHandlers.handleGetNodeConfigEndpoint(o, this.getHandlerContext()),
      'show-error-message': (p) => editorEndpointHandlers.handleShowErrorMessageEndpoint(p),
      'topo-editor-viewport-save': (p) => editorEndpointHandlers.handleViewportSaveEditEndpoint(p, this.getHandlerContext()),
      'topo-editor-viewport-save-suppress-notification': (p) =>
        editorEndpointHandlers.handleViewportSaveSuppressNotificationEndpoint(p, this.getHandlerContext()),
      'topo-editor-show-vscode-message': (p) => editorEndpointHandlers.handleShowVscodeMessageEndpoint(p),
      'topo-switch-mode': this.handleSwitchModeEndpoint.bind(this),
      'open-external': (p) => editorEndpointHandlers.handleOpenExternalEndpoint(p),
      'topo-editor-load-annotations': () => editorEndpointHandlers.handleLoadAnnotationsEndpoint(this.getHandlerContext()),
      'topo-editor-save-annotations': (_p, o) => editorEndpointHandlers.handleSaveAnnotationsEndpoint(o, this.getHandlerContext()),
      'topo-editor-load-viewer-settings': () => editorEndpointHandlers.handleLoadViewerSettingsEndpoint(this.getHandlerContext()),
      'topo-editor-save-viewer-settings': (_p, o) => editorEndpointHandlers.handleSaveViewerSettingsEndpoint(o, this.getHandlerContext()),
      'topo-editor-save-custom-node': (_p, o) => editorEndpointHandlers.handleSaveCustomNodeEndpoint(o),
      'topo-editor-delete-custom-node': (_p, o) => editorEndpointHandlers.handleDeleteCustomNodeEndpoint(o),
      'topo-editor-set-default-custom-node': (_p, o) => editorEndpointHandlers.handleSetDefaultCustomNodeEndpoint(o),
      'refresh-docker-images': () => editorEndpointHandlers.handleRefreshDockerImagesEndpoint(),
      'topo-editor-upload-icon': () => editorEndpointHandlers.handleUploadIconEndpoint(),
      'topo-editor-delete-icon': (_p, o) => editorEndpointHandlers.handleDeleteIconEndpoint(o),
      showError: (_p, o) => editorEndpointHandlers.handleShowErrorEndpoint(o),
      'performance-metrics': (p, o) => editorEndpointHandlers.handlePerformanceMetricsEndpoint(p, o),
      'topo-toggle-split-view': () => editorEndpointHandlers.handleToggleSplitViewEndpoint(this.getHandlerContext()),
      copyElements: (_p, o) => editorEndpointHandlers.handleCopyElementsEndpoint(this.context, o),
      getCopiedElements: (_p, _o, panel) => editorEndpointHandlers.handleGetCopiedElementsEndpoint(this.context, panel),
      'topo-debug-log': (_p, o) => editorEndpointHandlers.handleDebugLogEndpoint(o),
      'topo-editor-open-link': (p) => editorEndpointHandlers.handleOpenExternalLinkEndpoint(p)
    };

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
    this.linkStateManager = new LinkStateManager(this.adaptor);
    this.dockerImagesSubscription = utils.onDockerImagesUpdated(images => {
      if (this.currentPanel) {
        this.currentPanel.webview.postMessage({ type: 'docker-images-updated', dockerImages: images });
      }
    });
    context.subscriptions.push(this.dockerImagesSubscription);
  }

  private getHandlerContext(): EndpointHandlerContext {
    return {
      lastYamlFilePath: this.lastYamlFilePath,
      currentLabName: this.currentLabName,
      adaptor: this.adaptor,
      context: this.context,
      currentPanel: this.currentPanel,
      isInternalUpdate: this.isInternalUpdate,
      setInternalUpdate: (v: boolean) => { this.isInternalUpdate = v; },
      updateCachedYaml: () => this.updateCachedYamlFromCurrentDoc(),
      postMessage: (msg: any) => { if (this.currentPanel) this.currentPanel.webview.postMessage(msg); }
    };
  }

  private logDebug(message: string): void {
    log.debug(message);
  }

  private buildDefaultLabYaml(labName: string, savedPath?: string): string {
    const saved = savedPath ? ` # saved as ${savedPath}` : '';
    return `name: ${labName}${saved}\n\ntopology:\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n      type: ixr-d2l\n      image: ghcr.io/nokia/srlinux:latest\n\n    srl2:\n      kind: nokia_srlinux\n      type: ixr-d2l\n      image: ghcr.io/nokia/srlinux:latest\n\n  links:\n    - endpoints: [ srl1:e1-1, srl2:e1-1 ]\n    - endpoints: [ srl1:e1-2, srl2:e1-2 ]\n`;
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
    this.logDebug('handleManualSave: start');
    // Read the current file content
    try {
      const currentContent = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');
      const cachedContent = this.context.workspaceState.get<string>(`cachedYaml_${this.currentLabName}`);

      // If the content hasn't changed, don't do anything at all
      if (cachedContent === currentContent) {
        log.debug('Save listener: YAML content unchanged, ignoring completely');
        this.logDebug('handleManualSave: YAML unchanged, aborting');
        return;
      }
    } catch (err) {
      log.error(`Error checking YAML content: ${err}`);
      this.logDebug(`handleManualSave: error while checking content: ${err}`);
    }

    // Content has changed, proceed with normal update
    await this.triggerUpdate(true);
  }
  private async triggerUpdate(sendSaveAck: boolean): Promise<void> {
    this.logDebug(`triggerUpdate: invoked (sendSaveAck=${sendSaveAck})`);
    if (this.isUpdating) {
      this.logDebug('triggerUpdate: update already in progress, queueing request');
      this.queuedUpdate = true;
      this.queuedSaveAck = this.queuedSaveAck || sendSaveAck;
      return;
    }

    if (this.isSwitchingMode) {
      this.logDebug('triggerUpdate: mode switch in progress, skipping update');
      return;
    }

    try {
      const success = await this.updatePanelHtml(this.currentPanel);
      this.logDebug(`triggerUpdate: updatePanelHtml returned ${success}`);
      if (success) {
        if ((sendSaveAck || this.queuedSaveAck) && this.currentPanel) {
          this.logDebug('triggerUpdate: posting yaml-saved message to webview');
          this.currentPanel.webview.postMessage({ type: 'yaml-saved' });
        }
      } else {
        // updatePanelHtml returns false for various reasons, not just validation
        // The actual error message (if any) has already been shown
        log.debug('Panel update returned false - see previous logs for details');
        this.logDebug('triggerUpdate: updatePanelHtml returned false');
      }
    } catch (err) {
      log.error(`Error updating topology: ${err}`);
      vscode.window.showErrorMessage(`Error updating topology: ${err}`);
      this.logDebug(`triggerUpdate: caught error ${err}`);
    }

    if (this.queuedUpdate) {
      this.logDebug('triggerUpdate: processing queued update');
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
    const templateContent = this.buildDefaultLabYaml(baseNameWithoutExt, targetFileUri.fsPath);

    try {
      // Ensure the directory exists using the final URI's directory
      const dirUri = targetFileUri.with({ path: path.dirname(targetFileUri.path) });
      await vscode.workspace.fs.createDirectory(dirUri);

      // Write the file using the final URI and mark as internal to
      // avoid triggering the file watcher.
      const data = Buffer.from(templateContent, 'utf8');
      this.isInternalUpdate = true;
      await vscode.workspace.fs.writeFile(targetFileUri, data);
      await sleep(50);
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

  public async refreshAfterExternalCommand(
    deploymentState: 'deployed' | 'undeployed'
  ): Promise<boolean> {
    const panel = this.currentPanel;
    if (!panel) {
      this.logDebug('refreshAfterExternalCommand: aborted (no panel)');
      return false;
    }

    this.deploymentState = deploymentState;
    this.isViewMode = deploymentState === 'deployed';
    this.logDebug(
      `refreshAfterExternalCommand: start (state=${deploymentState}, mode=${this.isViewMode ? 'view' : 'edit'})`
    );

    const success = await this.updatePanelHtmlCore(panel, false, { skipHtml: true });
    this.logDebug(`refreshAfterExternalCommand: updatePanelHtmlCore returned ${success}`);
    if (!success) {
      return false;
    }

    await this.notifyWebviewModeChanged();
    this.logDebug('refreshAfterExternalCommand: notified webview');
    return true;
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
      this.logDebug('updatePanelHtml: skipped (mode switch in progress)');
      return false;
    }

    // Use the same queuing mechanism as triggerUpdate to prevent concurrent updates
    if (this.isUpdating) {
      log.debug('Panel HTML update already in progress, skipping');
      this.logDebug('updatePanelHtml: skipped (already updating)');
      return false;
    }

    this.isUpdating = true;
    try {
      this.logDebug('updatePanelHtml: delegating to updatePanelHtmlCore');
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
    isInitialLoad: boolean = false,
    options: { skipHtml?: boolean } = {}
  ): Promise<boolean> {
    this.logDebug(`updatePanelHtmlCore: start (isInitialLoad=${isInitialLoad}, skipHtml=${options.skipHtml === true})`);
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
      this.logDebug('updatePanelHtmlCore: skipping update (YAML unchanged and not view mode)');
      return true;
    }

    const cytoTopology = await this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedTree,
      this.lastYamlFilePath
    );

    if (this.isViewMode) {
      await this.updateViewModeCache(yamlContent, cytoTopology);
    } else {
      this.viewModeCache = undefined;
    }

    const writeOk = await this.writeTopologyFiles(
      folderName,
      cytoTopology,
      yamlContent,
      isInitialLoad
    );
    this.logDebug(`updatePanelHtmlCore: writeTopologyFiles result=${writeOk}`);
    if (!writeOk) {
      return false;
    }

    if (options.skipHtml) {
      log.debug('Skipping panel HTML refresh (data regeneration only)');
      this.logDebug('updatePanelHtmlCore: returning without refreshing HTML');
      return true;
    }

    if (!panel) {
      log.error('Panel is undefined');
      return false;
    }

    await this.setPanelHtml(panel, folderName, isInitialLoad);
    this.logDebug('updatePanelHtmlCore: HTML refreshed');
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
      const defaultContent = this.buildDefaultLabYaml(labNameFromFile);
      this.isInternalUpdate = true;
      await fs.promises.writeFile(yamlFilePath, defaultContent, 'utf8');
      await sleep(50);
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

  private async updateViewModeCache(yamlContent: string, elements: CyElement[]): Promise<void> {
    let parsedTopology: ClabTopology | undefined;
    try {
      parsedTopology = YAML.parse(yamlContent) as ClabTopology;
    } catch (err) {
      log.debug(`Failed to cache parsed topology: ${err}`);
    }

    const yamlMtimeMs = await this.getYamlMtimeMs();
    this.viewModeCache = { elements, parsedTopology, yamlMtimeMs };
  }

  private async getYamlMtimeMs(): Promise<number | undefined> {
    if (!this.lastYamlFilePath) {
      return undefined;
    }
    try {
      const stats = await fs.promises.stat(this.lastYamlFilePath);
      return stats.mtimeMs;
    } catch {
      return undefined;
    }
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
    this.logDebug(`writeTopologyFiles: start (folder=${folderName}, initial=${isInitialLoad})`);
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
      this.logDebug('writeTopologyFiles: completed successfully');
      return true;
    } catch (err) {
      log.error(`Failed to write topology files: ${String(err)}`);
      if (!isInitialLoad) {
        vscode.window.showErrorMessage(`Failed to write topology files: ${err}`);
      }
      this.logDebug(`writeTopologyFiles: failed with error ${err}`);
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

  private getTemplateParamsContext() {
    return {
      deploymentState: this.deploymentState,
      lastYamlFilePath: this.lastYamlFilePath,
      currentClabTopo: this.adaptor.currentClabTopo
    };
  }

  private getViewerTemplateParams(): Partial<ViewerTemplateParams> {
    return webviewTabManager.getViewerTemplateParams(this.getTemplateParamsContext());
  }

  private async getEditorTemplateParams(): Promise<Partial<EditorTemplateParams>> {
    return webviewTabManager.getEditorTemplateParams(this.getTemplateParamsContext());
  }

  private async notifyWebviewModeChanged(): Promise<void> {
    const panel = this.currentPanel;
    if (!panel) {
      log.warn('No active panel to notify about mode change');
      this.logDebug('notifyWebviewModeChanged: aborted (no panel)');
      return;
    }

    const mode: TemplateMode = this.isViewMode ? 'viewer' : 'editor';
    this.logDebug(`notifyWebviewModeChanged: posting mode=${mode}`);
    const viewerParams = this.getViewerTemplateParams();
    const editorParams = mode === 'editor' ? await this.getEditorTemplateParams() : undefined;

    await panel.webview.postMessage({
      type: 'topo-mode-changed',
      data: {
        mode,
        deploymentState: this.deploymentState,
        viewerParams,
        editorParams
      }
    });
  }
  public async postLifecycleStatus(payload: {
    commandType: 'deploy' | 'destroy' | 'redeploy';
    status: 'success' | 'error';
    errorMessage?: string;
  }): Promise<void> {
    const panel = this.currentPanel;
    if (!panel) { this.logDebug('postLifecycleStatus: aborted (no panel)'); return; }
    try {
      await panel.webview.postMessage({ type: 'lab-lifecycle-status', data: payload });
    } catch (error) {
      log.error(`postLifecycleStatus failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private async updateCachedYamlFromCurrentDoc(): Promise<void> {
    if (!this.currentLabName) return;
    const doc = this.adaptor.currentClabDoc;
    if (!doc) {
      return;
    }

    try {
      const yaml = doc.toString();
      await this.context.workspaceState.update(`cachedYaml_${this.currentLabName}`, yaml);
    } catch (err) {
      log.warn(`Failed to update cached YAML after save: ${err}`);
    }
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

    fileUri = this.normalizeFileUri(fileUri);

    const column = vscode.window.activeTextEditor?.viewColumn;
    if (this.revealIfPanelExists(column)) return;

    const panel = this.initPanel(labName, column);
    this.currentPanel = panel;
    this.setInitialLoadingContent(panel, labName);

    const topoFilePathForState = fileUri?.fsPath || this.lastYamlFilePath;
    const deploymentStateTask = (async () => {
      try {
        this.deploymentState = await this.checkDeploymentState(labName, topoFilePathForState);
      } catch (err) {
        log.warn(`Failed to check deployment state: ${err}`);
        this.deploymentState = 'unknown';
      }
    })();

    try {
      await Promise.all([this.initializePanelData(fileUri, labName), deploymentStateTask]);
    } catch {
      return;
    }

    this.startUpdatePanelHtml();
    this.setupFileHandlers();
    this.registerPanelListeners(panel, context);
  }

  private normalizeFileUri(fileUri: vscode.Uri): vscode.Uri {
    return webviewTabManager.normalizeFileUri(fileUri, this.lastYamlFilePath);
  }

  private revealIfPanelExists(column: vscode.ViewColumn | undefined): boolean {
    return webviewTabManager.revealIfPanelExists(this.currentPanel, column);
  }

  private initPanel(labName: string, column: vscode.ViewColumn | undefined): vscode.WebviewPanel {
    return webviewTabManager.createPanel(this.context, this.viewType, labName, column);
  }

  private setInitialLoadingContent(panel: vscode.WebviewPanel, labName: string): void {
    webviewTabManager.setInitialLoadingContent(panel, labName);
  }

  private async initializePanelData(fileUri: vscode.Uri, labName: string): Promise<void> {
    try {
      const tasks: Promise<unknown>[] = [this.loadInitialYaml(fileUri, labName)];
      if (this.isViewMode) {
        tasks.push(this.loadRunningLabData());
      }
      await Promise.all(tasks);
    } catch (e) {
      this.handleInitialLoadError(e);
      throw e;
    }
  }

  private async loadRunningLabData(): Promise<void> {
    try {
      this.cacheClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
    } catch (err) {
      log.warn(`Failed to load running lab data: ${err}`);
    }
  }

  private handleInitialLoadError(e: unknown): void {
    if (!this.isViewMode) {
      vscode.window.showErrorMessage(`Failed to load topology: ${(e as Error).message}`);
    } else {
      log.warn(`Failed to load topology in view mode, continuing: ${(e as Error).message}`);
    }
  }

  private startUpdatePanelHtml(): void {
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
  }

  private setupFileHandlers(): void {
    if (this.isViewMode || !this.lastYamlFilePath) return;
    this.setupFileWatcher();
    this.setupSaveListener();
  }

  private registerPanelListeners(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): void {
    panel.onDidDispose(() => {
      this.currentPanel = undefined;
      this.viewModeCache = undefined;
      this.disposeFileHandlers();
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      await this.handleWebviewMessage(msg, panel);
    });
  }

  private disposeFileHandlers(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    if (this.saveListener) {
      this.saveListener.dispose();
      this.saveListener = undefined;
    }
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
        `topology:\n  nodes:\n    srl1:\n      kind: nokia_srlinux\n      type: ixr-d2l\n      image: ghcr.io/nokia/srlinux:latest\n\n    srl2:\n      kind: nokia_srlinux\n      type: ixr-d2l\n      image: ghcr.io/nokia/srlinux:latest\n\n  links:\n    # inter-switch link\n    - endpoints: [ srl1:e1-1, srl2:e1-1 ]\n    - endpoints: [ srl1:e1-2, srl2:e1-2 ]\n`;
      this.isInternalUpdate = true;
      await fs.promises.writeFile(this.lastYamlFilePath, defaultContent, 'utf8');
      await sleep(50);
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

  private async handleGeneralEndpoint(
    endpointName: string,
    payload: string | undefined,
    payloadObj: any,
    panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    const handler = this.generalEndpointHandlers[endpointName];
    if (!handler) {
      const error = `Unknown endpoint "${endpointName}".`;
      log.error(error);
      return { result: null, error };
    }
    return handler(payload, payloadObj, panel);
  }

  private async handleSwitchModeEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      if (this.isSwitchingMode) {
        const error = 'Mode switch already in progress';
        log.debug('Mode switch already in progress');
        this.logDebug('handleSwitchModeEndpoint: rejected (already switching)');
        return { result: null, error };
      }
      log.debug(`Starting mode switch from ${this.isViewMode ? 'view' : 'edit'} mode`);
      this.logDebug(`handleSwitchModeEndpoint: start (payload=${payload ?? 'none'})`);
      this.isSwitchingMode = true;
      const data = payload ? JSON.parse(payload as string) : { mode: 'toggle' };
      if (data.mode === 'toggle') {
        this.isViewMode = !this.isViewMode;
      } else if (data.mode === 'view') {
        this.isViewMode = true;
      } else if (data.mode === 'edit') {
        this.isViewMode = false;
      }
      this.deploymentState = await this.checkDeploymentState(
        this.currentLabName,
        this.lastYamlFilePath
      );
      this.logDebug(`handleSwitchModeEndpoint: deployment state ${this.deploymentState}`);
      const dataRefreshSuccess = await this.updatePanelHtmlCore(
        this.currentPanel,
        false,
        { skipHtml: true }
      );
      this.logDebug(`handleSwitchModeEndpoint: updatePanelHtmlCore skipHtml result=${dataRefreshSuccess}`);
      if (!dataRefreshSuccess) {
        const error = 'Failed to refresh topology data during mode switch';
        log.error(error);
        this.logDebug(`handleSwitchModeEndpoint: aborting due to data refresh failure`);
        return { result: null, error };
      }
      await this.notifyWebviewModeChanged();
      const result = { mode: this.isViewMode ? 'view' : 'edit', deploymentState: this.deploymentState };
      log.info(`Switched to ${this.isViewMode ? 'view' : 'edit'} mode`);
      this.logDebug(`handleSwitchModeEndpoint: success -> mode=${result.mode}`);
      return { result, error: null };
    } catch (err) {
      const error = `Error switching mode: ${err}`;
      log.error(`Error switching mode: ${JSON.stringify(err, null, 2)}`);
      this.logDebug(`handleSwitchModeEndpoint: error ${err}`);
      return { result: null, error };
    } finally {
      this.isSwitchingMode = false;
      log.debug(`Mode switch completed, flag cleared`);
      this.logDebug('handleSwitchModeEndpoint: completed');
      await sleep(100);
    }
  }

  /* eslint-enable no-unused-vars */
  private async handleNodeEndpoint(endpointName: string, payloadObj: any): Promise<{ result: unknown; error: string | null }> {
    nodeCommandService.setYamlFilePath(this.lastYamlFilePath);
    return nodeCommandService.handleNodeEndpoint(endpointName, payloadObj);
  }

  private async handleInterfaceEndpoint(endpointName: string, payloadObj: any): Promise<{ result: unknown; error: string | null }> {
    return nodeCommandService.handleInterfaceEndpoint(endpointName, payloadObj);
  }

  private async handleLabLifecycleEndpoint(
    endpointName: string,
    payloadObj: any
  ): Promise<{ result: unknown; error: string | null }> {
    return labLifecycleService.handleLabLifecycleEndpoint(endpointName, payloadObj as string);
  }







  public async refreshLinkStatesFromInspect(
    labsData?: Record<string, ClabLabTreeNode>
  ): Promise<void> {
    if (!this.currentPanel || !this.isViewMode) {
      return;
    }

    if (!this.currentLabName) {
      return;
    }

    try {
      const labs = labsData ?? (await runningLabsProvider?.discoverInspectLabs());
      if (!labs) {
        return;
      }

      const hasMatchingLab = Object.values(labs).some(
        lab => lab.name === this.currentLabName
      );
      if (!hasMatchingLab) {
        return;
      }

      await this.ensureViewModeCache(labs);

      const edgeUpdates = this.buildEdgeUpdatesFromCache(labs);
      if (!edgeUpdates.length) {
        this.logDebug('refreshLinkStates: no edge updates to send');
        return;
      }

      this.logDebug(`refreshLinkStates: posting ${edgeUpdates.length} edge updates to webview`);
      this.currentPanel.webview.postMessage({
        type: 'updateTopology',
        data: edgeUpdates,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Failed to refresh link states from inspect data: ${message}`);
    }
  }

  private async ensureViewModeCache(
    labs: Record<string, ClabLabTreeNode> | undefined
  ): Promise<void> {
    if (!this.isViewMode) {
      return;
    }

    const yamlMtimeMs = await this.getYamlMtimeMs();
    const cache = this.viewModeCache;
    const needsReload =
      !cache ||
      cache.elements.length === 0 ||
      (yamlMtimeMs !== undefined && cache.yamlMtimeMs !== yamlMtimeMs);

    if (!needsReload) {
      return;
    }

    const yamlContent = await this.getYamlContentViewMode();
    const elements = await this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      labs,
      this.lastYamlFilePath
    );
    await this.updateViewModeCache(yamlContent, elements);
  }

  private buildEdgeUpdatesFromCache(labs: Record<string, ClabLabTreeNode>): CyElement[] {
    if (!this.viewModeCache) {
      return [];
    }
    this.linkStateManager.setCurrentLabName(this.currentLabName);
    return this.linkStateManager.buildEdgeUpdatesFromCache(this.viewModeCache, labs);
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
  public async checkDeploymentState(
    labName: string,
    topoFilePath: string | undefined = this.lastYamlFilePath
  ): Promise<'deployed' | 'undeployed' | 'unknown'> {
    return deploymentStateChecker.checkDeploymentState(
      labName,
      topoFilePath,
      (newName: string) => { this.currentLabName = newName; }
    );
  }
  /** Opens the specified file in a split editor. */
  public async openTemplateFile(filePath: string): Promise<void> {
    await splitViewManager.openTemplateFile(filePath, this.currentPanel);
  }
  /** Toggle the split view with YAML editor. */
  public async toggleSplitView(): Promise<void> {
    await splitViewManager.toggleSplitView(this.lastYamlFilePath, this.currentPanel);
  }
}
