import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";

import { editableLabPath } from "./backendGuards";

export async function openLabFile(node?: ClabLabTreeNode) {
  if (node === undefined) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }

  const labPath = await editableLabPath(node, "Open topology");
  if (!labPath) {
    vscode.window.showErrorMessage("No labPath found.");
    return;
  }

  const uri = vscode.Uri.file(labPath);
  vscode.commands.executeCommand("vscode.open", uri);
}
