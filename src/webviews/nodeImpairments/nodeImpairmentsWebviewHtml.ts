import type { Uri, Webview } from "vscode";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

import type { NodeImpairmentsInitialData } from "./types";

export function getNodeImpairmentsWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
  initialData: NodeImpairmentsInitialData
): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "nodeImpairmentsWebview.js",
    title: `Manage Link Impairments for ${initialData.nodeName}`,
    initialData,
    webviewKind: "containerlab-node-impairments",
  });
}
