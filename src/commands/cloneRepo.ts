import * as vscode from "vscode";
import { exec } from "child_process";
import * as utils from "../helpers/utils";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { outputChannel } from "../extension";

export async function cloneRepoFromUrl(repoUrl?: string) {
  if (!repoUrl) {
    repoUrl = await vscode.window.showInputBox({
      title: "Git repository URL",
      placeHolder: "https://github.com/user/repo.git",
      prompt: "Enter the repository to clone"
    });
    if (!repoUrl) {
      return;
    }
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const destBase = workspaceRoot ?? path.join(os.homedir(), ".clab");

  if (!fs.existsSync(destBase)) {
    fs.mkdirSync(destBase, { recursive: true });
  }

  const repoName = path.basename(repoUrl.replace(/\.git$/, ""));
  const dest = path.join(destBase, repoName);

  outputChannel.info(`git clone ${repoUrl} ${dest}`);

  exec(`${utils.getSudo()}git clone ${repoUrl} "${dest}"`, (error, stdout, stderr) => {
    if (stdout) { outputChannel.info(stdout); }
    if (stderr) { outputChannel.error(stderr); }
    if (error) {
      vscode.window.showErrorMessage(`Git clone failed: ${error.message}`);
      outputChannel.error(`git clone failed: ${error.message}`);
      return;
    }
    vscode.window.showInformationMessage(`Repository cloned to ${dest}`);
    vscode.commands.executeCommand('containerlab.refresh');
  });
}

export async function cloneRepo() {
  const choice = await vscode.window.showQuickPick(
    [
      { label: 'Clone via Git URL', action: 'url' },
      { label: 'Clone popular lab', action: 'popular' },
    ],
    { title: 'Clone repository' }
  );

  if (!choice) {
    return;
  }

  if (choice.action === 'url') {
    await cloneRepoFromUrl();
  } else if (choice.action === 'popular') {
    const mod = await import('./clonePopularRepo');
    await mod.clonePopularRepo();
  }
}
