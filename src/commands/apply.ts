import type { ClabLabTreeNode } from "../treeView/common";

import { runClabAction } from "./runClabAction";

export async function applyLab(node?: ClabLabTreeNode) {
  await runClabAction("apply", node);
}
