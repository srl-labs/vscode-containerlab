import * as path from "path";

import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import { localLabPath } from "./backendGuards";

export async function openFolderInNewWindow(node: ClabLabTreeNode) {
  const labPath = localLabPath(node, "Open folder");
  if (!labPath) {
    if (!node.labRef?.remotePath) {
      vscode.window.showErrorMessage("No lab path found for this lab.");
    }
    return;
  }

  // The folder that contains the .clab.(yml|yaml)
  const folderPath = path.dirname(labPath);
  const uri = vscode.Uri.file(folderPath);

  // Force opening that folder in a brand-new window
  await vscode.commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: true
  });
}
