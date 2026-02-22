// src/commands/save.ts
import * as path from "path";

import * as vscode from "vscode";

import type { ClabContainerTreeNode } from "../treeView/common";
import { ClabLabTreeNode } from "../treeView/common";

import { ClabCommand } from "./clabCommand";

/**
 * Save the entire lab configuration.
 * Executes: containerlab -t <labPath> save
 */
export async function saveLab(node: ClabLabTreeNode) {
  const labPath = node.labPath.absolute;
  if (labPath.length === 0) {
    vscode.window.showErrorMessage("No labPath found for the lab.");
    return;
  }

  // Create a ClabCommand for "save" using the lab node.
  const saveCmd = new ClabCommand("save", node);
  // ClabCommand automatically appends "-t <labPath>".
  void saveCmd.run();
}

/**
 * Save the configuration for a specific container node.
 * Executes: containerlab -t <labPath> save --node-filter <shortNodeName>
 */
export async function saveNode(node: ClabContainerTreeNode) {
  if (node.labPath.absolute.length === 0) {
    vscode.window.showErrorMessage("Error: Could not determine lab path for this node.");
    return;
  }

  // Use the short node name if available to support custom prefixes
  const shortNodeName = node.name_short;

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
  void saveCmd.run(["--node-filter", shortNodeName]);
}
