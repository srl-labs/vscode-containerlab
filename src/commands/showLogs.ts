import * as vscode from "vscode";

import type { ClabContainerTreeNode } from "../treeView/common";

import { execCommandInTerminal } from "./command";
import { resolveApiNodeTarget } from "./backendGuards";

export async function showLogs(node?: ClabContainerTreeNode) {
  if (node === undefined) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }
  const apiTarget = resolveApiNodeTarget(node);
  if (apiTarget) {
    try {
      const response = await apiTarget.backend.operations.getNodeLogs(
        apiTarget.labName,
        apiTarget.nodeName
      );
      const document = await vscode.workspace.openTextDocument({
        content: response.logs,
        language: "log"
      });
      await vscode.window.showTextDocument(document, { preview: true });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not load node logs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return;
  }
  const containerId = node.cID;

  if (!containerId) {
    vscode.window.showErrorMessage("No containerID for logs.");
    return;
  }

  const container = node.name || containerId;

  const config = vscode.workspace.getConfiguration("containerlab");
  const runtime = config.get<string>("runtime", "docker");
  execCommandInTerminal(`${runtime} logs -f ${containerId}`, `Logs - ${container}`);
}
