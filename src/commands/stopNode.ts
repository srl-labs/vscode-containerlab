import * as vscode from "vscode";
import  { execCommandInTerminal } from './command'
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

    execCommandInTerminal(`sudo docker stop ${containerId}`, `Start - ${containerLabel}`)
}