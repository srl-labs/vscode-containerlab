import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import { favoriteLabs, extensionContext, localLabsProvider } from "../globals";

export async function toggleFavorite(node: ClabLabTreeNode) {
  if (!node?.labPath?.absolute) {
    return;
  }
  const absPath = node.labPath.absolute;
  if (favoriteLabs.has(absPath)) {
    favoriteLabs.delete(absPath);
    await extensionContext.globalState.update("favoriteLabs", Array.from(favoriteLabs));
    vscode.window.showInformationMessage("Removed favorite lab");
  } else {
    favoriteLabs.add(absPath);
    await extensionContext.globalState.update("favoriteLabs", Array.from(favoriteLabs));
    vscode.window.showInformationMessage("Marked lab as favorite");
  }
  localLabsProvider.forceRefresh();
}
