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

    if (!containerId) {
        vscode.window.showErrorMessage('No containerID for logs.');
        return;
    }

    const container = node.name || containerId

    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    execCommandInTerminal(
        `${getSudo()}${runtime} logs -f ${containerId}`,
        `Logs - ${container}`
    );
}