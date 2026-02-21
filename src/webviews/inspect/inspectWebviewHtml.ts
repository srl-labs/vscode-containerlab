import type { Uri, Webview } from "vscode";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

import type { InspectWebviewInitialData } from "./types";

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
