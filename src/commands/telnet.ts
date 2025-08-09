import * as vscode from "vscode";
import * as utils from "../helpers/utils";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../treeView/common";

export function telnetToNode(node: ClabContainerTreeNode | undefined): void {
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

  const config = vscode.workspace.getConfiguration("containerlab");
  const port = (config.get("node.telnetPort") as number) || 5000;
  const runtime = config.get<string>("runtime", "docker");

  execCommandInTerminal(
    `${utils.getSudo()}${runtime} exec -it ${containerId} telnet 127.0.0.1 ${port}`,
    `Telnet - ${containerLabel}`
  );
}
