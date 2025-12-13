import * as vscode from "vscode";
import { execCommandInTerminal } from "./command";
import { ClabContainerTreeNode, ClabLabTreeNode } from "../treeView/common";
import { sshUserMapping } from "../extension";

export function sshToNode(node: ClabContainerTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage('No container node selected.');
    return;
  }

  let sshTarget: string | undefined;

  if (node.name) { sshTarget = node.name; }
  else if (node.v6Address) { sshTarget = node.v6Address; }
  else if (node.v4Address) { sshTarget = node.v4Address; }
  else if (node.cID) { sshTarget = node.cID; }
  else {
    vscode.window.showErrorMessage("No target to connect to container");
    return;
  }

  // Get the SSH user mapping from user settings
  const config = vscode.workspace.getConfiguration("containerlab");
  const userSshMapping = config.get("node.sshUserMapping") as { [key: string]: string };

  // Use user setting first, then default mapping, then fallback to "admin"
  const sshUser = userSshMapping?.[node.kind] || (sshUserMapping as any)[node.kind] || "admin";

  const container = node.name || node.cID || "Container";

  execCommandInTerminal(`ssh ${sshUser}@${sshTarget}`, `SSH - ${container}`, true);
}

export function sshToLab(node: ClabLabTreeNode | undefined): void {
  if (!node) {
    vscode.window.showErrorMessage('No lab node selected.');
    return;
  }

  if (!node.containers) {
    vscode.window.showErrorMessage("No child containers to connect to");
    return;
  }

  node.containers.forEach((c) => {
    sshToNode(c);
  });
}
