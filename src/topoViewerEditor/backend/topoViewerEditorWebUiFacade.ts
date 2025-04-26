import * as vscode from 'vscode';
import * as path from 'path';
import * as YAML from 'yaml'; // https://github.com/eemeli/yaml

import * as fs from 'fs';

import { log } from '../../topoViewer/backend/logger';

import { getHTMLTemplate } from '../webview-ui/template/vscodeHtmlTemplate';
import { TopoViewerAdaptorClab } from '../../topoViewer/backend/topoViewerAdaptorClab';
import { ClabLabTreeNode, ClabTreeDataProvider } from "../../clabTreeDataProvider";


/**
 * Class representing the TopoViewer Editor Webview Panel.
 * This class is responsible for creating and managing the webview panel
 * that displays the Cytoscape graph.
 */
export class TopoViewerEditor {
  private currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'topoViewerEditor';
  private adaptor: TopoViewerAdaptorClab;
  public lastYamlFilePath: string = '';
  public lastFolderName: string | undefined;
  public targetDirPath: string | undefined;
  public createTopoYamlTemplateSuccess: boolean = false;
  private currentLabName: string = '';
  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;

  constructor(private context: vscode.ExtensionContext) {
    this.adaptor = new TopoViewerAdaptorClab();
  }

  /**
   * Creates the directory (if needed) and writes out the YAML template
   * to a file path, ensuring it ends with '.clab.yml'.
   *
   * @param context - The VS Code extension context.
   * @param requestedFileUri - The URI suggested by the user (e.g., from a save dialog).
   * @param labName - Used to seed the template content and derive the folder name.
   */
  public async createTemplateFile(context: vscode.ExtensionContext, requestedFileUri: vscode.Uri, labName: string): Promise<void> {
    this.currentLabName = labName; // Use labName directly for folder

    // --- Start: Extension Enforcement Logic ---
    let finalFileUri: vscode.Uri;
    const desiredExtension = '.clab.yml';
    const requestedPath = requestedFileUri.fsPath;
    const parsedPath = path.parse(requestedPath);

    // Construct the base path without any .yml or .yaml extension
    let baseNameWithoutExt = parsedPath.name;
    if (baseNameWithoutExt.toLowerCase().endsWith('.clab')) {
       // Handle cases like 'myfile.clab.yml' -> 'myfile' or 'myfile.clab' -> 'myfile'
       baseNameWithoutExt = baseNameWithoutExt.substring(0, baseNameWithoutExt.length - 5);
    } else if (parsedPath.ext.toLowerCase() === '.yml' || parsedPath.ext.toLowerCase() === '.yaml') {
    }

    const finalFileName = baseNameWithoutExt + desiredExtension;
    const finalPath = path.join(parsedPath.dir, finalFileName);

    // Use the adjusted path to create the final URI
    finalFileUri = vscode.Uri.file(finalPath);
    // --- End: Extension Enforcement Logic ---

    // Use the labName passed in as the folder name for data storage
    this.lastFolderName = labName;

    // Build the template
    const templateContent = `
name: ${labName} # saved as ${finalFileUri.fsPath}

topology:
  nodes:
    srl1:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest
    srl2:
      kind: nokia_srlinux
      image: ghcr.io/nokia/srlinux:latest

  links:
    # inter-switch link
    - endpoints: [ srl1:e1-11, srl2:e1-11 ]
`;

    try {
      // Ensure the directory exists using the final URI's directory
      const dirUri = finalFileUri.with({ path: path.dirname(finalFileUri.path) });
      await vscode.workspace.fs.createDirectory(dirUri);

      // Write the file using the final URI
      const data = Buffer.from(templateContent, 'utf8');
      await vscode.workspace.fs.writeFile(finalFileUri, data);

      // Remember the actual path where it was written
      this.lastYamlFilePath = finalFileUri.fsPath;

      log.info(`Template file created at: ${finalFileUri.fsPath}`);

      // Notify the user with the actual path used
      vscode.window.showInformationMessage(`Template created at ${finalFileUri.fsPath}`);
      this.createTopoYamlTemplateSuccess = true; // Indicate success


      // Convert the YAML file to JSON and write it to the webview.
      // Read the YAML content from the file.
      const yamlContent = fs.readFileSync(this.lastYamlFilePath, 'utf8');
      log.debug(`YAML content: ${yamlContent}`);

      // Transform YAML into Cytoscape elements.
      const cytoTopology = this.adaptor.clabYamlToCytoscapeElementsEditor(yamlContent);
      log.debug(`Cytoscape topology: ${JSON.stringify(cytoTopology, null, 2)}`);

      // Create folder and write JSON files for the webview.
      // Use the enforced folderName (which is the labName)
      await this.adaptor.createFolderAndWriteJson(this.context, this.lastFolderName, cytoTopology, yamlContent);

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
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<void> {
    if (!this.currentLabName) {
      return;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.currentLabName;

    const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

    const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer
    );

    await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

    if (panel) {
      const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);
      const jsOutDir = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out'))
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

      panel.webview.html = this.getWebviewContent(
        css,
        js,
        images,
        jsonFileUrlDataCytoMarshall,
        jsonFileUrlDataEnvironment,
        isVscodeDeployment,
        jsOutDir,
        this.adaptor.allowedhostname as string,
        vscode.workspace.getConfiguration('containerlab.remote').get<boolean>('topoviewerUseSocket', false),
        8080
      );

      vscode.window.showInformationMessage('TopoViewer Webview reloaded!');
    } else {
      log.error('Panel is undefined');
    }
  }

  /**
   * Creates a new webview panel or reveals the current one.
   * @param context The extension context.
   */
  public createWebviewPanel(context: vscode.ExtensionContext, fileUri: vscode.Uri, labName: string): void {

    interface CytoViewportPositionPreset {
      data: {
        id: string,
        parent: string,
        groupLabelPos: string,
        extraData: any
      };
      parent: string;
      position:
      {
        x: number;
        y: number
      };
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
          vscode.Uri.joinPath(this.context.extensionUri, 'out'),
        ],
      }
    );

    this.currentPanel = panel;


    // Generate URIs for CSS, JavaScript, and image assets.
    const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);

    // Compute the URI for the compiled JS directory.
    const jsOutDir = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out'))
      .toString();

    // Define URIs for the JSON data files.
    const mediaPath = vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', labName);
    const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
    const jsonFileUrlDataCytoMarshall = panel.webview.asWebviewUri(jsonFileUriDataCytoMarshall).toString();

    const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
    const jsonFileUrlDataEnvironment = panel.webview
      .asWebviewUri(jsonFileUriDataEnvironment)
      .toString();

    // Inject the asset URIs and JSON data paths into the HTML content.
    panel.webview.html = this.getWebviewContent(
      css,
      js,
      images,
      jsonFileUrlDataCytoMarshall,
      jsonFileUrlDataEnvironment,
      true,
      jsOutDir,
      "orb",
      false,
      8080
    );

    // Clean up when the panel is disposed.
    panel.onDidDispose(() => {
      this.currentPanel = undefined;
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
              await this.updatePanelHtml(this.currentPanel);
              result = `Endpoint "${endpointName}" executed successfully.`;
              log.info(result);
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
              function computeEndpointsStr(data: any): string {
                let endpoints: string[];
                if (data.sourceEndpoint && data.targetEndpoint) {
                  endpoints = [
                    `${data.source}:${data.sourceEndpoint}`,
                    `${data.target}:${data.targetEndpoint}`
                  ];
                } else if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length > 0) {
                  endpoints = data.endpoints.every((ep: string) => ep.includes(':'))
                    ? data.endpoints
                    : [data.source, data.target];
                } else {
                  endpoints = [data.source, data.target];
                }
                return endpoints.join(',');
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
              payloadParsed.filter(el => el.group === 'nodes').forEach(element => {
                // Use the stable id from payload as the lookup key.
                var nodeId: string = element.data.id;

                let nodeYaml = yamlNodes.get(nodeId.split(':')[1], true) as YAML.YAMLMap | undefined;
                if (!nodeYaml) {
                  // Create a new mapping if it does not exist.
                  nodeYaml = new YAML.YAMLMap();
                  yamlNodes.set(nodeId, nodeYaml);
                }

                // For new nodes, extraData may be missing. Provide fallbacks.
                const extraData = element.data.extraData || {};

                // Update the node's properties.
                nodeYaml.set('kind', doc.createNode(extraData.kind || element.data.topoViewerRole || 'default-kind'));
                nodeYaml.set('image', doc.createNode(extraData.image || 'default-image'));
                // nodeYaml.set('startup-config', doc.createNode('configs/srl.cfg'));

                // --- Update Labels ---
                // Ensure labels exist and are a YAML map.
                let labels = nodeYaml.get('labels', true) as YAML.YAMLMap | undefined;
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
                  const newLink = new YAML.YAMLMap();
                  // Rebuild endpoints array for setting.
                  let endpoints: string[];
                  if (data.sourceEndpoint && data.targetEndpoint) {
                    endpoints = [
                      `${data.source}:${data.sourceEndpoint}`,
                      `${data.target}:${data.targetEndpoint}`
                    ];
                  } else if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length > 0) {
                    endpoints = data.endpoints.every((ep: string) => ep.includes(':'))
                      ? data.endpoints
                      : [data.source, data.target];
                  } else {
                    endpoints = [data.source, data.target];
                  }
                  // Create the endpoints node as a YAML sequence and enforce flow style.
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
              await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');

              const result = `Saved topology with preserved comments!`;
              log.info(result);
              vscode.window.showInformationMessage(result);


              log.info(doc);
              log.info(this.lastYamlFilePath);


            } catch (error) {
              const result = `Error executing endpoint "topo-editor-viewport-save".`;
              log.error(`Error executing endpoint "topo-editor-viewport-save": ${JSON.stringify(error, null, 2)}`);
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
              function computeEndpointsStr(data: any): string {
                let endpoints: string[];
                if (data.sourceEndpoint && data.targetEndpoint) {
                  endpoints = [
                    `${data.source}:${data.sourceEndpoint}`,
                    `${data.target}:${data.targetEndpoint}`
                  ];
                } else if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length > 0) {
                  endpoints = data.endpoints.every((ep: string) => ep.includes(':'))
                    ? data.endpoints
                    : [data.source, data.target];
                } else {
                  endpoints = [data.source, data.target];
                }
                return endpoints.join(',');
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
              payloadParsed.filter(el => el.group === 'nodes').forEach(element => {
                // Use the stable id from payload as the lookup key.
                var nodeId: string = element.data.id;

                let nodeYaml = yamlNodes.get(nodeId.split(':')[1], true) as YAML.YAMLMap | undefined;
                if (!nodeYaml) {
                  // Create a new mapping if it does not exist.
                  nodeYaml = new YAML.YAMLMap();
                  yamlNodes.set(nodeId, nodeYaml);
                }

                // For new nodes, extraData may be missing. Provide fallbacks.
                const extraData = element.data.extraData || {};

                // Update the node's properties.
                nodeYaml.set('kind', doc.createNode(extraData.kind || element.data.topoViewerRole || 'default-kind'));
                nodeYaml.set('image', doc.createNode(extraData.image || 'default-image'));
                // nodeYaml.set('startup-config', doc.createNode('configs/srl.cfg'));

                // --- Update Labels ---
                // Ensure labels exist and are a YAML map.
                let labels = nodeYaml.get('labels', true) as YAML.YAMLMap | undefined;
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
                  const newLink = new YAML.YAMLMap();
                  // Rebuild endpoints array for setting.
                  let endpoints: string[];
                  if (data.sourceEndpoint && data.targetEndpoint) {
                    endpoints = [
                      `${data.source}:${data.sourceEndpoint}`,
                      `${data.target}:${data.targetEndpoint}`
                    ];
                  } else if (data.endpoints && Array.isArray(data.endpoints) && data.endpoints.length > 0) {
                    endpoints = data.endpoints.every((ep: string) => ep.includes(':'))
                      ? data.endpoints
                      : [data.source, data.target];
                  } else {
                    endpoints = [data.source, data.target];
                  }
                  // Create the endpoints node as a YAML sequence and enforce flow style.
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
              await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');

              // const result = `Saved topology with preserved comments aaaa!`;
              // log.info(result);
              // vscode.window.showInformationMessage(result);

              log.info(doc);
              log.info(this.lastYamlFilePath);

            } catch (error) {
              const result = `Error executing endpoint "topo-editor-viewport-save-suppress-notification".`;
              log.error(`Error executing endpoint "topo-editor-viewport-save-suppress-notification": ${JSON.stringify(error, null, 2)}`);
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
