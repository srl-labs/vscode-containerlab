import { randomBytes } from "crypto";

import * as vscode from "vscode";

export interface ReactWebviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  scriptFile: string;
  title: string;
  initialData?: unknown;
  webviewKind?: string;
  connectSrc?: string[];
  frameSrc?: string[];
}

function uniqueSources(values: string[]): string {
  const filtered = values.filter((value) => value.trim().length > 0);
  return [...new Set(filtered)].join(" ");
}

export function createReactWebviewHtml(options: ReactWebviewHtmlOptions): string {
  const {
    webview,
    extensionUri,
    scriptFile,
    title,
    initialData,
    webviewKind,
    connectSrc,
    frameSrc,
  } = options;

  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", scriptFile));
  const nonce = randomBytes(16).toString("hex");

  const connectDirective = uniqueSources([webview.cspSource, ...(connectSrc ?? [])]);
  const frameDirective =
    frameSrc && frameSrc.length > 0 ? `; frame-src ${uniqueSources(frameSrc)}` : "";
  const bodyAttributes =
    webviewKind !== undefined && webviewKind.length > 0
      ? ` data-webview-kind="${webviewKind}"`
      : "";

  const initialDataJson = JSON.stringify(initialData ?? {}).replaceAll("<", "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; connect-src ${connectDirective}${frameDirective};">
  <title>${title}</title>
  <style>
    html, body, #root {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
  </style>
</head>
<body${bodyAttributes}>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__INITIAL_DATA__ = ${initialDataJson};
    if (!window.vscode) {
      try {
        window.vscode = acquireVsCodeApi();
      } catch {
        // Ignore duplicate-acquire errors. Hooks resolve an existing API via window.vscode.
      }
    }
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
