import * as vscode from "vscode";
import { SpinnerMsg } from "./command";
import { DockerCommand } from "./dockerCommand";
import { ClabContainerTreeNode } from "../treeView/common";


export async function startNode(node: ClabContainerTreeNode) {
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
    progressMsg: `Starting node ${containerId}...`,
    successMsg: `Node '${containerId}' started successfully`,
    failMsg: `Could not start node '${containerId}'`
  };

  const startCmd = new DockerCommand("start", spinnerMessages);
  startCmd.run(containerId);

}