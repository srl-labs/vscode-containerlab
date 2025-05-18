import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as utils from '../utils';

const execAsync = promisify(exec);

/**
 * Log info messages to the output channel.
 */
function log(message: string, channel: vscode.OutputChannel) {
  channel.appendLine(`[INFO] ${message}`);
}

/**
 * Replaces any " with \", so that we can safely wrap the entire string in quotes.
 */
function escapeDoubleQuotes(input: string): string {
  return input.replace(/"/g, '\\"');
}

/**
 * Runs a command, checking for two possibilities in order:
 *   1) If checkType is "containerlab" and the user is NOT forced to always use sudo
 *      (i.e. settings do not force sudo) and the user is in the "clab_admins" group,
 *      run the command directly (i.e. without sudo).
 *   2) If passwordless sudo is available, run with "sudo -E".
 *   3) Otherwise, prompt the user for their sudo password and run with it.
 *
 * If `returnOutput` is true, the function returns the command’s stdout as a string.
 */
export async function runWithSudo(
  command: string,
  description: string,
  outputChannel: vscode.OutputChannel,
  checkType: 'generic' | 'containerlab' = 'containerlab',
  returnOutput: boolean = false
): Promise<string | void> {
  // Get forced sudo setting from user configuration.
  // If the user has enabled "always use sudo" then utils.getSudo() will return a non-empty string.
  const forcedSudo = utils.getSudo();

  // --- 1) For containerlab commands, if NOT forced to use sudo, check if the user is in "clab_admins"
  if (checkType === 'containerlab' && forcedSudo === "") {
    try {
      const { stdout } = await execAsync("id -nG");
      const groups = stdout.split(/\s+/);
      if (groups.includes("clab_admins")) {
        log(`User is in "clab_admins". Running without sudo: ${command}`, outputChannel);
        const { stdout: cmdOut, stderr: cmdErr } = await execAsync(command);
        if (cmdOut) outputChannel.appendLine(cmdOut);
        if (cmdErr) outputChannel.appendLine(`[${description} stderr]: ${cmdErr}`);
        return returnOutput ? cmdOut : undefined;
      }
    } catch (err) {
      log(`Failed to check user groups: ${err}`, outputChannel);
      // Continue with sudo logic if group check fails.
    }
  }

  // --- 2) Check if passwordless sudo is available.
  let checkCommand =
    checkType === 'containerlab'
      ? "sudo -n containerlab version >/dev/null 2>&1 && echo true || echo false"
      : "sudo -n true";

  let passwordlessAvailable = false;
  try {
    await execAsync(checkCommand);
    passwordlessAvailable = true;
  } catch {
    passwordlessAvailable = false;
  }

  if (passwordlessAvailable) {
    log(`Passwordless sudo available. Trying with -E: ${command}`, outputChannel);
    const escapedCommand = escapeDoubleQuotes(command);
    const cmdToRun = `sudo -E bash -c "${escapedCommand}"`;
    try {
      const { stdout: cmdOut, stderr: cmdErr } = await execAsync(cmdToRun);
      if (cmdOut) outputChannel.appendLine(cmdOut);
      if (cmdErr) outputChannel.appendLine(`[${description} stderr]: ${cmdErr}`);
      return returnOutput ? cmdOut : undefined;
    } catch (err) {
      throw new Error(`Command failed: ${cmdToRun}\n${(err as Error).message}`);
    }
  }

  // --- 3) Prompt user for a sudo password.
  log(`Passwordless sudo not available for "${description}". Prompting for password.`, outputChannel);
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
    const { stdout: cmdOut, stderr: cmdErr } = await execAsync(cmdToRun);
    if (cmdOut) outputChannel.appendLine(cmdOut);
    if (cmdErr) outputChannel.appendLine(`[${description} stderr]: ${cmdErr}`);
    return returnOutput ? cmdOut : undefined;
  } catch (err) {
    throw new Error(`Command failed: runWithSudo [non-passwordless]\n${(err as Error).message}`);
  }
}

/**
 * Installs containerlab using the official installer script, via sudo.
 */
export async function installContainerlab(outputChannel: vscode.OutputChannel): Promise<void> {
  log(`Installing containerlab...`, outputChannel);
  const installerCmd = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(installerCmd, 'Installing containerlab', outputChannel, 'generic');
}

/**
 * Ensures containerlab is installed by running "which containerlab".
 * If not found, offers to install it.
 */
export async function ensureClabInstalled(outputChannel: vscode.OutputChannel): Promise<boolean> {
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
// In containerlabUtils.ts
export async function checkAndUpdateClabIfNeeded(
  outputChannel: vscode.OutputChannel,
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
          const urlRegex = /https?:\/\/[^\s]+/g;
          const match = versionOutput.match(urlRegex);
          if (match && match.length > 0) {
            vscode.env.openExternal(vscode.Uri.parse(match[0]));
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
