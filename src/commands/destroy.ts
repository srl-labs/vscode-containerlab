import * as vscode from "vscode";
import { ClabLabTreeNode } from "../clabTreeDataProvider";
import { ClabCommand } from "./clabCommand";
import { SpinnerMsg } from "./command";

export function destroy(node: ClabLabTreeNode) {
  const spinnerMessages: SpinnerMsg = {
    progressMsg: "Destroying Lab... ",
    successMsg: "Lab destroyed successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run();
}

export async function destroyCleanup(node: ClabLabTreeNode) {
  const config = vscode.workspace.getConfiguration("containerlab");
  const skipWarning = config.get<boolean>("skipCleanupWarning", false);
  if (!skipWarning) {
    const selection = await vscode.window.showWarningMessage(
      "WARNING: Destroy (cleanup) will remove all configuration artifacts.. Are you sure you want to proceed?",
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
    progressMsg: "Destroying Lab (cleanup)... ",
    successMsg: "Lab destroyed (cleanup) successfully!"
  };
  const destroyCmd = new ClabCommand("destroy", node, spinnerMessages);
  destroyCmd.run(["-c"]);
}
