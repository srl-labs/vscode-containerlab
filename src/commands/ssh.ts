import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";
import { sshUserMapping } from "../extension";

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
    const defaultSshUser = config.get<string>("defaultSshUser", "admin");

    // Check for a kind-specific SSH user in user settings, then in defaults
    const userSshMapping = config.get("node.sshUserMapping") as { [key: string]: string };
    const sshUser = userSshMapping?.[node.kind] || sshUserMapping[node.kind] || defaultSshUser;

    const containerLabel = node.label || "Container";

    execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${containerLabel}`);
}