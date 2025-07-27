import * as vscode from "vscode";
import * as path from 'path';
import * as fs from "fs";
import * as os from "os";
import { exec, execSync } from "child_process";
import * as net from 'net';

export function stripAnsi(input: string): string {
  const esc = String.fromCharCode(27);
  const escapeSeq = new RegExp(
    esc + String.fromCharCode(91) + "[0-?]*[ -/]*[@-~]",
    "g",
  );
  const controlSeq = new RegExp(`${esc}[@-Z\\-_]`, "g");
  return input.replace(escapeSeq, "").replace(controlSeq, "");
}

export function stripFileName(p: string): string {
  return p.substring(0, p.lastIndexOf("/"));
}

export function getRelativeFolderPath(targetPath: string): string {
  const workspacePath = vscode.workspace.workspaceFolders
    ? vscode.workspace.workspaceFolders[0].uri.path
    : "";
  return path.relative(workspacePath, targetPath);
}

export function getRelLabFolderPath(labPath: string): string {
  return stripFileName(getRelativeFolderPath(labPath));
}

/**
 * Normalize a lab path by:
 *   1) Handling empty input
 *   2) Normalizing slashes
 *   3) Expanding ~ if present
 *   4) Handling relative paths
 *   5) Using realpathSync if exists
 */
export function normalizeLabPath(labPath: string, singleFolderBase?: string): string {
  if (!labPath) {
    return labPath;
  }
  labPath = path.normalize(labPath);

  if (labPath.startsWith('~')) {
    const homedir = os.homedir();
    const sub = labPath.replace(/^~[/\\]?/, "");
    labPath = path.normalize(path.join(homedir, sub));
  }

  let candidatePaths: string[] = [];
  if (!path.isAbsolute(labPath)) {
    if (singleFolderBase) {
      candidatePaths.push(path.resolve(singleFolderBase, labPath));
    }
    candidatePaths.push(path.resolve(process.cwd(), labPath));
  } else {
    candidatePaths.push(labPath);
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        return fs.realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
  }
  return candidatePaths[0];
}

export function titleCase(str: string) {
  return str[0].toLocaleUpperCase() + str.slice(1);
}

/**
 * If sudo is enabled in config, return 'sudo ', else ''.
 */
export function getSudo() {
  const sudo = vscode.workspace.getConfiguration("containerlab")
    .get<boolean>("sudoEnabledByDefault", false)
    ? "sudo "
    : "";
  return sudo;
}

/**
 * Detect OrbStack by checking the kernel version from `uname -r` for "orbstack".
 * (No longer relying on `/.orbstack` existence.)
 */
export function isOrbstack(): boolean {
  try {
    const kernel = execSync("uname -r")
      .toString()
      .trim()
      .toLowerCase();
    // If "orbstack" is in the kernel, assume OrbStack environment
    return kernel.includes("orbstack");
  } catch {
    return false;
  }
}

export function getUsername(): string {
  let username = "";
  try {
    username = execSync("whoami").toString("utf-8").trim();
  } catch {
    throw new Error(
      "Could not determine user. Failed to execute command: whoami",
    );
  }
  return username;
}

export function execWithProgress(command: string, progressMessage: string): Thenable<string> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: progressMessage,
      cancellable: false
    },
    (progress) => new Promise<string>((resolve, reject) => {
      const child = exec(command, { encoding: 'utf-8' }, (err, stdout, stderr) => {
        if (err) {
          vscode.window.showErrorMessage(`Failed: ${stderr}`);
          return reject(err);
        }
        resolve(stdout.trim());
      });

      child.stderr?.on('data', (data) => {
        const line = data.toString().trim();
        if (line) progress.report({ message: line });
      });
    })
  );
} 

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1');
    server.on('listening', () => {
      const address = server.address();
      server.close();
      if (typeof address === 'object' && address?.port) {
        resolve(address.port);
      } else {
        reject(new Error('Could not get free port'));
      }
    });
    server.on('error', reject);
  });
}
