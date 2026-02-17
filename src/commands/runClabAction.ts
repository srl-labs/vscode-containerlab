import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import { getSelectedLabNode } from "../utils/utils";

import { ClabCommand } from "./clabCommand";
import {
  notifyCurrentTopoViewerOfCommandLog,
  notifyCurrentTopoViewerOfCommandFailure,
  notifyCurrentTopoViewerOfCommandSuccess
} from "./graph";

export async function runClabAction(
  action: "deploy" | "redeploy" | "destroy",
  node?: ClabLabTreeNode,
  cleanup = false
): Promise<void> {
  node = await getSelectedLabNode(node);
  if (!node) {
    await notifyCurrentTopoViewerOfCommandFailure(action, new Error("No lab node selected"));
    return;
  }

  const execute = async () => {
    const cmd = new ClabCommand(
      action,
      node as ClabLabTreeNode,
      undefined,
      undefined,
      undefined,
      async () => {
        await notifyCurrentTopoViewerOfCommandSuccess(action);
      },
      async (error) => {
        await notifyCurrentTopoViewerOfCommandFailure(action, error);
      },
      (line, stream) => {
        void notifyCurrentTopoViewerOfCommandLog(action, line, stream);
      }
    );
    if (cleanup) {
      await cmd.run(["-c"]);
    } else {
      await cmd.run();
    }
  };

  if (cleanup) {
    const config = vscode.workspace.getConfiguration("containerlab");
    const skipWarning = config.get<boolean>("skipCleanupWarning", false);
    if (!skipWarning) {
      const selection = await vscode.window.showWarningMessage(
        `WARNING: ${action.charAt(0).toUpperCase() + action.slice(1)} (cleanup) will remove all configuration artifacts.. Are you sure you want to proceed?`,
        { modal: true },
        "Yes",
        "Don't warn me again"
      );
      if (!selection) {
        await notifyCurrentTopoViewerOfCommandFailure(
          action,
          new Error("Operation cancelled by user")
        );
        return;
      }
      if (selection === "Don't warn me again") {
        await config.update("skipCleanupWarning", true, vscode.ConfigurationTarget.Global);
      }
    }
  }

  await execute();
}
