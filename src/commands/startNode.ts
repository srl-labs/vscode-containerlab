import * as vscode from "vscode";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { SpinnerMsg } from "./command";
import { DockerCommand } from "./dockerCommand";


export async function startNode(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.details?.containerId;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId found.");
    return;
  }

  const spinnerMessages: SpinnerMsg = {
    progressMsg: `Starting node ${containerId}...`,
    successMsg: `Node '${containerId}' started successfully`,
    failMsg: `Could not start node '${containerId}'`
  }

  const startCmd = new DockerCommand("start", spinnerMessages);
  startCmd.run(containerId);

}