import * as vscode from 'vscode';
import * as path from 'path';
import { getHTMLTemplate } from '../webview-ui/template/vscodeHtmlTemplate';
import { TopoViewerAdaptorClab } from '../../topoViewer/backend/topoViewerAdaptorClab';


/**
 * Class representing the TopoViewer Editor Webview Panel.
 * This class is responsible for creating and managing the webview panel
 * that displays the Cytoscape graph.
 */
export class TopoViewerEditor {
  private currentPanel: vscode.WebviewPanel | undefined;
  private readonly viewType = 'topoViewerEditor';
  private adaptor: TopoViewerAdaptorClab;


  /**
   * Creates a new instance of TopoViewerEditor.
   *
   * @param context - The VS Code extension context.
   */
  constructor(private context: vscode.ExtensionContext) {
    this.adaptor = new TopoViewerAdaptorClab();
  }

  /**
   * Creates a new webview panel or reveals the current one.
   * @param context The extension context.
   */
  public createOrShow(context: vscode.ExtensionContext): void {
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
          vscode.Uri.joinPath(this.context.extensionUri, 'topoViewerData', "Editor"),
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

    // Inject the asset URIs and JSON data paths into the HTML content.
    panel.webview.html = this.getWebviewContent(
      css,
      js,
      images,
      "jsonFileUrlDataCytoMarshall",
      "jsonFileUrlDataEnvironment",
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
}
