// file: src/topoViewer/backend/topoViewerWebUiFacade.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TopoViewerAdaptorClab } from './topoViewerAdaptorClab';
import { log } from './logger';
import { ClabLabTreeNode } from '../../../treeView/common';
import { RunningLabTreeDataProvider } from '../../../treeView/runningLabsProvider';
import { detectDeploymentState, getViewerMode, DeploymentState, ViewerMode } from './deploymentUtils';
import { createTopoViewerPanel, getWebviewContent } from './topoViewerPanel';
import { findContainerNode, findInterfaceNode } from './treeUtils';

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
  private deploymentState: DeploymentState = 'unknown';

  /**
   * Smart viewer/editor mode based on deployment state.
   */
  private viewerMode: ViewerMode = 'unified';



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
      const yamlContent = await fs.promises.readFile(yamlFilePath, 'utf8');

      if (!clabTreeDataToTopoviewer) {
        clabTreeDataToTopoviewer = await this.clabTreeProviderImported.discoverInspectLabs();
      }

      const [deploymentState, cytoTopology] = await Promise.all([
        detectDeploymentState(yamlContent, clabTreeDataToTopoviewer),
        Promise.resolve(
          this.adaptor.clabYamlToCytoscapeElements(
            yamlContent,
            clabTreeDataToTopoviewer
          )
        ),
      ]);

      this.deploymentState = deploymentState;
      this.viewerMode = getViewerMode(deploymentState);

      const folderName = path.basename(yamlFilePath, path.extname(yamlFilePath));
      this.lastFolderName = folderName;

      await this.adaptor.createFolderAndWriteJson(
        this.context,
        folderName,
        cytoTopology,
        yamlContent
      );

      log.info(`allowedHostname: ${this.adaptor.allowedhostname}`);

      const panel = await createTopoViewerPanel({
        context: this.context,
        adaptor: this.adaptor,
        folderName,
        deploymentState: this.deploymentState,
        viewerMode: this.viewerMode,
        allowedHostname: this.adaptor.allowedhostname as string,
        findContainerNode: name =>
          findContainerNode(this.cacheClabTreeDataToTopoviewer, name),
        findInterfaceNode: (nodeName, intf) =>
          findInterfaceNode(this.cacheClabTreeDataToTopoviewer, nodeName, intf),
        onUpdatePanelHtml: async () => {
          await this.updatePanelHtml(this.currentTopoViewerPanel);
        },
      });
      this.currentTopoViewerPanel = panel;

      this.cacheClabTreeDataToTopoviewer = clabTreeDataToTopoviewer;

      return panel;
    } catch (err) {
      vscode.window.showErrorMessage(`Error in openViewer: ${err}`);
      log.error(`openViewer: ${err}`);
      return undefined;
    }
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

      // If there's an active panel, update it with the new data without reloading
      if (this.currentTopoViewerPanel && this.lastYamlFilePath) {
        const yamlContent = fs.readFileSync(this.lastYamlFilePath, 'utf8');
        const cytoTopology = this.adaptor.clabYamlToCytoscapeElements(
          yamlContent,
          freshTreeData
        );

        // Update JSON data on disk for future reloads
        if (this.lastFolderName) {
          this.adaptor.createFolderAndWriteJson(
            this.context,
            this.lastFolderName,
            cytoTopology,
            yamlContent
          );
        }

        await this.currentTopoViewerPanel.webview.postMessage({
          type: 'updateTopology',
          data: cytoTopology,
        });
      }
    } catch (error) {
      log.error(`Failed to update tree data: ${error}`);
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

      panel.webview.html = getWebviewContent(
        css,
        js,
        schemaUri,
        images,
        jsonFileUrlDataCytoMarshall,
        jsonFileUrlDataEnvironment,
        isVscodeDeployment,
        jsOutDir,
        this.adaptor.allowedhostname as string,
        this.deploymentState,
        this.viewerMode,
        this.adaptor.currentClabTopo?.name || 'Unknown Topology'
      );

      // Only show message for manual reload, not for automatic updates
      vscode.window.showInformationMessage('TopoViewer Webview reloaded!');
    } else {
      log.error('Panel is undefined');
    }
  }

}
