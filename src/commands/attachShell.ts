import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { execCmdMapping } from "../extension";

export function attachShell(node: ContainerlabNode) {
    if (!node) {
        vscode.window.showErrorMessage('No container node selected.');
        return;
    }

    const nodeDetails = node.details;

    if(!nodeDetails) { return vscode.window.showErrorMessage("Couldn't fetch node details");}

    const containerId = nodeDetails.containerId;
    const containerKind = nodeDetails.kind;
    const containerLabel = node.label || "Container";

    if (!containerId) { return vscode.window.showErrorMessage('No containerId for shell attach.');}
    if (!containerKind) { return vscode.window.showErrorMessage('No container kind for shell attach.');}

    let execCmd = execCmdMapping[containerKind] || "sh";

    // Use the sudoEnabledByDefault setting
    const config = vscode.workspace.getConfiguration("containerlab");
    const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

    const userExecMapping = config.get("node.execCommandMapping") as { [key: string]: string };

    execCmd = userExecMapping[containerKind] || execCmd;

    execCommandInTerminal(
      `${useSudo ? "sudo " : ""}docker exec -it ${containerId} ${execCmd}`,
      `Shell - ${containerLabel}`
    );
}