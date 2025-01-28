import * as vscode from "vscode";
import * as path from "path";
import { ClabLabTreeNode } from "../clabTreeDataProvider";

export async function addLabFolderToWorkspace(node: ClabLabTreeNode) {
  if (!node.labPath.absolute) {
    return new Error("No lab path found for this lab")
  }

  // Get the folder that contains the .clab.yaml
  const folderPath = path.dirname(node.labPath.absolute);

  // Add it to the current workspace
  const existingCount = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders.length
    : 0;

  vscode.workspace.updateWorkspaceFolders(
    existingCount,
    null,
    {
      uri: vscode.Uri.file(folderPath),
      name: node.label // or any other display name
    }
  );

  vscode.window.showInformationMessage(
    `Added "${node.name}" to your workspace.`
  );
}
