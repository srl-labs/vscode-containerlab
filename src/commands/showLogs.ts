import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";
import { getSudo } from "../utils";

export function showLogs(node: ClabContainerTreeNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }
    const containerId = node.cID;
    const containerLabel = node.label || "Container";

    if (!containerId) {
        vscode.window.showErrorMessage('No containerID for logs.');
        return;
    }
    
    execCommandInTerminal(
      `${getSudo()}docker logs -f ${containerId}`,
      `Logs - ${containerLabel}`
    );
}