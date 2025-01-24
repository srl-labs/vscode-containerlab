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

  const openLabFileCmd = vscode.commands.registerCommand('containerlab.openLabFile', openLabFile);
  context.subscriptions.push(openLabFileCmd);

  const deployLabCmd = vscode.commands.registerCommand('containerlab.deployLab', deploy);
  context.subscriptions.push(deployLabCmd);

  const redeployLabCmd = vscode.commands.registerCommand('containerlab.redeployLab', redeploy);
  context.subscriptions.push(redeployLabCmd);

  const destroyLabCmd = vscode.commands.registerCommand('containerlab.destroyLab', destroy);
  context.subscriptions.push(destroyLabCmd);

  const startNodeCmd = vscode.commands.registerCommand('containerlab.startNode', startNode);
  context.subscriptions.push(startNodeCmd);

  const stopNodeCmd = vscode.commands.registerCommand('containerlab.stopNode', stopNode);
  context.subscriptions.push(stopNodeCmd);

  const attachShellCmd = vscode.commands.registerCommand('containerlab.attachShell', attachShell);
  context.subscriptions.push(attachShellCmd);

  const sshNodeCmd = vscode.commands.registerCommand('containerlab.sshNode', sshToNode);
  context.subscriptions.push(sshNodeCmd);

  const showLogsCmd = vscode.commands.registerCommand('containerlab.showLogs', showLogs);
  context.subscriptions.push(showLogsCmd);

  // Periodic refresh
  const intervalId = setInterval(() => {
    provider.refresh();
  }, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

  vscode.window.showInformationMessage('Containerlab Extension is now active!');
}

export function deactivate() { }
