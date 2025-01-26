import * as vscode from "vscode";
import * as path from "path";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export async function openFolderInNewWindow(node: ContainerlabNode) {
    if (!node.details?.labPath) {
        vscode.window.showErrorMessage("No lab path found for this lab.");
        return;
    }

    // The folder that contains the .clab.(yml|yaml)
    const folderPath = path.dirname(node.details.labPath);
    const uri = vscode.Uri.file(folderPath);

    // Force opening that folder in a brand-new window
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
        forceNewWindow: true
    });
}