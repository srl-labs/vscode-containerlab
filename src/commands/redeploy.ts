import * as vscode from "vscode";
import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function redeploy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Redeploying Lab... ",
    successMsg: "Lab redeployed successfully!"
  };
  const redeployCmd = new ClabCommand("redeploy", node, spinnerMessages);
  redeployCmd.run();
}

export async function redeployCleanup(node: ClabLabTreeNode) {
  const config = vscode.workspace.getConfiguration("containerlab");
  const skipWarning = config.get<boolean>("skipCleanupWarning", false);
  if (!skipWarning) {
    const selection = await vscode.window.showWarningMessage(
      "WARNING: Redeploy (cleanup) will remove all configuration artifacts.. Are you sure you want to proceed?",
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
    progressMsg: "Redeploying Lab (cleanup)... ",
    successMsg: "Lab redeployed (cleanup) successfully!"
  };
  const redeployCmd = new ClabCommand("redeploy", node, spinnerMessages);
  redeployCmd.run(["-c"]);
}
