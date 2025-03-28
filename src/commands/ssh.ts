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

    // Get the SSH user mapping from user settings
    const config = vscode.workspace.getConfiguration("containerlab");
    const userSshMapping = config.get("node.sshUserMapping") as { [key: string]: string };

    // Use user setting first, then default mapping, then fallback to "admin"
    const sshUser = userSshMapping?.[node.kind] || sshUserMapping[node.kind] || "admin";

    const containerLabel = node.label || "Container";

    execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${containerLabel}`);
}