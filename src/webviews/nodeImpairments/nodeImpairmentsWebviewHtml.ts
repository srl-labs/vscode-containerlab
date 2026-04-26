import type { Uri, Webview } from "vscode";
import type { NodeImpairmentsInitialData } from "@srl-labs/clab-ui/node-impairments";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

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
    webviewKind: "containerlab-node-impairments"
  });
}
