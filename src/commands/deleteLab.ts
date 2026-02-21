import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import { favoriteLabs, extensionContext } from "../globals";

export async function deleteLab(node: ClabLabTreeNode) {
  const filePath = node.labPath.absolute;
  if (filePath.length === 0) {
    vscode.window.showErrorMessage("No lab file found.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete lab "${path.basename(filePath)}"? This action cannot be undone.`,
    { modal: true },
    "Delete"
  );
  if (confirm !== "Delete") {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
    favoriteLabs.delete(filePath);
    await extensionContext.globalState.update("favoriteLabs", Array.from(favoriteLabs));
    vscode.window.showInformationMessage(`Deleted lab file ${node.label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to delete lab: ${msg}`);
  }
}
