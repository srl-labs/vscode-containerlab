import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { ClabLabTreeNode, ClabTreeDataProvider } from '../../clabTreeDataProvider';

import {
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
  graphTopoviewerReload
} from '../../commands/index';


/**
 * TopoViewer serves as the primary entry point for the TopoViewer extension.
 * It handles the activation of the extension, processes Containerlab YAML files,
 * transforms them into Cytoscape-compatible models, and initializes the visualization webview.
 * 
 * Responsibilities:
 * - Parsing Containerlab YAML configurations.
 * - Transforming YAML data into Cytoscape elements.
 * - Managing the creation and serialization of necessary JSON files.
 * - Initializing and managing the webview panel for topology visualization.
 * 
 * Note: This class leverages the TopoViewerAdaptorClab class to handle model transformations
 * and JSON file operations, promoting separation of concerns and modularity.
 */
export class TopoViewer {
  /**
   * Adaptor instance responsible for converting Containerlab YAML to Cytoscape elements
   * and for creating necessary JSON files.
   */
  private adaptor: TopoViewerAdaptorClab;
  private clabTreeProviderImported: ClabTreeDataProvider;

  /**
   * Tracks the YAML file path used in the last openViewer call.
   * Defaults to an empty string to satisfy TypeScript strict initialization rules.
   */
  private lastYamlFilePath: string = '';

  /**
   * Tracks the folder name (derived from the YAML file name) used to store JSON data files.
   */
  private lastFolderName: string | undefined;


  public currentTopoViewerPanel: vscode.WebviewPanel | undefined;

  /**
   * Initializes a new instance of the TopoViewer class.
   *
   * @param context - The VS Code extension context.
   */
  constructor(private context: vscode.ExtensionContext) {
    this.adaptor = new TopoViewerAdaptorClab();
    this.clabTreeProviderImported = new ClabTreeDataProvider(context);
  }

  /**
   * Opens the TopoViewer for a given Containerlab YAML file.
   * This method performs the following steps:
   * 1. Reads and parses the YAML file.
   * 2. Transforms the YAML data into Cytoscape elements.
   * 3. Writes the transformed data into JSON files within a designated folder.
   * 4. Initializes and displays the webview panel for visualization.
   * 
   * @param yamlFilePath - The file path to the Containerlab YAML configuration.
   * 
   * @example
   * ```typescript
   * const topoViewer = new TopoViewer(context);
   * await topoViewer.openViewer('/path/to/containerlab.yaml');
   * ```
   */
  public async openViewer(yamlFilePath: string, clabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined): Promise<vscode.WebviewPanel | undefined> {

    // log.info(`output of clabJsonData ${clabTreeDataToTopoviewer}`)

    this.lastYamlFilePath = yamlFilePath;

    try {
      vscode.window.showInformationMessage(`Opening Viewer for ${yamlFilePath}`);
      log.info(`Generating Cytoscape elements from YAML: ${yamlFilePath}`);

      // Read YAML content
      const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

      // Convert YAML to Cytoscape elements using the adaptor
      const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(yamlContent, clabTreeDataToTopoviewer);

      // Determine folder name based on YAML file name
      const folderName = path.basename(yamlFilePath, path.extname(yamlFilePath));

      this.lastFolderName = folderName;

      // Write JSON files (dataCytoMarshall.json and environment.json)
      await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

      // Initialize and display the webview panel for visualization
      log.info(`Creating webview panel for visualization`);
      const panel = await this.createWebviewPanel(folderName);
      this.currentTopoViewerPanel = panel

      return panel

    } catch (err) {
      vscode.window.showErrorMessage(`Error in openViewer: ${err}`);
      log.error(`openViewer: ${err}`);

      return undefined;

    }
  }

  /**
   * Creates and configures a new WebviewPanel for displaying the network topology.
   * This method sets up the webview's HTML content, including the integration of
   * Cytoscape and other necessary assets for visualization.
   * 
   * @param folderName - The name of the subfolder in 'topoViewerData' containing JSON files.
   * 
   * @example
   * ```typescript
   * await this.createWebviewPanel('exampleFolder');
   * ```
   */
  private async createWebviewPanel(folderName: string): Promise<vscode.WebviewPanel> {
    const panel = vscode.window.createWebviewPanel(
      'topoViewer',
      `Containerlab Topology: ${folderName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          // Register dynamic TopoViewer data folder in webview resource root
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName),

          // Register static TopoViewer asset folder in webview resource root
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'topoViewer', 'webview-ui', 'html-static'),

          // Include 'out' directory if loading compiled JS from there
          vscode.Uri.joinPath(this.context.extensionUri, 'out')
        ],
      }
    );

    // 1. Set the Context Key to True
    await vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);
    log.info(`Context key 'isTopoviewerActive' set to true`);

    // 2. Handle Webview Disposal to Unset the Context Key
    panel.onDidDispose(
      () => {
        vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
        log.info(`Context key 'isTopoviewerActive' set to false`);
      },
      null,
      this.context.subscriptions
    );

    // Generate static asset URIs (CSS, JS, Images)
    const { css, js, images } = this.adaptor.generateStaticAssetUris(this.context, panel.webview);

    // Define the path to the compiled JS files (if applicable)
    const jsOutDir = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out')
    ).toString();

    // Define URIs for JSON data files
    const mediaPath = vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName);
    const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
    const jsonFileUrlDataCytoMarshall = panel.webview.asWebviewUri(jsonFileUriDataCytoMarshall).toString();

    const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
    const jsonFileUrlDataEnvironment = panel.webview.asWebviewUri(jsonFileUriDataEnvironment).toString();

    const isVscodeDeployment = true;

    log.info(`Webview JSON => dataCytoMarshall: ${jsonFileUrlDataCytoMarshall}`);
    log.info(`Webview JSON => environment: ${jsonFileUrlDataEnvironment}`);

    // Inject URIs into the HTML content
    panel.webview.html = this.getWebviewContent(
      css,
      js,
      images,
      jsonFileUrlDataCytoMarshall,
      jsonFileUrlDataEnvironment,
      isVscodeDeployment,
      jsOutDir  // Path to compiled JS files
    );

    log.info(`Webview panel created successfully`);

    // // aarafat-tag:
    // // This handler listens for messages coming from the webview (from dev.js).
    // // We use a REST-like 'POST' message type to simulate API requests.
    // // The handler dispatches the call to the appropriate backend function based on the functionName in the message.
    // panel.webview.onDidReceiveMessage(async (msg) => {

    //   log.info (`received POST Message from frontEnd message is ${JSON.stringify(msg)}`)

    //   switch (msg.type) {
    //     case 'POST': {

    //       // Incoming request from the webview script.
    //       const { requestId, endpointName, payload } = msg;

    //       let result: any = null;
    //       let error: string | null = null;

    //       log.info (`endpointName: ${endpointName}`)

    //       try {
    //         // Dispatch the function call based on the provided functionName.
    //         if (endpointName === 'backendFuncBB') {
    //           // Example: call an internal function or service.
    //           result = await backendFuncBB(payload);

    //         } else if (endpointName === 'backendFuncAA') {
    //           // Example: call a different internal function or service.
    //           result = await backendFuncAA(payload);

    //         } else if (endpointName === 'reload-viewport') {

    //           try {
    //             await this.updatePanelHtml(this.currentTopoViewerPanel);
    //             result = `Endpoint "${endpointName}" executed successfully.`;
    //             log.info(`Endpoint "${endpointName}" executed successfully.`);
    //           } catch (error) {
    //             result = `Error executing endpoint "${endpointName}".`;
    //             log.error(`Error executing endpoint "${endpointName}": ${error}`);
    //           }
    //         }


    //         // You can add more function dispatches here as needed.
    //       } catch (err) {
    //         error = String(err);
    //       }

    //       // Send a response back to the webview with the result or error.
    //       panel.webview.postMessage({
    //         type: 'POST_RESPONSE',
    //         requestId,
    //         result,
    //         error
    //       });
    //       break;
    //     }
    //     default:
    //       console.log("Unrecognized message type:", msg.type);
    //       break;
    //   }
    // });

    // Define an interface for the incoming message
    interface WebviewMessage {
      type: string;
      requestId?: string;
      endpointName?: string;
      payload?: unknown;
    }

    // Improved handler for messages coming from the webview (from dev.js)
    panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      log.info(`Received POST message from frontEnd: ${JSON.stringify(msg)}`);

      // Basic validation for the message object
      if (!msg || typeof msg !== 'object') {
        log.error('Invalid message received.');
        return;
      }

      // Process only messages of type 'POST'
      if (msg.type !== 'POST') {
        log.warn(`Unrecognized message type: ${msg.type}`);
        return;
      }

      // Destructure and validate required properties
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
            // Validate payload if needed for backendFuncBB.
            result = await backendFuncBB(payload);
            break;
          }
          case 'backendFuncAA': {
            // Validate payload if needed for backendFuncAA.
            result = await backendFuncAA(payload);
            break;
          }
          case 'reload-viewport': {
            try {
              await this.updatePanelHtml(this.currentTopoViewerPanel);
              result = `Endpoint "${endpointName}" executed successfully.`;

              log.info(result);

            } catch (innerError) {
              // Capture and log detailed error information
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError)}`);
            }
            break;
          }
          case 'ssh-to-node': {
            try {

              log.info(`ssh-to-node called with payload: ${payload}`);

              const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();

              if (updatedClabTreeDataToTopoviewer) {

                const nodeName = (payload as string).startsWith('"') && (payload as string).endsWith('"')
                  ? (payload as string).slice(1, -1)
                  : (payload as string);

                let containerData = this.adaptor.getClabContainerTreeNode(nodeName as string, updatedClabTreeDataToTopoviewer, 'vscode');

                if (containerData) {
                  sshToNode(containerData)
                }



              } else {
                console.error('Updated Clab tree data is undefined.');
                // Handle the undefined case, e.g., by returning early or throwing an error.
              }

            } catch (innerError) {
              // Capture and log detailed error information
              result = `Error executing endpoint "${endpointName}".`;
              log.error(`Error executing endpoint "${endpointName}": ${JSON.stringify(innerError)}`);
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
        log.error(`Error processing message for endpoint "${endpointName}": ${JSON.stringify(err)}`);
      }

      // Send a response back to the webview with the result or error.
      panel.webview.postMessage({
        type: 'POST_RESPONSE',
        requestId,
        result,
        error,
      });
    });




    /**
     * Example backend function for demonstration.
     * @param payload - Arbitrary payload from the webview.
     */
    async function backendFuncBB(payload: any): Promise<any> {
      // Perform some backend logic or disk operations here

      log.info(`backend func called, with this payload: ${payload}`)

      return {
        success: true,
        message: `Received: ${JSON.stringify(payload)} and returning a demonstration result.`,
      };
    }

    /**
     * Example backend function for demonstration.
     * @param payload - Arbitrary payload from the webview.
     */
    async function backendFuncAA(payload: any): Promise<any> {
      // Perform some backend logic or disk operations here
      return {
        success: true,
        message: `Received: ${JSON.stringify(payload)}`,
      };
    }

    return panel

  }

  /**
   * Generates the HTML content for the Webview, injecting the appropriate asset URIs.
   * This method constructs the complete HTML structure, integrating CSS, JS, and JSON data
   * necessary for rendering the network topology visualization.
   *
   * @param cssUri - URI to the CSS assets directory.
   * @param jsUri - URI to the JS assets directory.
   * @param imagesUri - URI to the Images assets directory.
   * @param jsonFileUrlDataCytoMarshall - URI to 'dataCytoMarshall.json'.
   * @param jsonFileUrlDataEnvironment - URI to 'environment.json'.
   * @param isVscodeDeployment - Whether this is deployed inside VSCode (boolean).
   * @param jsOutDir - URI to the compiled JS files directory (e.g., '/out').
   * @returns A string containing the complete HTML content for the Webview.
   *
   * @example
   * ```typescript
   * const htmlContent = this.getWebviewContent(css, js, images, jsonCyto, jsonEnv, true, outDir);
   * panel.webview.html = htmlContent;
   * ```
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

    return `
      <!DOCTYPE html>
      <html lang="en" id="root">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>TopoViewer</title>
          <link rel="stylesheet" href="${jsUri}/library/bulma-1-0-0.min.css?ver=1">
          
                <!-- CSS Assets -->
          <link rel="stylesheet" href="${cssUri}/style.css?ver=1" />

          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
          <link rel="stylesheet" href="${cssUri}/cytoscape-leaflet.css?ver=1" /> 

                <!-- JS Assets -->
            <script src="${jsUri}/library/fontawesome-6-4-2.js?ver=1"></script>
          

          <script src="${jsUri}/library/bulma-slider.min.js?ver=1"></script>
          

          <script src="${jsUri}/library/bulma-toast.min.js?ver=1"></script>


          
        </head>
        <body>

          <nav class="level m-0 px-3 py-1 has-background-4a">

            <div class="is-flex is-justify-content-flex-start">
              <div class="pt-1 pr-2">
                <img
                  id="nokia-logo-img"
                  src="${imagesUri}/containerlab.svg"
                  alt="Containerlab Logo"
                  class="logo-image"
                >
              </div>
              <div class="p-0 is-flex is-justify-content-space-evenly is-flex-direction-column">
                <p class="title    m-0 px-1 py-0   is-4 is-unselectable has-text-weight-normal has-text-white"> containerlab</p>
                <p class="subtitle m-0 px-1 py-0   is-6                 has-text-weight-light  has-text-white" id="ClabSubtitle">Topology name: nokia-MAGc-lab ::: Uptime: 10m10s</p>
              </div>
            </div>

            <div class="level-right">
            
              <!--   aarafat-tag: vs-code

              <div class="level-item">
                <div class="dropdown is-hoverable is-right">
                <div class="dropdown-trigger">
                  <button class="button is-small">
                  <i class="icon fas fa-bars" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="dropdown-menu" id="dropdown-menu" role="menu">
                  <div class="dropdown-content">
                    <a id="about" href="#" onclick="showPanelAbout(event);" class="dropdown-item label has-text-weight-normal is-small py-0">About TopoViewer</a>                      

                    <hr class="dropdown-divider py-0">
                    <a id="getAllEndpointDetail" href="#" onclick="getActualNodesEndpoints(event);" class="dropdown-item label has-text-weight-normal is-small py-0">Action - Retrieve Actual Endpoint Label</a>     
                    <a id="logMessagesDropdownItem" href="#" onclick="showPanelLogMessages(event);" class="dropdown-item label has-text-weight-normal is-small py-0">Action - Log Messages</a>       
                    <hr class="dropdown-divider py-0">
                    <a id="clabClientDropdownItem" href="#" onclick="showPanelTopoViewerClient();"        class="dropdown-item label has-text-weight-normal is-small py-0">TopoViewer Helper App</a>                  
                    

                  </div>
                </div>
              </div>
              -->

              <!--   aarafat-tag: vs-code
              <div id="nokia-logo">
                <img
                  id="nokia-logo-img"
                  src="${imagesUri}/containerlab.svg"
                  alt="Containerlab Logo"
                  class="logo-image"
                >
              </div>
              -->

            </div>
          </nav>

          <div id="root-div">

            <div id="cy-leaflet"></div>
            
            <div id="cy"></div>
            <div id="loading-spinner-global" class="loading" style="display: none;">
              <button id="loading-spinner-global-button" class="button is-loading is-large">
                <span class="icon is-large">
                  <svg class="svg-inline--fa fa-italic" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="italic" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" data-fa-i2svg="">
                    <path fill="currentColor" d="M128 64c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H293.3L160 416h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H90.7L224 96H160c-17.7 0-32-14.3-32-32z"></path>
                  </svg>
                </span>
              </button>
            </div>
            <div id="viewport-buttons" class="box p-2 is-flex" style="display: block; height: auto;">
              <div class="is-flex is-flex-direction-column is-justify-content-space-evenly">
                <p class="control p-0">
                  <a  id="viewport-zoom-to-fit" href="Fit to Viewport" onclick="viewportButtonsZoomToFit(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fas fa-expand"></i> 
                  </span>
                  </a>
                </p>

               

                <p class="control p-0">
                  <a  id="viewport-layout" href="Layout Manager" onclick="viewportButtonsLayoutAlgo(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fas fa-circle-nodes"></i> 
                  </span>
                  </a>
                </p>



                <p class="control p-0">
                  <a  id="viewport-topology-overview" href="Find Node" onclick="viewportButtonsTopologyOverview(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fa-solid fa-binoculars"></i>
                  </span>
                  </a>
                </p>
                <p class="control p-0">
                  <a  id="viewport-label-endpoint" href="Toggle Endpoint Label" onclick="viewportButtonsLabelEndpoint()" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fas fa-tag"></i> 
                  </span>
                  </a>
                </p>

                <!-- aarafat-tag: vs-code  

                <p class="control p-0">
                  <a  id="viewport-container-status-visibility" href="#" onclick="viewportButtonContainerStatusVisibility()"class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fab fa-docker"></i> 
                  </span>
                  </a>
                </p>

                <p class="control p-0">
                  <a  id="viewport-topology-capture" href="#" onclick="viewportButtonsTopologyCapture(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fas fa-camera"></i> 
                  </span>
                  </a>
                </p>
               
                <p class="control p-0">
                  <a  id="viewport-clab-editor" href="#" onclick="viewportButtonsClabEditor(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                  <span class="icon is-small">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </span>
                  </a>
                </p>

                <p class="control p-0">
                  <a  id="viewport-multi-layer" href="#" onclick="viewportButtonsMultiLayerViewPortToggle(event)" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-layer-group"></i>
                    </span>
                  </a>
                </p>
                -->

                <p class="control p-0">
                  <a  id="viewport-reload-topo" href="Reload TopoViewer" onclick="reloadViewport()" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-arrow-rotate-right"></i>
                    </span>
                  </a>
                </p>

                <p class="control p-0">
                  <a  id="viewport-test-call-backend" href="Test Call to Backend" onclick="reloadViewport()" class="button px-4 py-4 is-smallest-element" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-phone"></i>
                    </span>
                  </a>
                </p>              

                
                <hr id="viewport-geo-map-divider" class="my-1 viewport-geo-map is-hidden" style="border-top: 1px solid #dbdbdb;">
                
                
                <p class="control p-0">
                  <a id="viewport-geo-map-pan" href="#" onclick="viewportButtonsGeoMapPan(event)" class="button px-4 py-4 is-smallest-element viewport-geo-map is-hidden is-inverted" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-hand"></i>
                    </span>
                  </a>
                </p>

                
                <p class="control p-0">
                  <a id="viewport-geo-map-edit" href="#" onclick="viewportButtonsGeoMapEdit(event)" class="button px-4 py-4 is-smallest-element viewport-geo-map is-hidden is-inverted" style="outline: none;">
                    <span class="icon is-small">
                      <i class="fa-solid fa-arrow-pointer"></i>
                    </span>
                  </a>
                </p>


              </div>
            </div>
            <div id="viewport-drawer-layout" class="panel p-1 is-1 viewport-drawer" style="display: none; height: 286px; ">
              <div class="panel-block p-0 pb-2">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column pb-0 is-12">
                    <label class="label is-size-7 has-text-weight-semibold px-auto">Layout</label>
                  </div>
                  <div  class="column pb-0 is-12">
                    <div class="content p-0 mb-2 is-small">
                      <p>
                        This panel allows computing new coordinates to nodes of the graph.
                      </p>
                    </div>
                    <div class="select p-0 is-small">
                      <select id="select-layout-algo" onchange="layoutAlgoChange(event)">
                        <option>Select Layout Algorithm</option>
                        <option>Force Directed Radial</option>
                        <option>Vertical</option>
                        <option>Horizontal</option>
                        <option>Geo Positioning</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-force-directed" style="display: none;" >
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Link Lenght</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <input id="force-directed-slider-link-lenght" class="slider" step="1" min="1" max="1000" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                    <div class="columns" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Node Gap</label>
                      </div>
                      <div  class="column is-5">
                        <input id="force-directed-slider-node-gap" class="slider" step="1" min="1" max="10" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-force-directed-reset-start" style="display: none;">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column is-12 is-flex is-justify-content-flex-end">
                    <div class="buttons">
                      
                      <button href="#" onclick="viewportDrawerLayoutForceDirected(event)" class="button is-link is-outlined is-small">Enable</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-force-directed-radial" style="display: none;" >
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
        
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Link<br>Lenght</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <input id="force-directed-radial-slider-link-lenght" class="slider" step="1" min="1" max="500" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                    <div class="columns" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Node Gap</label>
                      </div>
                      <div  class="column is-5">
                        <input id="force-directed-radial-slider-node-gap" class="slider" step="1" min="1" max="100" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-force-directed-radial-reset-start" style="display: none;">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column is-12 is-flex is-justify-content-flex-end">
                    <div class="buttons">
                      
                      <button href="#" onclick="viewportDrawerLayoutForceDirectedRadial(event)" class="button is-link is-outlined is-small">Enable</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-dc-vertical" style="display: none;">
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Node v-Gap</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <input id="vertical-layout-slider-node-v-gap" class="slider" step="1" min="1" max="10" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                    <div class="columns" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto">Group v-Gap</label>
                      </div>
                      <div  class="column is-5">
                        <input id="vertical-layout-slider-group-v-gap"  class="slider" step="1" min="1" max="100" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-dc-vertical-reset-start" style="display: none;">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column is-12 is-flex is-justify-content-flex-end">
                    <div class="buttons">
                      
                      <button href="#" onclick="viewportDrawerLayoutVertical(event)" class="button is-link is-outlined is-small">Enable</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-dc-horizontal" style="display: none;">
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Node h-Gap</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <input id="horizontal-layout-slider-node-h-gap" class="slider" step="1" min="1" max="10" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                    <div class="columns" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto">Group h-Gap</label>
                      </div>
                      <div  class="column is-5">
                        <input id="horizontal-layout-slider-group-h-gap"  class="slider" step="1" min="1" max="100" type="range"  style="width: 130px;">								
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-dc-horizontal-reset-start" style="display: none;">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column is-12 is-flex is-justify-content-flex-end">
                    <div class="buttons">
                      <button href="#" onclick="viewportDrawerLayoutHorizontal(event)" class="button is-link is-outlined is-small">Enable</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-geo-map-content-01"  style="display: none;">
                <div  class="column my-auto is-11">

                  <!-- aarafat-gat: vs-code

                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Enable</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <label class="checkbox is-size-7">
                        <input class="checkbox-input" type="checkbox" value="option01">
                        </label>
                      </div>
                    </div>
                  </div> 
                  
                  -->

                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-geo-map" style="display: none;">
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="content p-0 mb-2 is-small">
                      <div class="px-0 py-0" style="max-height: 73px; overflow-y: auto;">
                        <div class="content is-small pb-2">
                          <p>
                          <strong>Hint:</strong><br>

                            <!-- aarafat-gat: vs-code

                            Check the enable checkbox to activate Geo Positioning layout algorithm.

                            -->

                          </p>
                          <p>
                            Click the <i class="fa-solid fa-hand"></i> <strong>Pan</strong> icon to navigate the map, 
                            or the <i class="fa-solid fa-arrow-pointer"></i> <strong>Edit</strong> icon to interact 
                            with nodes and edges. Both icons are located in the viewport buttons. 
                          </p>

                          <!-- aarafat-gat: vs-code

                          <p>
                            Note that Pan and Edit modes are mutually exclusive, and Edit mode is active by default. 
                          </p>	
                          <p>
                            To switch to a different layout, first turn off the Geo Positioning layout by uncheck the enable checkbox.  
                          </p>	
                          -->

                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>



            <div id="viewport-drawer-topology-overview" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
              <div class="panel-block p-0 pb-2">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column pb-0 is-12">
                    <label class="label is-size-7 has-text-weight-semibold px-auto">Topology Overview</label>
                  </div>
                  <div  class="column pb-0 is-12">
                    <div class="content p-0 mb-2 is-small">
                      <p>
                        This panel allows to search node in the topology.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0" id="viewport-drawer-topology-overview-content" style="display: block;" >
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column">
                        <div class="control has-icons-left">
                          <input class="input is-small" type="text" id="viewport-drawer-topology-overview-content-edit" placeholder="Search for nodes ..." />
                          <span class="icon is-flex is-align-self-auto pl-2" style="display: block; height: 25px; width: 20px;">
                          <i class="fas fa-search" aria-hidden="true"></i>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column">
                        <button class="button is-link is-outlined is-small" onclick="viewportNodeFindEvent()">Search Node</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div id="viewport-drawer-capture-sceenshoot" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
              <div class="panel-block p-0 pb-2">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column pb-0 is-12">
                    <label class="label is-size-7 has-text-weight-semibold px-auto">Capture Screenshot</label>
                  </div>
                  <div  class="column pb-0 is-12">
                    <div class="content p-0 mb-2 is-small">
                      <p>
                        This panel allows to capture the topology screenshoot.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div id="viewport-drawer-capture-sceenshoot-content" class="panel-block layout-algo p-0" style="display: none;">
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >PNG</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <label class="checkbox is-size-7">
                        <input class="checkbox-input" type="checkbox" value="option01">
                        </label>
                      </div>
                    </div>
                    <div class="columns" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto">Draw.IO</label>
                      </div>
                      <div  class="column is-5">
                        <label class="checkbox is-size-7">
                        <input class="checkbox-input" type="checkbox" value="option02">
                        </label>			
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="panel-block layout-algo p-0 pb-2" id="viewport-drawer-capture-sceenshoot-button" style="display: block;">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column is-12 is-flex is-justify-content-flex-end">
                    <div class="buttons">
                      <button href="#" onclick="viewportDrawerCaptureFunc(event)" class="button is-link is-outlined is-small">Capture</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="viewport-drawer-clab-editor" class="panel p-1 is-1 viewport-drawer" style="display: none; ">
              <div class="panel-block p-0 pb-2">
                <div  class="column p-0 is-flex-direction-column">
                  <div  class="column pb-0 is-12">
                    <label class="label is-size-7 has-text-weight-semibold px-auto">Containerlab Editor</label>
                  </div>
                  <div  class="column pb-0 is-12">
                    <div class="content p-0 mb-2 is-small">
                      <p>
                        This panel allows to enable Containerlab Editor.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div id="viewport-drawer-clab-editor-content-01" class="panel-block  layout-algo p-0" style="display: none;">
                <div  class="column my-auto is-11">
                  <div  class="panel-content">
                    <div class="columns py-auto" >
                      <div  class="column is-5">
                        <label class="label is-size-7 has-text-right px-auto" >Enable</label>
                      </div>
                      <div  class="column pb-1 is-5">
                        <label class="checkbox is-size-7">
                        <input class="checkbox-input" type="checkbox" value="option01">
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div id="viewport-drawer-clab-editor-content-02" class="panel-block layout-algo p-0" style="display: none;">
                <div  class="column pb-0 is-12">
                  <div class="content p-0 mb-2 is-small">
                    <div class="px-0 py-0" style="max-height: 125px; overflow-y: auto;">
                      <div class="content is-small pb-2">
                        <p>
                          <strong>Hint:</strong><br>
                          (Shift + Click) on the viewport to add a node, or on the source-node and then click the target-node to create a link.
                        </p>
                        <p>
                          (Alt + Click) on a node to delete the node and its reference edges, or on a link to delete the link.
                        </p>
                        <p>
                          Drag an orphan node onto a group node to include it as part of the group.
                        </p>
                        <p>
                          Control + Click on a child node within a group to make it an orphan node.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>			
            
            <div class="panel is-link" id="panel-clab-editor" style="display: none;">
              <p class="panel-heading is-size-7">Containerlab YAML Editor</p>
              <div class="panel-tabContainer">
                <div class="panel-block p-0">
                  <div class="column px-0">
                    <div class="column my-auto">
                      <div class="panel-content">
                        <div class="field">
                          <div class="control">
                            <input type="file" id="panel-clab-editor-file-input" class="file-input">
                            <button class="button is-link is-outlined is-small" id="panel-clab-editor-copy-button"; onclick="clabEditorCopyYamlContent(event);">Copy to Clipboard</button>
                            <button class="button is-link is-outlined is-small" id="panel-clab-editor-close-button"; onclick="closePanelContainerlabEditor(event)" >Close</button>
                          </div>
                        </div>
                        <div id="panel-clab-editor-text-area" style="width:100%; height:600px;"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="panel panel-overlay is-link" id="panel-node" style="display: none;">
              <p class="panel-heading is-size-7">Node Properties</p>
              <div  class="panel-tabContainer">
                <div  class="panel-block p-0">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Node Name</label></div>
                          <div class="column is-8 p-1 pl-3">
                            <label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-name">node-name-placeholder</label>
                          </div>
                        </div>
                      </div>
                    </div>


                    <div  class="column my-auto is-11">
                      <div class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" ></label></div>
                          <div class="column is-8 p-1 pl-3" >
                            <div class="dropdown is-hoverable">
                              <div class="dropdown-trigger">
                                <button class="button label has-text-weight-normal is-small py-0" aria-haspopup="true" aria-controls="dropdown-menu">
                                <span>Actions</span>
                                <span class="icon is-small">
                                <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                                </button>
                              </div>
                              <div class="dropdown-menu" id="panel-node-action-dropdown-menu" role="menu">
                                <div class="dropdown-content">
                                  <a onclick="sshWebBased(event);"       class="dropdown-item label has-text-weight-normal is-small py-0" id="panel-node-action-ssh-web-based">Connect to SSH</a>

                                  <!--   aarafat-tag: vs-code

                                  <a onclick="sshCliCommandCopy(event);" class="dropdown-item label has-text-weight-normal is-small py-0" id="panel-node-action-ssh-copy-cli-command">SSH - Copy to Clipboard</a>
                                  <hr class="dropdown-divider" />
                                  <a onclick="backupRestoreNodeConfig(event);" class="dropdown-item label has-text-weight-normal is-small py-0"> Backup-Restore Config </a>
                                  <a href="#" class="dropdown-item label has-text-weight-normal is-small py-0"> Reboot </a>

                                    -->

                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  
                  

                  </div>
                </div>
                <div  class="panel-block p-0">
                  <div  class="column px-0">

                    <!--   aarafat-tag: vs-code
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >State</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-state">node-state-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    -->

                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Kind</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-kind">node-kind-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Image</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-image">node-image-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Management IPv4</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-mgmtipv4">node-mgmtipv4-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Management IPv6</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-mgmtipv6">node-mgmtipv6-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >FQDN</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-fqdn">node-fqdn-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Group</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-group">node-group-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >TopoViewer Role</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content"id="panel-node-topoviewerrole">node-topoviewerrole-placeholder</label></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel is-link" id="panel-node-editor" style="display: none;">
              <p class="panel-heading is-size-7">Node Properties Editor</p>
              <div  class="panel-tabContainer">
                <div  class="panel-block p-0">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Node Name</label></div>
                          <div class="column is-8 p-1 pl-3">
                            <input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-editor-name"></input>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div  class="panel-block p-0">
                  <div  class="column px-0">
                    <div class="column my-auto is-11">
                      <div class="panel-content">
                        <div class="columns py-auto">
                          <div class="column is-4 p-1">
                            <label class="label is-size-7 has-text-right has-text-weight-medium px-auto">Kind</label>
                          </div>
                          <div class="column is-8 p-1 pl-3">
                            <div class="dropdown" id="panel-node-kind-dropdown">
                              <div class="dropdown-trigger">
                                <button class="button is-size-7" aria-haspopup="true" aria-controls="dropdown-menu">
                                <span>Select Kind</span>
                                <span class="icon is-small">
                                <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                                </button>
                              </div>
                              <div class="dropdown-menu" id="dropdown-menu" role="menu">
                                <div class="dropdown-content" id="panel-node-kind-dropdown-content">
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="column my-auto is-11">
                      <div class="panel-content">
                        <div class="columns py-auto">
                          <div class="column is-4 p-1">
                            <label class="label is-size-7 has-text-right has-text-weight-medium px-auto">TopoViewer Role</label>
                          </div>
                          <div class="column is-8 p-1 pl-3">
                            <div class="dropdown" id="panel-node-topoviewerrole-dropdown">
                              <div class="dropdown-trigger">
                                <button class="button is-size-7" aria-haspopup="true" aria-controls="dropdown-menu">
                                <span>Select TopoViewerRole</span>
                                <span class="icon is-small">
                                <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                                </button>
                              </div>
                              <div class="dropdown-menu" id="dropdown-menu-topoviewerrole" role="menu">
                                <div class="dropdown-content" id="panel-node-topoviewerrole-dropdown-content">
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Id</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-editor-id"></label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Image</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-editor-image"></input></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Group</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-node-editor-group"></input></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"></div>
                          <div class="column is-8 p-1 pl-3" >
                            <div class="field">
                              <div class="control">
                                <input type="file" id="panel-clab-editor-file-input" class="file-input">
                                <button class="button is-link is-outlined is-small" onclick="saveNodeToEditorToFile()">Save</button>
                                <button class="button is-link is-outlined is-small" id="panel-node-editor-close-button" >Close</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel panel-overlay is-link" id="panel-link" style="display: none;">
              <p class="panel-heading is-size-7">Link Properties</p>
              <div  class="panel-tabContainer">
                <div  class="panel-block p-0">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Link Name</label></div>
                          <div class="column is-8 p-1 pl-3">
                            <label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-link-name">link-name-placeholder</label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!--   aarafat-tag: vs-code
                    <div  class="column my-auto is-11">
                      <div class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" ></label></div>
                          <div class="column is-8 p-1 pl-3" >
                            <div class="dropdown is-hoverable">
                              <div class="dropdown-trigger">
                                <button class="button label has-text-weight-normal is-small py-0" aria-haspopup="true" aria-controls="dropdown-menu">
                                <span>Actions</span>
                                <span class="icon is-small">
                                <i class="fas fa-angle-down" aria-hidden="true"></i>
                                </span>
                                </button>
                              </div>
                              
                              <div class="dropdown-menu" id="panel-link-action-dropdown-menu" role="menu">
                                <div class="dropdown-content" id="panel-link-action-dropdown-menu-dropdown-content">
                                  <a onclick="linkImpairmentClab(event, 'bidirectional');" class="dropdown-item label has-text-weight-normal is-small py-0" id="panel-link-action-impairment-B->A">Apply Impairment</a>						
                                  <hr class="dropdown-divider" />
                                  <a onclick="linkWireshark(event, 'edgeSharkInterface', 'source', null);" class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-a-edgeshark">Capture E.Point-A</a>
                                  <a onclick="linkWireshark(event, 'copy', 'source');" class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-a-clipboard">Capture E.Point-A Clipboard</a>
                                  <a class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-a-bottom"></a>
                                  <hr class="dropdown-divider" />
                                  <a onclick="linkWireshark(event, 'edgeSharkInterface', 'target');" class="dropdown-item label has-text-weight-normal is-small py-0"id="endpoint-b-edgeshark">Capture E.Point-B</a>
                                  <a onclick="linkWireshark(event, 'copy', 'target');" class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-b-clipboard">Capture E.Point-B Clipboard</a>
                                  <a class="dropdown-item label has-text-weight-normal is-small py-0" id="endpoint-b-bottom"></a>
                                </div>
                              </div>
                              
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    -->

                  </div>
                </div>
                <div  class="panel-block p-0" id="panel-link-endpoint-a">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Endpoint-A</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-link-endpoint-a-name">link-endpoint-a-name-placeholder</label></div>
                        </div>
                      </div>
                    </div>

                    <!--   aarafat-tag: vs-code

                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >MAC address</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-link-endpoint-a-mac-address">link-mac-address-placeholder</label></div>
                        </div>
                      </div>
                    </div>

                    -->

                  </div>
                </div>
                <div  class="panel-block p-0" id="panel-link-endpoint-b">
                  <div  class="column px-0">

                  
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Endpoint-B</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-link-endpoint-b-name">link-endpoint-b-name-placeholder</label></div>
                        </div>
                      </div>
                    </div>

                    <!--   aarafat-tag: vs-code

                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >MAC address</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" id="panel-link-endpoint-b-mac-address">link-mac-address-placeholder</label></div>
                        </div>
                      </div>
                    </div>

                    -->

                  </div>
                </div>

                <!--   aarafat-tag: vs-code

                <panel-block-impairment-a-b  class="panel-block p-0" id="panel-block-impairment-a-b">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Impairment</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left has-text-weight-medium px-auto" >A >>> B</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Delay (ms)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-a-delay" value="link-delay-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Jitter (ms)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-a-jitter" value="link-jitter-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Rate (kpbs)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-a-rate" value="link-rate-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Loss (%)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-a-loss" value="link-loss-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Corruption (%)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-a-corruption" value="link-corruption-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </panel-block-impairment-a-b>

                -->


                <!--   aarafat-tag: vs-code

                <panel-block-impairment-b-a  class="panel-block p-0" id="panel-block-impairment-b-a">
                  <div  class="column px-0">
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Impairment</label></div>
                          <div class="column is-8 p-1 pl-3" ><label class="label is-size-7 has-text-left has-text-weight-medium px-auto" >B >>> A</label></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Delay (ms)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-b-delay" value="link-delay-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Jitter (ms)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-b-jitter" value="link-jitter-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Rate (kpbs)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-b-rate" value="link-rate-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Loss (%)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-b-loss" value="link-loss-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                    <div  class="column my-auto is-11">
                      <div  class="panel-content">
                        <div class="columns py-auto" >
                          <div  class="column is-4 p-1"><label class="label is-size-7 has-text-right has-text-weight-medium px-auto" >Corruption (%)</label></div>
                          <div class="column is-8 p-1 pl-3" ><input class="input is-size-7 has-text-left link-impairment-widht has-text-weight-normal mr-0 is-max-content" type="text" id="panel-link-endpoint-b-corruption" value="link-corruption-placeholder"/></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </panel-block-impairment-b-a>

                -->


              </div>
            </div>
            <div class="panel panel-overlay is-link" id="panel-backup-restore" style="display: none;">
              <p class="panel-heading is-size-7" id="diff-panel-title">Diff</p>
              <div>
                <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
                  <div class="column is-one-fifth" id="file-browser">
                    <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
                      <div class="column p-0 is-flex is-justify-content-left is-flex-direction-column">
                        <h3 class="label is-size-7" id="file-browser-title">Config Files</h3>
                        <div class="panel is-link is-size-7" id="panel-file-browser">
                          <div>
                            <p class="control has-icons-left">
                              <input class="input is-link is-size-7" type="text" placeholder="Search" id="search-input">
                              <span class="icon is-flex is-align-self-auto pl-2" style="display: block; height: 25px; width: 20px;">
                                <svg class="svg-inline--fa fa-magnifying-glass" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="magnifying-glass" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg="">
                                  <path fill="currentColor" d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"></path>
                                </svg>
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="column p-0 is-two-third" style="height: 100%; width: 100%;">
                    <div class="columns m-0 p-0" style="height: 100%; width: 100%;">
                      <div class="column is-flex is-justify-content-left is-flex-direction-column">
                        <div class="label is-size-7">Saved Config</div>
                        <p class="control is-flex">
                          <button class="button is-small is-link is-outlined" id="buttonRestoreConfig">
                          <span>Restore</span>
                          <span class="icon is-small">
                          <i class="fa-solid fa-arrow-right"></i>
                          </span>
                          </button>
                        </p>
                      </div>
                      <div class="column is-flex is-justify-content-left is-flex-direction-column">
                        <div class="label label is-size-7">Running Config</div>
                        <p class="buttons is-flex">
                          <button class="button is-small is-link is-outlined" id="buttonBackupConfig">
                          <span>Backup</span>
                          <span class="icon is-small">
                          <i class="fa-solid fa-arrow-left"></i>
                          </span>
                          </button>
                        </p>
                      </div>
                    </div>
                    <div class="column pt-0" id="editor-container"></div>
                  </div>
                </div>
                <div id="loading-spinner" class="loading" style="display: none;">
                  <button id="loading-spinner-global-button" class="button is-loading is-large is-dark">
                    <span class="icon is-small">
                      <svg class="svg-inline--fa fa-italic" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="italic" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" data-fa-i2svg="">
                        <path fill="currentColor" d="M128 64c0-17.7 14.3-32 32-32H352c17.7 0 32 14.3 32 32s-14.3 32-32 32H293.3L160 416h64c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H90.7L224 96H160c-17.7 0-32-14.3-32-32z"></path>
                      </svg>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div class="panel panel-overlay is-link" id="panel-introduction" style="display: block;">
              <p class="panel-heading is-size-7">Introduction</p>
              <div id="tabContainer-" class="panel-tabContainer">
                <div id="panelBlock-tabContainer-" class="panel-block py-2">
                  <div id="panelBlock-tabContainer--divPanelBlock" class="column p-0">
                    <div class="px-2" style="max-height: 280px; overflow-y: auto;">
                      <div class="content is-small pb-2">
                        <h6>Welcome to TopoViewer!</h6>
                        <p>
                          TopoViewer is a powerful network topology visualization tool designed to help you easily manage and monitor your network infrastructure. Whether you're a network administrator, engineer, or simply curious about your network, TopoViewer has you covered.<br>
                        </p>
                        <p>
                          Designed and developed by <strong><a href="https://www.linkedin.com/in/asadarafat/">Asad Arafat</a></strong> <br>
                        </p>
                        <p>Key Features: </p>
                        <ul>
                          <li>Visualize your network topology with ease.</li>
                          <li>View detailed attributes of nodes and links by clicking on them.</li>
                        </ul>
                        <p>
                          Getting Started: 
                        </p>
                        <ul>
                          <li>Click on nodes and links to explore your network.</li>
                          <li>Use the settings menu to show/hide link endpoint labels.</li>
                          <li>Visit GitHub repository for more details <a href="https/github.com/asadarafat/topoViewer">https/github.com/asadarafat/topoViewer</a>.</li>
                        </ul>
                        <p>
                          We hope you find TopoViewer a valuable tool for your network needs. If you have any questions or feedback, please don't hesitate to reach out to me.
                        </p>
                        <p>
                        Special Thanks:
                            <ul>
                                <li><strong><a href="https://www.linkedin.com/in/siva19susi/">Siva Sivakumar</a></strong> - For pioneering the integration of Bulma CSS, significantly enhancing TopoViewer design and usability.</li>
                                <li><strong><a href="https://www.linkedin.com/in/gatot-susilo-b073166//">Gatot Susilo</a></strong> - For seamlessly incorporating TopoViewer into the Komodo2 tool, bridging functionality with innovation.</li>
                                <li><strong><a href="https://www.linkedin.com/in/gusman-dharma-putra-1b955117/">Gusman Dharma Putra</a></strong> - For his invaluable contribution in integrating TopoViewer into Komodo2, enriching its capabilities.</li>
                                <li><strong><a href="https://www.linkedin.com/in/sven-wisotzky-44788333/">Sven Wisotzky</a></strong> - For offering insightful feedback that led to significant full stack optimizations.</li>
                                <li><strong><a href="https://linkedin.com/in/florian-schwarz-812a34145">Florian Schwarz</a></strong> - Spearheaded the integration of TopoViewer into the vscode-containerlab plugin and offered valuable feedback to enhance TopoViewer's functionality.</li>
                                <li><strong><a href="https://linkedin.com/in/kaelem-chandra">Kaelem Chandra</a></strong>- Leads the maintenance of the vscode-containerlab plugin, ensuring seamless TopoViewer integration while providing expert insights and continuous support.</li>
                            </ul>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel is-link" id="panel-log-messages" style="display: none;">
              <p class="panel-heading is-size-7">Log Messages</p>
              <div class="panel-block py-2 px-2">
                <textarea class="textarea is-small is-outlined is-expanded" id="notificationTextarea" rows="12"></textarea>
              </div>
              <div class="panel-block py-2 px-2">
                <div class="is-justify-content-space-between">
                  <button id="copyToClipboardButton" class="button is-smallest-element">Copy to Clipboard</button>
                  <button id="panel-log-messages-close-button" class="button is-smallest-element">Close</button>
                </div>
              </div>
            </div>
            <div class="panel panel-overlay is-link" id="panel-topoviewer-helper" style="display: none;">
              <p class="panel-heading is-size-7">TopoViewer Helper App</p>
              <div id="tabContainer-" class="panel-tabContainer">
                <div id="panelBlock-tabContainer-" class="panel-block py-2">
                  <div id="panelBlock-tabContainer--divPanelBlock" class="column p-0">
                    <div class="px-2" style="max-height: 280px; overflow-y: auto;">
                      <div class="content is-small pb-2" id="panel-topoviewer-helper-content">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel panel-overlay is-link" id="panel-topoviewer-about" style="display: none;">
              <p class="panel-heading is-size-7">TopoViewer About</p>
              <div id="tabContainer-" class="panel-tabContainer">
                <div id="panelBlock-tabContainer-" class="panel-block py-2">
                  <div id="panelBlock-tabContainer--divPanelBlock" class="column p-0">
                    <div class="px-2" style="max-height: 280px; overflow-y: auto;">
                      <div class="content is-small pb-2" id="panel-topoviewer-about-content">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            
            <div class="modal" id="wiresharkModal">
              <div class="modal-background"></div>
              <div class="modal-content">
                <div class="box">
                  <h2 class="title is-4">Launch Wireshark</h2>
                  <div class="field">
                    <label class="label" for="subInterfaceId">Sub Interface ID:</label>
                    <div class="control">
                      <input class="input" type="text" id="subInterfaceId" placeholder="Enter Sub Interface ID">
                    </div>
                  </div>
                  <div class="field">
                    <label class="label" for="containerName">Container Name:</label>
                    <div class="control">
                      <div class="select">
                        <select id="containerName"></select>
                      </div>
                    </div>
                  </div>
                  <div class="field">
                    <label class="label" for="networkInterface">Network Interface:</label>
                    <div class="control">
                      <div class="select">
                        <select id="networkInterface"></select>
                      </div>
                    </div>
                  </div>
                  <div class="field">
                    <label class="label">URL Preview:</label>
                    <div id="urlPreview" class="content has-background-light p-2"></div>
                  </div>
                  <div class="buttons">
                    <button class="button is-success" id="launchButton">Launch</button>
                    <button class="button is-danger" id="customCloseModal">Cancel</button>
                  </div>
                </div>
              </div>
            </div>

            <script src="https://unpkg.com/leaflet@1.7.1"></script>

            <script src="${jsUri}/library/lodash.min.js?ver=1"></script>

            <script src="${jsUri}/library/cola.min.js?ver=1"></script>
            <script src="${jsUri}/library/popper.min.js?ver=1"></script>
            <script src="${jsUri}/library/tippy.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape.min.js?ver=1"></script>
            <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

            <script src="${jsUri}/library/cytoscape-leaflet.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape-cola.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape-popper.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape-grid-guide.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape-edgehandles.min.js?ver=1"></script>
            <script src="${jsUri}/library/cytoscape-expand-collapse.min.js"></script>

            
            <script src="https://unpkg.com/@floating-ui/core@1.5.0"></script>
            <script src="https://unpkg.com/@floating-ui/dom@1.5.3"></script>
            
            <script src="${jsUri}/library/js-yaml.min.js?ver=1"></script>
            <script src="${jsUri}/library/monaco-loader.js?ver=1"></script>

            <!-- Inject imagesUri as a global variable -->
            <script> window.imagesUrl = "${imagesUri}"; </script>

            <!-- Inject JSON dataCytoMarshall.json as a global variable -->
            <script> window.jsonFileUrlDataCytoMarshall = "${jsonFileUrlDataCytoMarshall}"; </script>
      
            <!-- Inject JSON environment.json as a global variable -->
            <script> window.jsonFileUrlDataEnvironment = "${jsonFileUrlDataEnvironment}"; </script>

            <!-- Inject isVscodeDeployment boolean as a global variable -->
            <script> window.isVscodeDeployment = "${isVscodeDeployment}"; </script>

            <script src="${jsUri}/globalVariables.js?ver=1"></script>

            <script src="${jsUri}/dev.js?ver=1"></script>
            <script src="${jsUri}/common.js?ver=1"></script>

                        <script src="${jsUri}/managerVscodeWebview.js?ver=1"></script>

            <script src="${jsUri}/managerSvg.js?ver=1"></script>
            <script src="${jsUri}/managerLayoutAlgo.js?ver=1"></script>
            
         
            <script src="${jsUri}/backupRestore.js?ver=1"></script> 
            <script src="${jsUri}/managerClabEditor.js?ver=1"></script> 
          

          </div>
          
        </body>
      </html>
    `;
  }




  //   /**
  //    * Updates the panel HTML with freshly computed Cytoscape elements and data files.
  //    * Primarily intended for refreshing or reloading the topology view
  //    * if the underlying YAML or environment data has changed.
  //    *
  //    * @param panel - The active WebviewPanel to update.
  //    */
  public async updatePanelHtml(panel: vscode.WebviewPanel | undefined): Promise<void> {
    // If we haven't opened a viewer yet or folderName is missing, do nothing
    if (!this.lastFolderName) {
      return;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.lastFolderName;

    // aarafat-tag:
    // get the latest clabTreeDataToTopoviewer
    const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();

    log.debug(`Updating panel HTML for folderName: ${folderName}`);

    // Read YAML content
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');

    // Convert YAML to Cytoscape elements using the adaptor
    const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
      yamlContent,
      updatedClabTreeDataToTopoviewer
    );

    // Write updated JSON files
    this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

    // panel possibly undefined
    if (panel) {
      // Recompute URIs
      const { css, js, images } = this.adaptor.generateStaticAssetUris(
        this.context,
        panel.webview
      );
      const jsOutDir = panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out'))
        .toString();

      // Get new JSON file URIs
      const mediaPath = vscode.Uri.joinPath(
        this.context.extensionUri,
        'topoViewerData',
        folderName
      );
      const jsonFileUriDataCytoMarshall = vscode.Uri.joinPath(mediaPath, 'dataCytoMarshall.json');
      const jsonFileUrlDataCytoMarshall = panel.webview
        .asWebviewUri(jsonFileUriDataCytoMarshall)
        .toString();

      const jsonFileUriDataEnvironment = vscode.Uri.joinPath(mediaPath, 'environment.json');
      const jsonFileUrlDataEnvironment = panel.webview
        .asWebviewUri(jsonFileUriDataEnvironment)
        .toString();

      const isVscodeDeployment = true;

      // Update the panel's HTML
      panel.webview.html = this.getWebviewContent(
        css,
        js,
        images,
        jsonFileUrlDataCytoMarshall,
        jsonFileUrlDataEnvironment,
        isVscodeDeployment,
        jsOutDir
      );

      vscode.window.showInformationMessage("TopoViewer Webview reloaded!");

    } else {
      log.error(`panel is undefined`)
    }
  }



}