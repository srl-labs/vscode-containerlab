import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

export function sshToNode(node: ContainerlabNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }

    let sshTarget: string | undefined;

    if(node.details?.hostname) {sshTarget = node.details?.hostname;}
    else if(node.details?.v6Addr) {sshTarget = node.details?.hostname;}
    else if(node.details?.v4Addr) {sshTarget = node.details?.v4Addr;}
    else if(node.details?.containerId) {sshTarget = node.details?.containerId;}
    else {return vscode.window.showErrorMessage("No target to connect to container");}

    // Pull the default SSH user from settings
    const config = vscode.workspace.getConfiguration("containerlab");
    const sshUser = config.get<string>("defaultSshUser", "admin");

    const containerLabel = node.label || "Container";

    execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${containerLabel}`);
}