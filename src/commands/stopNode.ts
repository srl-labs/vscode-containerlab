import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

/**
 * Stop Node with partial updates in a spinner.
 */
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

  // e.g. sudo docker stop <id>
  const cmdArgs = useSudo
    ? ["sudo", "docker", "stop", containerId]
    : ["docker", "stop", containerId];

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Stopping Node: ${containerId}`,
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
            // Optionally parse or display
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

    vscode.window.showInformationMessage(`Node stopped: ${containerId}`);
    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to stop node (${containerId}): ${msg}`);
  }
}