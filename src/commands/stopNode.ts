import * as vscode from "vscode";
import { execCommandInOutput } from './command';
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function stopNode(node: ContainerlabNode) {
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

    const cmd = `${useSudo ? "sudo " : ""}docker stop ${containerId}`;
    execCommandInOutput(cmd);
}