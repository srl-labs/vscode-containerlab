import type { Uri, Webview } from "vscode";
import type { WiresharkVncInitialData } from "@srl-labs/clab-ui/wireshark-vnc";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

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
    frameSrc: ["http:", "https:"]
  });
}
