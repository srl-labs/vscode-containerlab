import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import { favoriteLabs, extensionContext } from "../globals";
import { getBackendForResource } from "../backends/manager";
import { ApiContainerlabBackend } from "../backends/api/apiContainerlabBackend";

import { localLabPath } from "./backendGuards";

export async function deleteLab(node: ClabLabTreeNode) {
  const backend = getBackendForResource(node);
  if (node.labRef.remotePath && backend instanceof ApiContainerlabBackend) {
    const labName = node.labRef.labName ?? node.name;
    if (!labName) {
      vscode.window.showErrorMessage("Could not determine the API lab to delete.");
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      `Delete remote topology "${node.labRef.remotePath}" from ${backend.getConnectionInfo().url}?`,
      { modal: true },
      "Delete"
    );
    if (confirm !== "Delete") return;
    try {
      await backend.deleteTopologyFile(labName, node.labRef.remotePath);
      vscode.window.showInformationMessage(`Deleted remote topology ${node.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to delete remote topology: ${message}`);
    }
    return;
  }

  const filePath = localLabPath(node, "Delete topology");
  if (!filePath) {
    vscode.window.showErrorMessage("No lab file found.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete lab "${path.basename(filePath)}"? This action cannot be undone.`,
    { modal: true },
    "Delete"
  );
  if (confirm !== "Delete") {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
    favoriteLabs.delete(filePath);
    await extensionContext.globalState.update("favoriteLabs", Array.from(favoriteLabs));
    vscode.window.showInformationMessage(`Deleted lab file ${node.label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to delete lab: ${msg}`);
  }
}
