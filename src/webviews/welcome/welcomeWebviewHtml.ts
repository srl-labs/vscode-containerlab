import type { Uri, Webview } from "vscode";

import { createReactWebviewHtml } from "../shared/reactWebviewHtml";

export interface WelcomeWebviewInitialData {
  extensionVersion: string;
}

export function getWelcomeWebviewHtml(
  webview: Webview,
  extensionUri: Uri,
  initialData: WelcomeWebviewInitialData
): string {
  return createReactWebviewHtml({
    webview,
    extensionUri,
    scriptFile: "welcomePageWebview.js",
    title: "Welcome to Containerlab",
    initialData,
    webviewKind: "containerlab-welcome",
  });
}
