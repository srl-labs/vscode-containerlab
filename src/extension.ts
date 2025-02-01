import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import {
  deploy,
  deployCleanup,
  deploySpecificFile,
  destroy,
  destroyCleanup,
  redeploy,
  redeployCleanup,
  inspectAllLabs,
  inspectOneLab,
  openLabFile,
  openFolderInNewWindow,
  startNode,
  stopNode,
  attachShell,
  sshToNode,
  showLogs,
  graphNextUI,
  graphDrawIO,
  graphDrawIOInteractive,
  addLabFolderToWorkspace,
  copyLabPath,
  copyContainerIPv4Address,
  copyContainerIPv6Address,
  copyContainerName,
  copyContainerID,
  copyContainerImage,
  copyContainerKind,
  grapTopoviewer
} from './commands/index';
import { ClabTreeDataProvider } from './clabTreeDataProvider';

/** Our global output channel */
export let outputChannel: vscode.OutputChannel;

/** Promisified child_process.exec */
const execAsync = promisify(exec);

/** If you rely on this, keep it; otherwise remove. */
export const execCmdMapping = require('../resources/exec_cmd.json');
// (We’re not logging execCmdMapping here because outputChannel isn’t created yet.)

/**
 * Helper: Log a debug message to the output channel.
 * Only logs if the outputChannel is available.
 */
function log(message: string) {
  if (outputChannel) {
    outputChannel.appendLine(`[INFO] ${message}`);
  }
}

/* ------------------------------------------------------------------
   HELPER: run a command with sudo.
   1) Check for passwordless sudo.
   2) If not available, prompt the user for their sudo password.
   3) Execute the command, and log the output to the output channel.
------------------------------------------------------------------ */
async function runWithSudo(command: string, description: string) {
  try {
    log(`Checking for passwordless sudo for command: ${command}`);
    // Step 1: Check if passwordless sudo is available
    await execAsync('sudo -n true');
    log(`Passwordless sudo available. Executing command: ${command}`);
    // Run the command with sudo
    const { stdout, stderr } = await execAsync(`sudo ${command}`);
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
    }
  } catch (noPwlessErr) {
    log(`Passwordless sudo not available. Prompting user for sudo password for: ${description}`);
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
    log(`Executing command with sudo and provided password: ${command}`);
    const { stdout, stderr } = await execAsync(cmd);
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[${description} stderr]: ${stderr}`);
    }
  }
}

/* ------------------------------------------------------------------
   INSTALL CONTAINERLAB
   Always "curl -sL https://containerlab.dev/setup | bash -s 'all'"
   using runWithSudo (passwordless check → prompt if needed).
------------------------------------------------------------------ */
async function installContainerlab(): Promise<void> {
  log(`Installing containerlab...`);
  // The command passed here is without sudo because runWithSudo adds it.
  const installerCmd = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(installerCmd, 'Installing containerlab');
}

/* ------------------------------------------------------------------
   ADD USER TO "clab_admins" GROUP (after install, optional)
   If the user isn’t in that group, prompt them to add themselves.
------------------------------------------------------------------ */
async function addUserToClabAdminsIfNeeded(): Promise<void> {
  const currentUser = process.env.USER || '';
  if (!currentUser) {
    log('Cannot detect current user from environment; skipping clab_admins check.');
    return;
  }

  try {
    log(`Checking if user "${currentUser}" is in group clab_admins.`);
    // Get the current groups for the user
    const { stdout } = await execAsync('id -nG');
    if (stdout.includes('clab_admins')) {
      log(`User "${currentUser}" is already in clab_admins.`);
      return;
    }

    // Not in group → prompt the user
    const joinAction = 'Add me to clab_admins';
    const skipAction = 'No';
    const choice = await vscode.window.showWarningMessage(
      `Your user "${currentUser}" is not in the "clab_admins" group.\n` +
      'Joining this group helps run containerlab commands without sudo.\n\n' +
      'Add yourself to that group now?',
      joinAction,
      skipAction
    );
    if (choice !== joinAction) {
      log(`User declined to join clab_admins.`);
      return;
    }

    log(`Adding user "${currentUser}" to clab_admins.`);
    await runWithSudo(`usermod -aG clab_admins ${currentUser}`, `Add ${currentUser} to clab_admins`);
    vscode.window.showInformationMessage(
      `Added "${currentUser}" to clab_admins. You must log out and back in for this to take effect.`
    );
  } catch (err) {
    log(`Error checking or adding user to clab_admins group: ${err}`);
  }
}

/* ------------------------------------------------------------------
   ENSURE CONTAINERLAB INSTALLED
   If "containerlab version" fails, prompt to install.
   If the user accepts, install containerlab and then
   optionally add them to the clab_admins group.
------------------------------------------------------------------ */
async function ensureClabInstalled(): Promise<boolean> {
  try {
    log(`Verifying containerlab installation by running "containerlab version".`);
    await execAsync('containerlab version');
    log(`containerlab is already installed.`);
    return true;
  } catch (notInstalled) {
    log(`containerlab is not installed. Prompting user for installation.`);
    const installAction = 'Install containerlab';
    const cancelAction = 'No';
    const chosen = await vscode.window.showWarningMessage(
      'Containerlab is not installed. Would you like to install it now?',
      installAction,
      cancelAction
    );
    if (chosen !== installAction) {
      log(`User declined containerlab installation.`);
      return false;
    }
    // User chose to install containerlab
    try {
      await installContainerlab();
      // Verify installation succeeded
      await execAsync('containerlab version');
      vscode.window.showInformationMessage('Containerlab installed successfully!');
      log(`containerlab installed successfully.`);
      await addUserToClabAdminsIfNeeded();
      return true;
    } catch (installErr: any) {
      vscode.window.showErrorMessage(
        `Failed to install containerlab:\n${installErr.message}\nExtension will be disabled.`
      );
      log(`Failed to install containerlab: ${installErr}`);
      return false;
    }
  }
}

/* ------------------------------------------------------------------
   CHECK & UPDATE CONTAINERLAB IF NEEDED
   1) Run "sudo containerlab version check" and log the output.
   2) If not on the latest version, prompt the user to update.
   3) If the user agrees, run "sudo containerlab version upgrade".
------------------------------------------------------------------ */
async function checkAndUpdateClabIfNeeded(): Promise<void> {
  try {
    log(`Running "sudo containerlab version check".`);
    const { stdout, stderr } = await execAsync('sudo containerlab version check');
    if (stdout) {
      outputChannel.appendLine(stdout);
    }
    if (stderr) {
      outputChannel.appendLine(`[version check stderr]: ${stderr}`);
    }

    if (!stdout.includes('You are on the latest version')) {
      log(`Containerlab may be out of date. Prompting user for update.`);
      const updateAction = 'Update containerlab';
      const skipAction = 'Skip';
      const userChoice = await vscode.window.showWarningMessage(
        `Containerlab might be out of date. See the Output panel for details.`,
        updateAction,
        skipAction
      );
      if (userChoice === updateAction) {
        try {
          log(`User chose to update containerlab. Executing upgrade.`);
          await runWithSudo('containerlab version upgrade', 'Upgrading containerlab');
          vscode.window.showInformationMessage('Containerlab updated successfully!');
          log(`containerlab updated successfully.`);
        } catch (upgradeErr: any) {
          vscode.window.showErrorMessage(`Failed to update containerlab:\n${upgradeErr.message}`);
          log(`Failed to update containerlab: ${upgradeErr}`);
        }
      }
    } else {
      log(`Containerlab is on the latest version.`);
    }
  } catch (err: any) {
    log(`containerlab version check failed: ${err.message}`);
  }
}

/* ------------------------------------------------------------------
   ACTIVATE EXTENSION
------------------------------------------------------------------ */
export async function activate(context: vscode.ExtensionContext) {
  // Create and register the output channel
  outputChannel = vscode.window.createOutputChannel("Containerlab");
  context.subscriptions.push(outputChannel);

  // Now that outputChannel is defined, we can log our initial messages.
  outputChannel.appendLine(`[DEBUG] Containerlab extension activated.`);

  // 1) Ensure containerlab is installed
  const clabInstalled = await ensureClabInstalled();
  if (!clabInstalled) {
    return;
  }

  // 2) If installed, check for updates
  await checkAndUpdateClabIfNeeded();

  // *** Proceed with normal extension logic ***

  const provider = new ClabTreeDataProvider(context);
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  }));

  // Register the remaining commands
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFile', openLabFile));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.addToWorkspace', addLabFolderToWorkspace));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', openFolderInNewWindow));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.copyPath', copyLabPath));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy', deploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', deployCleanup));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', deploySpecificFile));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy', redeploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', redeployCleanup));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy', destroy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', destroyCleanup));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.inspectAll', () => inspectAllLabs(context)));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.inspectOneLab', (node) => inspectOneLab(node, context)));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph', graphNextUI));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio', graphDrawIO));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio.interactive', graphDrawIOInteractive));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', (node) => grapTopoviewer(node, context)));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.start', startNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.stop', stopNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.attachShell', attachShell));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.ssh', sshToNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.showLogs', showLogs));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv4Address', copyContainerIPv4Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv6Address', copyContainerIPv6Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyName', copyContainerName));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyID', copyContainerID));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyKind', copyContainerKind));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyImage', copyContainerImage));

  const config = vscode.workspace.getConfiguration("containerlab");
  const refreshInterval = config.get<number>("refreshInterval", 10000);

  const intervalId = setInterval(() => {
    provider.refresh();
  }, refreshInterval);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine(`[DEBUG] Deactivating Containerlab extension.`);
  }
}
