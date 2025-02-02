import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Log info messages to the output channel.
 */
function log(message: string, channel: vscode.OutputChannel) {
  channel.appendLine(`[INFO] ${message}`);
}

/**
 * Runs a command via `sudo`, checking for passwordless sudo first.
 * If passwordless sudo isn’t available, prompts for a password.
 */
export async function runWithSudo(
  command: string,
  description: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  try {
    log(`Checking for passwordless sudo for command: ${command}`, outputChannel);

    // Step 1: Check if passwordless sudo is available
    await execAsync('sudo -n true');
    log(`Passwordless sudo available. Executing command: ${command}`, outputChannel);

    // Run the command with sudo
    const { stdout, stderr } = await execAsync(`sudo ${command}`);
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
    }
  } catch (noPwlessErr) {
    log(`Passwordless sudo not available. Prompting user for sudo password: ${description}`, outputChannel);

    // Step 2: Prompt for sudo password
    const password = await vscode.window.showInputBox({
      prompt: `Enter your sudo password for: ${description}`,
      password: true,
      ignoreFocusOut: true
    });
    if (!password) {
      throw new Error(`User cancelled sudo password prompt for: ${description}`);
    }

    // Step 3: Execute the command using the provided password
    const cmd = `echo '${password}' | sudo -S sh -c '${command}'`;
    log(`Executing command with sudo and provided password: ${command}`, outputChannel);
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
    }
  }
}

/**
 * Installs containerlab using the official installer script, via sudo.
 */
export async function installContainerlab(outputChannel: vscode.OutputChannel): Promise<void> {
  log(`Installing containerlab...`, outputChannel);
  const installerCmd = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(installerCmd, 'Installing containerlab', outputChannel);
}

/**
 * Adds the current user to the "clab_admins" group if needed.
 */
export async function addUserToClabAdminsIfNeeded(outputChannel: vscode.OutputChannel): Promise<void> {
  const currentUser = process.env.USER || '';
  if (!currentUser) {
    log('Cannot detect current user from environment; skipping clab_admins check.', outputChannel);
    return;
  }

  try {
    log(`Checking if user "${currentUser}" is in group clab_admins.`, outputChannel);
    const { stdout } = await execAsync('id -nG');
    if (stdout.includes('clab_admins')) {
      log(`User "${currentUser}" is already in clab_admins.`, outputChannel);
      return;
    }

    // Not in group -> prompt
    const joinAction = 'Add me to clab_admins';
    const skipAction = 'No';
    const choice = await vscode.window.showWarningMessage(
      `Your user "${currentUser}" is not in the "clab_admins" group.\n` +
      `Joining this group helps run containerlab commands without sudo.\n\n` +
      `Add yourself to that group now?`,
      joinAction,
      skipAction
    );
    if (choice !== joinAction) {
      log(`User declined to join clab_admins.`, outputChannel);
      return;
    }

    // Run usermod
    log(`Adding user "${currentUser}" to clab_admins.`, outputChannel);
    await runWithSudo(`usermod -aG clab_admins ${currentUser}`, `Add ${currentUser} to clab_admins`, outputChannel);

    vscode.window.showInformationMessage(
      `Added "${currentUser}" to clab_admins. You must log out and back in for this to take effect.`
    );

  } catch (err) {
    log(`Error checking or adding user to clab_admins group: ${err}`, outputChannel);
  }
}

/**
 * Ensures containerlab is installed. If not, prompts the user to install.
 */
export async function ensureClabInstalled(
  outputChannel: vscode.OutputChannel
): Promise<boolean> {
  try {
    log(`Verifying containerlab installation by running "containerlab version".`, outputChannel);
    await execAsync('containerlab version');
    log(`containerlab is already installed.`, outputChannel);
    return true;
  } catch (notInstalled) {
    log(`containerlab is not installed. Prompting user for installation.`, outputChannel);
    const installAction = 'Install containerlab';
    const cancelAction = 'No';
    const chosen = await vscode.window.showWarningMessage(
      `Containerlab is not installed. Would you like to install it now?`,
      installAction,
      cancelAction
    );
    if (chosen !== installAction) {
      log(`User declined containerlab installation.`, outputChannel);
      return false;
    }

    // User chose to install containerlab
    try {
      await installContainerlab(outputChannel);
      // Verify installation
      await execAsync('containerlab version');
      vscode.window.showInformationMessage('Containerlab installed successfully!');
      log(`containerlab installed successfully.`, outputChannel);

      // Optionally add user to clab_admins group
      await addUserToClabAdminsIfNeeded(outputChannel);

      return true;
    } catch (installErr: any) {
      vscode.window.showErrorMessage(
        `Failed to install containerlab:\n${installErr.message}\nExtension will be disabled.`
      );
      log(`Failed to install containerlab: ${installErr}`, outputChannel);
      return false;
    }
  }
}

/**
 * Checks if containerlab is up to date, and if not, prompts the user to update it.
 */
export async function checkAndUpdateClabIfNeeded(outputChannel: vscode.OutputChannel): Promise<void> {
  try {
    log(`Running "sudo containerlab version check".`, outputChannel);
    const { stdout, stderr } = await execAsync('sudo containerlab version check');
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[version check stderr]: ${stderr}`);
    }

    if (!stdout.includes('You are on the latest version')) {
      log(`Containerlab may be out of date. Prompting user for update.`, outputChannel);
      const updateAction = 'Update containerlab';
      const skipAction = 'Skip';
      const userChoice = await vscode.window.showWarningMessage(
        `Containerlab might be out of date. See the Output panel for details.`,
        updateAction,
        skipAction
      );
      if (userChoice === updateAction) {
        try {
          log(`User chose to update containerlab. Executing upgrade.`, outputChannel);
          await runWithSudo('containerlab version upgrade', 'Upgrading containerlab', outputChannel);
          vscode.window.showInformationMessage('Containerlab updated successfully!');
          log(`containerlab updated successfully.`, outputChannel);
        } catch (upgradeErr: any) {
          vscode.window.showErrorMessage(`Failed to update containerlab:\n${upgradeErr.message}`);
          log(`Failed to update containerlab: ${upgradeErr}`, outputChannel);
        }
      }
    } else {
      log(`Containerlab is on the latest version.`, outputChannel);
    }
  } catch (err: any) {
    log(`containerlab version check failed: ${err.message}`, outputChannel);
  }
}
