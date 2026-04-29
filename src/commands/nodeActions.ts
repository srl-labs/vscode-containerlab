import * as vscode from "vscode";

import { ClabLabTreeNode, type ClabContainerTreeNode } from "../treeView/common";
import * as utils from "../utils";

import { ClabCommand } from "./clabCommand";
import {
  createTopoViewerLifecycleHandlers,
  notifyCurrentTopoViewerOfCommandFailure
} from "./graph";

type TopologyNodeLifecycleAction = "start" | "stop" | "restart";

async function runNodeAction(
  action: utils.ContainerAction,
  node?: ClabContainerTreeNode
): Promise<void> {
  if (node === undefined) {
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

export async function startNode(node?: ClabContainerTreeNode): Promise<void> {
  await runTopologyNodeLifecycleAction("start", node);
}

export async function stopNode(node?: ClabContainerTreeNode): Promise<void> {
  await runTopologyNodeLifecycleAction("stop", node);
}

export async function restartNode(node?: ClabContainerTreeNode): Promise<void> {
  await runTopologyNodeLifecycleAction("restart", node);
}

export async function pauseNode(node?: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Pause, node);
}

export async function unpauseNode(node?: ClabContainerTreeNode): Promise<void> {
  await runNodeAction(utils.ContainerAction.Unpause, node);
}

function resolveTopologyNodeName(node: ClabContainerTreeNode): string {
  if (typeof node.rootNodeName === "string" && node.rootNodeName.trim().length > 0) {
    return node.rootNodeName;
  }

  if (node.name_short.trim().length > 0) {
    return node.name_short;
  }

  return node.name;
}

async function runTopologyNodeLifecycleAction(
  action: TopologyNodeLifecycleAction,
  node?: ClabContainerTreeNode
): Promise<void> {
  if (node === undefined) {
    const error = new Error("No container node selected.");
    vscode.window.showErrorMessage(error.message);
    await notifyCurrentTopoViewerOfCommandFailure(action, error);
    return;
  }

  const nodeName = resolveTopologyNodeName(node).trim();
  if (!nodeName) {
    const error = new Error("No topology node name found.");
    vscode.window.showErrorMessage(error.message);
    await notifyCurrentTopoViewerOfCommandFailure(action, error);
    return;
  }

  if (!node.labPath.absolute) {
    const error = new Error("No lab path found.");
    vscode.window.showErrorMessage(error.message);
    await notifyCurrentTopoViewerOfCommandFailure(action, error);
    return;
  }

  const labNode = new ClabLabTreeNode("", vscode.TreeItemCollapsibleState.None, node.labPath);
  const handlers = createTopoViewerLifecycleHandlers(action);
  const cmd = new ClabCommand(
    action,
    labNode,
    undefined,
    undefined,
    undefined,
    handlers.onSuccess,
    handlers.onFailure,
    handlers.onOutputLine
  );

  await cmd.run(["--node", nodeName]);
}
