import * as vscode from 'vscode';
import * as cmd from './commands/index';
import * as utils from './utils';
import { ClabTreeDataProvider } from './clabTreeDataProvider';
import {
  ensureClabInstalled,
  checkAndUpdateClabIfNeeded
} from './helpers/containerlabUtils';
import { WelcomePage } from './welcomePage';

/** Our global output channel */
export let outputChannel: vscode.OutputChannel;

export const execCmdMapping = require('../resources/exec_cmd.json');
export const sshUserMapping = require('../resources/ssh_users.json');

/**
 * Called when VSCode activates your extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create and register the output channel
  outputChannel = vscode.window.createOutputChannel('Containerlab');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine(process.platform);

  // Allow activation only on Linux or when connected via WSL.
  if (process.platform !== "linux" && vscode.env.remoteName !== "wsl") {
    vscode.window.showWarningMessage(
      "The Containerlab extension is only supported on Linux or WSL. It will not be activated on this system."
    );
    return; // Do not activate the extension.
  }

  outputChannel.appendLine('[DEBUG] Containerlab extension activated.');

  // 1) Ensure containerlab is installed
  const clabInstalled = await ensureClabInstalled(outputChannel);
  if (!clabInstalled) {
    // If user declined installation, bail out
    return;
  }

  // 2) If installed, check for updates
  await checkAndUpdateClabIfNeeded(outputChannel);

  // Show welcome page
  const welcomePage = new WelcomePage(context);
  await welcomePage.show();

  // Tree data provider
  const provider = new ClabTreeDataProvider(context);

  // If you have a defined "containerlabExplorer" view in package.json, 
  // you can either do:
  const treeView = vscode.window.createTreeView('containerlabExplorer', {
    treeDataProvider: provider,
    canSelectMany: true
  });

  // Determine if local capture is allowed.
  const isLocalCaptureAllowed =
    vscode.env.remoteName !== "ssh-remote" && !utils.isOrbstack();
  vscode.commands.executeCommand(
    'setContext',
    'containerlab:isLocalCaptureAllowed',
    isLocalCaptureAllowed
  );

  // Register commands

  // Refresh the tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.refresh', () => {
      provider.refresh();
    })
  );

  // Lab file and workspace commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFile', cmd.openLabFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.addToWorkspace', cmd.addLabFolderToWorkspace)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', cmd.openFolderInNewWindow)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.copyPath', cmd.copyLabPath)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.viewLogs', () => {
      outputChannel.show(true);
    })
  );

  // Lab deployment commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy', cmd.deploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', cmd.deployCleanup)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', cmd.deploySpecificFile)
  );

  // Lab redeployment commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy', cmd.redeploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', cmd.redeployCleanup)
  );

  // Lab destruction commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy', cmd.destroy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', cmd.destroyCleanup)
  );

  // Lab save command
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.save', cmd.saveLab)
  );

  // Lab inspection commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectAll', () =>
      cmd.inspectAllLabs(context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectOneLab', node =>
      cmd.inspectOneLab(node, context)
    )
  );

  // Lab graph commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph', cmd.graphNextUI)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.drawio', cmd.graphDrawIO)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.lab.graph.drawio.interactive',
      cmd.graphDrawIOInteractive
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', node =>
      cmd.graphTopoviewer(node, context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.topoViewerReload', () => cmd.graphTopoviewerReload(context)));

  // Node commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.start', cmd.startNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.stop', cmd.stopNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.save', cmd.saveNode)
  ); 
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.attachShell', cmd.attachShell)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.ssh', cmd.sshToNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.showLogs', cmd.showLogs)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.manageImpairments', node =>
      cmd.manageNodeImpairments(node, context)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.node.copyIPv4Address',
      cmd.copyContainerIPv4Address
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.node.copyIPv6Address',
      cmd.copyContainerIPv6Address
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyName', cmd.copyContainerName)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyID', cmd.copyContainerID)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyKind', cmd.copyContainerKind)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyImage', cmd.copyContainerImage)
  );

  // Interface commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.capture', cmd.captureInterface)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.interface.captureWithEdgeshark',
      (clickedNode, allSelectedNodes) => {
        cmd.captureInterfaceWithPacketflix(clickedNode, allSelectedNodes);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setDelay', cmd.setLinkDelay)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setJitter', cmd.setLinkJitter)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setLoss', cmd.setLinkLoss)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.setRate', cmd.setLinkRate)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'containerlab.interface.setCorruption',
      cmd.setLinkCorruption
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.interface.copyMACAddress', cmd.copyMACAddress)
  );

  // Edgeshark install/uninstall
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.install.edgeshark', cmd.installEdgeshark)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.uninstall.edgeshark', cmd.uninstallEdgeshark)
  );

  // Session hostname command
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.set.sessionHostname', cmd.setSessionHostname)
  );

  // Auto-refresh the TreeView based on user setting
  const config = vscode.workspace.getConfiguration('containerlab');
  const refreshInterval = config.get<number>('refreshInterval', 10000);
  const intervalId = setInterval(async () => {
    // Only refresh if there are changes
    if (await provider.hasChanges()) {
      provider.refresh();
    }
  }, refreshInterval);

  // Clean up the auto-refresh interval when the extension is deactivated
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine('[DEBUG] Deactivating Containerlab extension.');
  }
}
