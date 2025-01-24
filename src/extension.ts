import * as vscode from 'vscode';
import { ContainerlabTreeDataProvider } from './containerlabTreeDataProvider';
import {
  deploy,
  destroy,
  openLabFile,
  redeploy,
  startNode,
  stopNode,
  attachShell,
  sshToNode,
  showLogs,
  graphNextUI,
  graphDrawIO,
} from './commands/index';

export let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {

  outputChannel = vscode.window.createOutputChannel("Containerlab")

  // Pass this output channel to our tree data provider
  const provider = new ContainerlabTreeDataProvider(outputChannel);

  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  const refreshCmd = vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  /*
  Register commands
  */

  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.openFile', openLabFile));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.deploy', deploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.redeploy', redeploy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.destroy', destroy));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.start', startNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.stop', stopNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.attachShell', attachShell));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.node.ssh', sshToNode));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.showLogs', showLogs));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph', graphNextUI));
  context.subscriptions.push(vscode.commands.registerCommand('containerlab.lab.graph.drawio', graphDrawIO));


  // Periodic refresh
  const intervalId = setInterval(() => {
    provider.refresh();
  }, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

  vscode.window.showInformationMessage('Containerlab Extension is now active!');
}

export function deactivate() { }
