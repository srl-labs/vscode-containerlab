import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { ClabLabTreeNode, ClabTreeDataProvider, ClabInterfaceTreeNode } from '../../clabTreeDataProvider';
import { getHTMLTemplate } from '../webview-ui/html-static/template/vscodeHtmlTemplate';
import * as http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import {
  captureInterface,
  getHostname,
  deploy,
  deployCleanup,
  deploySpecificFile,
  destroy,
  destroyCleanup,
  redeploy,
  redeployCleanup,
  inspectAllLabs,
  inspectOneLab,
  openLabFile,
  openFolderInNewWindow,
  startNode,
  stopNode,
  attachShell,
  sshToNode,
  showLogs,
  graphNextUI,
  graphDrawIO,
  graphDrawIOInteractive,
  addLabFolderToWorkspace,
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerImage,
  copyContainerKind,
  graphTopoviewer,
  graphTopoviewerReload,
  captureInterfaceWithPacketflix,
} from '../../commands/index';

/**
 * Class representing the TopoViewer, the primary entry point for the
 * Containerlab Topology Viewer extension in VS Code.
 *
 * Responsibilities:
 * - Parse Containerlab YAML configurations.
 * - Transform YAML data into Cytoscape elements.
 * - Manage JSON file creation for topology data.
 * - Initialize and manage the visualization webview.
 */
export class TopoViewer {
  /**
   * Adaptor instance responsible for converting Containerlab YAML to Cytoscape elements
   * and creating the required JSON files.
   */
  private adaptor: TopoViewerAdaptorClab;

  /**
   * Tree data provider to manage Containerlab lab nodes.
   */
  private clabTreeProviderImported: ClabTreeDataProvider;

  /**
   * Stores the YAML file path from the last openViewer call.
   */
  private lastYamlFilePath: string = '';

  /**
   * Stores the folder name (derived from the YAML file name) where JSON data files are stored.
   */
  private lastFolderName: string | undefined;

  /**
   * The currently active TopoViewer webview panel.
   */
  public currentTopoViewerPanel: vscode.WebviewPanel | undefined;

  /**
   * Creates a new instance of TopoViewer.
   *
   * @param context - The VS Code extension context.
   */
  constructor(private context: vscode.ExtensionContext) {
    this.adaptor = new TopoViewerAdaptorClab();
    this.clabTreeProviderImported = new ClabTreeDataProvider(context);
  }

  /**
   * Opens the TopoViewer for a given Containerlab YAML file.
   *
   * Steps performed:
   * 1. Reads and parses the YAML file.
   * 2. Converts the YAML to Cytoscape elements.
   * 3. Writes JSON files (e.g. dataCytoMarshall.json and environment.json).
   * 4. Displays the webview panel for topology visualization.
   *
   * @param yamlFilePath - The file path to the Containerlab YAML configuration.
   * @param clabTreeDataToTopoviewer - Optional Containerlab lab tree data.
   * @returns The created webview panel or undefined if an error occurs.
   *
   * @example
   * ```typescript
   * const topoViewer = new TopoViewer(context);
   * const panel = await topoViewer.openViewer('/path/to/containerlab.yaml', labTreeData);
   * ```
   */
  public async openViewer(
    yamlFilePath: string,
    clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined
  ): Promise<vscode.WebviewPanel | undefined> {
    this.lastYamlFilePath = yamlFilePath;

    try {
      vscode.window.showInformationMessage(`Opening Viewer for ${yamlFilePath}`);
      log.info(`Generating Cytoscape elements from YAML: ${yamlFilePath}`);


      log.info(`clabTreeDataToTopoviewer JSON: ${JSON.stringify(clabTreeDataToTopoviewer, null, 2)}`);


      // Read the YAML content from the file.
      const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

      // Transform YAML into Cytoscape elements.
      const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(yamlContent, clabTreeDataToTopoviewer);

      // Determine folder name based on the YAML file name.
      const folderName = path.basename(yamlFilePath, path.extname(yamlFilePath));
      this.lastFolderName = folderName;

      // Create folder and write JSON files for the webview.
      await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

      // Create and display the webview panel.
      log.info(`Creating webview panel for visualization`);
      const panel = await this.createWebviewPanel(folderName);
      this.currentTopoViewerPanel = panel;

      // aarafat-tag: test socket.io server
      this.startSocketIOServer();

      return panel;

    } catch (err) {
      vscode.window.showErrorMessage(`Error in openViewer: ${err}`);
      log.error(`openViewer: ${err}`);
      return undefined;
    }
  }

  /**
   * Creates and configures a new WebviewPanel for displaying the network topology.
   *
   * Sets up the resource roots, injects asset URIs into the HTML, and
   * establishes message handlers for communication between the webview and extension.
   *
   * @param folderName - The subfolder name where JSON data files are stored.
   * @returns The created WebviewPanel.
   */
  private async createWebviewPanel(folderName: string): Promise<vscode.WebviewPanel> {
    const panel = vscode.window.createWebviewPanel(
      'topoViewer',
      `Containerlab Topology: ${folderName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          // Dynamic data folder.
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName),
          // Static asset folder.
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'topoViewer', 'webview-ui', 'html-static'),
          // Compiled JS directory.
          vscode.Uri.joinPath(this.context.extensionUri, 'out'),
        ],
      }
    );

    // Set a context key so that other parts of the extension know TopoViewer is active.
    await vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);
    log.info(`Context key 'isTopoviewerActive' set to true`);

    // When the panel is closed, reset the context key.
    panel.onDidDispose(
      () => {
        vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
        log.info(`Context key 'isTopoviewerActive' set to false`);
      },
      null,
      this.context.subscriptions
    );

    // Generate URIs for CSS, JavaScript, and image assets.
    const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);

    // Compute the URI for the compiled JS directory.
    const jsOutDir = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out'))
      .toString();

    // Define URIs for the JSON data files.
    const mediaPath = vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName);
    const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
    const jsonFileUrlDataCytoMarshall = panel.webview.asWebviewUri(jsonFileUriDataCytoMarshall).toString();

    const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
    const jsonFileUrlDataEnvironment = panel.webview.asWebviewUri(jsonFileUriDataEnvironment).toString();

    const isVscodeDeployment = true;

    log.info(`Webview JSON => dataCytoMarshall: ${jsonFileUrlDataCytoMarshall}`);
    log.info(`Webview JSON => environment: ${jsonFileUrlDataEnvironment}`);

    // Inject the asset URIs and JSON data paths into the HTML content.
    panel.webview.html = this.getWebviewContent(
      css,
      js,
      images,
      jsonFileUrlDataCytoMarshall,
      jsonFileUrlDataEnvironment,
      isVscodeDeployment,
      jsOutDir
    );

    log.info(`Webview panel created successfully`);

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
          case 'backendFuncBB': {
            // Execute the demonstration backend function BB.
            result = await backendFuncBB(payload);
            break;
          }
          case 'backendFuncAA': {
            // Execute the demonstration backend function AA.
            result = await backendFuncAA(payload);
            break;
          }
          case 'reload-viewport': {
            try {
              // Refresh the webview content.
              await this.updatePanelHtml(this.currentTopoViewerPanel);
              result = `Endpoint "${endpointName}" executed successfully.`;
              log.info(result);
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }
          case 'topo-viewport-save': {
            try {
              // Parse the payload to update node positions.
              const payloadParsed = JSON.parse(payload as string) as {
                data: { id: string };
                position: { x: number; y: number };
              }[];
              log.info(`topo-viewport-save called with payload: ${JSON.stringify(payloadParsed, null, 2)}`);

              // Retrieve the current parsed YAML topology.
              const parsedClabYaml = this.adaptor.currentClabTopo;
              if (!parsedClabYaml?.topology?.nodes) {
                throw new Error('Invalid parsedClabYaml structure');
              }

              // Update node labels with new preset positions.
              for (const { data: { id }, position: { x, y } } of payloadParsed) {
                if (!id) continue;
                const nodeYaml = parsedClabYaml.topology.nodes[id];
                if (!nodeYaml) continue;
                nodeYaml.labels = nodeYaml.labels || {};
                nodeYaml.labels['topoViewer-presetPosX'] = x.toString();
                nodeYaml.labels['topoViewer-presetPosY'] = y.toString();
              }
              const prettyYamlString = yaml.dump(parsedClabYaml, { indent: 2 });
              log.info(`topo-viewport-save result: ${prettyYamlString}`);

              // Write the updated YAML back to the file.
              await fs.promises.writeFile(this.lastYamlFilePath, prettyYamlString, 'utf8');
            } catch (error) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(error, null, 2)}`);
            }
            break;
          }
          case 'clab-node-connect-ssh': {
            try {
              log.info(`clab-node-connect-ssh called with payload: ${payload}`);
              // Refresh the Containerlab tree data.
              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                // Remove wrapping quotes if present.
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-connect-ssh backend endpoint is called`);
                log.info(`lab name: ${this.lastFolderName}`);
                log.info(`node name: ${nodeName}`);

                // Retrieve container data for the specified node.
                let containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName as string,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                if (containerData) {
                  sshToNode(containerData);
                }
              } else {
                log.error(`Updated Clab tree data is undefined`);

              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'clab-node-attach-shell': {
            try {
              log.info(`clab-node-attach-shell called with payload: ${payload}`);
              // Refresh the Containerlab tree data.
              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                // Remove wrapping quotes if present.
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-attach-shell backend endpoint is called`);
                log.info(`lab name: ${this.lastFolderName}`);
                log.info(`node name: ${nodeName}`);

                // Retrieve container data for the specified node.
                let containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName as string,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                if (containerData) {
                  attachShell(containerData);
                }
              } else {
                console.error('Updated Clab tree data is undefined.');
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'clab-node-view-logs': {
            try {
              log.info(`clab-node-view-logs called with payload: ${payload}`);
              // Refresh the Containerlab tree data.
              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                // Remove wrapping quotes if present.
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-view-logs backend endpoint is called`);
                log.info(`lab name: ${this.lastFolderName}`);
                log.info(`node name: ${nodeName}`);

                // Retrieve container data for the specified node.
                let containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName as string,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                if (containerData) {
                  showLogs(containerData);
                }
              } else {
                console.error('Updated Clab tree data is undefined.');
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }

          case 'clab-host-get-hostname': {
            try {
              const hostname = await getHostname();
              result = `Endpoint "${endpointName}" executed successfully. Return payload is ${hostname}`;
              log.info(result);
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError)}`);
            }
            break;
          }
          case 'clab-link-capture': {
            try {
              // Define the expected structure of the payload.
              interface LinkEndpointInfo {
                nodeName: string;
                interfaceName: string;
              }
              const linkInfo: LinkEndpointInfo = JSON.parse(payload as string);
              log.info(`clab-link-capture called with payload: ${JSON.stringify(linkInfo, null, 2)}`);

              // Update lab data and retrieve the relevant interface node.
              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                let containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
                  linkInfo.nodeName,
                  linkInfo.interfaceName,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                if (containerInterfaceData) {
                  captureInterfaceWithPacketflix(containerInterfaceData);
                }
                result = `Endpoint "${endpointName}" executed successfully. Return payload is ${containerInterfaceData}`;
                log.info(result);
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError)}`);
            }
            break;
          }
          case 'clab-link-subinterfaces': {
            try {
              interface LinkEndpointInfo {
                nodeName: string;
                interfaceName: string;
              }
              const linkInfo: LinkEndpointInfo = JSON.parse(payload as string);
              log.info(`clab-link-subinterfaces called with payload: ${JSON.stringify(linkInfo, null, 2)}`);

              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                let containerData = this.adaptor.getClabContainerTreeNode(
                  linkInfo.nodeName,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                const parentInterfaceName = linkInfo.interfaceName;

                // Filter subinterfaces based on naming convention.
                const subInterfaces = containerData?.interfaces.filter((intf) =>
                  intf.name.startsWith(`${parentInterfaceName}-`)
                );

                log.info(`subInterfaces: ${JSON.stringify(subInterfaces, null, 2)}`);

                if (subInterfaces) {
                  // Map the filtered interfaces to ClabInterfaceTreeNode instances.
                  subInterfaces.map(
                    (intf) =>
                      new ClabInterfaceTreeNode(
                        intf.label as string,
                        intf.collapsibleState as vscode.TreeItemCollapsibleState,
                        intf.parentName,
                        intf.cID,
                        intf.name,
                        intf.type,
                        intf.alias,
                        intf.mac,
                        intf.mtu,
                        intf.ifIndex,
                        intf.contextValue
                      )
                  );
                }
                result = subInterfaces;
                log.info(`Endpoint "${endpointName}" executed successfully. Return payload is ${JSON.stringify(subInterfaces, null, 2)}`);
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }
          case 'clab-link-mac-address': {
            try {
              interface LinkEndpointInfo {
                nodeName: string;
                interfaceName: string;
              }
              const linkInfo: LinkEndpointInfo = JSON.parse(payload as string);
              log.info(`clab-link-mac-address called with payload: ${JSON.stringify(linkInfo, null, 2)}`);

              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
              if (updatedClabTreeDataToTopoviewer) {
                let containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
                  linkInfo.nodeName,
                  linkInfo.interfaceName,
                  updatedClabTreeDataToTopoviewer,
                  this.lastFolderName as string
                );
                log.info(`macAddress: ${JSON.stringify(containerInterfaceData?.mac, null, 2)}`);
                result = containerInterfaceData?.mac;
                log.info(`Endpoint "${endpointName}" executed successfully. Return payload is ${result}`);
              }
            } catch (innerError) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError, null, 2)}`);
            }
            break;
          }
          case 'open-external': {
            try {
              // Assume the payload is a JSON string containing the URL.
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

    /**
     * Example backend function for demonstration purposes.
     *
     * @param payload - Arbitrary payload from the webview.
     * @returns A demonstration result object.
     */
    async function backendFuncBB(payload: any): Promise<any> {
      log.info(`backendFuncBB called with payload: ${payload}`);
      return {
        success: true,
        message: `Received: ${JSON.stringify(payload, null, 2)} and returning a demonstration result.`,
      };
    }

    /**
     * Another example backend function for demonstration.
     *
     * @param payload - Arbitrary payload from the webview.
     * @returns A demonstration result object.
     */
    async function backendFuncAA(payload: any): Promise<any> {
      return {
        success: true,
        message: `Received: ${JSON.stringify(payload, null, 2)}`,
      };
    }

    return panel;
  }

  /**
   * Generates the HTML content for the webview by injecting asset URIs.
   *
   * @param cssUri - URI for the CSS assets.
   * @param jsUri - URI for the JavaScript assets.
   * @param imagesUri - URI for image assets.
   * @param jsonFileUrlDataCytoMarshall - URI for the dataCytoMarshall.json file.
   * @param jsonFileUrlDataEnvironment - URI for the environment.json file.
   * @param isVscodeDeployment - Whether the extension is running inside VS Code.
   * @param jsOutDir - URI for the compiled JavaScript directory.
   * @returns The complete HTML content as a string.
   */
  private getWebviewContent(
    cssUri: string,
    jsUri: string,
    imagesUri: string,
    jsonFileUrlDataCytoMarshall: string,
    jsonFileUrlDataEnvironment: string,
    isVscodeDeployment: boolean,
    jsOutDir: string
  ): string {
    return getHTMLTemplate(
      cssUri,
      jsUri,
      imagesUri,
      jsonFileUrlDataCytoMarshall,
      jsonFileUrlDataEnvironment,
      isVscodeDeployment,
      jsOutDir
    );
  }

  /**
   * Updates the webview panel's HTML with the latest topology data.
   *
   * Reads the YAML file, regenerates Cytoscape elements, updates JSON files,
   * and refreshes the webview content.
   *
   * @param panel - The active WebviewPanel to update.
   */
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<void> {
    // If no viewer has been opened, exit early.
    if (!this.lastFolderName) {
      return;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.lastFolderName;

    // Discover updated Containerlab lab data.
    const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    // Read the latest YAML content.
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

    // Convert the YAML to Cytoscape elements.
    const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer
    );

    // Write updated JSON files.
    this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

    if (panel) {
      // Regenerate asset URIs.
      const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);
      const jsOutDir = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out'))
        .toString();

      // Compute new URIs for JSON data files.
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

      // Update the panel's HTML content.
      panel.webview.html = this.getWebviewContent(
        css,
        js,
        images,
        jsonFileUrlDataCytoMarshall,
        jsonFileUrlDataEnvironment,
        isVscodeDeployment,
        jsOutDir
      );

      vscode.window.showInformationMessage('TopoViewer Webview reloaded!');
    } else {
      log.error('Panel is undefined');
    }
  }

  // /**
  //  * Initializes the Socket.IO server to emit ON-CHANGE events for endpoint state changes.
  //  *
  //  * The backend checks the state of endpoints periodically (e.g. every 5 seconds) and, if a state change
  //  * (Up/Down) is detected, emits an "on-change-edge-state" event to connected clients. Clients can use the provided
  //  * node name and endpoint to update their UI accordingly.
  //  */
  // public startSocketIOServer(): void {
  //   // Create an HTTP server to attach Socket.IO.
  //   const server = http.createServer();
  //   const port = 3000;
  //   const io = new SocketIOServer(server, {
  //     cors: { origin: "*" } // Allow all origins for simplicity.
  //   });

  //   server.listen(port, () => {
  //     console.log(`Socket.IO server listening on port ${port}`);
  //     // Optionally, show a notification in VS Code:
  //     // vscode.window.showInformationMessage(`Socket.IO server running on port ${port}`);
  //   });

  //   // Storage for the current state of each endpoint, keyed by "nodeName-endpoint".
  //   const endpointStates: { [key: string]: "Up" | "Down" } = {};

  //   /**
  //    * Checks the state of an endpoint and emits an on-change-edge-state event if the state has changed.
  //    * In a real implementation, you would query your actual endpoint state instead of simulating it.
  //    */
  //   function checkEndpointStateAndEmit(): void {
  //     // Simulated data for demonstration purposes.
  //     // In practice, replace this with actual logic to get the endpoint state.
  //     const simulatedUpdate = {
  //       nodeName: "router1",               // The node identifier
  //       endpoint: "e1-1",            // The endpoint identifier
  //       state: Math.random() > 0.5 ? "Up" : "Down" // Simulated state change.
  //     };

  //     const key = `${simulatedUpdate.nodeName}-${simulatedUpdate.endpoint}`;

  //     // Emit only if the state has changed.
  //     if (endpointStates[key] !== simulatedUpdate.state) {
  //       endpointStates[key] = simulatedUpdate.state as "Up" | "Down";
  //       io.emit("on-change-edge-state", simulatedUpdate);
  //       log.info(`Emitted on-change-edge-state event: ${JSON.stringify(simulatedUpdate)}`);
  //     }
  //   }

  //   // Periodically check for endpoint state changes every 1 seconds.
  //   setInterval(checkEndpointStateAndEmit, 1000);

  //   // Handle Socket.IO connections.
  //   io.on("connection", (socket) => {
  //     console.log("A client connected to the Socket.IO server.");

  //     // Optionally, when a client connects, send the current state for all endpoints.
  //     Object.keys(endpointStates).forEach((key) => {
  //       const [nodeName, endpoint] = key.split("-");
  //       socket.emit("on-change-edge-state", {
  //         nodeName,
  //         endpoint,
  //         state: endpointStates[key]
  //       });
  //     });

  //     // Optional: Listen for manual messages from the client.
  //     socket.on("clientMessage", (data) => {
  //       console.log("Received message from client:", data);
  //       socket.emit("serverMessage", { text: "Hello from the VS Code extension backend!" });
  //     });

  //     // Log disconnections.
  //     socket.on("disconnect", () => {
  //       console.log("A client disconnected from the Socket.IO server.");
  //     });
  //   });
  // }

  // /**
  //  * Initializes the Socket.IO server to emit ON-CHANGE events for endpoint state changes.
  //  *
  //  * The backend polls for updated lab data periodically (every 1 second) and, if it detects a state change
  //  * (Up/Down) on any container interface, emits an "on-change-edge-state" event to connected clients.
  //  * Clients can use the provided node name and endpoint to update their UI accordingly.
  //  */
  // public startSocketIOServer(): void {
  //   // Create an HTTP server to attach Socket.IO.
  //   const server = http.createServer();
  //   const port = 3000;
  //   const io = new SocketIOServer(server, {
  //     cors: { origin: "*" } // Allow all origins for simplicity.
  //   });

  //   server.listen(port, () => {
  //     console.log(`Socket.IO server listening on port ${port}`);
  //     // Optionally, show a VS Code notification:
  //     // vscode.window.showInformationMessage(`Socket.IO server running on port ${port}`);
  //   });

  //   // Cache for the current state of each interface, keyed by "nodeName-endpoint"
  //   const endpointStates: { [key: string]: "Up" | "Down" } = {};

  //   // Define extractNodeName as an arrow function so it uses the surrounding 'this'
  //   const extractNodeName = (label: string): string => {
  //     const labName = this.adaptor.currentClabTopo?.name ?? '';
  //     log.debug (`labName: ${labName}`);
  //     return label.replace(new RegExp(`^clab-${labName}-`), '');
  //   };

  //   // Define processLabData as an arrow function so it can call extractNodeName properly.
  //   const processLabData = (labData: any): void => {
  //     // Iterate through each lab (keyed by its YAML file path).
  //     for (const labPath in labData) {
  //       const lab = labData[labPath];
  //       if (!lab || !lab.containers || !Array.isArray(lab.containers)) {
  //         continue;
  //       }
  //       // Process each container in the lab.
  //       lab.containers.forEach((container: any) => {
  //         // Extract a simplified node name from the container label.
  //         // (For example, "clab-ngp-lab-router1" becomes "router1".)
  //         const nodeName = extractNodeName(container.label);
  //         if (!container.interfaces || !Array.isArray(container.interfaces)) {
  //           return;
  //         }
  //         // Process each interface.
  //         container.interfaces.forEach((iface: any) => {
  //           // Determine the new state from the "description" property.
  //           // If the description contains "UP" (case-insensitive), consider the state as "Up"; otherwise "Down".
  //           const description: string = iface.description || "";
  //           const newState: "Up" | "Down" = description.toUpperCase().includes("UP") ? "Up" : "Down";
  //           // Use the interface's label as the endpoint identifier.
  //           const endpoint: string = iface.label;
  //           // Build a unique cache key.
  //           const key = `${nodeName}-${endpoint}`;
  //           // Only emit an event if the state has changed.
  //           if (endpointStates[key] !== newState) {
  //             endpointStates[key] = newState;
  //             const update = {
  //               nodeName,
  //               endpoint,
  //               state: newState
  //             };
  //             io.emit("on-change-edge-state", update);
  //             log.info(`Emitted on-change-edge-state event: ${JSON.stringify(update)}`);
  //           }
  //         });
  //       });
  //     }
  //   };

  //   // Periodically poll for updated lab data and process it.
  //   setInterval(async () => {
  //     try {
  //       const labData = await this.clabTreeProviderImported.discoverInspectLabs();
  //       if (labData) {
  //         processLabData(labData);
  //       }
  //     } catch (error) {
  //       console.error("Error processing lab data", error);
  //     }
  //   }, 500); // 0.5 seconds

  //   // Handle Socket.IO connections.
  //   io.on("connection", (socket) => {
  //     console.log("A client connected to the Socket.IO server.");

  //     // When a client connects, send the current state for all endpoints.
  //     Object.keys(endpointStates).forEach((key) => {
  //       // Note: Splitting the key assumes the key was built as "nodeName-endpoint"
  //       const [nodeName, endpoint] = key.split("-");
  //       socket.emit("on-change-edge-state", {
  //         nodeName,
  //         endpoint,
  //         state: endpointStates[key]
  //       });
  //     });

  //     // Optional: Listen for manual messages from the client.
  //     socket.on("clientMessage", (data) => {
  //       console.log("Received message from client:", data);
  //       socket.emit("serverMessage", { text: "Hello from the VS Code extension backend!" });
  //     });

  //     // Log disconnections.
  //     socket.on("disconnect", () => {
  //       console.log("A client disconnected from the Socket.IO server.");
  //     });
  //   });
  // }

  public startSocketIOServer(): void {
    // Create an HTTP server to attach Socket.IO.
    const server = http.createServer();
    const port = 3000;
    const io = new SocketIOServer(server, {
      cors: { origin: "*" } // Allow all origins for simplicity.
    });

    server.listen(port, () => {

      log.info(`Socket.IO server listening on port ${port}`);

      // Optionally, show a notification in VS Code:
      // vscode.window.showInformationMessage(`Socket.IO server running on port ${port}`);
    });

    // Periodically poll for updated lab data and emit it without processing.
    setInterval(async () => {
      try {
        const labData = await this.clabTreeProviderImported.discoverInspectLabs();
        if (labData) {
          // Emit the raw lab data to the front end.5
          io.emit("clab-tree-provider-data", labData);
          // log.info(`Received client message: ${JSON.stringify(labData, null, 2)}`);
        }
      } catch (error) {
        log.error(`Error retrieving lab data: ${JSON.stringify(error, null, 2)}`);
      }
    }, 5000); // Every 0.5 seconds (adjust as needed)

    // Handle Socket.IO connections.
    io.on("connection", (socket) => {
      log.info("A client connected to the Socket.IO server.");
      socket.on("clientMessage", (data) => {
        log.info(`Received client message: ${JSON.stringify(data, null, 2)}`);
        socket.emit("serverMessage", { text: "Hello from the VS Code extension backend!" });
      });
      socket.on("disconnect", () => {
        log.info("A client disconnected from the Socket.IO server.");
      });
    });
  }



}
