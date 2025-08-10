import * as vscode from 'vscode';
import * as path from 'path';

import * as fs from 'fs';

import { log } from '../../common/logging/extensionLogger';

import { generateWebviewHtml, EditorTemplateParams, TemplateMode } from '../../common/htmlTemplateUtils';
import { TopoViewerAdaptorClab } from '../../common/core/topoViewerAdaptorClab';
import { ClabLabTreeNode } from "../../../treeView/common";

import { validateYamlContent } from '../utilities/yamlValidator';
import { saveViewport } from '../../common/utilities/saveViewport';

/**
 * Class representing the TopoViewer Editor Webview Panel.
 * This class is responsible for creating and managing the webview panel
 * that displays the Cytoscape graph.
 */
export class TopoViewerEditor {
  private currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'topoViewerEditor';
  private adaptor: TopoViewerAdaptorClab;
  private context: vscode.ExtensionContext;
  public lastYamlFilePath: string = '';
  public lastFolderName: string | undefined;
  public targetDirPath: string | undefined;
  public createTopoYamlTemplateSuccess: boolean = false;
  private currentLabName: string = '';
  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private saveListener: vscode.Disposable | undefined;
  private isInternalUpdate: boolean = false; // Flag to prevent feedback loops
  private isUpdating: boolean = false; // Prevent duplicate updates
  private queuedUpdate: boolean = false; // Indicates an update is queued
  private queuedSaveAck: boolean = false; // If any queued update came from a manual save
  private skipInitialValidation: boolean = false; // Skip schema check for template

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.adaptor = new TopoViewerAdaptorClab();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    this.isUpdating = true;
    try {
      const success = await this.updatePanelHtml(this.currentPanel);
      if (success) {
        if ((sendSaveAck || this.queuedSaveAck) && this.currentPanel) {
          this.currentPanel.webview.postMessage({ type: 'yaml-saved' });
        }
      } else {
        vscode.window.showErrorMessage(
          'Invalid Containerlab YAML: changes not applied'
        );
      }
    } catch (err) {
      log.error(`Error updating topology: ${err}`);
    } finally {
      this.isUpdating = false;
      if (this.queuedUpdate) {
        const nextSaveAck = this.queuedSaveAck;
        this.queuedUpdate = false;
        this.queuedSaveAck = false;
        await this.triggerUpdate(nextSaveAck);
      }
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

    // Build the template with the actual lab name
    const templateContent = `
name: ${baseNameWithoutExt} # saved as ${targetFileUri.fsPath}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest
      labels:
        graph-posX: "65"
        graph-posY: "25"
        graph-icon: router
    srl2:
      kind: nokia_srlinux
      type: ixrd1
      image: ghcr.io/nokia/srlinux:latest
      labels:
        graph-posX: "165"
        graph-posY: "25"
        graph-icon: router

  links:
    # inter-switch link
    - endpoints: [ srl1:e1-1, srl2:e1-1 ]
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

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.currentLabName;

    const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    let yamlContent: string;
    try {
      yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');
    } catch (err) {
      log.error(`Failed to read YAML file: ${String(err)}`);
      vscode.window.showErrorMessage(`Failed to read YAML file: ${err}`);
      return false;
    }
    if (!this.skipInitialValidation) {
      const isValid = await this.validateYaml(yamlContent);
      if (!isValid) {
        log.error('YAML validation failed. Aborting updatePanelHtml.');
        return false;
      }
    } else {
      this.skipInitialValidation = false;
    }

    const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer
    );

    try {
      await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);
    } catch (err) {
      log.error(`Failed to write topology files: ${String(err)}`);
      vscode.window.showErrorMessage(`Failed to write topology files: ${err}`);
      return false;
    }

    if (panel) {
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
      };

      const mode: TemplateMode = 'editor';
      panel.webview.html = generateWebviewHtml(
        this.context,
        panel,
        mode,
        folderName,
        this.adaptor,
        editorParams
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
  public async createWebviewPanel(context: vscode.ExtensionContext, fileUri: vscode.Uri, labName: string): Promise<void> {
    this.currentLabName = labName;
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
      'containerlab Editor (Web)',
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
      // Check if the file exists before attempting to read it
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        // File doesn't exist, try with the corrected path if available
        if (this.lastYamlFilePath) {
          fileUri = vscode.Uri.file(this.lastYamlFilePath);
          log.info(`Fallback to lastYamlFilePath: ${fileUri.fsPath}`);
        } else {
          throw new Error(`File not found: ${fileUri.fsPath}`);
        }
      }

      const yaml = await fs.promises.readFile(fileUri.fsPath, 'utf8');
      if (!this.skipInitialValidation) {
        const isValid = await this.validateYaml(yaml);
        if (!isValid) {
          log.error('YAML validation failed. Aborting createWebviewPanel.');
          return;
        }
      }
      const cyElements = this.adaptor.clabYamlToCytoscapeElements(yaml, undefined);
      await this.adaptor.createFolderAndWriteJson(
        this.context,
        labName,                // folder below <extension>/topoViewerData/
        cyElements,
        yaml
      );
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to load topology: ${(e as Error).message}`);
      return;
    }



    await this.updatePanelHtml(this.currentPanel);
    this.setupFileWatcher();
    this.setupSaveListener();

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
      type: string;
      requestId?: string;
      endpointName?: string;
      payload?: string;
    }

    // Listen for incoming messages from the webview.
    panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      log.info(`Received POST message from frontEnd: ${JSON.stringify(msg, null, 2)}`);

      const payloadObj = JSON.parse(msg.payload as string);
      log.info(`Received POST message from frontEnd Pretty Payload:\n${JSON.stringify(payloadObj, null, 2)}`);

      // Validate that the message is an object.
      if (!msg || typeof msg !== 'object') {
        log.error('Invalid message received.');
        return;
      }

      // Process only messages of type 'POST'.
      if (msg.type !== 'POST') {
        log.warn(`Unrecognized message type: ${msg.type}`);
        return;
      }

      const { requestId, endpointName, payload } = msg;
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
              // Refresh the webview content.
              const success = await this.updatePanelHtml(this.currentPanel);
              if (success) {
                result = `Endpoint "${endpointName}" executed successfully.`;
                log.info(result);
              } else {
                result = `YAML validation failed.`;
                vscode.window.showErrorMessage(
                  'Invalid Containerlab YAML: changes not applied'
                );
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
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
              
              // Find if there's already an editor with this document open
              const existingEditor = vscode.window.visibleTextEditors.find(
                editor => editor.document.uri.fsPath === document.uri.fsPath
              );
              
              // Force focus on the YAML editor
              if (existingEditor) {
                // Make the existing editor active and focused
                await vscode.window.showTextDocument(document, {
                  viewColumn: existingEditor.viewColumn,
                  preview: false,
                  preserveFocus: false  // Important: don't preserve focus, we want to switch to this editor
                });
              } else {
                // Open a new editor if the file isn't already open
                await vscode.window.showTextDocument(document, { 
                  preview: false, 
                  preserveFocus: false  // Important: don't preserve focus
                });
              }
              
              // Small delay to ensure the editor is fully active
              await this.sleep(50);
              
              // Execute undo command on the now-active editor
              await vscode.commands.executeCommand('undo');
              
              // Save the document to trigger file watcher update
              await document.save();
              
              result = 'Undo operation completed successfully';
              log.info('Undo operation executed on YAML file');
            } catch (error) {
              result = `Error executing undo operation`;
              log.error(`Error executing undo operation: ${JSON.stringify(error, null, 2)}`);
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
 * Opens the specified file (usually the created YAML template) in a split editor.
 *
 * @param filePath - The absolute path to the file.
 */
  public async openTemplateFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening template file: ${error}`);
    }
  }
}