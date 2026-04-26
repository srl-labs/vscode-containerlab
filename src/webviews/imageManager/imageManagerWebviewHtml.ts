import type { Uri, Webview } from "vscode";
import type { ImageManagerInitialData } from "@srl-labs/clab-ui/image-manager";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

export function getImageManagerWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
  initialData: ImageManagerInitialData
): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "imageManagerWebview.js",
    title: "Containerlab Images",
    initialData,
    webviewKind: "containerlab-image-manager"
  });
}
