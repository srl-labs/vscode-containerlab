import * as path from "path";

import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";

import { localLabPath } from "./backendGuards";

export async function addLabFolderToWorkspace(node: ClabLabTreeNode): Promise<void> {
  const labPath = localLabPath(node, "Add lab folder to workspace");
  if (!labPath) {
    vscode.window.showErrorMessage("No lab path found for this lab");
    return;
  }

  // Get the folder that contains the .clab.yaml
  const folderPath = path.dirname(labPath);

  // Add it to the current workspace
  const existingCount = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders.length
    : 0;

  vscode.workspace.updateWorkspaceFolders(existingCount, null, {
    uri: vscode.Uri.file(folderPath),
    name: node.label // or any other display name
  });

  vscode.window.showInformationMessage(`Added "${node.name}" to your workspace.`);
}
