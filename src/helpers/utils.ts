import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { exec } from "child_process";
import * as net from "net";
import { promisify } from "util";
import { ClabLabTreeNode } from "../treeView/common";

const execAsync = promisify(exec);

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
    const kernel = os.release().toLowerCase();
    // If "orbstack" is in the kernel, assume OrbStack environment
    return kernel.includes("orbstack");
  } catch {
    return false;
  }
}

export function getUsername(): string {
  let username = "";
  try {
    username = os.userInfo().username;
  } catch {
    throw new Error(
      "Could not determine user. Failed to execute command: whoami",
    );
  }
  return username;
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

// Get the config, set the default to undefined as all defaults **SHOULD** be set in package.json
export function getConfig(relCfgPath: string): any {
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

/**
 * Replaces any " with \", so that we can safely wrap the entire string in quotes.
 */
function escapeDoubleQuotes(input: string): string {
  return input.replace(/"/g, '\\"');
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
  const combined = includeStderr && returnOutput
    ? [cmdOut, cmdErr].filter(Boolean).join("\n")
    : cmdOut;
  return returnOutput ? combined : undefined;
}

async function tryRunAsGroupMember(
  command: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  returnOutput: boolean,
  includeStderr: boolean,
  groupsToCheck: string[]
): Promise<string | void | undefined> {
  try {
    const { stdout } = await execAsync("id -nG");
    const groups = stdout.split(/\s+/);
    for (const grp of groupsToCheck) {
      if (groups.includes(grp)) {
        log(`User is in "${grp}". Running without sudo: ${command}`, outputChannel);
        const result = await runAndLog(
          command,
          description,
          outputChannel,
          returnOutput,
          includeStderr
        );
        return returnOutput ? (result as string) : "";
      }
    }
  } catch (err) {
    log(`Failed to check user groups: ${err}`, outputChannel);
  }
  return undefined;
}

async function hasPasswordlessSudo(checkType: 'generic' | 'containerlab' | 'docker'): Promise<boolean> {
  let checkCommand: string;
  if (checkType === 'containerlab') {
    checkCommand = "sudo -n containerlab version >/dev/null 2>&1 && echo true || echo false";
  } else if (checkType === 'docker') {
    checkCommand = "sudo -n docker ps >/dev/null 2>&1 && echo true || echo false";
  } else {
    checkCommand = "sudo -n true";
  }
  try {
    await execAsync(checkCommand);
    return true;
  } catch {
    return false;
  }
}

async function runWithPasswordless(
  command: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  returnOutput: boolean,
  includeStderr: boolean
): Promise<string | void> {
  log(`Passwordless sudo available. Trying with -E: ${command}`, outputChannel);
  const escapedCommand = escapeDoubleQuotes(command);
  const cmdToRun = `sudo -E bash -c "${escapedCommand}"`;
  try {
    return await runAndLog(cmdToRun, description, outputChannel, returnOutput, includeStderr);
  } catch (err) {
    throw new Error(`Command failed: ${cmdToRun}\n${(err as Error).message}`);
  }
}

async function runWithPasswordPrompt(
  command: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  returnOutput: boolean,
  includeStderr: boolean
): Promise<string | void> {
  log(
    `Passwordless sudo not available for "${description}". Prompting for password.`,
    outputChannel
  );
  const shouldProceed = await vscode.window.showWarningMessage(
    `The command "${description}" requires sudo privileges. Proceed?`,
    { modal: true },
    'Yes'
  );
  if (shouldProceed !== 'Yes') {
    throw new Error(`User cancelled sudo password prompt for: ${description}`);
  }

  const password = await vscode.window.showInputBox({
    prompt: `Enter sudo password for: ${description}`,
    password: true,
    ignoreFocusOut: true
  });
  if (!password) {
    throw new Error(`No sudo password provided for: ${description}`);
  }

  log(`Executing command with sudo and provided password: ${command}`, outputChannel);
  const escapedCommand = escapeDoubleQuotes(command);
  const cmdToRun = `echo '${password}' | sudo -S -E bash -c "${escapedCommand}"`;
  try {
    return await runAndLog(cmdToRun, description, outputChannel, returnOutput, includeStderr);
  } catch (err) {
    throw new Error(
      `Command failed: runWithSudo [non-passwordless]\n${(err as Error).message}`
    );
  }
}

/**
 * Runs a command, checking for these possibilities in order:
 *   1) If sudo is not forced and the user belongs to an allowed group
 *      ("clab_admins"/"docker" for containerlab or "docker" for docker), run it directly.
 *   2) If passwordless sudo is available, run with "sudo -E".
 *   3) Otherwise, prompt the user for their sudo password and run with it.
 *
 * If `returnOutput` is true, the function returns the command’s stdout as a string.
 */
export async function runWithSudo(
  command: string,
  description: string,
  outputChannel: vscode.LogOutputChannel,
  checkType: 'generic' | 'containerlab' | 'docker' = 'containerlab',
  returnOutput: boolean = false,
  includeStderr: boolean = false
): Promise<string | void> {
  // Get forced sudo setting from user configuration.
  // If the user has enabled "always use sudo" then getSudo() will return a non-empty string.
  const forcedSudo = getSudo();

  if (forcedSudo === "") {
    if (checkType === 'containerlab') {
      const direct = await tryRunAsGroupMember(
        command,
        description,
        outputChannel,
        returnOutput,
        includeStderr,
        ['clab_admins', 'docker']
      );
      if (typeof direct !== 'undefined') {
        return direct;
      }
    } else if (checkType === 'docker') {
      const direct = await tryRunAsGroupMember(
        command,
        description,
        outputChannel,
        returnOutput,
        includeStderr,
        ['docker']
      );
      if (typeof direct !== 'undefined') {
        return direct;
      }
    }
  }

  if (await hasPasswordlessSudo(checkType)) {
    return runWithPasswordless(
      command,
      description,
      outputChannel,
      returnOutput,
      includeStderr
    );
  }

  return runWithPasswordPrompt(
    command,
    description,
    outputChannel,
    returnOutput,
    includeStderr
  );
}

/**
 * Installs containerlab using the official installer script, via sudo.
 */
export async function installContainerlab(outputChannel: vscode.LogOutputChannel): Promise<void> {
  log(`Installing containerlab...`, outputChannel);
  const installerCmd = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(installerCmd, 'Installing containerlab', outputChannel, 'generic');
}

/**
 * Ensures containerlab is installed by running "which containerlab".
 * If not found, offers to install it.
 */
export async function ensureClabInstalled(outputChannel: vscode.LogOutputChannel): Promise<boolean> {
  try {
    log(`Checking "which containerlab" to verify installation...`, outputChannel);
    const { stdout } = await execAsync('which containerlab');
    if (stdout && stdout.trim().length > 0) {
      log(`containerlab is already installed.`, outputChannel);
      return true;
    }
    throw new Error('containerlab not found.');
  } catch {
    log(`containerlab is not installed. Prompting user for installation.`, outputChannel);
    const installAction = 'Install containerlab';
    const cancelAction = 'No';
    const chosen = await vscode.window.showWarningMessage(
      'Containerlab is not installed. Would you like to install it now?',
      installAction,
      cancelAction
    );
    if (chosen !== installAction) {
      log('User declined containerlab installation.', outputChannel);
      return false;
    }
    try {
      await installContainerlab(outputChannel);
      // Verify the installation once more.
      const { stdout } = await execAsync('which containerlab');
      if (stdout && stdout.trim().length > 0) {
        vscode.window.showInformationMessage('Containerlab installed successfully!');
        log(`containerlab installed successfully.`, outputChannel);
        return true;
      } else {
        throw new Error('containerlab installation failed; command not found after installation.');
      }
    } catch (installErr: any) {
      vscode.window.showErrorMessage(`Failed to install containerlab:\n${installErr.message}`);
      log(`Failed to install containerlab: ${installErr}`, outputChannel);
      return false;
    }
  }
}

/**
 * Checks if containerlab is up to date, and if not, prompts the user to update it.
 * This version uses runWithSudo to execute the version check only once.
 */
export async function checkAndUpdateClabIfNeeded(
  outputChannel: vscode.LogOutputChannel,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    log('Running "containerlab version check".', outputChannel);
    // Run the version check via runWithSudo and capture output.
    const versionOutputRaw = await runWithSudo(
      'containerlab version check',
      'containerlab version check',
      outputChannel,
      'containerlab',
      true
    );
    const versionOutput = (versionOutputRaw || "").trim();
    if (!versionOutput) {
      throw new Error('No output from containerlab version check command.');
    }

    if (versionOutput.includes("Version check timed out")) {
      log("Version check timed out. Skipping update check.", outputChannel);
      return;
    }

    // Register update command if there's a new version
    if (versionOutput.includes("newer containerlab version") || versionOutput.includes("version:")) {
      // Register command for performing the update
      const updateCommandId = 'containerlab.updateClab';
      context.subscriptions.push(
        vscode.commands.registerCommand(updateCommandId, async () => {
          try {
            await runWithSudo('containerlab version upgrade', 'Upgrading containerlab', outputChannel, 'generic');
            vscode.window.showInformationMessage('Containerlab updated successfully!');
            log('Containerlab updated successfully.', outputChannel);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Update failed: ${err.message}`);
          }
        })
      );

      // Show non-modal notification with options
      vscode.window.showInformationMessage(
        versionOutput,
        'Update Now',
        'View Release Notes',
        'Dismiss'
      ).then(selection => {
        if (selection === 'Update Now') {
          vscode.commands.executeCommand(updateCommandId);
        } else if (selection === 'View Release Notes') {
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
  } catch (err: any) {
    log(`containerlab version check failed: ${err.message}`, outputChannel);
    vscode.window.showErrorMessage(
      'Unable to detect containerlab version. Please check your installation.'
    );
  }
}

// ----------------------------------------------------------
// Command helper functions
// ----------------------------------------------------------

export async function getSelectedLabNode(node?: ClabLabTreeNode): Promise<ClabLabTreeNode | undefined> {
  if (node) {
    return node;
  }

  // Try to get from tree selection
  const { localTreeView, runningTreeView } = await import("../extension");

  // Try running tree first
  if (runningTreeView && runningTreeView.selection.length > 0) {
    const selected = runningTreeView.selection[0];
    if (selected instanceof ClabLabTreeNode) {
      return selected;
    }
  }

  // Then try local tree
  if (localTreeView && localTreeView.selection.length > 0) {
    const selected = localTreeView.selection[0];
    if (selected instanceof ClabLabTreeNode) {
      return selected;
    }
  }

  return undefined;
}

// Sanitizes a string to a Docker-safe container name.
// Rules: only [A-Za-z0-9_.-], must start with alnum, no trailing '.'/'-'.
export function sanitize(
  raw: string,
  { maxLen = 128, lower = false }: { maxLen?: number; lower?: boolean } = {},
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

