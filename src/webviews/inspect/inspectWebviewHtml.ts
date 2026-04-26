import type { Uri, Webview } from "vscode";
import type { InspectWebviewInitialData } from "@srl-labs/clab-ui/inspect";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

export function getInspectWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
  initialData: InspectWebviewInitialData
): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "inspectWebview.js",
    title: "Containerlab Inspect",
    initialData,
    webviewKind: "containerlab-inspect"
  });
}
