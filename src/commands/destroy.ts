import { ClabLabTreeNode } from "../treeView/common";
import { runClabAction } from "./runClabAction";

export async function destroy(node?: ClabLabTreeNode) {
  await runClabAction("destroy", node);
}

export async function destroyCleanup(node?: ClabLabTreeNode) {
  await runClabAction("destroy", node, true);
}
