// src/commands/save.ts
import * as vscode from "vscode";
import { SpinnerMsg } from "./command";
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

  const spinnerMessages: SpinnerMsg = {
    progressMsg: `Saving lab configuration for ${node.label}...`,
    successMsg: `Lab configuration for ${node.label} saved successfully!`,
    failMsg: `Could not save lab configuration for ${node.label}`
  };

  // Create a ClabCommand for "save" using the lab node.
  const saveCmd = new ClabCommand("save", node, spinnerMessages);
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

  const spinnerMessages: SpinnerMsg = {
    progressMsg: `Saving configuration for node ${shortNodeName}...`,
    successMsg: `Configuration for node ${shortNodeName} saved successfully!`,
    failMsg: `Could not save configuration for node ${shortNodeName}`
  };

  const tempLabNode = new ClabLabTreeNode(
    path.basename(node.labPath.absolute),
    vscode.TreeItemCollapsibleState.None,
    node.labPath,
    undefined,
    undefined,
    undefined,
    "containerlabLabDeployed"
  );

  const saveCmd = new ClabCommand("save", tempLabNode, spinnerMessages);
  // Use --node-filter instead of -n and use the short name
  saveCmd.run(["--node-filter", shortNodeName]);
}
