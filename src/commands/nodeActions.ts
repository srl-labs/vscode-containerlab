import * as vscode from "vscode";
import { SpinnerMsg } from "./command";
import { DockerCommand } from "./dockerCommand";
import { ClabContainerTreeNode } from "../treeView/common";

async function runNodeAction(action: "start" | "stop", node: ClabContainerTreeNode): Promise<void> {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.cID;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId found.");
    return;
  }

  const verb = action === "start" ? "Starting" : "Stopping";
  const past = action === "start" ? "started" : "stopped";

  const spinnerMessages: SpinnerMsg = {
    progressMsg: `${verb} node ${containerId}...`,
    successMsg: `Node '${containerId}' ${past} successfully`,
    failMsg: `Could not ${action} node '${containerId}'`,
  };

  const cmd = new DockerCommand(action, spinnerMessages);
  cmd.run(containerId);
}

export async function startNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction("start", node);
}

export async function stopNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction("stop", node);
}
