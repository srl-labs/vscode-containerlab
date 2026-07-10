import * as vscode from "vscode";

import { pickPopularRepo } from "../helpers/popularLabs";
import { ClabLabTreeNode } from "../treeView/common";
import { getDefaultBackend } from "../backends/manager";

import { runClabAction } from "./runClabAction";

export async function deployPopularLab() {
  const pick = await pickPopularRepo("Deploy popular lab", "Select a repository to deploy");
  if (!pick) {
    return;
  }
  const node = new ClabLabTreeNode(
    "",
    vscode.TreeItemCollapsibleState.None,
    { absolute: pick.repo, relative: "" },
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    { backendId: getDefaultBackend().id }
  );
  // Call runClabAction directly to avoid circular dependency with deploy.ts
  await runClabAction("deploy", node);
}
