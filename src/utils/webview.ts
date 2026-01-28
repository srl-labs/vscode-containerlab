import type * as vscode from "vscode";

export async function tryPostMessage(panel: vscode.WebviewPanel, message: unknown): Promise<void> {
  try {
    await panel.webview.postMessage(message);
  } catch {
    // The panel might already be disposed; ignore errors
  }
}

export async function isHttpEndpointReady(url: string, timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
