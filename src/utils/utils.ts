import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { exec, execSync } from "child_process";
import * as net from "net";
import { promisify } from "util";

import * as vscode from "vscode";

import { ClabLabTreeNode } from "../treeView/common";
import { containerlabBinaryPath, outputChannel } from "../globals";

const execAsync = promisify(exec);

export function stripAnsi(input: string): string {
  const esc = String.fromCharCode(27);
  const escapeSeq = new RegExp(esc + String.fromCharCode(91) + "[0-?]*[ -/]*[@-~]", "g");
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

  if (labPath.startsWith("~")) {
    const homedir = os.homedir();
    const sub = labPath.replace(/^~[/\\]?/, "");
    labPath = path.normalize(path.join(homedir, sub));
  }

  let candidatePaths: string[] = [];
  if (!path.isAbsolute(labPath)) {
    if (singleFolderBase !== undefined && singleFolderBase.length > 0) {
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

// Get relevant user information we need to validate permissions.
export function getUserInfo(): {
  hasPermission: boolean;
  isRoot: boolean;
  userGroups: string[];
  username: string;
  uid: number;
} {
  try {
    // Check if running as root
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const uidOut = execSync("id -u", { encoding: "utf-8" });
    const uid = parseInt(uidOut.trim(), 10);
    const isRoot = uid === 0;

    // Get username
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const usernameOut = execSync("id -un", { encoding: "utf-8" });
    const username = usernameOut.trim();

    // Check group membership
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const groupsOut = execSync("id -nG", { encoding: "utf-8" });
    const userGroups = groupsOut.trim().split(/\s+/);

    if (isRoot) {
      return {
        hasPermission: true,
        isRoot: true,
        userGroups,
        username,
        uid
      };
    }

    const isMemberOfClabAdmins = userGroups.includes("clab_admins");
    const isMemberOfDocker = userGroups.includes("docker");

    if (isMemberOfClabAdmins && isMemberOfDocker) {
      return {
        hasPermission: true,
        isRoot: false,
        userGroups,
        username,
        uid
      };
    } else {
      return {
        hasPermission: false,
        isRoot: false,
        userGroups,
        username,
        uid
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    outputChannel.error(`User info check failed: ${errorMessage}`);
    return {
      hasPermission: false,
      isRoot: false,
      userGroups: [],
      username: "",
      uid: -1
    };
  }
}

/**
 * Detect OrbStack by checking the kernel version from `uname -r` for "orbstack".
 * (No longer relying on `/.orbstack` existence.)
 */
export function isOrbstack(): boolean {
  try {
    const kernel = os.release().toLowerCase();
    // If "orbstack" is in the kernel, assume OrbStack environment
    return kernel.includes("orbstack");
  } catch {
    return false;
  }
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1");
    server.on("listening", () => {
      const address = server.address();
      server.close();
      if (address !== null && typeof address === "object" && typeof address.port === "number") {
        resolve(address.port);
      } else {
        reject(new Error("Could not get free port"));
      }
    });
    server.on("error", reject);
  });
}

// Get the config, set the default to undefined as all defaults **SHOULD** be set in package.json
export function getConfig(relCfgPath: string): unknown {
  return vscode.workspace.getConfiguration("containerlab").get(relCfgPath, undefined);
}

// ----------------------------------------------------------
// Containerlab helper functions
// ----------------------------------------------------------

/**
 * Log info messages to the output channel.
 */
function log(message: string, channel: vscode.LogOutputChannel) {
  channel.info(message);
}

async function runAndLog(
  cmd: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  returnOutput: boolean,
  includeStderr: boolean
): Promise<string | void> {
  const { stdout: cmdOut, stderr: cmdErr } = await execAsync(cmd);
  if (cmdOut) outputChannel.info(cmdOut);
  if (cmdErr) outputChannel.warn(`[${description} stderr]: ${cmdErr}`);
  const combined =
    includeStderr && returnOutput ? [cmdOut, cmdErr].filter(Boolean).join("\n") : cmdOut;
  return returnOutput ? combined : undefined;
}

/**
 * Runs a command and logs output to the channel.
 * If `returnOutput` is true, the function returns the command's stdout as a string.
 */
export async function runCommand(
  command: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  returnOutput: boolean = false,
  includeStderr: boolean = false
): Promise<string | void> {
  log(`Running: ${command}`, outputChannel);
  try {
    return await runAndLog(command, description, outputChannel, returnOutput, includeStderr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${command}\n${message}`);
  }
}

// Launch clab install script in a terminal. Let the shell handle sudo passwords.
export function installContainerlab(): void {
  const terminal = vscode.window.createTerminal("Containerlab Installation");
  terminal.show();
  terminal.sendText('curl -sL https://containerlab.dev/setup | sudo bash -s "all"');
}

/**
 * Checks if containerlab is up to date, and if not, prompts the user to update it.
 * Handled in a terminal to let the shell handle sudo passwords
 */
export async function checkAndUpdateClabIfNeeded(
  outputChannel: vscode.LogOutputChannel,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const versionOutputRaw = await runCommand(
      `${containerlabBinaryPath} version check`,
      "containerlab version check",
      outputChannel,
      true,
      true
    );
    const versionOutput = (typeof versionOutputRaw === "string" ? versionOutputRaw : "").trim();
    if (!versionOutput) {
      throw new Error("No output from containerlab version check command.");
    }

    if (versionOutput.includes("Version check timed out")) {
      log("Version check timed out. Skipping update check.", outputChannel);
      return;
    }

    // Register update command if there's a new version
    if (
      versionOutput.includes("newer containerlab version") ||
      versionOutput.includes("version:")
    ) {
      // Register command for performing the update
      const updateCommandId = "containerlab.updateClab";
      context.subscriptions.push(
        vscode.commands.registerCommand(updateCommandId, () => {
          const terminal = vscode.window.createTerminal("Containerlab Update");
          terminal.show();
          terminal.sendText(`${containerlabBinaryPath} version upgrade`);
          vscode.window.showInformationMessage(
            `Containerlab update started in terminal 'Containerlab Update'. Please follow the prompts.`
          );
        })
      );

      // Show non-modal notification with options
      vscode.window
        .showInformationMessage(versionOutput, "Update Now", "View Release Notes", "Dismiss")
        .then((selection) => {
          if (selection === "Update Now") {
            vscode.commands.executeCommand(updateCommandId);
          } else if (selection === "View Release Notes") {
            const urlRegex = /(https?:\/\/\S+)/;
            const m = urlRegex.exec(versionOutput);
            if (m) {
              vscode.env.openExternal(vscode.Uri.parse(m[1]));
            } else {
              vscode.window.showInformationMessage("No release notes URL found.");
            }
          }
          // For 'Dismiss' we do nothing
        });
    } else {
      log("Containerlab is up to date.", outputChannel);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`containerlab version check failed: ${errorMessage}`, outputChannel);
    vscode.window.showErrorMessage(
      "Unable to detect containerlab version. Please check your installation."
    );
  }
}

// ----------------------------------------------------------
// Command helper functions
// ----------------------------------------------------------

export async function getSelectedLabNode(
  node?: ClabLabTreeNode
): Promise<ClabLabTreeNode | undefined> {
  if (node) {
    return node;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const labPath = editor.document.uri.fsPath;
  if (!/\.clab\.(yml|yaml)$/i.test(labPath)) {
    return undefined;
  }

  const fileName = path.basename(labPath);
  return new ClabLabTreeNode(fileName, vscode.TreeItemCollapsibleState.None, {
    absolute: labPath,
    relative: fileName
  });
}

// Sanitizes a string to a Docker-safe container name.
// Rules: only [A-Za-z0-9_.-], must start with alnum, no trailing '.'/'-'.
export function sanitize(
  raw: string,
  { maxLen = 128, lower = false }: { maxLen?: number; lower?: boolean } = {}
): string {
  if (!raw) return "container";

  // Replace all disallowed characters (including "/") with "-"
  let out = raw.replace(/[^A-Za-z0-9_.-]+/g, "-");

  // Remove leading or trailing separators
  while (out.startsWith("-") || out.startsWith(".")) out = out.substring(1);
  while (out.endsWith("-") || out.endsWith(".")) out = out.slice(0, -1);

  // Ensure the name starts with an alphanumeric character
  if (!/^[A-Za-z0-9]/.test(out)) {
    out = `c-${out}`;
  }

  // Enforce maximum length and trim any trailing separators again
  if (out.length > maxLen) {
    out = out.slice(0, maxLen);
    while (out.endsWith("-") || out.endsWith(".")) out = out.slice(0, -1);
  }

  if (!out) out = "container";
  return lower ? out.toLowerCase() : out;
}
