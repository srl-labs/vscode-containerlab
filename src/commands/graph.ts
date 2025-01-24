import * as vscode from "vscode";
import { spawn } from "child_process";
import { ContainerlabNode } from "../containerlabTreeDataProvider";
import { outputChannel } from "../extension";
import { stripAnsi } from "../utils";

/**
 * Graph Lab (Web) => run in Terminal (no spinner).
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

  // e.g. ["sudo","containerlab","graph","--drawio","-t","<labPath>"]
  const cmdArgs = useSudo
    ? ["sudo", "containerlab", "graph", "--drawio", "-t", labPath]
    : ["containerlab", "graph", "--drawio", "-t", labPath];

  outputChannel.appendLine(`[graphDrawIO] Running: ${cmdArgs.join(" ")}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating DrawIO Graph...",
        cancellable: true
      },
      async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const child = spawn(cmdArgs[0], cmdArgs.slice(1));

          token.onCancellationRequested(() => {
            child.kill();
            reject(new Error("User canceled the graph command."));
          });

          child.stdout.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            lines.forEach((line: string) => {
              const trimmed = line.trim();
              if (trimmed) {
                const cleanLine = stripAnsi(trimmed);
                progress.report({ message: cleanLine });
                outputChannel.appendLine(cleanLine);
              }
            });
          });

          child.stderr.on("data", (data: Buffer) => {
            const lines = data.toString().split("\n");
            lines.forEach((line: string) => {
              const trimmed = line.trim();
              if (trimmed) {
                outputChannel.appendLine(`[stderr] ${stripAnsi(trimmed)}`);
              }
            });
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

    vscode.window
      .showInformationMessage("DrawIO Graph Completed!", "Show Logs")
      .then((choice) => {
        if (choice === "Show Logs") {
          outputChannel.show(true);
        }
      });

    vscode.commands.executeCommand("containerlab.refresh");
  } catch (err: any) {
    vscode.window.showErrorMessage(`Graph (draw.io) Failed: ${err.message}`);
  }
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
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

  // e.g. "sudo containerlab graph --drawio --drawio-args "-I" -t "<labPath>"
  const cmd = `${useSudo ? "sudo " : ""}containerlab graph --drawio --drawio-args "-I" -t "${labPath}"`;

  const terminal = vscode.window.createTerminal("Graph - drawio Interactive");
  terminal.sendText(cmd);
  terminal.show();
}