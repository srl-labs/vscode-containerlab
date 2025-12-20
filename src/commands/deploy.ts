import * as vscode from "vscode";

import { ClabLabTreeNode } from "../treeView/common";

import { runClabAction } from "./runClabAction";

export async function deploy(node?: ClabLabTreeNode) {
  await runClabAction("deploy", node);
}

export async function deployCleanup(node?: ClabLabTreeNode) {
  await runClabAction("deploy", node, true);
}

export async function deploySpecificFile() {
  const mode = await vscode.window.showQuickPick(
    ["Select local file", "Enter Git/HTTP URL", "Choose from popular labs"],
    { title: "Deploy from" }
  );

  if (!mode) {
    return;
  }

  let labRef: string | undefined;

  if (mode === "Select local file") {
    const opts: vscode.OpenDialogOptions = {
      title: "Select containerlab topology file",
      filters: {
        yaml: ["yaml", "yml"],
      },
    };

    const uri = await vscode.window.showOpenDialog(opts);
    if (!uri || !uri.length) {
      return;
    }
    labRef = uri[0].fsPath;
  } else if (mode === "Enter Git/HTTP URL") {
    labRef = await vscode.window.showInputBox({
      title: "Git/HTTP URL",
      placeHolder: "https://github.com/user/repo or https://example.com/lab.yml",
      prompt: "Provide a repository or file URL",
    });
    if (!labRef) {
      return;
    }
  } else {
    // Dynamic import to avoid circular dependency
    const { deployPopularLab } = await import("./deployPopular");
    await deployPopularLab();
    return;
  }

  const tempNode = new ClabLabTreeNode(
    "",
    vscode.TreeItemCollapsibleState.None,
    { absolute: labRef, relative: "" }
  );
  deploy(tempNode);
}
