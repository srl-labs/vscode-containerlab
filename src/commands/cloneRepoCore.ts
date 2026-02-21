import * as path from "path";
import * as os from "os";
import * as fs from "fs";

import * as vscode from "vscode";

import { outputChannel } from "../globals";
import { runCommand } from "../utils/utils";

export async function cloneRepoFromUrl(repoUrl?: string) {
  if (repoUrl === undefined || repoUrl.length === 0) {
    const input = await vscode.window.showInputBox({
      title: "Git repository URL",
      placeHolder: "https://github.com/user/repo.git",
      prompt: "Enter the repository to clone"
    });
    if (input === undefined || input.length === 0) {
      return;
    }
    repoUrl = input;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const destBase = workspaceRoot ?? path.join(os.homedir(), ".clab");

  if (!fs.existsSync(destBase)) {
    fs.mkdirSync(destBase, { recursive: true });
  }

  const repoName = path.basename(repoUrl.replace(/\.git$/, ""));
  const dest = path.join(destBase, repoName);

  outputChannel.info(`git clone ${repoUrl} ${dest}`);

  try {
    const command = `git clone ${repoUrl} "${dest}"`;
    await runCommand(command, "Clone repository", outputChannel, false, false);
    vscode.window.showInformationMessage(`Repository cloned to ${dest}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Git clone failed: ${message}`);
    outputChannel.error(`git clone failed: ${message}`);
  }
}
