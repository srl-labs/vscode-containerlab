import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { outputChannel } from "../extension";
import { stripAnsi } from "../utils";

export async function stopNode(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage("No container node selected.");
    return;
  }

  const containerId = node.details?.containerId;
  if (!containerId) {
    vscode.window.showErrorMessage("No containerId found.");
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

  // e.g. ["sudo", "docker", "stop", "<containerId>"]
  const cmdArgs = useSudo
    ? ["sudo", "docker", "stop", containerId]
    : ["docker", "stop", containerId];

  // Print the exact command
  outputChannel.appendLine(`[stopNode] Running: ${cmdArgs.join(" ")}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Stopping Node: ${containerId}`,
        cancellable: true
      },
      async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          token.onCancellationRequested(() => {
            child.kill();
            reject(new Error("User canceled the stopNode command."));
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
      .showInformationMessage(`Node stopped: ${containerId}`, "Show Logs")
      .then((choice) => {
        if (choice === "Show Logs") {
          outputChannel.show(true);
        }
      });

    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to stop node (${containerId}): ${err.message}`);
  }
}