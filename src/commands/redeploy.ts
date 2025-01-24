import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { outputChannel } from "../extension";
import { stripAnsi } from "../utils";

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

  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "redeploy", "-t", labPath]
    : ["containerlab", "redeploy", "-t", labPath];

  try {
    outputChannel.appendLine(`[redeploy] Running: ${cmdArgs.join(" ")}`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Redeploying Lab...",
        cancellable: true
      },
      async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          token.onCancellationRequested(() => {
            child.kill();
            reject(new Error("User canceled the redeploy command."));
          });

          child.stdout.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                const cleanLine = stripAnsi(trimmed);
                progress.report({ message: cleanLine });
                outputChannel.appendLine(cleanLine);
              }
            }
          });

          child.stderr.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                outputChannel.appendLine(`[stderr] ${stripAnsi(trimmed)}`);
              }
            }
          });

          child.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Process exited with code ${code}`));
            }
          });
        });
      }
    );

    vscode.window
      .showInformationMessage("Lab Redeployed Successfully!", "Show Logs")
      .then((choice) => {
        if (choice === "Show Logs") {
          outputChannel.show(true);
        }
      });

    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Redeploy Failed: ${err.message}`);
  }
}
