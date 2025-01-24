import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

/**
 * Deploy Lab using a progress spinner and partial log updates.
 */
export async function deploy(node: ContainerlabNode) {
  // 1) Find the lab path from the node details or active editor
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

  // 2) Check if user wants 'sudo'
  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

  // 3) Build the spawn arguments
  // e.g. "sudo containerlab deploy -c -t <labPath>"
  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "deploy", "-c", "-t", labPath]
    : ["containerlab", "deploy", "-c", "-t", labPath];

  // 4) Show a spinner with partial updates
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Deploying Lab...",
        cancellable: false,
      },
      async (progress) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          // On stdout, parse lines and update the spinner text
          child.stdout.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            lines.forEach((line: string) => {
              if (line.trim().length > 0) {
                progress.report({ message: line.trim() });
              }
            });
          });

          // Optionally read stderr
          child.stderr.on("data", (data: Buffer) => {
            // If you wish, parse or log error lines
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

    // If we get here, the command succeeded
    vscode.window.showInformationMessage("Lab Deployed Successfully!");
    vscode.commands.executeCommand("containerlab.refresh");

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Deployment Failed: ${msg}`);
  }
}