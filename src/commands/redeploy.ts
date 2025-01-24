import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

/**
 * Redeploy Lab using a progress spinner with partial stdout updates.
 */
export async function redeploy(node: ContainerlabNode) {
  let labPath = node?.details?.labPath;
  if (!labPath) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      labPath = editor.document.uri.fsPath;
    }
  }
  if (!labPath) {
    vscode.window.showErrorMessage("No lab node or topology file selected.");
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);
  // e.g. sudo containerlab redeploy -t <labPath>
  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "redeploy", "-t", labPath]
    : ["containerlab", "redeploy", "-t", labPath];

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Redeploying Lab...",
        cancellable: false,
      },
      async (progress) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          child.stdout.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            lines.forEach((line: string) => {
              if (line.trim().length > 0) {
                progress.report({ message: line.trim() });
              }
            });
          });

          child.stderr.on("data", (data: Buffer) => {
            // Optionally parse or display error lines
          });

          child.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Exited with code ${code}`));
            }
          });
        });
      }
    );

    vscode.window.showInformationMessage("Lab Redeployed Successfully!");
    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Redeploy Failed: ${msg}`);
  }
}