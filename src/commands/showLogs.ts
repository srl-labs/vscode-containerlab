import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../treeView/common";
import { getSudo } from "../helpers/utils";

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

    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    execCommandInTerminal(
        `${getSudo()}${runtime} logs -f ${containerId}`,
        `Logs - ${containerLabel}`
    );
}