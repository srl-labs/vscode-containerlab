/**
 * PanelManager - Handles webview panel lifecycle and HTML generation
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * Configuration for creating a webview panel
 */
export interface PanelConfig {
  viewType: string;
  title: string;
  column?: vscode.ViewColumn;
  extensionUri: vscode.Uri;
}

/**
 * Options for webview panel creation
 */
export interface WebviewPanelOptions {
  enableScripts: boolean;
  retainContextWhenHidden: boolean;
  localResourceRoots: vscode.Uri[];
}

/**
 * Creates a webview panel with the given configuration
 */
export function createPanel(config: PanelConfig): vscode.WebviewPanel {
  const options: WebviewPanelOptions = {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [
      vscode.Uri.joinPath(config.extensionUri, 'dist'),
      vscode.Uri.joinPath(config.extensionUri, 'resources')
    ]
  };

  return vscode.window.createWebviewPanel(
    config.viewType,
    config.title,
    config.column || vscode.ViewColumn.One,
    options
  );
}

/**
 * Generate a nonce for CSP using crypto
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Data required to generate webview HTML
 */
export interface WebviewHtmlData {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  topologyData: unknown;
}

/**
 * Generates the HTML content for the React TopoViewer webview
 */
export function generateWebviewHtml(data: WebviewHtmlData): string {
  const { webview, extensionUri, topologyData } = data;

  // Get URIs for resources
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'reactTopoViewerWebview.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'reactTopoViewerStyles.css')
  );

  // Get schema URI for kind/type dropdowns
  const schemaUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'schema', 'clab.schema.json')
  ).toString();

  // CSP nonce for security
  const nonce = generateNonce();

  // Serialize initial data
  const initialDataJson = JSON.stringify(topologyData || {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https://*.basemaps.cartocdn.com; worker-src ${webview.cspSource} blob:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>TopoViewer (React)</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VS Code API for webview communication
    window.vscode = acquireVsCodeApi();
    window.__INITIAL_DATA__ = ${initialDataJson};
    window.schemaUrl = "${schemaUri}";
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Reveals an existing panel or returns false if it doesn't exist
 */
export function revealPanel(panel: vscode.WebviewPanel | undefined, column?: vscode.ViewColumn): boolean {
  if (panel) {
    panel.reveal(column);
    return true;
  }
  return false;
}
