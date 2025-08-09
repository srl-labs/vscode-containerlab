import * as vscode from "vscode";
import * as utils from "../helpers/utils";
import { execCommandInTerminal } from "./command";
import { execCmdMapping } from "../extension";
import { ClabContainerTreeNode } from "../treeView/common";

export function attachShell(node: ClabContainerTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.cID;
  const containerKind = node.kind;
  const containerLabel = node.label || "Container";

  if (!containerId) {
    vscode.window.showErrorMessage('No containerId for shell attach.');
    return;
  }
  if (!containerKind) {
    vscode.window.showErrorMessage('No container kind for shell attach.');
    return;
  }

  let execCmd = (execCmdMapping as any)[containerKind] || "sh";

  const config = vscode.workspace.getConfiguration("containerlab");
  const userExecMapping = config.get("node.execCommandMapping") as { [key: string]: string };
  const runtime = config.get<string>("runtime", "docker");

  execCmd = userExecMapping[containerKind] || execCmd;

  execCommandInTerminal(
    `${utils.getSudo()}${runtime} exec -it ${containerId} ${execCmd}`,
    `Shell - ${containerLabel}`
  );
}
