import * as vscode from "vscode";
import * as utils from "../utils";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function copyLabPath(node: ContainerlabNode) {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }

    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found.');
      return;
    }

    const labName = node.details?.labName ? node.details?.labName : utils.getRelativeFolderPath(labPath);
    
    vscode.env.clipboard.writeText(labPath).then(() => {
        vscode.window.showInformationMessage(`Copied file path of ${labName} to clipboard.`);
    });
}