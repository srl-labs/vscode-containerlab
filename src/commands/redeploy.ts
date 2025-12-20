import type { ClabLabTreeNode } from "../treeView/common";

import { runClabAction } from "./runClabAction";

export async function redeploy(node?: ClabLabTreeNode) {
  await runClabAction("redeploy", node);
}

export async function redeployCleanup(node?: ClabLabTreeNode) {
  await runClabAction("redeploy", node, true);
}
