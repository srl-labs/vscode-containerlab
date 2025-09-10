// src/commands/save.ts
import * as vscode from "vscode";
import { ClabCommand } from "./clabCommand";
import { ClabLabTreeNode, ClabContainerTreeNode } from "../treeView/common";
import * as path from "path";

/**
 * Save the entire lab configuration.
 * Executes: containerlab -t <labPath> save
 */
export async function saveLab(node: ClabLabTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }
  const labPath = node.labPath && node.labPath.absolute;
  if (!labPath) {
    vscode.window.showErrorMessage("No labPath found for the lab.");
    return;
  }

  // Create a ClabCommand for "save" using the lab node.
  const saveCmd = new ClabCommand("save", node);
  // ClabCommand automatically appends "-t <labPath>".
  saveCmd.run();
}

/**
 * Save the configuration for a specific container node.
 * Executes: containerlab -t <labPath> save --node-filter <shortNodeName>
 */
export async function saveNode(node: ClabContainerTreeNode) {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  if (!node.labPath || !node.labPath.absolute) {
    vscode.window.showErrorMessage("Error: Could not determine lab path for this node.");
    return;
  }

  // Extract the short node name by removing the "clab-{labname}-" prefix
  const shortNodeName = node.name.replace(/^clab-[^-]+-/, '');

  const tempLabNode = new ClabLabTreeNode(
    path.basename(node.labPath.absolute),
    vscode.TreeItemCollapsibleState.None,
    node.labPath,
    undefined,
    undefined,
    undefined,
    "containerlabLabDeployed"
  );

  const saveCmd = new ClabCommand("save", tempLabNode);
  // Use --node-filter instead of -n and use the short name
  saveCmd.run(["--node-filter", shortNodeName]);
}
