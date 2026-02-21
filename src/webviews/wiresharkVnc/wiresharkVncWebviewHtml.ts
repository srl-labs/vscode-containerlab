import type { Uri, Webview } from "vscode";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

import type { WiresharkVncInitialData } from "./types";

export function getWiresharkVncWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
  initialData: WiresharkVncInitialData
): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "wiresharkVncWebview.js",
    title: "Wireshark Capture",
    initialData,
    webviewKind: "containerlab-wireshark-vnc",
    connectSrc: ["http:", "https:"],
    frameSrc: ["http:", "https:"],
  });
}
