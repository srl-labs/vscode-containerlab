import * as vscode from 'vscode';
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
import {
  ensureClabInstalled,
  checkAndUpdateClabIfNeeded
} from './helpers/containerlabUtils';

/** Our global output channel */
export let outputChannel: vscode.OutputChannel;

/** If you rely on this, keep it; otherwise remove. */
export const execCmdMapping = require('../resources/exec_cmd.json');

/**
 * Called when VSCode activates your extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create and register the output channel
  outputChannel = vscode.window.createOutputChannel('Containerlab');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('[DEBUG] Containerlab extension activated.');

  // 1) Ensure containerlab is installed
  const clabInstalled = await ensureClabInstalled(outputChannel);
  if (!clabInstalled) {
    // If user declined installation, bail out
    return;
  }

  // 2) If installed, check for updates
  await checkAndUpdateClabIfNeeded(outputChannel);

  // *** Proceed with normal extension logic ***

  // Tree data provider
  const provider = new ClabTreeDataProvider(context);
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.refresh', () => {
      provider.refresh();
    })
  );

  // Register the remaining commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFile', openLabFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.addToWorkspace', addLabFolderToWorkspace)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', openFolderInNewWindow)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.copyPath', copyLabPath)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy', deploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', deployCleanup)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', deploySpecificFile)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy', redeploy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', redeployCleanup)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy', destroy)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', destroyCleanup)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectAll', () => inspectAllLabs(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.inspectOneLab', (node) => inspectOneLab(node, context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph', graphNextUI)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.drawio', graphDrawIO)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.drawio.interactive', graphDrawIOInteractive)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', (node) => grapTopoviewer(node, context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.start', startNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.stop', stopNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.attachShell', attachShell)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.ssh', sshToNode)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.showLogs', showLogs)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyIPv4Address', copyContainerIPv4Address)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyIPv6Address', copyContainerIPv6Address)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyName', copyContainerName)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyID', copyContainerID)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyKind', copyContainerKind)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('containerlab.node.copyImage', copyContainerImage)
  );

  // Auto-refresh the TreeView based on user setting
  const config = vscode.workspace.getConfiguration('containerlab');
  const refreshInterval = config.get<number>('refreshInterval', 10000);
  const intervalId = setInterval(() => {
    provider.refresh();
  }, refreshInterval);

  // Clean up
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine('[DEBUG] Deactivating Containerlab extension.');
  }
}
