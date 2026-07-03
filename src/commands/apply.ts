import type { ClabLabTreeNode } from "../treeView/common";

import { runClabAction } from "./runClabAction";

export async function apply(node?: ClabLabTreeNode) {
  await runClabAction("apply", node);
}
