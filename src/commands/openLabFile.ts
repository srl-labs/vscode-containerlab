import * as vscode from "vscode";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function openLabFile(node: ContainerlabNode) {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }

    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found.');
      return;
    }
    
    const uri = vscode.Uri.file(labPath);
    vscode.commands.executeCommand('vscode.open', uri);
}