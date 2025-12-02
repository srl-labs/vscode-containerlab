import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as YAML from 'yaml';

import { log } from '../logging/logger';

import { generateWebviewHtml, EditorTemplateParams, ViewerTemplateParams, TemplateMode } from './HtmlGenerator';
import { TopoViewerAdaptorClab } from './TopologyAdapter';
import { ClabTopology, CyElement } from '../shared/types/topoViewerType';
import { resolveNodeConfig } from '../core/nodeConfig';
import { ClabLabTreeNode, ClabContainerTreeNode, ClabInterfaceTreeNode } from "../../treeView/common";
import * as inspector from "../../treeView/inspector";
import { runningLabsProvider } from "../../extension";
import * as utils from "../../utils/index";

import { validateYamlContent } from './YamlValidator';
import { saveViewport } from '../shared/utilities/SaveViewport';
import { annotationsManager } from './AnnotationsFile';
import { perfMark, perfMeasure, perfSummary } from '../shared/utilities/PerformanceMonitor';
import { sleep } from '../shared/utilities/AsyncUtils';
import { DEFAULT_INTERFACE_PATTERNS } from '../shared/constants/interfacePatterns';
import type { ClabInterfaceStats } from '../../types/containerlab';
import { findInterfaceNode } from '../shared/utilities/TreeUtils';

// Common configuration section key used throughout this module
const CONFIG_SECTION = 'containerlab.editor';
const SUPPORTED_ICON_EXTENSIONS = new Set(['.svg', '.png']);

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
  private dockerImagesSubscription: vscode.Disposable | undefined;
  private viewModeCache:
    | {
      elements: CyElement[];
      parsedTopology?: ClabTopology;
      yamlMtimeMs?: number;
    }
    | undefined;
  /* eslint-disable no-unused-vars */

  private readonly generalEndpointHandlers: Record<
    string,
    (
      _payload: string | undefined,
      _payloadObj: any,
      _panel: vscode.WebviewPanel
    ) => Promise<{ result: unknown; error: string | null }>
  > = {
      'topo-viewport-save': this.handleViewportSaveEndpoint.bind(this),
      'lab-settings-get': this.handleLabSettingsGetEndpoint.bind(this),
      'lab-settings-update': this.handleLabSettingsUpdateEndpoint.bind(this),
      'topo-editor-get-node-config': this.handleGetNodeConfigEndpoint.bind(this),
      'show-error-message': this.handleShowErrorMessageEndpoint.bind(this),
      'topo-editor-viewport-save': this.handleViewportSaveEditEndpoint.bind(this),
      'topo-editor-viewport-save-suppress-notification':
        this.handleViewportSaveSuppressNotificationEndpoint.bind(this),
      'topo-editor-undo': this.handleUndoEndpoint.bind(this),
      'topo-editor-show-vscode-message': this.handleShowVscodeMessageEndpoint.bind(this),
      'topo-switch-mode': this.handleSwitchModeEndpoint.bind(this),
      'open-external': this.handleOpenExternalEndpoint.bind(this),
      'topo-editor-load-annotations': this.handleLoadAnnotationsEndpoint.bind(this),
      'topo-editor-save-annotations': this.handleSaveAnnotationsEndpoint.bind(this),
      'topo-editor-load-viewer-settings': this.handleLoadViewerSettingsEndpoint.bind(this),
      'topo-editor-save-viewer-settings': this.handleSaveViewerSettingsEndpoint.bind(this),
      'topo-editor-save-custom-node': this.handleSaveCustomNodeEndpoint.bind(this),
      'topo-editor-delete-custom-node': this.handleDeleteCustomNodeEndpoint.bind(this),
      'topo-editor-set-default-custom-node': this.handleSetDefaultCustomNodeEndpoint.bind(this),
      'refresh-docker-images': this.handleRefreshDockerImagesEndpoint.bind(this),
      'topo-editor-upload-icon': this.handleUploadIconEndpoint.bind(this),
      'topo-editor-delete-icon': this.handleDeleteIconEndpoint.bind(this),
      showError: this.handleShowErrorEndpoint.bind(this),
      'performance-metrics': this.handlePerformanceMetricsEndpoint.bind(this),
      'topo-toggle-split-view': this.handleToggleSplitViewEndpoint.bind(this),
      copyElements: this.handleCopyElementsEndpoint.bind(this),
      getCopiedElements: this.handleGetCopiedElementsEndpoint.bind(this),
      'topo-debug-log': this.handleDebugLogEndpoint.bind(this),
      'topo-editor-open-link': this.handleOpenExternalLinkEndpoint.bind(this)
    };

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
    this.dockerImagesSubscription = utils.onDockerImagesUpdated(images => {
      if (this.currentPanel) {
        this.currentPanel.webview.postMessage({ type: 'docker-images-updated', dockerImages: images });
      }
    });
    context.subscriptions.push(this.dockerImagesSubscription);
  }

  private logDebug(message: string): void {
    log.debug(message);
  }

  private buildDefaultLabYaml(labName: string, savedPath?: string): string {
    const saved = savedPath ? ` # saved as ${savedPath}` : '';
    return `name: ${labName}${saved}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixr-d2l
      image: ghcr.io/nokia/srlinux:latest

    srl2:
      kind: nokia_srlinux
      type: ixr-d2l
      image: ghcr.io/nokia/srlinux:latest

  links:
    # inter-switch link
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
    - endpoints: [ srl1:e1-2, srl2:e1-2 ]
`;
  }

  private async getContainerNode(nodeName: string): Promise<ClabContainerTreeNode | undefined> {
    const labs = await runningLabsProvider?.discoverInspectLabs();
    if (!labs || !this.lastYamlFilePath) {
      return undefined;
    }

    // Only search in the current lab
    const currentLab = Object.values(labs).find(lab => lab.labPath.absolute === this.lastYamlFilePath);
    if (!currentLab) {
      return undefined;
    }

    const containers = currentLab.containers ?? [];
    const directMatch = containers.find(
      (c) => c.name === nodeName || c.name_short === nodeName || (c.label as string) === nodeName
    );
    if (directMatch) {
      return directMatch;
    }

    // Check for distributed SROS container
    return this.resolveDistributedSrosContainer(containers, nodeName);
  }

  private resolveDistributedSrosContainer(
    containers: ClabContainerTreeNode[],
    nodeName: string
  ): ClabContainerTreeNode | undefined {
    const normalizedTarget = nodeName.toLowerCase();
    const candidates = containers
      .filter((container) => container.kind === 'nokia_srsim')
      .map((container) => ({ container, info: this.extractSrosComponentInfo(container) }))
      .filter((entry): entry is { container: ClabContainerTreeNode; info: { base: string; slot: string } } => {
        return !!entry.info && entry.info.base.toLowerCase() === normalizedTarget;
      });

    if (!candidates.length) {
      return undefined;
    }

    candidates.sort((a, b) => {
      const slotOrder = this.srosSlotPriority(a.info.slot) - this.srosSlotPriority(b.info.slot);
      if (slotOrder !== 0) {
        return slotOrder;
      }
      return a.info.slot.localeCompare(b.info.slot, undefined, { sensitivity: 'base' });
    });
    return candidates[0].container;
  }

  private extractSrosComponentInfo(
    container: ClabContainerTreeNode
  ): { base: string; slot: string } | undefined {
    const rawLabel = (container.name_short || container.name || '').trim();
    if (!rawLabel) {
      return undefined;
    }

    const lastDash = rawLabel.lastIndexOf('-');
    if (lastDash === -1) {
      return undefined;
    }

    const base = rawLabel.slice(0, lastDash);
    const slot = rawLabel.slice(lastDash + 1);
    if (!base || !slot) {
      return undefined;
    }

    return { base, slot };
  }

  private srosSlotPriority(slot: string): number {
    const normalized = slot.toLowerCase();
    if (normalized === 'a') {
      return 0;
    }
    if (normalized === 'b') {
      return 1;
    }
    return 2;
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

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getViewerTemplateParams(): Partial<ViewerTemplateParams> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const lockLabByDefault = config.get<boolean>('lockLabByDefault', true);
    return {
      deploymentState: this.deploymentState,
      viewerMode: 'viewer',
      currentLabPath: this.lastYamlFilePath,
      lockLabByDefault
    };
  }

  private async getEditorTemplateParams(): Promise<Partial<EditorTemplateParams>> {
    await utils.refreshDockerImages();
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const lockLabByDefault = config.get<boolean>('lockLabByDefault', true);
    const legacyIfacePatternMapping = this.getLegacyInterfacePatternMapping(config);
    const updateLinkEndpointsOnKindChange = config.get<boolean>(
      'updateLinkEndpointsOnKindChange',
      true
    );
    const rawCustomNodes = config.get<unknown>('customNodes', []);
    const normalizedCustomNodes = Array.isArray(rawCustomNodes) ? rawCustomNodes : [];
    const customNodes = await this.ensureCustomNodeInterfacePatterns(
      config,
      normalizedCustomNodes,
      legacyIfacePatternMapping
    );
    const ifacePatternMapping = this.buildInterfacePatternMapping(
      customNodes,
      legacyIfacePatternMapping
    );
    const { defaultNode, defaultKind, defaultType } = this.getDefaultCustomNode(customNodes);
    const imageMapping = this.buildImageMapping(customNodes);
    const dockerImages = utils.getDockerImages();
    const customIcons = await this.loadCustomIcons();
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
      lockLabByDefault,
      customIcons
    };
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
    if (!panel) {
      this.logDebug('postLifecycleStatus: aborted (no panel)');
      return;
    }

    try {
      await panel.webview.postMessage({
        type: 'lab-lifecycle-status',
        data: payload
      });
    } catch (error) {
      log.error(
        `postLifecycleStatus failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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

  private getLegacyInterfacePatternMapping(
    config: vscode.WorkspaceConfiguration
  ): Record<string, string> {
    const legacy = config.get<Record<string, string> | undefined>('interfacePatternMapping');
    if (!legacy || typeof legacy !== 'object') {
      return {};
    }
    return Object.fromEntries(
      Object.entries(legacy)
        .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0)
    );
  }

  private async ensureCustomNodeInterfacePatterns(
    config: vscode.WorkspaceConfiguration,
    customNodes: any[],
    legacyIfacePatternMapping: Record<string, string>
  ): Promise<any[]> {
    let didUpdate = false;

    const normalized = customNodes.map(node => {
      if (!node || typeof node !== 'object') {
        return node;
      }

      const kind = typeof node.kind === 'string' ? node.kind : '';
      const rawPattern = typeof node.interfacePattern === 'string' ? node.interfacePattern : '';
      const trimmedPattern = rawPattern.trim();

      if (trimmedPattern.length > 0) {
        if (trimmedPattern !== rawPattern) {
          didUpdate = true;
          return { ...node, interfacePattern: trimmedPattern };
        }
        return node;
      }

      if (!kind) {
        return node;
      }

      const fallback =
        legacyIfacePatternMapping[kind] || DEFAULT_INTERFACE_PATTERNS[kind];
      if (!fallback) {
        return node;
      }

      didUpdate = true;
      return { ...node, interfacePattern: fallback };
    });

    if (didUpdate) {
      await config.update('customNodes', normalized, vscode.ConfigurationTarget.Global);
    }

    return normalized;
  }

  private buildInterfacePatternMapping(
    customNodes: any[],
    legacyIfacePatternMapping: Record<string, string>
  ): Record<string, string> {
    const mapping: Record<string, string> = {
      ...DEFAULT_INTERFACE_PATTERNS,
      ...legacyIfacePatternMapping,
    };

    customNodes.forEach(node => {
      if (!node || typeof node !== 'object') {
        return;
      }
      const kind = typeof node.kind === 'string' ? node.kind : '';
      const pattern = typeof node.interfacePattern === 'string' ? node.interfacePattern.trim() : '';
      if (!kind || !pattern) {
        return;
      }
      mapping[kind] = pattern;
    });

    return mapping;
  }

  private async updateCachedYamlFromCurrentDoc(): Promise<void> {
    if (!this.currentLabName) {
      return;
    }

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
    if (this.lastYamlFilePath && fileUri.fsPath !== this.lastYamlFilePath) {
      const corrected = vscode.Uri.file(this.lastYamlFilePath);
      log.info(`Using corrected file path: ${corrected.fsPath}`);
      return corrected;
    }
    return fileUri;
  }

  private revealIfPanelExists(column: vscode.ViewColumn | undefined): boolean {
    if (!this.currentPanel) return false;
    this.currentPanel.reveal(column);
    return true;
  }

  private initPanel(labName: string, column: vscode.ViewColumn | undefined): vscode.WebviewPanel {
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
    return panel;
  }

  private setInitialLoadingContent(panel: vscode.WebviewPanel, labName: string): void {
    panel.webview.html = this.buildInitialLoadingHtml(labName);
  }

  private buildInitialLoadingHtml(labName: string): string {
    const safeLabName = this.escapeHtml(labName || 'Topology');
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeLabName} – Loading TopoViewer</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-editor-foreground, #cccccc);
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      }
      .container {
        text-align: center;
        max-width: 420px;
        padding: 2rem;
      }
      .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(128, 128, 128, 0.25);
        border-top-color: var(--vscode-progressBar-background, #007acc);
        border-radius: 50%;
        margin: 0 auto 1.5rem;
        animation: spin 0.8s linear infinite;
      }
      h1 {
        font-size: 1.2rem;
        margin: 0 0 0.75rem;
        font-weight: 600;
      }
      p {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.5;
        color: var(--vscode-descriptionForeground, inherit);
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="spinner" role="presentation" aria-hidden="true"></div>
      <h1>Loading TopoViewer…</h1>
      <p>Preparing topology data for <strong>${safeLabName}</strong>. This may take a moment on busy systems.</p>
    </div>
  </body>
</html>`;
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

  private async updateLabSettings(settings: any): Promise<{ success: boolean; yamlContent?: string; error?: string }> {
    try {
      const yamlContent = await fsPromises.readFile(this.lastYamlFilePath, 'utf8');
      const doc = YAML.parseDocument(yamlContent, { keepCstNodes: true } as any);
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
    const handler = this.generalEndpointHandlers[endpointName];
    if (!handler) {
      const error = `Unknown endpoint "${endpointName}".`;
      log.error(error);
      return { result: null, error };
    }
    return handler(payload, payloadObj, panel);
  }

  private async handleViewportSaveEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      await saveViewport({ yamlFilePath: this.lastYamlFilePath, payload: payload as string, mode: 'view' });
      const result = 'Saved viewport positions successfully.';
      log.info(result);
      return { result, error: null };
    } catch (err) {
      log.error(`Error executing endpoint "topo-viewport-save": ${JSON.stringify(err, null, 2)}`);
      return { result: null, error: null };
    }
  }

  private async handleLabSettingsGetEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const yamlContent = await fsPromises.readFile(this.lastYamlFilePath, 'utf8');
      const parsed = YAML.parse(yamlContent) as any;
      const settings = { name: parsed.name, prefix: parsed.prefix, mgmt: parsed.mgmt };
      log.info('Lab settings retrieved successfully');
      return { result: { success: true, settings }, error: null };
    } catch (err) {
      log.error(`Error getting lab settings: ${err}`);
      return { result: { success: false, error: String(err) }, error: null };
    }
  }

  private async handleLabSettingsUpdateEndpoint(
    payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    const settings = typeof payload === 'string' ? JSON.parse(payload) : payloadObj;
    const res = await this.updateLabSettings(settings);
    return {
      result: res.success ? { success: true, yamlContent: res.yamlContent } : { success: false, error: res.error },
      error: null
    };
  }

  private async handleGetNodeConfigEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
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
      log.info(`Node config retrieved for ${nodeName}`);
      return { result: { ...mergedNode, inherited: inheritedProps }, error: null };
    } catch (err) {
      const error = `Failed to get node config: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      return { result: null, error };
    }
  }

  private async handleShowErrorMessageEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    const data = payload as any;
    if (data && data.message) {
      vscode.window.showErrorMessage(data.message);
    }
    return { result: { success: true }, error: null };
  }

  private async handlePerformanceMetricsEndpoint(
    payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const metricsPayload = this.normalizeMetricsPayload(payload, payloadObj);
      const metrics = metricsPayload?.metrics;
      if (!metrics || typeof metrics !== 'object') {
        const warning = 'Received performance-metrics call without metrics payload';
        log.warn(warning);
        return { result: { success: false, warning }, error: null };
      }

      const numericEntries = Object.entries(metrics)
        .map(([name, value]) => [name, typeof value === 'number' ? value : Number(value)] as [string, number])
        .filter(([, value]) => Number.isFinite(value));

      if (!numericEntries.length) {
        const warning = 'Performance metrics payload contained no numeric values';
        log.warn(warning);
        return { result: { success: false, warning }, error: null };
      }

      const total = numericEntries.reduce((sum, [, value]) => sum + value, 0);
      log.info(
        `TopoViewer performance metrics (${numericEntries.length} entries, total ${total.toFixed(2)}ms):`
      );
      const sortedEntries = [...numericEntries].sort((a, b) => b[1] - a[1]);
      sortedEntries.slice(0, 8).forEach(([name, value]) => {
        log.info(`  ${name}: ${value.toFixed(2)}ms`);
      });

      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Failed to record performance metrics: ${err instanceof Error ? err.message : String(err)}`;
      log.error(error);
      return { result: null, error };
    }
  }

  private normalizeMetricsPayload(
    payload: string | undefined,
    payloadObj: any
  ): any {
    if (payloadObj && typeof payloadObj === 'object') {
      return payloadObj;
    }
    if (typeof payload === 'string' && payload.trim()) {
      try {
        return JSON.parse(payload);
      } catch (err) {
        log.warn(`Failed to parse performance metrics payload: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return undefined;
  }

  private async handleViewportSaveEditEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
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
      await this.updateCachedYamlFromCurrentDoc();
      const result = 'Saved topology with preserved comments!';
      log.info(result);
      return { result, error: null };
    } catch (err) {
      log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(err, null, 2)}`);
      this.isInternalUpdate = false;
      return { result: null, error: null };
    }
  }

  private async handleViewportSaveSuppressNotificationEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
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
      await this.updateCachedYamlFromCurrentDoc();
      return { result: null, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "topo-editor-viewport-save-suppress-notification".';
      log.error(
        `Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(err, null, 2)}`
      );
      this.isInternalUpdate = false;
      return { result, error: null };
    }
  }

  private async handleUndoEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
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
      await sleep(50);
      await vscode.commands.executeCommand('undo');
      await document.save();
      if (currentActiveEditor && !existingEditor) {
        await vscode.window.showTextDocument(currentActiveEditor.document, {
          viewColumn: currentActiveEditor.viewColumn,
          preview: false,
          preserveFocus: false
        });
      }
      const result = 'Undo operation completed successfully';
      log.info('Undo operation executed on YAML file');
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing undo operation';
      log.error(`Error executing undo operation: ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  private async handleShowVscodeMessageEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = JSON.parse(payload as string) as { type: 'info' | 'warning' | 'error'; message: string };
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
      const result = `Displayed ${data.type} message: ${data.message}`;
      log.info(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "clab-show-vscode-message".';
      log.error(`Error executing endpoint "clab-show-vscode-message": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
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

  private async handleOpenExternalEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const url: string = JSON.parse(payload as string);
      await vscode.env.openExternal(vscode.Uri.parse(url));
      const result = `Opened external URL: ${url}`;
      log.info(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "open-external".';
      log.error(`Error executing endpoint "open-external": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  private async handleOpenExternalLinkEndpoint(
    payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const parsed = payload ? JSON.parse(payload) : {};
      const url = typeof parsed?.url === 'string' ? parsed.url : '';
      if (!url) {
        const warning = 'topo-editor-open-link called without a URL';
        log.warn(warning);
        return { result: warning, error: warning };
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
      const result = `Opened free text link: ${url}`;
      log.debug(result);
      return { result, error: null };
    } catch (err) {
      const result = 'Error executing endpoint "topo-editor-open-link".';
      log.error(`Error executing endpoint "topo-editor-open-link": ${JSON.stringify(err, null, 2)}`);
      return { result, error: null };
    }
  }

  private async handleLoadAnnotationsEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      const result = {
        annotations: annotations.freeTextAnnotations || [],
        freeShapeAnnotations: annotations.freeShapeAnnotations || [],
        groupStyles: annotations.groupStyleAnnotations || []
      };
      log.info(
        `Loaded ${annotations.freeTextAnnotations?.length || 0} text annotations, ${annotations.freeShapeAnnotations?.length || 0} shape annotations, and ${annotations.groupStyleAnnotations?.length || 0} group styles`
      );
      return { result, error: null };
    } catch (err) {
      log.error(`Error loading annotations: ${JSON.stringify(err, null, 2)}`);
      return { result: { annotations: [], freeShapeAnnotations: [], groupStyles: [] }, error: null };
    }
  }

  private async handleSaveAnnotationsEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = payloadObj;
      const existing = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      // Preserve existing values when not provided in the payload
      // This allows individual managers (freeText, freeShapes, groupStyle) to save independently
      await annotationsManager.saveAnnotations(this.lastYamlFilePath, {
        freeTextAnnotations: data.annotations !== undefined ? data.annotations : existing.freeTextAnnotations,
        freeShapeAnnotations: data.freeShapeAnnotations !== undefined ? data.freeShapeAnnotations : existing.freeShapeAnnotations,
        groupStyleAnnotations: data.groupStyles !== undefined ? data.groupStyles : existing.groupStyleAnnotations,
        cloudNodeAnnotations: existing.cloudNodeAnnotations,
        nodeAnnotations: existing.nodeAnnotations,
        // Preserve viewer settings to avoid accidental loss when other managers save
        viewerSettings: (existing as any).viewerSettings
      });
      log.info(
        `Saved ${data.annotations?.length || 0} text annotations, ${data.freeShapeAnnotations?.length || 0} shape annotations, and ${data.groupStyles?.length || 0} group styles`
      );
      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Error saving annotations: ${err}`;
      log.error(`Error saving annotations: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleLoadViewerSettingsEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      const viewerSettings = (annotations as any).viewerSettings || {};
      return { result: { viewerSettings }, error: null };
    } catch (err) {
      log.error(`Error loading viewer settings: ${JSON.stringify(err, null, 2)}`);
      return { result: { viewerSettings: {} }, error: null };
    }
  }

  private async handleSaveViewerSettingsEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = payloadObj;
      const existing = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
      const merged = {
        ...existing,
        viewerSettings: {
          ...(existing as any).viewerSettings,
          ...(data?.viewerSettings || {})
        }
      } as any;
      await annotationsManager.saveAnnotations(this.lastYamlFilePath, merged);
      log.info('Saved viewer settings');
      return { result: { success: true }, error: null };
    } catch (err) {
      const error = `Error saving viewer settings: ${err}`;
      log.error(`Error saving viewer settings: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleSaveCustomNodeEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = payloadObj;
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      let customNodes = config.get<any[]>('customNodes', []);
      if (data.setDefault) {
        customNodes = customNodes.map((n: any) => ({ ...n, setDefault: false }));
      }
      if (data.oldName) {
        const oldIndex = customNodes.findIndex((n: any) => n.name === data.oldName);
        const nodeData = { ...data };
        delete nodeData.oldName;
        if (oldIndex >= 0) {
          customNodes[oldIndex] = nodeData;
        } else {
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
      log.info(`Saved custom node ${data.name}`);
      return { result: { customNodes, defaultNode: defaultCustomNode?.name || '' }, error: null };
    } catch (err) {
      const error = `Error saving custom node: ${err}`;
      log.error(`Error saving custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleSetDefaultCustomNodeEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = payloadObj as { name?: string };
      if (!data?.name) {
        throw new Error('Missing custom node name');
      }

      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const customNodes = config.get<any[]>('customNodes', []);

      let found = false;
      const updatedNodes = customNodes.map((node: any) => {
        const updated = { ...node, setDefault: false };
        if (node.name === data.name) {
          found = true;
          updated.setDefault = true;
        }
        return updated;
      });

      if (!found) {
        throw new Error(`Custom node ${data.name} not found`);
      }

      await config.update('customNodes', updatedNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = updatedNodes.find((n: any) => n.setDefault === true);
      log.info(`Set default custom node ${data.name}`);

      return {
        result: { customNodes: updatedNodes, defaultNode: defaultCustomNode?.name || '' },
        error: null
      };
    } catch (err) {
      const error = `Error setting default custom node: ${err}`;
      log.error(`Error setting default custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleDeleteCustomNodeEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const data = payloadObj;
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      const customNodes = config.get<any[]>('customNodes', []);
      const filteredNodes = customNodes.filter((n: any) => n.name !== data.name);
      await config.update('customNodes', filteredNodes, vscode.ConfigurationTarget.Global);
      const defaultCustomNode = filteredNodes.find((n: any) => n.setDefault === true);
      log.info(`Deleted custom node ${data.name}`);
      return { result: { customNodes: filteredNodes, defaultNode: defaultCustomNode?.name || '' }, error: null };
    } catch (err) {
      const error = `Error deleting custom node: ${err}`;
      log.error(`Error deleting custom node: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleShowErrorEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const message = payloadObj as string;
      await vscode.window.showErrorMessage(message);
      const result = 'Error message displayed';
      return { result, error: null };
    } catch (err) {
      const error = `Error showing error message: ${err}`;
      log.error(`Error showing error message: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleToggleSplitViewEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      await this.toggleSplitView();
      const result = { splitViewOpen: this.isSplitViewOpen };
      log.info(`Split view toggled: ${this.isSplitViewOpen ? 'opened' : 'closed'}`);
      return { result, error: null };
    } catch (err) {
      const error = `Error toggling split view: ${err}`;
      log.error(`Error toggling split view: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleCopyElementsEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    this.context.globalState.update('topoClipboard', payloadObj);
    return { result: 'Elements copied', error: null };
  }

  private async handleGetCopiedElementsEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    const clipboard = this.context.globalState.get('topoClipboard') || [];
    panel.webview.postMessage({ type: 'copiedElements', data: clipboard });
    return { result: 'Clipboard sent', error: null };
  }

  private async handleDebugLogEndpoint(
    _payload: string | undefined,
    payloadObj: any
  ): Promise<{ result: unknown; error: string | null }> {
    const message = typeof payloadObj?.message === 'string' ? payloadObj.message : '';
    if (!message) {
      return { result: false, error: 'No message provided' };
    }
    log.debug(message);
    return { result: true, error: null };
  }

  private async handleRefreshDockerImagesEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      await utils.refreshDockerImages();
      const dockerImages = utils.getDockerImages();
      log.info(`Docker images refreshed, found ${dockerImages.length} images`);
      return { result: { success: true, dockerImages }, error: null };
    } catch (err) {
      const error = `Error refreshing docker images: ${err}`;
      log.error(`Error refreshing docker images: ${JSON.stringify(err, null, 2)}`);
      return { result: null, error };
    }
  }

  private async handleUploadIconEndpoint(
    _payload: string | undefined,
    _payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const uploadSource = await this.promptIconUploadSource();
      if (!uploadSource) {
        return { result: { cancelled: true }, error: null };
      }

      const selection = await vscode.window.showOpenDialog(
        this.getIconPickerOptions(uploadSource)
      );
      if (!selection || selection.length === 0) {
        return { result: { cancelled: true }, error: null };
      }

      const { name } = await this.importCustomIcon(selection[0]);
      const customIcons = await this.loadCustomIcons();
      void vscode.window.showInformationMessage(`Added custom icon "${name}".`);
      return { result: { success: true, customIcons, lastAddedIcon: name }, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to import custom icon: ${message}`);
      void vscode.window.showErrorMessage(`Failed to add custom icon: ${message}`);
      return { result: null, error: message };
    }
  }

  private async promptIconUploadSource(): Promise<'remote' | 'local' | null> {
    if (!vscode.env.remoteName) {
      return 'remote';
    }

    const pick = await vscode.window.showQuickPick<{
      label: string;
      description: string;
      value: 'remote' | 'local';
    }>(
      [
        {
          label: 'Upload from remote environment',
          description: 'Use a file accessible from the current VS Code session',
          value: 'remote'
        },
        {
          label: 'Upload from local machine',
          description: 'Choose a file on your local computer (SSH/WSL)',
          value: 'local'
        }
      ],
      {
        title: 'Select icon source',
        placeHolder: 'Where should the custom icon be uploaded from?'
      }
    );

    return pick?.value ?? null;
  }

  private getIconPickerOptions(source: 'remote' | 'local'): vscode.OpenDialogOptions {
    const baseOptions: vscode.OpenDialogOptions = {
      canSelectMany: false,
      title: 'Select a Containerlab icon',
      openLabel: 'Import Icon',
      filters: { Images: ['svg', 'png'], SVG: ['svg'] }
    };

    if (source === 'local') {
      const defaultUri = this.getLocalFilePickerBaseUri();
      if (defaultUri) {
        baseOptions.defaultUri = defaultUri;
      }
    }

    return baseOptions;
  }

  private getLocalFilePickerBaseUri(): vscode.Uri | undefined {
    try {
      return vscode.Uri.parse('vscode-userdata:/');
    } catch (err) {
      log.warn(
        `Failed to build local file picker URI: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  }

  private async handleDeleteIconEndpoint(
    _payload: string | undefined,
    payloadObj: any,
    _panel: vscode.WebviewPanel
  ): Promise<{ result: unknown; error: string | null }> {
    try {
      const iconName = typeof payloadObj?.iconName === 'string' ? payloadObj.iconName.trim() : '';
      if (!iconName) {
        throw new Error('Icon name is required.');
      }
      const removed = await this.deleteCustomIcon(iconName);
      if (!removed) {
        throw new Error(`Custom icon "${iconName}" was not found.`);
      }
      const customIcons = await this.loadCustomIcons();
      void vscode.window.showInformationMessage(`Deleted custom icon "${iconName}".`);
      return { result: { success: true, customIcons, deletedIcon: iconName }, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Failed to delete custom icon: ${message}`);
      void vscode.window.showErrorMessage(`Failed to delete custom icon: ${message}`);
      return { result: null, error: message };
    }
  }

  private getCustomIconDirectory(): string {
    return path.join(os.homedir(), '.clab', 'icons');
  }

  private sanitizeIconBaseName(name: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    let start = 0;
    while (start < normalized.length && normalized[start] === '-') {
      start += 1;
    }
    let end = normalized.length;
    while (end > start && normalized[end - 1] === '-') {
      end -= 1;
    }
    const trimmed = normalized.slice(start, end);
    return trimmed || 'custom-icon';
  }

  private async ensureCustomIconDirectory(): Promise<string> {
    const dir = this.getCustomIconDirectory();
    await fsPromises.mkdir(dir, { recursive: true });
    return dir;
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fsPromises.access(target);
      return true;
    } catch {
      return false;
    }
  }

  private async generateUniqueIconFileName(dir: string, base: string, ext: string): Promise<string> {
    let candidate = `${base}${ext}`;
    let counter = 1;
    while (await this.pathExists(path.join(dir, candidate))) {
      candidate = `${base}-${counter}${ext}`;
      counter += 1;
    }
    return candidate;
  }

  private async importCustomIcon(uri: vscode.Uri): Promise<{ name: string; filePath: string }> {
    const ext = path.extname(uri.path).toLowerCase();
    if (!SUPPORTED_ICON_EXTENSIONS.has(ext)) {
      throw new Error('Only .svg and .png icons are supported.');
    }
    const dir = await this.ensureCustomIconDirectory();
    const baseName = this.sanitizeIconBaseName(path.basename(uri.path, ext));
    const fileName = await this.generateUniqueIconFileName(dir, baseName, ext);
    const destination = path.join(dir, fileName);
    const content = await vscode.workspace.fs.readFile(uri);
    await fsPromises.writeFile(destination, Buffer.from(content));
    return { name: path.basename(fileName, ext), filePath: destination };
  }

  private async deleteCustomIcon(iconName: string): Promise<boolean> {
    const dir = this.getCustomIconDirectory();
    if (!(await this.pathExists(dir))) {
      return false;
    }
    let deleted = false;
    for (const ext of SUPPORTED_ICON_EXTENSIONS) {
      const candidate = path.join(dir, `${iconName}${ext}`);
      if (await this.pathExists(candidate)) {
        await fsPromises.unlink(candidate);
        deleted = true;
      }
    }
    return deleted;
  }

  private async loadCustomIcons(): Promise<Record<string, string>> {
    const dir = this.getCustomIconDirectory();
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      const result: Record<string, string> = {};
      for (const entry of entries) {
        const iconRecord = await this.readCustomIconEntry(dir, entry);
        if (iconRecord) {
          result[iconRecord.name] = iconRecord.data;
        }
      }
      return result;
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return {};
      }
      log.error(`Failed to read custom icon directory: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  private async readCustomIconEntry(
    dir: string,
    entry: fs.Dirent
  ): Promise<{ name: string; data: string } | null> {
    if (!entry.isFile()) {
      return null;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_ICON_EXTENSIONS.has(ext)) {
      return null;
    }
    try {
      const buffer = await fsPromises.readFile(path.join(dir, entry.name));
      const mime = ext === '.svg' ? 'image/svg+xml' : 'image/png';
      const base64 = buffer.toString('base64');
      return { name: path.basename(entry.name, ext), data: `data:${mime};base64,${base64}` };
    } catch (error) {
      log.warn(
        `Failed to load custom icon ${entry.name}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /* eslint-enable no-unused-vars */
  private async handleNodeEndpoint(endpointName: string, payloadObj: any): Promise<{ result: unknown; error: string | null }> {
    let result: unknown = null;
    let error: string | null = null;

    switch (endpointName) {
      case 'clab-node-connect-ssh': {
        try {
          const nodeName = payloadObj as string;
          const containerNode = (await this.getContainerNode(nodeName)) ?? {
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
          await vscode.commands.executeCommand('containerlab.node.ssh', containerNode);
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
    const cache = this.viewModeCache;
    if (!cache || cache.elements.length === 0) {
      return [];
    }

    const updates: CyElement[] = [];
    const topology = cache.parsedTopology?.topology;

    for (const el of cache.elements) {
      if (el.group !== 'edges') {
        continue;
      }
      const updated = this.refreshEdgeWithLatestData(el, labs, topology);
      if (updated) {
        updates.push(updated);
      }
    }

    return updates;
  }

  private refreshEdgeWithLatestData(
    edge: CyElement,
    labs: Record<string, ClabLabTreeNode>,
    topology?: ClabTopology['topology']
  ): CyElement | null {
    if (edge.group !== 'edges') {
      return null;
    }

    const data = { ...edge.data };
    const extraData = { ...(data.extraData || {}) };

    const sourceIfaceName = this.normalizeInterfaceName(extraData.clabSourcePort, data.sourceEndpoint);
    const targetIfaceName = this.normalizeInterfaceName(extraData.clabTargetPort, data.targetEndpoint);

    const sourceIface = findInterfaceNode(
      labs,
      extraData.clabSourceLongName ?? '',
      sourceIfaceName,
      this.currentLabName
    );
    const targetIface = findInterfaceNode(
      labs,
      extraData.clabTargetLongName ?? '',
      targetIfaceName,
      this.currentLabName
    );

    const sourceState = this.applyInterfaceDetails(extraData, 'Source', sourceIface);
    const targetState = this.applyInterfaceDetails(extraData, 'Target', targetIface);

    data.extraData = extraData;

    const sourceNodeForClass = this.pickNodeId(extraData.yamlSourceNodeId, data.source);
    const targetNodeForClass = this.pickNodeId(extraData.yamlTargetNodeId, data.target);

    const stateClass =
      topology && sourceNodeForClass && targetNodeForClass
        ? this.adaptor.computeEdgeClassFromStates(
          topology,
          sourceNodeForClass,
          targetNodeForClass,
          sourceState,
          targetState
        )
        : undefined;

    const mergedClasses = this.mergeLinkStateClasses(edge.classes, stateClass);

    edge.data = data;
    if (mergedClasses !== undefined) {
      edge.classes = mergedClasses;
    }

    return edge;
  }

  private applyInterfaceDetails(
    extraData: Record<string, any>,
    prefix: 'Source' | 'Target',
    iface: ClabInterfaceTreeNode | undefined
  ): string | undefined {
    const stateKey = prefix === 'Source' ? 'clabSourceInterfaceState' : 'clabTargetInterfaceState';
    const macKey = prefix === 'Source' ? 'clabSourceMacAddress' : 'clabTargetMacAddress';
    const mtuKey = prefix === 'Source' ? 'clabSourceMtu' : 'clabTargetMtu';
    const typeKey = prefix === 'Source' ? 'clabSourceType' : 'clabTargetType';
    const statsKey = prefix === 'Source' ? 'clabSourceStats' : 'clabTargetStats';

    if (!iface) {
      delete extraData[statsKey];
      return typeof extraData[stateKey] === 'string' ? extraData[stateKey] : undefined;
    }

    extraData[stateKey] = iface.state || '';
    extraData[macKey] = iface.mac ?? '';
    extraData[mtuKey] = iface.mtu ?? '';
    extraData[typeKey] = iface.type ?? '';

    const stats = this.extractInterfaceStatsForEdge(iface.stats);
    if (stats) {
      extraData[statsKey] = stats;
    } else {
      delete extraData[statsKey];
    }

    return iface.state;
  }

  private extractInterfaceStatsForEdge(stats?: ClabInterfaceStats): Record<string, number> | undefined {
    if (!stats) {
      return undefined;
    }

    const result: Record<string, number> = {};
    const keys: Array<keyof ClabInterfaceStats> = [
      'rxBps',
      'rxPps',
      'rxBytes',
      'rxPackets',
      'txBps',
      'txPps',
      'txBytes',
      'txPackets',
      'statsIntervalSeconds',
    ];

    for (const key of keys) {
      const value = stats[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  private normalizeInterfaceName(value: unknown, fallback: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
    return '';
  }

  private pickNodeId(primary: unknown, fallback: unknown): string {
    if (typeof primary === 'string' && primary.trim()) {
      return primary;
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
    return '';
  }

  private mergeLinkStateClasses(existing: string | undefined, stateClass: string | undefined): string | undefined {
    if (!stateClass) {
      return existing;
    }

    const tokens = (existing ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .filter(token => token !== 'link-up' && token !== 'link-down');

    tokens.unshift(stateClass);

    return tokens.join(' ');
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
    try {
      await inspector.update();
      if (!inspector.rawInspectData) return 'unknown';
      if (this.labExistsByName(labName)) return 'deployed';
      if (topoFilePath && this.updateLabNameFromTopoFileMatch(topoFilePath)) return 'deployed';
      return 'undeployed';
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
      return 'unknown';
    }
  }

  private labExistsByName(labName: string): boolean {
    return labName in (inspector.rawInspectData as any);
  }

  private updateLabNameFromTopoFileMatch(topoFilePath: string): boolean {
    const normalizedYamlPath = topoFilePath.replace(/\\/g, '/');
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
      await sleep(100);

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
