import * as vscode from "vscode";

import {
  type ClabContainerTreeNode,
  type ClabLabTreeNode,
  flattenContainers,
} from "../treeView/common";
import { sshUserMapping } from "../globals";

import { execCommandInTerminal } from "./command";

export function sshToNode(node: ClabContainerTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  let sshTarget: string | undefined;

  if (node.name) {
    sshTarget = node.name;
  } else if (node.v6Address !== undefined && node.v6Address.length > 0) {
    sshTarget = node.v6Address;
  } else if (node.v4Address !== undefined && node.v4Address.length > 0) {
    sshTarget = node.v4Address;
  } else if (node.cID) {
    sshTarget = node.cID;
  } else {
    vscode.window.showErrorMessage("No target to connect to container");
    return;
  }

  // Get the SSH user mapping from user settings
  const config = vscode.workspace.getConfiguration("containerlab");
  const userSshMapping = config.get<Partial<Record<string, string>>>("node.sshUserMapping", {});
  const defaultMapping = sshUserMapping as Partial<Record<string, string>>;

  // Use user setting first, then default mapping, then fallback to "admin"
  const sshUser = userSshMapping[node.kind] ?? defaultMapping[node.kind] ?? "admin";

  let container = "Container";
  if (node.name.length > 0) {
    container = node.name;
  } else if (node.cID.length > 0) {
    container = node.cID;
  }

  execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${container}`, true);
}

export function sshToLab(node: ClabLabTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }

  if (!node.containers) {
    vscode.window.showErrorMessage("No child containers to connect to");
    return;
  }

  flattenContainers(node.containers).forEach((c) => {
    sshToNode(c);
  });
}
