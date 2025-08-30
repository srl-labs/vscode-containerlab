import * as vscode from 'vscode';
import * as path from 'path';

import * as fs from 'fs';

import { log } from '../logging/logger';

import { generateWebviewHtml, EditorTemplateParams, ViewerTemplateParams, TemplateMode } from '../htmlTemplateUtils';
import { TopoViewerAdaptorClab } from '../core/topoViewerAdaptorClab';
import { ClabLabTreeNode, ClabContainerTreeNode } from "../../treeView/common";
import * as inspector from "../../treeView/inspector";
import { runningLabsProvider } from "../../extension";

import { validateYamlContent } from '../utilities/yamlValidator';
import { saveViewport } from '../utilities/saveViewport';
import { annotationsManager } from '../utilities/annotationsManager';

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

      this.fileWatcher.onDidChange(() => {
        // Prevent feedback loop
        if (this.isInternalUpdate) {
          return;
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
    return this.updatePanelHtmlCore(panel);
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
  private async updatePanelHtmlCore(panel: vscode.WebviewPanel | undefined): Promise<boolean> {
    if (!this.currentLabName) {
      return false;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.currentLabName;

    let updatedClabTreeDataToTopoviewer = this.isViewMode
      ? this.cacheClabTreeDataToTopoviewer
      : undefined;
    if (this.isViewMode) {
      try {
        updatedClabTreeDataToTopoviewer = await runningLabsProvider.discoverInspectLabs();
        this.cacheClabTreeDataToTopoviewer = updatedClabTreeDataToTopoviewer;
      } catch (err) {
        log.warn(`Failed to refresh running lab data: ${err}`);
      }
    }
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    let yamlContent: string = '';

    // Always skip validation in view mode
    if (this.isViewMode) {
      log.info(`updatePanelHtml in view mode for ${folderName}`);
      // Try to read YAML if available, but don't fail if invalid
      if (yamlFilePath) {
        try {
          yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
          log.info('Read YAML file in view mode, skipping validation');
        } catch (err) {
          log.warn(`Could not read YAML in view mode: ${err}`);
        }
      }

      // If no YAML content, generate minimal one
      if (!yamlContent) {
        yamlContent = `name: ${this.currentLabName}\ntopology:\n  nodes: {}\n  links: []`;
        log.info('Using minimal YAML for view mode');
      }
    } else {
      // Edit mode - strict validation
      if (!yamlFilePath) {
        log.error('No YAML file path in edit mode');
        return false;
      }

      try {
        yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
      } catch (err) {
        log.error(`Failed to read YAML file: ${String(err)}`);
        vscode.window.showErrorMessage(`Failed to read YAML file: ${err}`);
        return false;
      }

      // Only validate in edit mode
      if (!this.skipInitialValidation) {
        const isValid = await this.validateYaml(yamlContent);
        if (!isValid) {
          log.error('YAML validation failed. Aborting updatePanelHtml.');
          return false;
        }
      } else {
        this.skipInitialValidation = false;
      }
    }

    const cytoTopology = await this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer,
      this.lastYamlFilePath
    );

    try {
      await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);
    } catch (err) {
      log.error(`Failed to write topology files: ${String(err)}`);
      vscode.window.showErrorMessage(`Failed to write topology files: ${err}`);
      return false;
    }

    if (panel) {
      const mode: TemplateMode = this.isViewMode ? 'viewer' : 'editor';
      let templateParams: any = {};

      if (mode === 'viewer') {
        // For viewer mode, pass viewer-specific parameters
        const viewerParams: Partial<ViewerTemplateParams> = {
          deploymentState: this.deploymentState,
          viewerMode: 'viewer',
          currentLabPath: this.lastYamlFilePath,
        };
        templateParams = viewerParams;
      } else {
        // For editor mode, pass editor-specific parameters
        const imageMapping = vscode.workspace.getConfiguration('containerlab.editor').get<Record<string, string>>('imageMapping', {});
        const ifacePatternMapping = vscode.workspace.getConfiguration('containerlab.editor').get<Record<string, string>>('interfacePatternMapping', {});
        const defaultKind = vscode.workspace.getConfiguration('containerlab.editor').get<string>('defaultKind', 'nokia_srlinux');
        const defaultType = vscode.workspace.getConfiguration('containerlab.editor').get<string>('defaultType', 'ixrd1');
        const updateLinkEndpointsOnKindChange = vscode.workspace.getConfiguration('containerlab.editor').get<boolean>('updateLinkEndpointsOnKindChange', true);

        const editorParams: Partial<EditorTemplateParams> = {
          imageMapping,
          ifacePatternMapping,
          defaultKind,
          defaultType,
          updateLinkEndpointsOnKindChange,
          currentLabPath: this.lastYamlFilePath,
        };
        templateParams = editorParams;
      }

      panel.webview.html = generateWebviewHtml(
        this.context,
        panel,
        mode,
        folderName,
        this.adaptor,
        templateParams
      );

    } else {
      log.error('Panel is undefined');
      return false;
    }

    return true;
  }

  /**
   * Creates a new webview panel or reveals the current one.
   * @param context The extension context.
   */
  public async createWebviewPanel(context: vscode.ExtensionContext, fileUri: vscode.Uri, labName: string, viewMode: boolean = false): Promise<void> {
    this.currentLabName = labName;
    this.isViewMode = viewMode;

    // Check deployment state
    this.deploymentState = await this.checkDeploymentState(labName);
    if (this.lastYamlFilePath && fileUri.fsPath !== this.lastYamlFilePath) {
      // If we have a lastYamlFilePath and it's different from the fileUri,
      // create a new URI from the lastYamlFilePath
      fileUri = vscode.Uri.file(this.lastYamlFilePath);
      log.info(`Using corrected file path: ${fileUri.fsPath}`);
    }

    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If a panel already exists, reveal it.
    if (this.currentPanel) {
      this.currentPanel.reveal(column);
      return;
    }

    // Otherwise, create a new webview panel.
    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      this.isViewMode ? 'containerlab Viewer (Web)' : 'containerlab Editor (Web)',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          // Dynamic data folder.
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', labName),
          // Compiled JS directory.
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          // Schema directory for YAML validation and dropdown data.
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
      let yaml: string = '';

      if (this.isViewMode) {
        // View mode - be flexible with YAML
        log.info(`Creating panel in view mode for lab: ${labName}`);

        // Try to read YAML if we have a path
        if (fileUri && fileUri.fsPath) {
          try {
            yaml = await fs.promises.readFile(fileUri.fsPath, 'utf8');
            this.lastYamlFilePath = fileUri.fsPath;
            log.info('Read YAML file for view mode');
          } catch (err) {
            log.warn(`Could not read YAML in view mode: ${err}`);
            this.lastYamlFilePath = '';
          }
        }

        // If no YAML, use minimal
        if (!yaml) {
          yaml = `name: ${labName}\ntopology:\n  nodes: {}\n  links: []`;
          log.info('Using minimal YAML for view mode');
        }

        // Always skip validation in view mode
        this.skipInitialValidation = true;
      } else {
        // Edit mode - strict handling
        if (!fileUri || !fileUri.fsPath) {
          throw new Error('No file URI provided for edit mode');
        }

        // Check if file exists
        try {
          await vscode.workspace.fs.stat(fileUri);
          this.lastYamlFilePath = fileUri.fsPath;
        } catch {
          if (this.lastYamlFilePath) {
            fileUri = vscode.Uri.file(this.lastYamlFilePath);
            log.info(`Using cached file path: ${this.lastYamlFilePath}`);
          } else {
            throw new Error(`File not found: ${fileUri.fsPath}`);
          }
        }

        // Read the YAML
        yaml = await fs.promises.readFile(this.lastYamlFilePath, 'utf8');

        // Validate unless explicitly skipped
        if (!this.skipInitialValidation) {
          const isValid = await this.validateYaml(yaml);
          if (!isValid) {
            log.error('YAML validation failed. Aborting createWebviewPanel.');
            return;
          }
        }
      }

      // Skip initial processing - updatePanelHtmlInternal will handle it
      // This avoids duplicate YAML processing and file writes
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
      } else {
        log.warn(`Failed to load topology in view mode, continuing: ${(e as Error).message}`);
      }
    }



    await this.updatePanelHtmlInternal(this.currentPanel);

    // Only setup file watchers and save listeners in edit mode
    if (!this.isViewMode && this.lastYamlFilePath) {
      this.setupFileWatcher();
      this.setupSaveListener();
    }

    // Clean up when the panel is disposed.
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

    /**
    * Interface for messages received from the webview.
    */
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

    // Listen for incoming messages from the webview.
    panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      if (!msg || typeof msg !== 'object') {
        log.error('Invalid message received.');
        return;
      }

      if (msg.command === 'topoViewerLog') {
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
        return;
      }

      log.info(`Received POST message from frontEnd: ${JSON.stringify(msg, null, 2)}`);

      // Process only messages of type 'POST'.
      if (msg.type !== 'POST') {
        log.warn(`Unrecognized message type: ${msg.type}`);
        return;
      }

      const { requestId, endpointName, payload } = msg;
      const payloadObj = payload ? JSON.parse(payload) : undefined;
      if (payloadObj !== undefined) {
        log.info(`Received POST message from frontEnd Pretty Payload:\n${JSON.stringify(payloadObj, null, 2)}`);
      }
      if (!requestId || !endpointName) {
        const missingFields = [];
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
        switch (endpointName) {

          case 'topo-editor-reload-viewport': {
            try {
              // Skip reload if mode switching is in progress
              if (this.isSwitchingMode) {
                result = 'Reload skipped - mode switch in progress';
                log.debug(result);
                break;
              }

              // Refresh deployment state
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
              // Refresh the webview content.
              const success = await this.updatePanelHtml(this.currentPanel);
              if (success) {
                result = `Endpoint "${endpointName}" executed successfully.`;
                log.info(result);
              } else {
                result = `Panel update failed - check logs for details`;
                // updatePanelHtml returns false for various reasons
                // The actual error message (if any) has already been shown
                log.debug('Panel update returned false during reload');
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
          }
          break;
        }

        case 'topo-viewport-save': {
          try {
            await saveViewport({
              yamlFilePath: this.lastYamlFilePath,
              payload: payload as string,
              mode: 'view'
            });
            result = `Saved viewport positions successfully.`;
            log.info(result);
          } catch (error) {
            log.error(`Error executing endpoint "topo-viewport-save": ${JSON.stringify(error, null, 2)}`);
          }
          break;
        }

        case 'topo-editor-viewport-save': {
          try {
            await saveViewport({
              adaptor: this.adaptor,
              yamlFilePath: this.lastYamlFilePath,
                payload: payload as string,
                mode: 'edit',
                setInternalUpdate: v => {
                  this.isInternalUpdate = v;
                },
              });
              result = `Saved topology with preserved comments!`;
              log.info(result);
            } catch (error) {
                log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(error, null, 2)}`);
              this.isInternalUpdate = false;
            }
            break;
          }

          case 'topo-editor-viewport-save-suppress-notification': {
            try {
              await saveViewport({
                adaptor: this.adaptor,
                yamlFilePath: this.lastYamlFilePath,
                payload: payload as string,
                mode: 'edit',
                setInternalUpdate: v => {
                  this.isInternalUpdate = v;
                },
              });
            } catch (error) {
                result = `Error executing endpoint "topo-editor-viewport-save-suppress-notification".`;
                log.error(
                  `Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(error, null, 2)}`
                );
              this.isInternalUpdate = false;
            }
            break;
          }

          case 'topo-editor-undo': {
            try {
              // Get the document for the YAML file
              const document = await vscode.workspace.openTextDocument(this.lastYamlFilePath);

              // Store the currently active editor to restore focus later
              const currentActiveEditor = vscode.window.activeTextEditor;

              // Find if there's already an editor with this document open
              const existingEditor = vscode.window.visibleTextEditors.find(
                editor => editor.document.uri.fsPath === document.uri.fsPath
              );

              if (existingEditor) {
                // Make the existing editor active temporarily
                await vscode.window.showTextDocument(document, {
                  viewColumn: existingEditor.viewColumn,
                  preview: false,
                  preserveFocus: false
                });
              } else {
                // Open in a side column (beside the webview) without stealing focus
                const targetColumn = vscode.ViewColumn.Beside;
                await vscode.window.showTextDocument(document, {
                  viewColumn: targetColumn,
                  preview: false,
                  preserveFocus: false
                });
              }

              // Small delay to ensure the editor is fully active
              await this.sleep(50);

              // Execute undo command on the now-active editor
              await vscode.commands.executeCommand('undo');

              // Save the document to trigger file watcher update
              await document.save();

              // Restore focus to the previously active editor (usually the webview)
              if (currentActiveEditor && !existingEditor) {
                await vscode.window.showTextDocument(currentActiveEditor.document, {
                  viewColumn: currentActiveEditor.viewColumn,
                  preview: false,
                  preserveFocus: false
                });
              }

              result = 'Undo operation completed successfully';
              log.info('Undo operation executed on YAML file');
            } catch (error) {
              result = `Error executing undo operation`;
              log.error(`Error executing undo operation: ${JSON.stringify(error, null, 2)}`);
            }
            break;
          }

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

          case 'clab-interface-capture': {
            try {
              const data = payloadObj as { nodeName: string; interfaceName: string };
              const iface = {
                label: data.interfaceName,
                parentName: data.nodeName,
                cID: data.nodeName,
                name: data.interfaceName,
                type: '',
                alias: '',
                mac: '',
                mtu: 0,
                ifIndex: 0,
                state: ''
              } as any;
              // Use the default capture method (same as tree view)
              await vscode.commands.executeCommand('containerlab.interface.capture', iface);
              result = `Capture executed for ${data.nodeName}/${data.interfaceName}`;
            } catch (innerError) {
              error = `Error executing capture: ${innerError}`;
              log.error(`Error executing capture: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'clab-link-capture': {
            try {
              const data = payloadObj as { nodeName: string; interfaceName: string };
              const iface = {
                label: data.interfaceName,
                parentName: data.nodeName,
                cID: data.nodeName,
                name: data.interfaceName,
                type: '',
                alias: '',
                mac: '',
                mtu: 0,
                ifIndex: 0,
                state: ''
              } as any;
              await vscode.commands.executeCommand('containerlab.interface.captureWithEdgeshark', iface);
              result = `Capture executed for ${data.nodeName}/${data.interfaceName}`;
            } catch (innerError) {
              error = `Error executing capture: ${innerError}`;
              log.error(`Error executing capture: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'clab-link-capture-edgeshark-vnc': {
            try {
              const data = payloadObj as { nodeName: string; interfaceName: string };
              const iface = {
                label: data.interfaceName,
                parentName: data.nodeName,
                cID: data.nodeName,
                name: data.interfaceName,
                type: '',
                alias: '',
                mac: '',
                mtu: 0,
                ifIndex: 0,
                state: ''
              } as any;
              await vscode.commands.executeCommand('containerlab.interface.captureWithEdgesharkVNC', iface);
              result = `VNC capture executed for ${data.nodeName}/${data.interfaceName}`;
            } catch (innerError) {
              error = `Error executing VNC capture: ${innerError}`;
              log.error(`Error executing VNC capture: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'topo-editor-show-vscode-message': {
            try {
              // Parse the payload from the webview
              const data = JSON.parse(payload as string) as {
                type: 'info' | 'warning' | 'error';
                message: string;
              };

              // Display the message based on its type
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
                  // throw new Error(`Unsupported message type: ${data.type}`);

                  log.error(
                    `Unsupported message type: ${JSON.stringify(data.type, null, 2)}`
                  );
              }
              result = `Displayed ${data.type} message: ${data.message}`;
              log.info(result);
            } catch (innerError) {
              result = `Error executing endpoint "clab-show-vscode-message".`;
              log.error(
                `Error executing endpoint "clab-show-vscode-message": ${JSON.stringify(innerError, null, 2)}`
              );
            }
            break;
          }

          case 'topo-switch-mode': {
            try {
              // Prevent concurrent mode switches
              if (this.isSwitchingMode) {
                error = 'Mode switch already in progress';
                log.debug('Mode switch already in progress');
                break;
              }

              log.debug(`Starting mode switch from ${this.isViewMode ? 'view' : 'edit'} mode`);
              this.isSwitchingMode = true;

              // Switch between view and edit modes
              const data = payload ? JSON.parse(payload as string) : { mode: 'toggle' };
              if (data.mode === 'toggle') {
                this.isViewMode = !this.isViewMode;
              } else if (data.mode === 'view') {
                this.isViewMode = true;
              } else if (data.mode === 'edit') {
                this.isViewMode = false;
              }

              // Update deployment state
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);

              // Update the panel HTML to reflect the new mode
              const success = await this.updatePanelHtmlInternal(this.currentPanel);
              if (success) {
                result = { mode: this.isViewMode ? 'view' : 'edit', deploymentState: this.deploymentState };
                log.info(`Switched to ${this.isViewMode ? 'view' : 'edit'} mode`);
              } else {
                error = 'Failed to switch mode';
              }

              // Add a small delay to ensure any concurrent operations see the flag
              await this.sleep(100);
            } catch (innerError) {
              error = `Error switching mode: ${innerError}`;
              log.error(`Error switching mode: ${JSON.stringify(innerError, null, 2)}`);
            } finally {
              this.isSwitchingMode = false;
              log.debug(`Mode switch completed, flag cleared`);
            }
            break;
          }

          case 'open-external': {
            try {
              const url: string = JSON.parse(payload as string);
              await vscode.env.openExternal(vscode.Uri.parse(url));
              result = `Opened external URL: ${url}`;
              log.info(result);
            } catch (innerError) {
              result = `Error executing endpoint "open-external".`;
              log.error(`Error executing endpoint "open-external": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }
          case 'topo-editor-load-annotations': {
            try {
              const annotations = await annotationsManager.loadAnnotations(this.lastYamlFilePath);
              result = {
                annotations: annotations.freeTextAnnotations || [],
                groupStyles: annotations.groupStyleAnnotations || []
              };
              log.info(
                `Loaded ${annotations.freeTextAnnotations?.length || 0} annotations and ${annotations.groupStyleAnnotations?.length || 0} group styles`
              );
            } catch (innerError) {
              result = { annotations: [], groupStyles: [] };
              log.error(`Error loading annotations: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'topo-editor-save-annotations': {
            try {
              const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
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
            } catch (innerError) {
              error = `Error saving annotations: ${innerError}`;
              log.error(`Error saving annotations: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'deployLab': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for deployment';
                break;
              }

              // Create a temporary lab node for the deploy command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.deploy', tempNode);
              result = `Lab deployment initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error deploying lab: ${innerError}`;
              log.error(`Error deploying lab: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'destroyLab': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for destruction';
                break;
              }

              // Create a temporary lab node for the destroy command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.destroy', tempNode);
              result = `Lab destruction initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error destroying lab: ${innerError}`;
              log.error(`Error destroying lab: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'deployLabCleanup': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for deployment with cleanup';
                break;
              }

              // Create a temporary lab node for the deploy with cleanup command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.deploy.cleanup', tempNode);
              result = `Lab deployment with cleanup initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error deploying lab with cleanup: ${innerError}`;
              log.error(`Error deploying lab with cleanup: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'destroyLabCleanup': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for destruction with cleanup';
                break;
              }

              // Create a temporary lab node for the destroy with cleanup command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.destroy.cleanup', tempNode);
              result = `Lab destruction with cleanup initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error destroying lab with cleanup: ${innerError}`;
              log.error(`Error destroying lab with cleanup: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'redeployLab': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for redeploy';
                break;
              }

              // Create a temporary lab node for the redeploy command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.redeploy', tempNode);
              result = `Lab redeploy initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error redeploying lab: ${innerError}`;
              log.error(`Error redeploying lab: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'redeployLabCleanup': {
            try {
              const labPath = payloadObj as string;
              if (!labPath) {
                error = 'No lab path provided for redeploy with cleanup';
                break;
              }

              // Create a temporary lab node for the redeploy with cleanup command
              const { ClabLabTreeNode } = await import('../../treeView/common');
              const tempNode = new ClabLabTreeNode(
                '',
                vscode.TreeItemCollapsibleState.None,
                { absolute: labPath, relative: '' }
              );

              await vscode.commands.executeCommand('containerlab.lab.redeploy.cleanup', tempNode);
              result = `Lab redeploy with cleanup initiated for ${labPath}`;

              // Refresh deployment state instead of forcing it
              this.deploymentState = await this.checkDeploymentState(this.currentLabName);
            } catch (innerError) {
              error = `Error redeploying lab with cleanup: ${innerError}`;
              log.error(`Error redeploying lab with cleanup: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'showError': {
            try {
              const message = payloadObj as string;
              await vscode.window.showErrorMessage(message);
              result = 'Error message displayed';
            } catch (innerError) {
              error = `Error showing error message: ${innerError}`;
              log.error(`Error showing error message: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'topo-toggle-split-view': {
            try {
              await this.toggleSplitView();
              result = { splitViewOpen: this.isSplitViewOpen };
              log.info(`Split view toggled: ${this.isSplitViewOpen ? 'opened' : 'closed'}`);
            } catch (innerError) {
              error = `Error toggling split view: ${innerError}`;
              log.error(`Error toggling split view: ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'copyElements': {
            this.context.globalState.update('topoClipboard', payloadObj);
            result = 'Elements copied';
            break;
          }

          case 'getCopiedElements': {
            const clipboard = this.context.globalState.get('topoClipboard') || [];
            panel.webview.postMessage({ type: 'copiedElements', data: clipboard });
            result = 'Clipboard sent';
            break;
          }

          default: {
            error = `Unknown endpoint "${endpointName}".`;
            log.error(error);
          }
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        log.error(`Error processing message for endpoint "${endpointName}": ${JSON.stringify(err, null, 2)}`);
      }

      log.info("########################################################### RESULT in RESPONSE");
      log.info(`${JSON.stringify(result, null, 2)}`);

      // Send the response back to the webview.
      panel.webview.postMessage({
        type: 'POST_RESPONSE',
        requestId,
        result,
        error,
      });
    });

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
      // Update the inspector data
      await inspector.update();

      // Check if the lab exists in the raw inspect data
      if (inspector.rawInspectData) {
        // First try exact name match
        if (labName in inspector.rawInspectData) {
          return 'deployed';
        }

        // If we have a YAML file path, also check by comparing lab paths
        if (this.lastYamlFilePath) {
          const normalizedYamlPath = this.lastYamlFilePath.replace(/\\/g, '/');

          for (const [deployedLabName, labData] of Object.entries(inspector.rawInspectData)) {
            const deployedLab = labData as any;
            // Check if the lab's topo-file matches our YAML path
            if (deployedLab['topo-file']) {
              const normalizedTopoFile = deployedLab['topo-file'].replace(/\\/g, '/');
              if (normalizedTopoFile === normalizedYamlPath) {
                // Update the currentLabName to match the deployed lab name
                if (this.currentLabName !== deployedLabName) {
                  log.info(`Updating lab name from '${this.currentLabName}' to '${deployedLabName}' based on topo-file match`);
                  this.currentLabName = deployedLabName;
                }
                return 'deployed';
              }
            }
          }
        }

        return 'undeployed';
      }
    } catch (err) {
      log.warn(`Failed to check deployment state: ${err}`);
    }
    return 'unknown';
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
