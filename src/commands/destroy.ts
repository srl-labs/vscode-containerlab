import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";
import { ClabCommand } from "./clabCommand";
import { getSelectedLabNode } from "../helpers/utils";
import { notifyCurrentTopoViewerOfCommandSuccess } from "./graph";

export async function destroy(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const destroyCmd = new ClabCommand(
    "destroy",
    node,
    undefined, // spinnerMsg
    undefined, // useTerminal
    undefined, // terminalName
    async () => {
      // This callback is called when the success message appears
      await notifyCurrentTopoViewerOfCommandSuccess('destroy');
    }
  );
  await destroyCmd.run();
}

export async function destroyCleanup(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

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

  const destroyCmd = new ClabCommand(
    "destroy",
    node,
    undefined, // spinnerMsg
    undefined, // useTerminal
    undefined, // terminalName
    async () => {
      // This callback is called when the success message appears
      await notifyCurrentTopoViewerOfCommandSuccess('destroy');
    }
  );
  await destroyCmd.run(["-c"]);
}

