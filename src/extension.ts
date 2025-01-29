import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as cmd from './commands/index';
import { ClabTreeDataProvider } from './clabTreeDataProvider';

export let outputChannel: vscode.OutputChannel;
const execAsync = promisify(exec);
export const execCmdMapping = require('../resources/exec_cmd.json');

console.log(execCmdMapping);

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Containerlab");
  context.subscriptions.push(outputChannel);

  // Check if containerlab is installed
  let versionOutput: string;
  try {
    const { stdout } = await execAsync('sudo containerlab version');
    versionOutput = stdout;
  } catch (err) {
    // Show error message with button to open installation guide
    const installAction = 'Open Installation Guide';
    const selection = await vscode.window.showErrorMessage(
      'containerlab not detected. Please install it first.',
      installAction
    );

    if (selection === installAction) {
      vscode.env.openExternal(vscode.Uri.parse('https://containerlab.dev/install/'));
    }
    versionOutput = '';
  }

  // const provider = new ContainerlabTreeDataProvider(context);
  const provider = new ClabTreeDataProvider(context);
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFile', cmd.openLabFile));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.addToWorkspace', cmd.addLabFolderToWorkspace));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFolderInNewWindow', cmd.openFolderInNewWindow));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.copyPath', cmd.copyLabPath));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy', cmd.deploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.cleanup', cmd.deployCleanup));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy.specificFile', cmd.deploySpecificFile));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy', cmd.redeploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy.cleanup', cmd.redeployCleanup));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy', cmd.destroy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy.cleanup', cmd.destroyCleanup));

  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectAll", () => cmd.inspectAllLabs(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("containerlab.inspectOneLab", (node) => cmd.inspectOneLab(node, context))
  );

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph', cmd.graphNextUI));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio', cmd.graphDrawIO));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio.interactive', cmd.graphDrawIOInteractive));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.topoViewer', (node) => cmd.grapTopoviewer(node, context)));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.start', cmd.startNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.stop', cmd.stopNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.attachShell', cmd.attachShell));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.ssh', cmd.sshToNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.showLogs', cmd.showLogs));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv4Address', cmd.copyContainerIPv4Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyIPv6Address', cmd.copyContainerIPv6Address));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyName', cmd.copyContainerName));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyID', cmd.copyContainerID));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyKind', cmd.copyContainerKind));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.copyImage', cmd.copyContainerImage));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.capture', cmd.captureInterface));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.captureWithEdgeshark', cmd.captureInterfaceWithPacketflix));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.setDelay', cmd.setLinkDelay));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.setJitter', cmd.setLinkJitter));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.setLoss', cmd.setLinkLoss));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.setRate', cmd.setLinkRate));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.interface.setCorruption', cmd.setLinkCorruption));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.install.edgeshark', cmd.installEdgeshark));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.uninstall.edgeshark', cmd.uninstallEdgeshark));

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.set.sessionHostname', cmd.setSessionHostname));






  const config = vscode.workspace.getConfiguration("containerlab");
  const refreshInterval = config.get<number>("refreshInterval", 10000);

  const intervalId = setInterval(() => {
    provider.refresh();
  }, refreshInterval);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });
}

export function deactivate() { }
