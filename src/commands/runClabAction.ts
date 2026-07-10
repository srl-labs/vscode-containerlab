import * as vscode from "vscode";

import { ClabLabTreeNode } from "../treeView/common";
import { getSelectedLabNode } from "./selectedLabNode";
import { getBackendForResource, listConnectedBackends } from "../backends/manager";
import { backendHasCapability, type ContainerlabBackend } from "../backends/types";

import {
  createTopoViewerLifecycleHandlers,
  notifyCurrentTopoViewerOfCommandFailure,
  type LifecycleCommandType
} from "./graph";

export type LabLifecycleAction = LifecycleCommandType;

function backendLabel(backend: ContainerlabBackend): string {
  if (backend.kind === "local") return "Local containerlab";
  const identity = backend.id.replace(/^api:/u, "");
  const separator = identity.lastIndexOf("#");
  if (separator === -1) return identity;
  const url = identity.slice(0, separator);
  const username = decodeURIComponent(identity.slice(separator + 1));
  return `${url} (${username})`;
}

function routeNodeToBackend(node: ClabLabTreeNode, backendId: string): ClabLabTreeNode {
  const localPath =
    node.labRef.localPath ?? (node.labPath.absolute.length > 0 ? node.labPath.absolute : undefined);
  return new ClabLabTreeNode(
    node.label,
    node.collapsibleState ?? vscode.TreeItemCollapsibleState.None,
    node.labPath,
    node.name,
    node.owner,
    node.containers,
    node.contextValue,
    node.favorite,
    node.sshxLink,
    node.gottyLink,
    {
      backendId,
      ...(node.labRef.labName !== undefined ? { labName: node.labRef.labName } : {}),
      ...(localPath !== undefined ? { localPath } : {}),
      ...(node.labRef.remotePath !== undefined ? { remotePath: node.labRef.remotePath } : {}),
      ...(node.labRef.sourceLabName !== undefined
        ? { sourceLabName: node.labRef.sourceLabName }
        : {}),
      ...(node.labRef.sourcePath !== undefined ? { sourcePath: node.labRef.sourcePath } : {})
    }
  );
}

async function selectDeployBackend(node: ClabLabTreeNode): Promise<ClabLabTreeNode | undefined> {
  if (
    typeof node.contextValue !== "string" ||
    !node.contextValue.includes("containerlabLabUndeployed")
  ) {
    return node;
  }
  if (node.labRef.remotePath) {
    const owner = getBackendForResource(node);
    if (backendHasCapability(owner, "lab-lifecycle")) return node;
  }
  const backends = listConnectedBackends().filter((backend) =>
    backendHasCapability(backend, "lab-lifecycle")
  );
  if (backends.length === 0) return node;
  if (backends.length === 1) return routeNodeToBackend(node, backends[0].id);

  const selected = await vscode.window.showQuickPick(
    backends.map((backend) => ({ label: backendLabel(backend), backend })),
    {
      title: "Deploy with",
      placeHolder: "Choose the local runtime or a connected clab-api-server"
    }
  );
  return selected === undefined ? undefined : routeNodeToBackend(node, selected.backend.id);
}

export async function runClabAction(
  action: LabLifecycleAction,
  node?: ClabLabTreeNode,
  cleanup = false
): Promise<void> {
  node = await getSelectedLabNode(node);
  if (!node) {
    await notifyCurrentTopoViewerOfCommandFailure(action, new Error("No lab node selected"));
    return;
  }
  if (action === "deploy") {
    node = await selectDeployBackend(node);
    if (node === undefined) {
      await notifyCurrentTopoViewerOfCommandFailure(action, new Error("Operation cancelled"));
      return;
    }
  }
  const backend = getBackendForResource(node);
  if (!backendHasCapability(backend, "lab-lifecycle")) {
    const error = new Error(
      `Lab lifecycle actions are not supported by backend '${node.labRef.backendId}'.`
    );
    await notifyCurrentTopoViewerOfCommandFailure(action, error);
    vscode.window.showInformationMessage(error.message);
    return;
  }

  const execute = async () => {
    const handlers = createTopoViewerLifecycleHandlers(action);
    await backend.runLabLifecycle({
      action,
      node,
      cleanup,
      ...handlers
    });
  };

  if (cleanup) {
    const config = vscode.workspace.getConfiguration("containerlab");
    const skipWarning = config.get<boolean>("skipCleanupWarning", false);
    if (!skipWarning) {
      const selection = await vscode.window.showWarningMessage(
        `WARNING: ${action.charAt(0).toUpperCase() + action.slice(1)} (cleanup) will remove all configuration artifacts.. Are you sure you want to proceed?`,
        { modal: true },
        "Yes",
        "Don't warn me again"
      );
      if (!selection) {
        await notifyCurrentTopoViewerOfCommandFailure(
          action,
          new Error("Operation cancelled by user")
        );
        return;
      }
      if (selection === "Don't warn me again") {
        await config.update("skipCleanupWarning", true, vscode.ConfigurationTarget.Global);
      }
    }
  }

  await execute();
}
