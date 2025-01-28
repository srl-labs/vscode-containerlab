import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";

export function sshToNode(node: ClabContainerTreeNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }

    let sshTarget: string | undefined;

    if(node.name) {sshTarget = node.name}
    else if(node.v6Address) {sshTarget = node.v6Address;}
    else if(node.v4Address) {sshTarget = node.v4Address}
    else if(node.cID) {sshTarget = node.cID}
    else { return vscode.window.showErrorMessage("No target to connect to container"); }

    // Pull the default SSH user from settings
    const config = vscode.workspace.getConfiguration("containerlab");
    const sshUser = config.get<string>("defaultSshUser", "admin");

    const containerLabel = node.label || "Container";

    execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${containerLabel}`);
}