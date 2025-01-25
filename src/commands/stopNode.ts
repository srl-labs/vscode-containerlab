import * as vscode from "vscode";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { SpinnerMsg } from "./command";
import { DockerCommand } from "./dockerCommand";


export async function stopNode(node: ContainerlabNode) {
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
    progressMsg: `Stopping node ${containerId}...`,
    successMsg: `Node '${containerId}' stopped successfully`,
    failMsg: `Could not stop node '${containerId}'`
  }

  const startCmd = new DockerCommand("stop", spinnerMessages);
  startCmd.run(containerId);
}