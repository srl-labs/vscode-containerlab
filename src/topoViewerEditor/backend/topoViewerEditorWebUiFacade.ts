import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml'; // https://github.com/eemeli/yaml

import * as fs from 'fs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { log } from '../../topoViewer/backend/logger';

import { getHTMLTemplate } from '../webview-ui/template/vscodeHtmlTemplate';
import { TopoViewerAdaptorClab } from '../../topoViewer/backend/topoViewerAdaptorClab';
import { ClabLabTreeNode } from "../../treeView/common";

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
    try {
      const schemaUri = vscode.Uri.joinPath(
        this.context.extensionUri,
        'schema',
        'clab.schema.json'
      );
      const schemaBytes = await vscode.workspace.fs.readFile(schemaUri);
      const schema = JSON.parse(Buffer.from(schemaBytes).toString('utf8'));

      const ajv = new Ajv({
        strict: false,
        allErrors: true,
        verbose: true,
      });
      addFormats(ajv);
      ajv.addKeyword({
        keyword: 'markdownDescription',
        schemaType: 'string',
        compile: () => () => true,
      });
      const validate = ajv.compile(schema);
      const yamlObj = YAML.parse(yamlContent);
      const valid = validate(yamlObj);
      if (!valid) {
        const errors = ajv.errorsText(validate.errors);
        vscode.window.showErrorMessage(`Invalid Containerlab YAML: ${errors}`);
        log.error(`Invalid Containerlab YAML: ${errors}`);
        return false;
      }

      const linkError = this.checkLinkReferences(yamlObj);
      if (linkError) {
        vscode.window.showErrorMessage(`Invalid Containerlab YAML: ${linkError}`);
        log.error(`Invalid Containerlab YAML: ${linkError}`);
        return false;
      }

      return true;
    } catch (err) {
      vscode.window.showErrorMessage(`Error validating YAML: ${err}`);
      log.error(`Error validating YAML: ${String(err)}`);
      return false;
    }
  }

  private checkLinkReferences(yamlObj: any): string | null {
    const nodes = new Set(Object.keys(yamlObj?.topology?.nodes ?? {}));
    const invalidNodes = new Set<string>();

    if (Array.isArray(yamlObj?.topology?.links)) {
      for (const link of yamlObj.topology.links) {
        if (!Array.isArray(link?.endpoints)) {
          continue;
        }
        for (const ep of link.endpoints) {
          if (typeof ep !== 'string') {
            continue;
          }
          const nodeName = ep.split(':')[0];
          if (nodeName && !nodes.has(nodeName)) {
            invalidNodes.add(nodeName);
          }
        }
      }
    }

    if (invalidNodes.size > 0) {
      return `Undefined node reference(s): ${Array.from(invalidNodes).join(', ')}`;
    }
    return null;
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
   * @param context - The VS Code extension context.
   * @param requestedFileUri - The URI suggested by the user (e.g., from a save dialog).
   * @param labName - Used to seed the template content and derive the folder name.
   */
  public async createTemplateFile(context: vscode.ExtensionContext, requestedFileUri: vscode.Uri): Promise<void> {
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
      const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);
      const jsOutDir = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist'))
        .toString();

      const mediaPath = vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName);
      const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
      const jsonFileUrlDataCytoMarshall = panel.webview
        .asWebviewUri(jsonFileUriDataCytoMarshall)
        .toString();

      const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
      const jsonFileUrlDataEnvironment = panel.webview
        .asWebviewUri(jsonFileUriDataEnvironment)
        .toString();

      const isVscodeDeployment = true;

      const schemaUri = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'schema', 'clab.schema.json'))
        .toString();

      panel.webview.html = this.getWebviewContent(
        css,
        js,
        schemaUri,
        images,
        jsonFileUrlDataCytoMarshall,
        jsonFileUrlDataEnvironment,
        isVscodeDeployment,
        jsOutDir,
        this.adaptor.allowedhostname as string,
        vscode.workspace.getConfiguration('containerlab.remote').get<boolean>('topoviewerUseSocket', false),
        8080
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
          // Static asset folder.
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'topoViewer', 'webview-ui', 'html-static'),
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

          /**
          * Handles the "topo-editor-viewport-save" endpoint.
          * This function updates the YAML document with the current topology state (nodes and edges)
          * received from the frontend. It synchronizes additions, updates, and deletions.
          *
          * @param payload - The JSON payload string sent from the frontend.
          */
          case 'topo-editor-viewport-save': {
            try {
              // Helper function to compute a consistent endpoints string from edge data.
              function computeEndpointsStr(data: any): string | null {
                if (data.sourceEndpoint && data.targetEndpoint) {
                  return `${data.source}:${data.sourceEndpoint},${data.target}:${data.targetEndpoint}`;
                }
                if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length === 2) {
                  const valid = data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'));
                  return valid ? (data.endpoints as string[]).join(',') : null;
                }
                return null;
              }

              // Parse the JSON payload from the frontend.
              const payloadParsed: any[] = JSON.parse(payload as string);

              // Retrieve the current YAML document (with comments preserved) from the adaptor.
              const doc: YAML.Document.Parsed | undefined = this.adaptor.currentClabDoc;
              if (!doc) {
                throw new Error('No parsed Document found (this.adaptor.currentClabDoc is undefined).');
              }

              // Create a map to track node key updates (oldKey -> newKey).
              const updatedKeys = new Map<string, string>();

              // --- Process Nodes ---

              // Retrieve the nodes map from the YAML document.
              const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
              if (!YAML.isMap(nodesMaybe)) {
                throw new Error('YAML topology nodes is not a map');
              }
              const yamlNodes: YAML.YAMLMap = nodesMaybe;

              // Iterate through payload nodes to add/update nodes in YAML.
              payloadParsed
                .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'group')
                .forEach(element => {
                  // Use the stable id from payload as the lookup key.
                  var nodeId: string = element.data.id;

                  let nodeYaml = yamlNodes.get(nodeId.split(':')[1], true) as unknown as YAML.YAMLMap | undefined;
                  if (!nodeYaml) {
                    // Create a new mapping if it does not exist.
                    nodeYaml = new YAML.YAMLMap();
                    yamlNodes.set(nodeId, nodeYaml);
                  }

                  // For new nodes, extraData may be missing. Provide fallbacks.
                  const extraData = element.data.extraData || {};

                  // Update the node's properties.
                  // if extraData.type exist then add it to yaml.
                  nodeYaml.set('kind', doc.createNode(extraData.kind || element.data.topoViewerRole || 'default-kind'));
                  nodeYaml.set('image', doc.createNode(extraData.image || 'default-image'));
                  if (extraData.type) {
                    nodeYaml.set('type', doc.createNode(extraData.type));
                  }

                  // nodeYaml.set('startup-config', doc.createNode('configs/srl.cfg'));

                  // --- Update Labels ---
                  // Ensure labels exist and are a YAML map.
                  let labels = nodeYaml.get('labels', true) as unknown as YAML.YAMLMap | undefined;
                  if (!labels || !YAML.isMap(labels)) {
                    labels = new YAML.YAMLMap();
                    nodeYaml.set('labels', labels);
                  }
                  // Merge any extra labels from the payload.
                  if (extraData.labels) {
                    for (const [key, value] of Object.entries(extraData.labels)) {
                      labels.set(key, doc.createNode(value));
                    }
                  }
                  // Update the position-related labels (using element.position, with fallback values).
                  const x = element.position?.x || 0;
                  const y = element.position?.y || 0;
                  labels.set('graph-posX', doc.createNode(Math.round(x).toString()));
                  labels.set('graph-posY', doc.createNode(Math.round(y).toString()));

                  // Update the node's icon
                  labels.set('graph-icon', doc.createNode(element.data.topoViewerRole || 'pe'));

                  // Update group-related labels if a parent string is provided.
                  const parent = element.parent;
                  if (parent) {
                    const parts = parent.split(":");
                    labels.set('graph-group', doc.createNode(parts[0]));
                    labels.set('graph-level', doc.createNode(parts[1]));
                  } else {
                    labels.delete('graph-group');
                    labels.delete('graph-level');
                  }
                  // Set the group label position (defaulting to 'bottom-center' if not provided).
                  const groupLabelPos = element.groupLabelPos;
                  labels.set('graph-groupLabelPos', doc.createNode(groupLabelPos || 'bottom-center'));

                  // --- Update YAML mapping key if the node's display name has changed ---
                  // Here, we want the mapping key to reflect the new node name.
                  const newKey = element.data.name;
                  if (nodeId !== newKey) {
                    yamlNodes.set(newKey, nodeYaml); // Add node with new key.
                    yamlNodes.delete(nodeId);        // Remove the old key.
                    updatedKeys.set(nodeId, newKey);   // Record the update so that links can be fixed.
                  }
                });

              // Remove YAML nodes that are not present in the payload.
              const payloadNodeIds = new Set(
                payloadParsed
                  .filter(el => el.group === 'nodes')
                  .map(el => el.data.id)
              );
              for (const item of [...yamlNodes.items]) {
                const keyStr = String(item.key);
                // Check against both original IDs and updated keys.
                if (!payloadNodeIds.has(keyStr) && ![...updatedKeys.values()].includes(keyStr)) {
                  yamlNodes.delete(item.key);
                }
              }

              // --- Process Edges (Links) ---

              // Retrieve or create the links sequence.
              const maybeLinksNode = doc.getIn(['topology', 'links'], true);
              let linksNode: YAML.YAMLSeq;
              if (YAML.isSeq(maybeLinksNode)) {
                linksNode = maybeLinksNode;
              } else {
                linksNode = new YAML.YAMLSeq();
                const topologyNode = doc.getIn(['topology'], true);
                if (YAML.isMap(topologyNode)) {
                  topologyNode.set('links', linksNode);
                }
              }

              // Process each edge element to add or update links in YAML.
              payloadParsed.filter(el => el.group === 'edges').forEach(element => {
                const data = element.data;
                const endpointsStr = computeEndpointsStr(data);
                if (!endpointsStr) {
                  return;
                }

                // Look for an existing link with these endpoints.
                let linkFound = false;
                for (const linkItem of linksNode.items) {
                  if (YAML.isMap(linkItem)) {
                    const eps = linkItem.get('endpoints', true);
                    if (YAML.isSeq(eps)) {
                      // Convert each YAML node in the sequence to a string.
                      const yamlEndpointsStr = eps.items
                        .map(item => String((item as any).value ?? item))
                        .join(',');
                      if (yamlEndpointsStr === endpointsStr) {
                        linkFound = true;
                        break;
                      }
                    }
                  }
                }
                if (!linkFound) {
                  // Add a new link if not found.
                  const endpointsArrStr = endpointsStr;
                  const newLink = new YAML.YAMLMap();
                  const endpoints = endpointsArrStr.split(',');
                  const endpointsNode = doc.createNode(endpoints) as YAML.YAMLSeq;
                  endpointsNode.flow = true;
                  newLink.set('endpoints', endpointsNode);
                  linksNode.add(newLink);
                }
              });

              // Remove any YAML links that are not present in the updated payload.
              const payloadEdgeEndpoints = new Set(
                payloadParsed
                  .filter(el => el.group === 'edges')
                  .map(el => computeEndpointsStr(el.data))
                  .filter((s): s is string => Boolean(s))
              );
              linksNode.items = linksNode.items.filter(linkItem => {
                if (YAML.isMap(linkItem)) {
                  const endpointsNode = linkItem.get('endpoints', true);
                  if (YAML.isSeq(endpointsNode)) {
                    const endpointsStr = endpointsNode.items
                      .map(item => String((item as any).value ?? item))
                      .join(',');
                    return payloadEdgeEndpoints.has(endpointsStr);
                  }
                }
                return true;
              });

              // After processing edges, update each link's endpoints to reflect any updated node keys.
              for (const linkItem of linksNode.items) {
                if (YAML.isMap(linkItem)) {
                  const endpointsNode = linkItem.get('endpoints', true);
                  if (YAML.isSeq(endpointsNode)) {
                    endpointsNode.items = endpointsNode.items.map(item => {
                      let endpointStr = String((item as any).value ?? item);
                      // If the endpoint contains a colon, split into nodeKey and the rest.
                      if (endpointStr.includes(':')) {
                        const [nodeKey, rest] = endpointStr.split(':');
                        if (updatedKeys.has(nodeKey)) {
                          endpointStr = `${updatedKeys.get(nodeKey)}:${rest}`;
                        }
                      } else {
                        if (updatedKeys.has(endpointStr)) {
                          endpointStr = updatedKeys.get(endpointStr)!;
                        }
                      }
                      return doc.createNode(endpointStr);
                    });
                    endpointsNode.flow = true; // Ensure flow style.
                  }
                }
              }

              // --- Serialize and Save the Updated YAML Document ---
              const updatedYamlString = doc.toString();
              this.isInternalUpdate = true;
              await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');
              await this.sleep(50);
              this.isInternalUpdate = false;

              const result = `Saved topology with preserved comments!`;
              log.info(result);


              log.info(doc);
              log.info(this.lastYamlFilePath);


            } catch (error) {
              log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(error, null, 2)}`);
              this.isInternalUpdate = false;
            }
            break;
          }


          /**
          * Handles the "topo-editor-viewport-save-suppress-notification" endpoint.
          * This function updates the YAML document with the current topology state (nodes and edges)
          * received from the frontend. It synchronizes additions, updates, and deletions.
          *
          * @param payload - The JSON payload string sent from the frontend.
          */
          case 'topo-editor-viewport-save-suppress-notification': {
            try {
              // Helper function to compute a consistent endpoints string from edge data.
              function computeEndpointsStr(data: any): string | null {
                if (data.sourceEndpoint && data.targetEndpoint) {
                  return `${data.source}:${data.sourceEndpoint},${data.target}:${data.targetEndpoint}`;
                }
                if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length === 2) {
                  const valid = data.endpoints.every((ep: any) => typeof ep === 'string' && ep.includes(':'));
                  return valid ? (data.endpoints as string[]).join(',') : null;
                }
                return null;
              }

              // Parse the JSON payload from the frontend.
              const payloadParsed: any[] = JSON.parse(payload as string);

              // Retrieve the current YAML document (with comments preserved) from the adaptor.
              const doc: YAML.Document.Parsed | undefined = this.adaptor.currentClabDoc;
              if (!doc) {
                throw new Error('No parsed Document found (this.adaptor.currentClabDoc is undefined).');
              }

              // Create a map to track node key updates (oldKey -> newKey).
              const updatedKeys = new Map<string, string>();

              // --- Process Nodes ---

              // Retrieve the nodes map from the YAML document.
              const nodesMaybe = doc.getIn(['topology', 'nodes'], true);
              if (!YAML.isMap(nodesMaybe)) {
                throw new Error('YAML topology nodes is not a map');
              }
              const yamlNodes: YAML.YAMLMap = nodesMaybe;

              // Iterate through payload nodes to add/update nodes in YAML.
              payloadParsed
                .filter(el => el.group === 'nodes' && el.data.topoViewerRole !== 'group')
                .forEach(element => {
                  // Use the stable id from payload as the lookup key.
                  var nodeId: string = element.data.id;

                  let nodeYaml = yamlNodes.get(nodeId.split(':')[1], true) as unknown as YAML.YAMLMap | undefined;
                  if (!nodeYaml) {
                    // Create a new mapping if it does not exist.
                    nodeYaml = new YAML.YAMLMap();
                    yamlNodes.set(nodeId, nodeYaml);
                  }

                  // For new nodes, extraData may be missing. Provide fallbacks.
                  const extraData = element.data.extraData || {};

                  // Update the node's properties.
                  // if extraData.type exist then add it to yaml.
                  nodeYaml.set('kind', doc.createNode(extraData.kind || element.data.topoViewerRole || 'default-kind'));
                  nodeYaml.set('image', doc.createNode(extraData.image || 'default-image'));
                  if (extraData.type) {
                    nodeYaml.set('type', doc.createNode(extraData.type));
                  }

                  // nodeYaml.set('startup-config', doc.createNode('configs/srl.cfg'));

                  // --- Update Labels ---
                  // Ensure labels exist and are a YAML map.
                  let labels = nodeYaml.get('labels', true) as unknown as YAML.YAMLMap | undefined;
                  if (!labels || !YAML.isMap(labels)) {
                    labels = new YAML.YAMLMap();
                    nodeYaml.set('labels', labels);
                  }
                  // Merge any extra labels from the payload.
                  if (extraData.labels) {
                    for (const [key, value] of Object.entries(extraData.labels)) {
                      labels.set(key, doc.createNode(value));
                    }
                  }
                  // Update the position-related labels (using element.position, with fallback values).
                  const x = element.position?.x || 0;
                  const y = element.position?.y || 0;
                  labels.set('graph-posX', doc.createNode(Math.round(x).toString()));
                  labels.set('graph-posY', doc.createNode(Math.round(y).toString()));

                  // Update the node's icon
                  labels.set('graph-icon', doc.createNode(element.data.topoViewerRole || 'pe'));

                  // Update group-related labels if a parent string is provided.
                  const parent = element.parent;
                  if (parent) {
                    const parts = parent.split(":");
                    labels.set('graph-group', doc.createNode(parts[0]));
                    labels.set('graph-level', doc.createNode(parts[1]));
                  } else {
                    labels.delete('graph-group');
                    labels.delete('graph-level');
                  }
                  // Set the group label position (defaulting to 'bottom-center' if not provided).
                  const groupLabelPos = element.data.groupLabelPos;
                  labels.set('graph-groupLabelPos', doc.createNode(groupLabelPos || 'bottom-center'));

                  // --- Update YAML mapping key if the node's display name has changed ---
                  // Here, we want the mapping key to reflect the new node name.
                  const newKey = element.data.name;
                  if (nodeId !== newKey) {
                    yamlNodes.set(newKey, nodeYaml); // Add node with new key.
                    yamlNodes.delete(nodeId);        // Remove the old key.
                    updatedKeys.set(nodeId, newKey);   // Record the update so that links can be fixed.
                  }
                });

              // Remove YAML nodes that are not present in the payload.
              const payloadNodeIds = new Set(
                payloadParsed.filter(el => el.group === 'nodes').map(el => el.data.id)
              );
              for (const item of [...yamlNodes.items]) {
                const keyStr = String(item.key);
                // Check against both original IDs and updated keys.
                if (!payloadNodeIds.has(keyStr) && ![...updatedKeys.values()].includes(keyStr)) {
                  yamlNodes.delete(item.key);
                }
              }

              // --- Process Edges (Links) ---

              // Retrieve or create the links sequence.
              const maybeLinksNode = doc.getIn(['topology', 'links'], true);
              let linksNode: YAML.YAMLSeq;
              if (YAML.isSeq(maybeLinksNode)) {
                linksNode = maybeLinksNode;
              } else {
                linksNode = new YAML.YAMLSeq();
                const topologyNode = doc.getIn(['topology'], true);
                if (YAML.isMap(topologyNode)) {
                  topologyNode.set('links', linksNode);
                }
              }

              // Process each edge element to add or update links in YAML.
              payloadParsed.filter(el => el.group === 'edges').forEach(element => {
                const data = element.data;
                const endpointsStr = computeEndpointsStr(data);
                if (!endpointsStr) {
                  return;
                }

                // Look for an existing link with these endpoints.
                let linkFound = false;
                for (const linkItem of linksNode.items) {
                  if (YAML.isMap(linkItem)) {
                    const eps = linkItem.get('endpoints', true);
                    if (YAML.isSeq(eps)) {
                      // Convert each YAML node in the sequence to a string.
                      const yamlEndpointsStr = eps.items
                        .map(item => String((item as any).value ?? item))
                        .join(',');
                      if (yamlEndpointsStr === endpointsStr) {
                        linkFound = true;
                        break;
                      }
                    }
                  }
                }
                if (!linkFound) {
                  // Add a new link if not found.
                  const endpointsArrStr = endpointsStr;
                  const newLink = new YAML.YAMLMap();
                  const endpoints = endpointsArrStr.split(',');
                  const endpointsNode = doc.createNode(endpoints) as YAML.YAMLSeq;
                  endpointsNode.flow = true;
                  newLink.set('endpoints', endpointsNode);
                  linksNode.add(newLink);
                }
              });

              // Remove any YAML links that are not present in the updated payload.
              const payloadEdgeEndpoints = new Set(
                payloadParsed
                  .filter(el => el.group === 'edges')
                  .map(el => computeEndpointsStr(el.data))
                  .filter((s): s is string => Boolean(s))
              );
              linksNode.items = linksNode.items.filter(linkItem => {
                if (YAML.isMap(linkItem)) {
                  const endpointsNode = linkItem.get('endpoints', true);
                  if (YAML.isSeq(endpointsNode)) {
                    const endpointsStr = endpointsNode.items
                      .map(item => String((item as any).value ?? item))
                      .join(',');
                    return payloadEdgeEndpoints.has(endpointsStr);
                  }
                }
                return true;
              });

              // After processing edges, update each link's endpoints to reflect any updated node keys.
              for (const linkItem of linksNode.items) {
                if (YAML.isMap(linkItem)) {
                  const endpointsNode = linkItem.get('endpoints', true);
                  if (YAML.isSeq(endpointsNode)) {
                    endpointsNode.items = endpointsNode.items.map(item => {
                      let endpointStr = String((item as any).value ?? item);
                      // If the endpoint contains a colon, split into nodeKey and the rest.
                      if (endpointStr.includes(':')) {
                        const [nodeKey, rest] = endpointStr.split(':');
                        if (updatedKeys.has(nodeKey)) {
                          endpointStr = `${updatedKeys.get(nodeKey)}:${rest}`;
                        }
                      } else {
                        if (updatedKeys.has(endpointStr)) {
                          endpointStr = updatedKeys.get(endpointStr)!;
                        }
                      }
                      return doc.createNode(endpointStr);
                    });
                    endpointsNode.flow = true; // Ensure flow style.
                  }
                }
              }

              // --- Serialize and Save the Updated YAML Document ---
              const updatedYamlString = doc.toString();
              this.isInternalUpdate = true;
              await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');
              await this.sleep(50);
              this.isInternalUpdate = false;

              // const result = `Saved topology with preserved comments aaaa!`;
              // log.info(result);
              // vscode.window.showInformationMessage(result);

              log.info(doc);
              log.info(this.lastYamlFilePath);

            } catch (error) {
              result = `Error executing endpoint "topo-editor-viewport-save-suppress-notification".`;
              log.error(
                `Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(error, null, 2)}`
              );
              this.isInternalUpdate = false;
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
   * Generates the HTML content for the webview by injecting asset URIs.
   *
   * @param jsUri - URI for the JavaScript assets.
   */
  private getWebviewContent(
    cssUri: string,
    jsUri: string,
    schemaUri: string,
    imagesUri: string,
    jsonFileUrlDataCytoMarshall: string,
    jsonFileUrlDataEnvironment: string,
    isVscodeDeployment: boolean,
    jsOutDir: string,
    allowedhostname: string,
    useSocket: boolean,
    socketAssignedPort: number
  ): string {
    return getHTMLTemplate(
      cssUri,
      jsUri,
      schemaUri,
      imagesUri,
      jsonFileUrlDataCytoMarshall,
      jsonFileUrlDataEnvironment,
      isVscodeDeployment,
      jsOutDir,
      allowedhostname,
      useSocket,
      socketAssignedPort
    );
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