import * as vscode from "vscode";

import type { ClabContainerTreeNode } from "../treeView/common";
import * as utils from "../utils";

async function runNodeAction(
  action: utils.ContainerAction,
  node: ClabContainerTreeNode
): Promise<void> {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.cID;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId found.");
    return;
  }

  await utils.runContainerAction(containerId, action);
}

export async function startNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Start, node);
}

export async function stopNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Stop, node);
}

export async function pauseNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Pause, node);
}

export async function unpauseNode(node: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Unpause, node);
}
