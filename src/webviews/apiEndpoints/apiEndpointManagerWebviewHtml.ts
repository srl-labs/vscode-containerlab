import type { Uri, Webview } from "vscode";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

export function getApiEndpointManagerWebviewHtml(webview: Webview, extensionUri: Uri): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "apiEndpointManagerWebview.js",
    title: "Containerlab API Endpoints",
    webviewKind: "containerlab-api-endpoints"
  });
}
