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
 * Runs a command via sudo, checking for passwordless sudo first.
 * If passwordless sudo isn’t available, it first asks the user if they want
 * to proceed. Only if the user confirms does it then prompt for a sudo password.
 */
export async function runWithSudo(
  command: string,
  description: string,
  outputChannel: vscode.OutputChannel,
  checkType: 'generic' | 'containerlab' = 'containerlab'
): Promise<void> {
  const checkCommand =
    checkType === 'containerlab'
      ? "sudo -n containerlab version >/dev/null 2>&1 && echo true || echo false"
      : "sudo -n true";

  let passwordlessAvailable = false;
  try {
    await execAsync(checkCommand);
    passwordlessAvailable = true;
  } catch (checkErr) {
    passwordlessAvailable = false;
  }

  if (passwordlessAvailable) {
    try {
      log(`Passwordless sudo available. Trying with -E first: ${command}`, outputChannel);
      try {
        const { stdout, stderr } = await execAsync(`sudo -E ${command}`);
        if (stdout) {
          outputChannel.appendLine(stdout);
        }
        if (stderr) {
          outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
        }
        return;
      } catch (eErr: any) {
        // Check if the error is about -E not being allowed
        if (eErr.stderr?.includes('sorry, you are not allowed to preserve the environment')) {
          log(`sudo -E not allowed, falling back to regular sudo`, outputChannel);
          const { stdout, stderr } = await execAsync(`sudo ${command}`);
          if (stdout) {
            outputChannel.appendLine(stdout);
          }
          if (stderr) {
            outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
          }
          return;
        }
        throw eErr;
      }
    } catch (commandErr) {
      throw commandErr;
    }
  } else {
    log(`Passwordless sudo not available for "${description}".`, outputChannel);
    const shouldProceed = await vscode.window.showWarningMessage(
      `The command "${description}" requires you to enter your sudo password. Do you want to proceed?`,
      { modal: true },
      'Yes'
    );
    if (shouldProceed !== 'Yes') {
      throw new Error(`User declined to provide sudo password for: ${description}`);
    }

    const password = await vscode.window.showInputBox({
      prompt: `Enter your sudo password for: ${description}`,
      password: true,
      ignoreFocusOut: true
    });
    if (!password) {
      throw new Error(`User cancelled sudo password prompt for: ${description}`);
    }
    
    log(`Executing command with sudo and provided password: ${command}`, outputChannel);
    try {
      // Try with -E first
      try {
        const cmd = `echo '${password}' | sudo -S -E sh -c '${command}'`;
        const { stdout, stderr } = await execAsync(cmd);
        if (stdout) {
          outputChannel.appendLine(stdout);
        }
        if (stderr) {
          outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
        }
      } catch (eErr: any) {
        // Check if the error is about -E not being allowed
        if (eErr.stderr?.includes('sorry, you are not allowed to preserve the environment')) {
          log(`sudo -E not allowed, falling back to regular sudo`, outputChannel);
          const cmd = `echo '${password}' | sudo -S sh -c '${command}'`;
          const { stdout, stderr } = await execAsync(cmd);
          if (stdout) {
            outputChannel.appendLine(stdout);
          }
          if (stderr) {
            outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
          }
        } else {
          throw eErr;
        }
      }
    } catch (err) {
      throw err;
    }
  }
}

/**
 * Installs containerlab using the official installer script, via sudo.
 * Uses the generic sudo check.
 */
export async function installContainerlab(outputChannel: vscode.OutputChannel): Promise<void> {
  log(`Installing containerlab...`, outputChannel);
  const installerCmd = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(installerCmd, 'Installing containerlab', outputChannel, 'generic');
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

    log(`Adding user "${currentUser}" to clab_admins.`, outputChannel);
    await runWithSudo(`usermod -aG clab_admins ${currentUser}`, `Add ${currentUser} to clab_admins`, outputChannel, 'generic');

    vscode.window.showInformationMessage(
      `Added "${currentUser}" to clab_admins. You must log out and back in for this to take effect.`
    );
  } catch (err) {
    log(`Error checking or adding user to clab_admins group: ${err}`, outputChannel);
  }
}

/**
 * Ensures containerlab is installed by checking if the command is available.
 * We simply run "which containerlab" and verify that its output is non-empty.
 */
export async function ensureClabInstalled(
  outputChannel: vscode.OutputChannel
): Promise<boolean> {
  try {
    log(`Verifying containerlab installation by running "which containerlab".`, outputChannel);
    const { stdout } = await execAsync('which containerlab');
    if (stdout && stdout.trim().length > 0) {
      log(`containerlab is already installed.`, outputChannel);
      return true;
    }
    throw new Error('containerlab not found.');
  } catch (err) {
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
      // Verify the installation again.
      const { stdout } = await execAsync('which containerlab');
      if (stdout && stdout.trim().length > 0) {
        vscode.window.showInformationMessage('Containerlab installed successfully!');
        log(`containerlab installed successfully.`, outputChannel);
        await addUserToClabAdminsIfNeeded(outputChannel);
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
 * If the version check command fails or its output is unrecognized,
 * an error is shown stating that the version cannot be detected.
 */
export async function checkAndUpdateClabIfNeeded(outputChannel: vscode.OutputChannel): Promise<void> {
  try {
    log('Running "containerlab version check".', outputChannel);
    const { stdout, stderr } = await execAsync('containerlab version check');

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

    // Check for different version patterns
    if (versionOutput.includes('Version check timed out')) {
      // This is a newer version but couldn't check for updates
      log('Version check timed out. Skipping update check.', outputChannel);
      return;
    }

    if (versionOutput.includes('You are on the latest version')) {
      // This is a newer version and it's up to date
      log('Containerlab is on the latest version.', outputChannel);
      return;
    }

    if (versionOutput.includes('version:')) {
      // This is an older version that just prints version info
      // Extract version number for logging
      const versionMatch = versionOutput.match(/version:\s*([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      log(`Detected older containerlab version ${version}. Prompting user for update.`, outputChannel);
      const updateAction = 'Update containerlab';
      const skipAction = 'Skip';
      const userChoice = await vscode.window.showWarningMessage(
        'An update may be available for containerlab. Would you like to check for updates?',
        updateAction,
        skipAction
      );

      if (userChoice === updateAction) {
        try {
          log('User chose to update containerlab. Executing upgrade.', outputChannel);
          await runWithSudo('containerlab version upgrade', 'Upgrading containerlab', outputChannel, 'containerlab');
          vscode.window.showInformationMessage('Containerlab updated successfully!');
          log('Containerlab updated successfully.', outputChannel);
        } catch (upgradeErr: any) {
          vscode.window.showErrorMessage(`Failed to update containerlab:\n${upgradeErr.message}`);
          log(`Failed to update containerlab: ${upgradeErr}`, outputChannel);
        }
      }
    } else {
      throw new Error(`Unrecognized output from version check: "${versionOutput}"`);
    }
  } catch (err: any) {
    log(`containerlab version check failed: ${err.message}`, outputChannel);
    vscode.window.showErrorMessage('Unable to detect containerlab version. Please check your installation.');
  }
}
