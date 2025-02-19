// file: src/topoViewerWebUiFacade.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml'; // https://github.com/eemeli/yaml
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
 * Class representing the Containerlab Topology Viewer extension in VS Code.
 * It is responsible for:
 * - Parsing Containerlab YAML configurations.
 * - Transforming YAML data into Cytoscape elements.
 * - Managing JSON file creation for topology data.
 * - Initializing and managing the visualization webview.
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

  private cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;


  private socketAssignedPort: number | undefined;



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
   * This method performs the following steps:
   * 1. Reads and parses the YAML file.
   * 2. Converts the YAML to Cytoscape elements.
   * 3. Writes JSON files (e.g. dataCytoMarshall.json and environment.json).
   * 4. Displays the webview panel for topology visualization.
   *
   * @param yamlFilePath - The file path to the Containerlab YAML configuration.
   * @param clabTreeDataToTopoviewer - Optional Containerlab lab tree data.
   * @returns A promise that resolves to the created webview panel or undefined if an error occurs.
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

      log.info(`allowedHostname: ${this.adaptor.allowedhostname}`);

      // Start the Socket.IO server and wait for the port to be assigned.
      const socketPort = await this.startSocketIOServer();

      // Create and display the webview panel using the assigned socket port.
      log.info(`Creating webview panel for visualization`);
      const panel = await this.createWebviewPanel(folderName, socketPort);
      this.currentTopoViewerPanel = panel;

      // Initialize updatedClabTreeDataToTopoviewer
      this.cacheClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();

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
   * This method sets up resource roots, injects asset URIs into the HTML, and
   * establishes message handlers for communication between the webview and the extension.
   *
   * @param folderName - The subfolder name where JSON data files are stored.
   * @param socketPort - The assigned socket port from the Socket.IO server.
   * @returns A promise that resolves to the created WebviewPanel.
   */
  private async createWebviewPanel(folderName: string, socketPort: number): Promise<vscode.WebviewPanel> {
    interface CytoViewportPositionPreset {
      data: { id: string, parent: string };
      position: { x: number; y: number };
    }

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
      jsOutDir,
      this.adaptor.allowedhostname as string,
      socketPort
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
              const payloadParsed = JSON.parse(payload as string) as CytoViewportPositionPreset[];

              // Retrieve the parsed YAML document (with comments) from the adaptor.
              const doc: YAML.Document.Parsed | undefined = this.adaptor.currentClabDoc;
              if (!doc) {
                throw new Error('No parsed Document found (this.adaptor.currentClabDoc is undefined).');
              }

              // Update each node’s position in the AST.

              // data: { id: string; parent: string; name: string; };
              // position: { x: number; y: number };

              for (const { data: { id, parent }, position: { x, y } } of payloadParsed) {
                if (!id) continue;  // Skip if invalid
                const nodeMap = doc.getIn(['topology', 'nodes', id], true);
                if (YAML.isMap(nodeMap)) {
                  nodeMap.setIn(['labels', 'graph-posX'], x.toString());
                  nodeMap.setIn(['labels', 'graph-posY'], y.toString());

                  if (parent) {
                    nodeMap.setIn(['labels', 'graph-group'], parent.split(":")[0]);
                    nodeMap.setIn(['labels', 'graph-level'], parent.split(":")[1]);
                  } else {
                    // If no parent exists, remove these keys.
                    nodeMap.deleteIn(['labels', 'graph-group']);
                    nodeMap.deleteIn(['labels', 'graph-level']);
                  }
                }
              }

              // Optionally convert links.endpoints arrays to "flow" style.
              const linksNode = doc.getIn(['topology', 'links']);
              if (YAML.isSeq(linksNode)) {
                for (const linkItem of linksNode.items) {
                  if (YAML.isMap(linkItem)) {
                    const endpointsNode = linkItem.get('endpoints', true);
                    if (YAML.isSeq(endpointsNode)) {
                      endpointsNode.flow = true;
                    }
                  }
                }
              }

              // Serialize back to YAML preserving original comments.
              const updatedYamlString = doc.toString();

              // Write the updated YAML to disk.
              await fs.promises.writeFile(this.lastYamlFilePath, updatedYamlString, 'utf8');

              result = `Saved topology with preserved comments!`;
              log.info(result);
              vscode.window.showInformationMessage(result as string);

            } catch (error) {
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(error, null, 2)}`);
            }
            break;
          }
          case 'clab-node-connect-ssh': {
            try {
              log.info(`clab-node-connect-ssh called with payload: ${payload}`);
              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-connect-ssh backend endpoint is called`);
                log.info(`lab name: ${this.adaptor.currentClabTopo?.name}`);
                log.info(`node name: ${nodeName}`);

                const containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name
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
              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-attach-shell backend endpoint is called`);
                log.info(`lab name: ${this.adaptor.currentClabTopo?.name}`);
                log.info(`node name: ${nodeName}`);

                const containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name
                );
                log.info(`containerData : ${JSON.stringify(containerData, null, 2)}`);
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
              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);
                log.info(`clab-node-view-logs backend endpoint is called`);
                log.info(`lab name: ${this.adaptor.currentClabTopo?.name}`);
                log.info(`node name: ${nodeName}`);

                const containerData = this.adaptor.getClabContainerTreeNode(
                  nodeName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name
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
              interface LinkEndpointInfo {
                nodeName: string;
                interfaceName: string;
              }
              const linkInfo: LinkEndpointInfo = JSON.parse(payload as string);
              log.info(`clab-link-capture called with payload: ${JSON.stringify(linkInfo, null, 2)}`);

              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
                  linkInfo.nodeName,
                  linkInfo.interfaceName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name as string
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

              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const containerData = this.adaptor.getClabContainerTreeNode(
                  linkInfo.nodeName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name as string
                );
                const parentInterfaceName = linkInfo.interfaceName;

                const subInterfaces = containerData?.interfaces.filter((intf) =>
                  intf.name.startsWith(`${parentInterfaceName}-`)
                );

                log.info(`subInterfaces: ${JSON.stringify(subInterfaces, null, 2)}`);

                if (subInterfaces) {
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
                        intf.state,
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

              const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
              if (updatedClabTreeDataToTopoviewer) {
                const containerInterfaceData = this.adaptor.getClabContainerInterfaceTreeNode(
                  linkInfo.nodeName,
                  linkInfo.interfaceName,
                  updatedClabTreeDataToTopoviewer,
                  this.adaptor.currentClabTopo?.name as string
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
          case 'clab-show-vscode-message': {
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
     * Another example backend function for demonstration purposes.
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
   * @param imagesUri - URI for the image assets.
   * @param jsonFileUrlDataCytoMarshall - URI for the dataCytoMarshall.json file.
   * @param jsonFileUrlDataEnvironment - URI for the environment.json file.
   * @param isVscodeDeployment - Indicates whether the extension is running inside VS Code.
   * @param jsOutDir - URI for the compiled JavaScript directory.
   * @param socketAssignedPort - The assigned Socket.IO port.
   * @returns The complete HTML content as a string.
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
      socketAssignedPort
    );
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
    if (!this.lastFolderName) {
      return;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.lastFolderName;

    const updatedClabTreeDataToTopoviewer = this.cacheClabTreeDataToTopoviewer;
    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

    const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer
    );

    this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

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
        this.socketAssignedPort || 0
      );

      vscode.window.showInformationMessage('TopoViewer Webview reloaded!');
    } else {
      log.error('Panel is undefined');
    }
  }

  /**
   * Initializes the Socket.IO server to periodically emit lab data to connected clients.
   *
   * The server is configured to:
   * - Listen on a dynamically assigned port.
   * - Allow cross-origin requests from any origin.
   * - Poll for updated lab data periodically and emit the raw data via the "clab-tree-provider-data" event.
   *
   * @returns A Promise that resolves with the assigned port number.
   */
  public startSocketIOServer(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      const io = new SocketIOServer(server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
          allowedHeaders: ["Content-Type"],
          credentials: false,
        },
      });

      // Let the OS assign an available port by listening on port 0.
      server.listen(0, () => {
        const address = server.address();
        const socketAssignedPortNumber = typeof address === 'string' ? 0 : (address?.port || 0);
        this.socketAssignedPort = socketAssignedPortNumber;
        log.info(`Socket.IO server listening on port ${this.socketAssignedPort}`);
        resolve(this.socketAssignedPort);
      });

      // Periodically poll for updated lab data and emit it.
      setInterval(async () => {
        try {
          const labData = await this.clabTreeProviderImported.discoverInspectLabs();
          if (labData) {
            io.emit("clab-tree-provider-data", labData);
          }
        } catch (error) {
          log.error(`Error retrieving lab data: ${JSON.stringify(error, null, 2)}`);
        }
      }, 5000);

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
    });
  }
}
