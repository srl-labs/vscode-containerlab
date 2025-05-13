import * as vscode from "vscode";
import { SpinnerMsg } from "./command";
import { DockerCommand } from "./dockerCommand";
import { ClabContainerTreeNode } from "../treeView/common";


export async function stopNode(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.cID;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId found.");
    return;
  }

  const spinnerMessages: SpinnerMsg = {
    progressMsg: `Stopping node ${containerId}...`,
    successMsg: `Node '${containerId}' stopped successfully`,
    failMsg: `Could not stop node '${containerId}'`
  };

  const startCmd = new DockerCommand("stop", spinnerMessages);
  startCmd.run(containerId);
}