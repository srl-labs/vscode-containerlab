import * as vscode from "vscode";
import * as path from "path";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export async function addLabFolderToWorkspace(node: ContainerlabNode) {
  if (!node?.details?.labPath) {
    vscode.window.showErrorMessage("No lab path found for this lab.");
    return;
  }

  // Get the folder that contains the .clab.yaml
  const folderPath = path.dirname(node.details.labPath);

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
    `Added "${node.label}" to your workspace.`
  );
}
