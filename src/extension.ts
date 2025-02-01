import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import { TopoViewer } from './topoViewer/backend/topoViewerWebUiFacade';
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

/** Output channel for logs */
export let outputChannel: vscode.OutputChannel;

/** Promisified child_process.exec */
const execAsync = promisify(exec);

/** 
 * If you rely on this file, keep it; otherwise remove.
 */
export const execCmdMapping = require('../resources/exec_cmd.json');
console.log(execCmdMapping);

/* ------------------------------------------------------------------
   A helper to detect & prompt for passwordless/sudo. 
   We'll use this logic for both installing Containerlab and 
   adding the user to the 'clab_admins' group.
------------------------------------------------------------------ */
async function runWithSudo(command: string, actionDescription: string): Promise<void> {
  try {
    // Check if passwordless sudo is available
    await execAsync('sudo -n true');
    const { stdout, stderr } = await execAsync(`sudo ${command}`);
    outputChannel.appendLine(stdout);
    if (stderr) {
      outputChannel.appendLine(`[${actionDescription} stderr]: ${stderr}`);
    }
  } catch (noPwlessErr) {
    // We must prompt the user for their sudo password
    const password = await vscode.window.showInputBox({
      prompt: `Enter your sudo password for: ${actionDescription}`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sudo password'
    });
    if (!password) {
      throw new Error('User cancelled sudo password prompt.');
    }

    // We'll feed that password into "sudo -S"
    // echo 'mypassword' | sudo -S sh -c 'the command...'
    const fullCmd = `echo '${password}' | sudo -S sh -c '${command}'`;
    const { stdout, stderr } = await execAsync(fullCmd);
    outputChannel.appendLine(stdout);
    if (stderr) {
      outputChannel.appendLine(`[${actionDescription} stderr]: ${stderr}`);
    }
  }
}

/* ------------------------------------------------------------------
   INSTALLATION
   Always do: "curl -sL https://containerlab.dev/setup | sudo -E bash -s all"
   (with passwordless check first).
------------------------------------------------------------------ */
async function installContainerlabWithSudo(): Promise<void> {
  // The entire install script that we pass to runWithSudo():
  const installerCmd = `curl -sL https://containerlab.dev/setup | sudo -E bash -s "all"`;
  // We nest 'sudo' calls inside runWithSudo, so let's remove the leading "sudo" from the command.
  // Actually we DO have "sudo" inside the pipe; let's just do a simpler approach:
  const command = `curl -sL https://containerlab.dev/setup | bash -s "all"`;
  await runWithSudo(command, 'Installing containerlab');
}

/* ------------------------------------------------------------------
   ADD USER TO 'clab_admins' GROUP IF NEEDED
   Because containerlab 0.63.3+ will require the user to be in 
   'clab_admins' group to run "containerlab version upgrade" 
   (and possibly other commands) without error.
------------------------------------------------------------------ */
async function addUserToClabAdminsIfNeeded(): Promise<void> {
  const currentUser = process.env.USER || '';
  if (!currentUser) {
    console.warn('Could not detect the current user from environment. Skipping clab_admins group check.');
    return;
  }

  try {
    // check if user is already in clab_admins
    const { stdout } = await execAsync('id -nG');
    if (stdout.includes('clab_admins')) {
      // user is already in group
      return;
    }

    // user not in group => ask if they'd like to join
    const addAction = 'Add me to clab_admins';
    const skipAction = 'No';
    const choice = await vscode.window.showWarningMessage(
      `To run future containerlab commands without sudo, you can join the "clab_admins" group.\nAdd "${currentUser}" to that group now?`,
      addAction,
      skipAction
    );
    if (choice !== addAction) {
      return;
    }

    // user wants to join the group => run usermod
    await runWithSudo(`usermod -aG clab_admins ${currentUser}`, `Add ${currentUser} to clab_admins`);
    vscode.window.showInformationMessage(
      `You have been added to the "clab_admins" group. Please log out and log in again for this to take effect.`
    );
  } catch (err) {
    console.warn('Error checking or adding user to clab_admins group:', err);
  }
}

/* ------------------------------------------------------------------
   ensureClabInstalled
   If containerlab version fails => prompt user to install
   If user says yes => attempt passwordless sudo first, then prompt
   On success => show success message, then optionally add user to clab_admins
------------------------------------------------------------------ */
async function ensureClabInstalled(): Promise<boolean> {
  try {
    // If this succeeds, containerlab is installed
    await execAsync('containerlab version');
    return true;
  } catch (err) {
    // Not installed
    const installAction = 'Install containerlab';
    const cancelAction = 'No';
    const chosen = await vscode.window.showWarningMessage(
      'Containerlab is not installed. Would you like to install it now?',
      installAction,
      cancelAction
    );

    if (chosen === installAction) {
      try {
        await installContainerlabWithSudo();

        // After installation, verify
        await execAsync('containerlab version');
        vscode.window.showInformationMessage('Containerlab installed successfully!');

        // Optionally see if user wants to join clab_admins
        await addUserToClabAdminsIfNeeded();

        return true;
      } catch (installErr: any) {
        vscode.window.showErrorMessage(
          `Failed to install containerlab:\n${installErr.message}\n` +
          `Extension will be disabled.`
        );
        return false;
      }
    } else {
      // user doesn't want to install → return false
      return false;
    }
  }
}

/* ------------------------------------------------------------------
   checkAndUpdateClabIfNeeded
   - Always do "sudo containerlab version check"
   - If out-of-date, prompt user
   - If yes => do "sudo containerlab version upgrade"
------------------------------------------------------------------ */
async function checkAndUpdateClabIfNeeded(): Promise<void> {
  try {
    const { stdout } = await execAsync('sudo containerlab version check');
    if (!stdout.includes('You are on the latest version')) {
      // containerlab indicates we are not on the latest version
      const updateAction = 'Update containerlab';
      const skipAction = 'Skip';
      const userChoice = await vscode.window.showWarningMessage(
        `It looks like your containerlab might be out of date.`,
        updateAction,
        skipAction
      );

      if (userChoice === updateAction) {
        // If your environment differs, adjust accordingly.
        try {
          await runWithSudo('containerlab version upgrade', 'Upgrading containerlab');
          vscode.window.showInformationMessage('Containerlab updated successfully!');
        } catch (upgradeErr: any) {
          vscode.window.showErrorMessage(`Failed to update containerlab:\n${upgradeErr.message}`);
        }
      }
    }
  } catch (err) {
    // The 'containerlab version check' command might fail 
    // if the user has a much older version or there's a network error.
    // We'll just log a warning and proceed with normal activation.
    console.warn('[WARN] containerlab version check failed:', err);
  }
}

/* ------------------------------------------------------------------
   ACTIVATE EXTENSION
------------------------------------------------------------------ */
export async function activate(context: vscode.ExtensionContext) {
  // Create the output channel up front
  outputChannel = vscode.window.createOutputChannel("Containerlab");
  context.subscriptions.push(outputChannel);

  // 1) Ensure containerlab is installed (or prompt installation).
  const clabInstalled = await ensureClabInstalled();
  if (!clabInstalled) {
    // If user declined or install failed, stop here.
    return;
  }

  // 2) If installed, check if containerlab is outdated; if so, prompt to update.
  await checkAndUpdateClabIfNeeded();

  // *** Normal extension initialization code below ***

  // Initialize our TreeDataProvider
  const provider = new ClabTreeDataProvider(context);
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  }));

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

  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectAll", () => inspectAllLabs(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectOneLab", (node) => inspectOneLab(node, context))
  );

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

  // Auto-refresh the Containerlab Explorer using the configured interval
  const config = vscode.workspace.getConfiguration("containerlab");
  const refreshInterval = config.get<number>("refreshInterval", 10000);

  const intervalId = setInterval(() => {
    provider.refresh();
  }, refreshInterval);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate() {
  // If you need to clean up anything, do it here
}