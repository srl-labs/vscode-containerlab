import * as vscode from "vscode";
import * as utils from "../utils"
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode } from "../treeView/common";

export function telnetToNode(node: ClabContainerTreeNode) {
  if (!node) {
    return new Error("No container node selected.")
  }

  const containerId = node.cID;
  const containerKind = node.kind;
  const containerLabel = node.label || "Container";

  if (!containerId) { return vscode.window.showErrorMessage('No containerId for shell attach.'); }
  if (!containerKind) { return vscode.window.showErrorMessage('No container kind for shell attach.'); }


  const config = vscode.workspace.getConfiguration("containerlab");
  const port = config.get("node.telnetPort") as number || 5000;
  const runtime = config.get<string>("runtime", "docker");

  execCommandInTerminal(
    `${utils.getSudo()}${runtime} exec -it ${containerId} telnet 127.0.0.1 ${port}`,
    `Telnet - ${containerLabel}`
  );
}
