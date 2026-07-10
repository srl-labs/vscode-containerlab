import * as vscode from "vscode";

import type { ApiEndpointController } from "./apiEndpointController";
import {
  isApiEndpointManagerRequest,
  type ApiEndpointManagerRequest,
  type ApiEndpointManagerResponse
} from "./protocol";
import { getApiEndpointManagerWebviewHtml } from "../webviews/apiEndpoints/apiEndpointManagerWebviewHtml";

let currentPanel: vscode.WebviewPanel | undefined;

async function runRequest(
  controller: ApiEndpointController,
  request: ApiEndpointManagerRequest
): Promise<void> {
  switch (request.action) {
    case "refresh":
      return;
    case "add":
      await controller.addEndpoint(request.input);
      return;
    case "reconnect":
      await controller.reconnectEndpoint(request.input);
      return;
    case "connect":
      await controller.connectEndpoint(request.endpointId);
      return;
    case "update":
      await controller.updateEndpoint(request.input);
      return;
    case "remove":
      await controller.removeEndpoint(request.endpointId);
      return;
    case "openTlsSettings":
      await controller.openTlsSettings();
  }
}

async function respond(
  panel: vscode.WebviewPanel,
  controller: ApiEndpointController,
  message: unknown
): Promise<void> {
  if (!isApiEndpointManagerRequest(message)) return;
  let success = true;
  let error: string | undefined;
  try {
    await runRequest(controller, message);
  } catch (requestError) {
    success = false;
    error = requestError instanceof Error ? requestError.message : String(requestError);
  }
  const state = await controller
    .getState(success)
    .catch(async () => await controller.getState(false));
  const response: ApiEndpointManagerResponse = {
    type: "api-endpoints:response",
    requestId: message.requestId,
    success,
    state,
    ...(error !== undefined ? { error } : {})
  };
  await panel.webview.postMessage(response);
}

export async function showApiEndpointManager(
  context: vscode.ExtensionContext,
  controller: ApiEndpointController
): Promise<void> {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    const state = await controller.getState();
    await currentPanel.webview.postMessage({ type: "api-endpoints:state", state });
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "containerlabApiEndpointManager",
    "Containerlab API Endpoints",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")]
    }
  );
  currentPanel = panel;
  panel.onDidDispose(() => {
    currentPanel = undefined;
  });
  panel.webview.html = getApiEndpointManagerWebviewHtml(panel.webview, context.extensionUri);
  panel.webview.onDidReceiveMessage((message: unknown) => {
    void respond(panel, controller, message);
  });
}
