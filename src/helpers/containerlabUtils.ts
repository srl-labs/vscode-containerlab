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
  // First, check if passwordless sudo is available.
  let passwordlessAvailable = false;
  try {
    await execAsync('sudo -n true');
    passwordlessAvailable = true;
  } catch (checkErr) {
    passwordlessAvailable = false;
  }

  if (passwordlessAvailable) {
    // Try to run the command with sudo.
    try {
      log(`Passwordless sudo available. Executing command: ${command}`, outputChannel);
      const { stdout, stderr } = await execAsync(`sudo ${command}`);
      if (stdout) {
        outputChannel.appendLine(stdout);
      }
      if (stderr) {
        outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
      }
      return;
    } catch (commandErr) {
      // The command failed for reasons other than sudo password issues.
      // Propagate the error so that higher-level logic (e.g. installation check) can handle it.
      throw commandErr;
    }
  } else {
    // If passwordless sudo isn't available, prompt for the sudo password.
    log(`Passwordless sudo not available. Prompting user for sudo password: ${description}`, outputChannel);
    const password = await vscode.window.showInputBox({
      prompt: `Enter your sudo password for: ${description}`,
      password: true,
      ignoreFocusOut: true
    });
    if (!password) {
      throw new Error(`User cancelled sudo password prompt for: ${description}`);
    }
    
    // Execute the command using the provided password.
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
    log(
      `Verifying containerlab installation by running "containerlab version".`,
      outputChannel
    );
    // Run the version command with sudo using runWithSudo
    await runWithSudo(
      'containerlab version',
      'Verifying containerlab installation',
      outputChannel
    );
    log(`containerlab is already installed.`, outputChannel);
    return true;
  } catch (notInstalled) {
    log(
      `containerlab is not installed. Prompting user for installation.`,
      outputChannel
    );
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
      // Verify the installation using runWithSudo instead of execAsync
      await runWithSudo(
        'containerlab version',
        'Verifying containerlab installation after install',
        outputChannel
      );
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
/**
 * Checks if containerlab is up to date, and if not, prompts the user to update it.
 * If the version check command fails, an error is shown instead of suggesting an update.
 */
/**
 * Checks if containerlab is up to date, and if not, prompts the user to update it.
 * If the version check command fails or its output is unrecognized,
 * an error is shown stating that the version cannot be detected.
 */
export async function checkAndUpdateClabIfNeeded(outputChannel: vscode.OutputChannel): Promise<void> {
  try {
    log(`Running "sudo clab version check".`, outputChannel);
    const { stdout, stderr } = await execAsync('sudo clab version check');

    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[version check stderr]: ${stderr}`);
    }

    const versionOutput = stdout.trim();
    if (!versionOutput) {
      throw new Error('No output received from version check command.');
    }

    // Use a case-insensitive check for key phrases.
    const lowerOutput = versionOutput.toLowerCase();

    if (lowerOutput.includes('a newer containerlab version')) {
      log(`A newer version of containerlab is available. Prompting user for update.`, outputChannel);
      const updateAction = 'Update containerlab';
      const skipAction = 'Skip';
      const userChoice = await vscode.window.showWarningMessage(
        `A newer version of containerlab is available. See the Output panel for details.`,
        updateAction,
        skipAction
      );
      if (userChoice === updateAction) {
        try {
          log(`User chose to update containerlab. Executing upgrade.`, outputChannel);
          await runWithSudo('clab version upgrade', 'Upgrading containerlab', outputChannel);
          vscode.window.showInformationMessage('Containerlab updated successfully!');
          log(`Containerlab updated successfully.`, outputChannel);
        } catch (upgradeErr: any) {
          vscode.window.showErrorMessage(`Failed to update containerlab:\n${upgradeErr.message}`);
          log(`Failed to update containerlab: ${upgradeErr}`, outputChannel);
        }
      }
    } else if (lowerOutput.includes('latest') || lowerOutput.includes('up to date')) {
      // Example output might include: "You are on the latest version"
      log(`Containerlab is on the latest version.`, outputChannel);
    } else {
      // If the output doesn't match any expected pattern, treat it as a detection failure.
      throw new Error(`Unrecognized output from version check: "${versionOutput}"`);
    }
  } catch (err: any) {
    log(`containerlab version check failed: ${err.message}`, outputChannel);
    vscode.window.showErrorMessage(`Unable to detect containerlab version. Please check your installation.`);
  }
}


