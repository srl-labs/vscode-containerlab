import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function sshToNode(node: ContainerlabNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }

    const sshIp = node.details?.sshIp;
    const containerLabel = node.label || "Container";

    if (!sshIp) {
        vscode.window.showErrorMessage('No IP found for SSH.');
        return;
    }

    // Pull the default SSH user from settings
    const config = vscode.workspace.getConfiguration("containerlab");
    const sshUser = config.get<string>("defaultSshUser", "admin");

    execCommandInTerminal(`ssh ${sshUser}@${sshIp}`, `SSH - ${containerLabel}`);
}