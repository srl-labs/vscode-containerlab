import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { outputChannel } from "../extension";
import { stripAnsi } from "../utils";

export async function deploy(node: ContainerlabNode) {
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

  // e.g.: ["sudo", "containerlab", "deploy", "-c", "-t", "<labPath>"]
  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "deploy", "-c", "-t", labPath]
    : ["containerlab", "deploy", "-c", "-t", labPath];

  // Print the exact command in the output
  outputChannel.appendLine(`[deploy] Running: ${cmdArgs.join(" ")}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Deploying Lab...",
        cancellable: true
      },
      async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          // If user clicks Cancel, kill the child process
          token.onCancellationRequested(() => {
            child.kill();
            reject(new Error("User canceled the deploy command."));
          });

          // On stdout, parse lines and update spinner + output channel
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

          // stderr lines → output channel only
          child.stderr.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                outputChannel.appendLine(`[stderr] ${stripAnsi(trimmed)}`);
              }
            }
          });

          // When the process completes
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

    // If we get here, the command succeeded
    vscode.window
      .showInformationMessage("Lab Deployed Successfully!", "Show Logs")
      .then((choice) => {
        if (choice === "Show Logs") {
          outputChannel.show(true);
        }
      });

    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Deploy Failed: ${err.message}`);
  }
}