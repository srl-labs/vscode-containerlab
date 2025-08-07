// file: src/topoViewer/backend/topoViewerWebUiFacade.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml'; // https://github.com/eemeli/yaml
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { ClabLabTreeNode } from '../../treeView/common';
import { RunningLabTreeDataProvider } from '../../treeView/runningLabsProvider';
import { handleWebviewMessage, WebviewMessage } from './webviewMessageHandler';

import { getHTMLTemplate } from '../webview-ui/html-static/template/vscodeHtmlTemplate';

/**
 * Class representing the Unified Containerlab Topology Viewer/Editor extension in VS Code.
 * Features smart detection of lab deployment state to provide contextual functionality.
 * It is responsible for:
 * - Parsing Containerlab YAML configurations.
 * - Transforming YAML data into Cytoscape elements.
 * - Managing JSON file creation for topology data.
 * - Initializing and managing the visualization webview.
 * - Smart viewer/editor mode switching based on deployment state.
 * - Providing contextual UI based on lab deployment status.
 */
export class TopoViewer {
  /**
   * Adaptor instance responsible for converting Containerlab YAML to Cytoscape elements
   * and creating the required JSON files.
   */
  public adaptor: TopoViewerAdaptorClab;

  /**
   * Tree data provider to manage Containerlab lab nodes.
   */
  private clabTreeProviderImported: RunningLabTreeDataProvider;

  /**
   * Stores the YAML file path from the last topenViewer call.
   */
  public lastYamlFilePath: string = '';

  /**
   * Stores the folder name (derived from the YAML file name) where JSON data files are stored.
   */
  public lastFolderName: string | undefined;

  /**
   * The currently active TopoViewer webview panel.
   */
  public currentTopoViewerPanel: vscode.WebviewPanel | undefined;

  public cacheClabTreeDataToTopoviewer: Record<string, ClabLabTreeNode> | undefined;


  /**
   * Current deployment state of the lab being viewed.
   */
  private deploymentState: 'deployed' | 'undeployed' | 'unknown' = 'unknown';

  /**
   * Smart viewer/editor mode based on deployment state.
   */
  private viewerMode: 'viewer' | 'editor' | 'unified' = 'unified';



  /**
   * Creates a new instance of TopoViewer.
   *
   * @param context - The VS Code extension context.
   */
  constructor(public context: vscode.ExtensionContext) {
    this.adaptor = new TopoViewerAdaptorClab();
    this.clabTreeProviderImported = new RunningLabTreeDataProvider(context);
  }

  /**
   * Detects the deployment state of the lab by checking if containers are running.
   * This enables smart viewer/editor functionality.
   *
   * @param yamlContent - The raw YAML content of the lab configuration file
   * @returns Promise resolving to deployment state
   */
  private async detectDeploymentState(yamlContent: string, clabTreeData?: Record<string, ClabLabTreeNode>): Promise<'deployed' | 'undeployed' | 'unknown'> {
    try {
      // Parse the YAML to get lab name
      const yamlData = YAML.parse(yamlContent);
      const labName = yamlData?.name;

      if (!labName) {
        log.info('Unable to determine lab name from YAML file');
        return 'unknown';
      }

      // Use provided clabTreeData or get from cache if available
      const runningLabs = clabTreeData || this.cacheClabTreeDataToTopoviewer;

      if (!runningLabs) {
        log.info('No running labs data available yet');
        return 'unknown';
      }

      const isDeployed = Object.keys(runningLabs).some(key =>
        runningLabs[key].name === labName
      );

      const state = isDeployed ? 'deployed' : 'undeployed';
      log.info(`Lab "${labName}" deployment state: ${state}`);

      return state;
    } catch (error) {
      log.error(`Failed to detect deployment state: ${error}`);
      return 'unknown';
    }
  }

  /**
   * Updates the viewer mode based on deployment state and user preferences.
   *
   * @param deploymentState - Current deployment state
   */
  private updateViewerMode(deploymentState: 'deployed' | 'undeployed' | 'unknown'): void {
    // Smart mode selection based on deployment state
    switch (deploymentState) {
      case 'deployed':
        // Show viewer mode with live data and operational controls
        this.viewerMode = 'viewer';
        log.info('Switching to viewer mode - lab is deployed');
        break;
      case 'undeployed':
        // Show editor mode with design and configuration controls
        this.viewerMode = 'editor';
        log.info('Switching to editor mode - lab is undeployed');
        break;
      default:
        // Unified mode shows both viewer and editor capabilities
        this.viewerMode = 'unified';
        log.info('Using unified mode - deployment state unknown');
        break;
    }
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
      // Read the YAML content from the file asynchronously.
      const yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');

      // If clabTreeDataToTopoviewer is not provided, fetch it once
      if (!clabTreeDataToTopoviewer) {
        clabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
      }

      // Detect deployment state and transform YAML concurrently.
      const [deploymentState, cytoTopology] = await Promise.all([
        this.detectDeploymentState(yamlContent, clabTreeDataToTopoviewer),
        Promise.resolve(this.adaptor.clabYamlToCytoscapeElements(yamlContent, clabTreeDataToTopoviewer))
      ]);

      // Update viewer/editor mode based on deployment state
      this.deploymentState = deploymentState;
      this.updateViewerMode(deploymentState);

      // Determine folder name based on the YAML file name.
      const folderName = path.basename(yamlFilePath, path.extname(yamlFilePath));
      this.lastFolderName = folderName;

      // Create folder and write Cyto Data JSON files for the webview.
      await this.adaptor.createFolderAndWriteJson(this.context, folderName, cytoTopology, yamlContent);

      log.info(`allowedHostname: ${this.adaptor.allowedhostname}`);

      // Create and display the webview panel.
      log.info(`Creating webview panel for visualization`);
      const panel = await this.createWebviewPanel(folderName);
      this.currentTopoViewerPanel = panel;

      // Store the clabTreeDataToTopoviewer in cache
      this.cacheClabTreeDataToTopoviewer = clabTreeDataToTopoviewer;

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
   * @returns A promise that resolves to the created WebviewPanel.
   */
  private async createWebviewPanel(folderName: string): Promise<vscode.WebviewPanel> {
    const panel = vscode.window.createWebviewPanel(
      'topoViewer',
      `Containerlab Topology: ${folderName}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', folderName),
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'topoViewer', 'webview-ui', 'html-static'),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        ],
      }
    );

    const iconUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'resources',
      'containerlab.png'
    );
    panel.iconPath = iconUri;

    await vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);
    log.info(`Context key 'isTopoviewerActive' set to true`);

    const themeChangeListener = vscode.window.onDidChangeActiveColorTheme(() => {
      const isDarkTheme =
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
        vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
      const logoFile = isDarkTheme ? 'containerlab.svg' : 'containerlab-dark.svg';

      panel.webview.postMessage({
        type: 'theme-changed',
        isDarkTheme: isDarkTheme,
        logoFile: logoFile,
      });

      log.info(`Theme changed - isDarkTheme: ${isDarkTheme}, logoFile: ${logoFile}`);
    });

    panel.onDidDispose(
      () => {
        vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
        log.info(`Context key 'isTopoviewerActive' set to false`);
        themeChangeListener.dispose();
      },
      null,
      this.context.subscriptions
    );

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
      true,
      jsOutDir,
      this.adaptor.allowedhostname as string
    );

    log.info('Webview panel created successfully');

    panel.webview.onDidReceiveMessage((msg: WebviewMessage) =>
      handleWebviewMessage.call(this, msg, panel)
    );

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
   * @returns The complete HTML content as a string.
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
    allowedhostname: string
  ): string {
    // Detect VS Code theme for logo selection
    const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                       vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

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
      this.deploymentState,
      this.viewerMode,
      this.adaptor.currentClabTopo?.name || 'Unknown Topology',
      isDarkTheme
    );
  }

  /**
   * Updates the cached tree data with fresh data from the tree provider.
   * This should be called when the tree data changes (e.g., interface state changes).
   *
   * @returns A promise that resolves when the tree data has been updated.
   */
  public async updateTreeData(): Promise<void> {
    try {
      // Fetch fresh tree data from the provider
      const freshTreeData = await this.clabTreeProviderImported.discoverInspectLabs();

      // Update the cache
      this.cacheClabTreeDataToTopoviewer = freshTreeData;

      log.info('Tree data cache updated successfully');

      // If there's an active panel, send updated data without reloading
      if (this.currentTopoViewerPanel && this.lastYamlFilePath) {
        await this.sendUpdatedDataToWebview();
      }
    } catch (error) {
      log.error(`Failed to update tree data: ${error}`);
    }
  }

  /**
   * Sends updated topology data to the webview without reloading.
   * This allows for real-time updates of link states.
   */
  private async sendUpdatedDataToWebview(): Promise<void> {
    if (!this.currentTopoViewerPanel || !this.lastYamlFilePath) {
      return;
    }

    try {
      // Read the YAML content
      const yamlContent = fs.readFileSync(this.lastYamlFilePath, 'utf8');

      // Generate fresh cytoscape elements with updated tree data
      const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
        yamlContent,
        this.cacheClabTreeDataToTopoviewer
      );

      // Send the updated data to the webview
      this.currentTopoViewerPanel.webview.postMessage({
        type: 'updateTopology',
        data: cytoTopology
      });

      log.info('Sent updated topology data to webview');
    } catch (error) {
      log.error(`Failed to send updated data to webview: ${error}`);
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
    if (!this.lastFolderName) {
      return;
    }

    const yamlFilePath = this.lastYamlFilePath;
    const folderName = this.lastFolderName;

    // Always fetch fresh tree data before updating
    const updatedClabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();

    // Update the cache with fresh data
    this.cacheClabTreeDataToTopoviewer = updatedClabTreeDataToTopoviewer;

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
        this.adaptor.allowedhostname as string
      );

      // Only show message for manual reload, not for automatic updates
      vscode.window.showInformationMessage('TopoViewer Webview reloaded!');
    } else {
      log.error('Panel is undefined');
    }
  }

}
