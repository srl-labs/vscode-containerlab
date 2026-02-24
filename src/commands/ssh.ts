import * as vscode from "vscode";

import {
  type ClabContainerTreeNode,
  type ClabLabTreeNode,
  flattenContainers
} from "../treeView/common";
import { sshUserMapping } from "../globals";

import { execCommandInTerminal } from "./command";

function resolveDistributedSrosSshTarget(node: ClabContainerTreeNode): string | undefined {
  if (node.kind !== "nokia_srsim") {
    return undefined;
  }

  const rootNodeName = node.rootNodeName?.trim();
  if (rootNodeName === undefined || rootNodeName.length === 0 || node.name.length === 0) {
    return undefined;
  }

  const fullName = node.name.trim();
  const shortName = node.name_short.trim();
  if (shortName.length > 0 && shortName.length < fullName.length && fullName.endsWith(shortName)) {
    return `${fullName.slice(0, fullName.length - shortName.length)}${rootNodeName}`;
  }

  const suffixSeparator = fullName.lastIndexOf("-");
  if (suffixSeparator > 0) {
    return fullName.slice(0, suffixSeparator);
  }

  return undefined;
}

function resolveSshTarget(node: ClabContainerTreeNode): string | undefined {
  const distributedSrosTarget = resolveDistributedSrosSshTarget(node);
  if (distributedSrosTarget !== undefined && distributedSrosTarget.length > 0) {
    return distributedSrosTarget;
  }
  if (node.name.length > 0) {
    return node.name;
  }
  if (node.v6Address !== undefined && node.v6Address.length > 0) {
    return node.v6Address;
  }
  if (node.v4Address !== undefined && node.v4Address.length > 0) {
    return node.v4Address;
  }
  if (node.cID.length > 0) {
    return node.cID;
  }
  return undefined;
}

export function sshToNode(node: ClabContainerTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const sshTarget = resolveSshTarget(node);
  if (sshTarget === undefined) {
    vscode.window.showErrorMessage("No target to connect to container");
    return;
  }

  // Get the SSH user mapping from user settings
  const config = vscode.workspace.getConfiguration("containerlab");
  const userSshMapping = config.get<Partial<Record<string, string>>>("node.sshUserMapping", {});
  const defaultMapping = sshUserMapping as Partial<Record<string, string>>;

  // Use user setting first, then default mapping, then fallback to "admin"
  const sshUser = userSshMapping[node.kind] ?? defaultMapping[node.kind] ?? "admin";

  execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${sshTarget}`, true);
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
