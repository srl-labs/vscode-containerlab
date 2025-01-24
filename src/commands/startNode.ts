import * as vscode from "vscode";
import { execCommandInOutput } from './command';  // we use the Output version now
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function startNode(node: ContainerlabNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }

    const containerId = node.details?.containerId;
    const containerLabel = node.label || "Container";
    if (!containerId) {
        vscode.window.showErrorMessage('No containerId found.');
        return;
    }

    // Check whether we use 'sudo'
    const config = vscode.workspace.getConfiguration("containerlab");
    const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

    // Use execCommandInOutput so it prints to the Output panel
    const cmd = `${useSudo ? "sudo " : ""}docker start ${containerId}`;
    execCommandInOutput(cmd);

    // Optionally, you could append a label in your output if you want
    // outputChannel.appendLine(`Starting node: ${containerLabel}`);
}