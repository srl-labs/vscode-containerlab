import { ClabLabTreeNode } from "../treeView/common";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import * as vscode from "vscode";
import { deployPopularLab } from "./deployPopular";
import { getSelectedLabNode } from "./utils";

export async function deploy(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab... ",
    successMsg: "Lab deployed successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run();
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
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab (cleanup)... ",
    successMsg: "Lab deployed (cleanup) successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run(["-c"]);
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