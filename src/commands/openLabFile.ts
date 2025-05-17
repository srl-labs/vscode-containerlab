import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";

export function openLabFile(node: ClabLabTreeNode) {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }

    const labPath = node.labPath.absolute;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found.');
      return;
    }
    
    const uri = vscode.Uri.file(labPath);
    vscode.commands.executeCommand('vscode.open', uri);
}