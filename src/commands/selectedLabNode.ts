import * as path from "path";

import * as vscode from "vscode";

import { getBackendForLocalSource } from "../backends/manager";
import { ClabLabTreeNode } from "../treeView/common";

function isUriSelection(value: unknown): value is vscode.Uri {
  return (
    typeof value === "object" && value !== null && typeof Reflect.get(value, "fsPath") === "string"
  );
}

/** Resolve a tree, editor-title, or active-editor selection with backend identity intact. */
export async function getSelectedLabNode(
  node?: ClabLabTreeNode | vscode.Uri
): Promise<ClabLabTreeNode | undefined> {
  if (node !== undefined && !isUriSelection(node)) return node;

  const labPath =
    node === undefined ? vscode.window.activeTextEditor?.document.uri.fsPath : node.fsPath;
  if (labPath === undefined || labPath === "" || !/\.clab\.(yml|yaml)$/iu.test(labPath)) {
    return undefined;
  }

  const fileName = path.basename(labPath);
  const backend = getBackendForLocalSource(labPath);
  const labRef = backend.resolveLocalSourceRef?.(labPath) ?? {
    backendId: backend.id,
    localPath: labPath
  };
  return new ClabLabTreeNode(
    fileName,
    vscode.TreeItemCollapsibleState.None,
    { absolute: labPath, relative: fileName },
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    labRef
  );
}
