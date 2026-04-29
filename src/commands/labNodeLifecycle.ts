import type { ClabLabTreeNode } from "../treeView/common";

import { runClabAction } from "./runClabAction";

export async function startLab(node?: ClabLabTreeNode): Promise<void> {
  await runClabAction("start", node);
}

export async function stopLab(node?: ClabLabTreeNode): Promise<void> {
  await runClabAction("stop", node);
}

export async function restartLab(node?: ClabLabTreeNode): Promise<void> {
  await runClabAction("restart", node);
}
