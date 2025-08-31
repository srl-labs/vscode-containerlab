import { ClabLabTreeNode } from "../treeView/common";
import { ClabCommand } from "./clabCommand";
import * as vscode from "vscode";
import { deployPopularLab } from "./deployPopular";
import { getSelectedLabNode } from "../helpers/utils";
import { notifyCurrentTopoViewerOfCommandSuccess } from "./graph";

export async function deploy(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const deployCmd = new ClabCommand(
    "deploy",
    node,
    undefined, // spinnerMsg
    undefined, // useTerminal
    undefined, // terminalName
    async () => {
      // This callback is called when the success message appears
      await notifyCurrentTopoViewerOfCommandSuccess('deploy');
    }
  );
  await deployCmd.run();
}

export async function deployCleanup(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const skipWarning = config.get<boolean>("skipCleanupWarning", false);
  if (!skipWarning) {
    const selection = await vscode.window.showWarningMessage(
      "WARNING: Deploy (cleanup) will remove all configuration artifacts.. Are you sure you want to proceed?",
      { modal: true },
      "Yes", "Don't warn me again"
    );
    if (!selection) {
      return; // user cancelled
    }
    if (selection === "Don't warn me again") {
      await config.update("skipCleanupWarning", true, vscode.ConfigurationTarget.Global);
    }
  }

  const deployCmd = new ClabCommand(
    "deploy",
    node,
    undefined, // spinnerMsg
    undefined, // useTerminal
    undefined, // terminalName
    async () => {
      // This callback is called when the success message appears
      await notifyCurrentTopoViewerOfCommandSuccess('deploy');
    }
  );
  await deployCmd.run(["-c"]);
}

export async function deploySpecificFile() {
  // Offer the user a choice between selecting a local file or providing a URL.
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

