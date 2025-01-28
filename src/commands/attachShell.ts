import * as vscode from "vscode";
import * as utils from "../utils"
import { execCommandInTerminal } from "./command";
import { execCmdMapping } from "../extension";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";

export function attachShell(node: ClabContainerTreeNode) {
    if (!node) {
        return new Error("No container node selected.")
    }

    const containerId = node.cID;
    const containerKind = node.kind;
    const containerLabel = node.label || "Container";

    if (!containerId) { return vscode.window.showErrorMessage('No containerId for shell attach.');}
    if (!containerKind) { return vscode.window.showErrorMessage('No container kind for shell attach.');}

    // get any default shell action from the exec_cmd.json file. Default action is 'sh'.
    let execCmd = execCmdMapping[containerKind] || "sh";

    // get any user custom shell action mappings from settings.
    const userExecMapping = vscode.workspace.getConfiguration("containerlab").config.get("node.execCommandMapping") as { [key: string]: string };

    execCmd = userExecMapping[containerKind] || execCmd;

    execCommandInTerminal(
      `${utils.getSudo()}docker exec -it ${containerId} ${execCmd}`,
      `Shell - ${containerLabel}`
    );
}