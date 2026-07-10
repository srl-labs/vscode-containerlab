import * as vscode from "vscode";

import { apiLabFavoriteKey } from "../backends/labIdentity";
import type { ClabLabTreeNode } from "../treeView/common";
import {
  favoriteApiLabs,
  favoriteLabs,
  extensionContext,
  localLabsProvider,
  runningLabsProvider
} from "../globals";

import { localLabPath } from "./backendGuards";

export async function toggleFavorite(node: ClabLabTreeNode) {
  const apiKey = apiLabFavoriteKey(node.labRef);
  if (apiKey !== undefined) {
    const wasFavorite = favoriteApiLabs.delete(apiKey);
    if (!wasFavorite) favoriteApiLabs.add(apiKey);
    await extensionContext.globalState.update("favoriteApiLabs", Array.from(favoriteApiLabs));
    vscode.window.showInformationMessage(
      wasFavorite ? "Removed favorite API lab" : "Marked API lab as favorite"
    );
    runningLabsProvider.refreshWithoutDiscovery();
    return;
  }

  const absPath = localLabPath(node, "Favorite topology");
  if (!absPath) {
    return;
  }

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
