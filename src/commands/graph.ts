import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";

/**
 * Graph Lab (Web) => run in Terminal, as before
 */
export function graphNextUI(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }
  const labPath = node.details?.labPath;
  if (!labPath) {
    vscode.window.showErrorMessage("No labPath found.");
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);
  const cmd = `${useSudo ? "sudo " : ""}containerlab graph -t "${labPath}"`;

  const terminal = vscode.window.createTerminal("Graph - Web");
  terminal.sendText(cmd);
  terminal.show();
}

/**
 * Graph Lab (draw.io) => partial spinner approach
 */
export async function graphDrawIO(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }
  const labPath = node.details?.labPath;
  if (!labPath) {
    vscode.window.showErrorMessage("No labPath found.");
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

  // e.g. sudo containerlab graph --drawio -t <labPath>
  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "graph", "--drawio", "-t", labPath]
    : ["containerlab", "graph", "--drawio", "-t", labPath];

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating DrawIO Graph...",
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

    vscode.window.showInformationMessage("DrawIO Graph Completed!");
    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Graph (draw.io) Failed: ${msg}`);
  }
}

/**
 * Graph Lab (draw.io, Interactive) => must always run in a Terminal
 */
export function graphDrawIOInteractive(node: ContainerlabNode) {
  if (!node) {
    vscode.window.showErrorMessage("No lab node selected.");
    return;
  }
  const labPath = node.details?.labPath;
  if (!labPath) {
    vscode.window.showErrorMessage("No labPath found.");
    return;
  }

  const config = vscode.workspace.getConfiguration("containerlab");
  const useSudo = config.get<boolean>("sudoEnabledByDefault", true);

  // e.g. sudo containerlab graph --drawio --drawio-args "-I" -t <labPath>
  const cmd = `${useSudo ? "sudo " : ""}containerlab graph --drawio --drawio-args "-I" -t "${labPath}"`;

  // we run it in a Terminal
  const terminal = vscode.window.createTerminal("Graph - drawio Interactive");
  terminal.sendText(cmd);
  terminal.show();
}