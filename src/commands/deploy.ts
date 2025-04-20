import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";
import * as vscode from "vscode";

export function deploy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Deploying Lab... ",
    successMsg: "Lab deployed successfully!"
  };
  const deployCmd = new ClabCommand("deploy", node, spinnerMessages);
  deployCmd.run();
}

export async function deployCleanup(node: ClabLabTreeNode) {
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

export function deploySpecificFile() {

  const opts: vscode.OpenDialogOptions = {
    title: "Select containerlab topology file",
    filters: {
      yaml: ["yaml", "yml"]
    },
  };

  vscode.window.showOpenDialog(opts).then(uri => {
    if (!uri || !uri.length) {
      return;
    }
    const picked = uri[0].fsPath;
    const tempNode = new ClabLabTreeNode("", vscode.TreeItemCollapsibleState.None, {absolute: picked, relative: ""});
    deploy(tempNode);
  });
}