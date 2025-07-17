import { ClabLabTreeNode } from "../treeView/common";

export async function getSelectedLabNode(node?: ClabLabTreeNode): Promise<ClabLabTreeNode | undefined> {
  if (node) {
    return node;
  }

  // Try to get from tree selection
  const { localTreeView, runningTreeView } = await import("../extension");

  // Try running tree first
  if (runningTreeView && runningTreeView.selection.length > 0) {
    const selected = runningTreeView.selection[0];
    if (selected instanceof ClabLabTreeNode) {
      return selected;
    }
  }

  // Then try local tree
  if (localTreeView && localTreeView.selection.length > 0) {
    const selected = localTreeView.selection[0];
    if (selected instanceof ClabLabTreeNode) {
      return selected;
    }
  }

  return undefined;
}