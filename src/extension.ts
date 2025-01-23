import * as vscode from 'vscode';
import { ContainerlabTreeDataProvider, ContainerlabNode } from './containerlabTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {

  // Create an output channel for Containerlab debug logs
  const containerlabOutput = vscode.window.createOutputChannel("Containerlab");

  // Pass this output channel to our tree data provider
  const provider = new ContainerlabTreeDataProvider(containerlabOutput);

  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  const refreshCmd = vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  const openLabFileCmd = vscode.commands.registerCommand('containerlab.openLabFile', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath found.');
      return;
    }
    const uri = vscode.Uri.file(labPath);
    vscode.commands.executeCommand('vscode.open', uri);
  });
  context.subscriptions.push(openLabFileCmd);

  const deployLabCmd = vscode.commands.registerCommand('containerlab.deployLab', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    const labLabel = node.label || "Lab";
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath to deploy.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Deploy - ${labLabel}` });
    terminal.sendText(`sudo containerlab deploy -c -t ${labPath}`);
    terminal.show();
  });
  context.subscriptions.push(deployLabCmd);

  const redeployLabCmd = vscode.commands.registerCommand('containerlab.redeployLab', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    const labLabel = node.label || "Lab";
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath to redeploy.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Redeploy - ${labLabel}` });
    terminal.sendText(`sudo containerlab redeploy -c -t ${labPath}`);
    terminal.show();
  });
  context.subscriptions.push(redeployLabCmd);

  const destroyLabCmd = vscode.commands.registerCommand('containerlab.destroyLab', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No lab node selected.');
      return;
    }
    const labPath = node.details?.labPath;
    const labLabel = node.label || "Lab";
    if (!labPath) {
      vscode.window.showErrorMessage('No labPath to destroy.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Destroy - ${labLabel}` });
    terminal.sendText(`sudo containerlab destroy -c -t ${labPath}`);
    terminal.show();
  });
  context.subscriptions.push(destroyLabCmd);

  const startNodeCmd = vscode.commands.registerCommand('containerlab.startNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    const containerLabel = node.label || "Container";
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId found.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Start - ${containerLabel}` });
    terminal.sendText(`sudo docker start ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(startNodeCmd);

  const stopNodeCmd = vscode.commands.registerCommand('containerlab.stopNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    const containerLabel = node.label || "Container";
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId found.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Stop - ${containerLabel}` });
    terminal.sendText(`sudo docker stop ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(stopNodeCmd);

  const attachShellCmd = vscode.commands.registerCommand('containerlab.attachShell', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    const containerLabel = node.label || "Container";
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId for shell attach.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Shell - ${containerLabel}` });
    terminal.sendText(`sudo docker exec -it ${containerId} sh`);
    terminal.show();
  });
  context.subscriptions.push(attachShellCmd);

  const sshNodeCmd = vscode.commands.registerCommand('containerlab.sshNode', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const sshIp = node.details?.sshIp;
    const containerLabel = node.label || "Container";
    if (!sshIp) {
      vscode.window.showErrorMessage('No IP found for SSH.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `SSH - ${containerLabel}` });
    terminal.sendText(`ssh admin@${sshIp}`);
    terminal.show();
  });
  context.subscriptions.push(sshNodeCmd);

  const showLogsCmd = vscode.commands.registerCommand('containerlab.showLogs', (node: ContainerlabNode) => {
    if (!node) {
      vscode.window.showErrorMessage('No container node selected.');
      return;
    }
    const containerId = node.details?.containerId;
    const containerLabel = node.label || "Container";
    if (!containerId) {
      vscode.window.showErrorMessage('No containerId for logs.');
      return;
    }
    const terminal = vscode.window.createTerminal({ name: `Logs - ${containerLabel}` });
    terminal.sendText(`sudo docker logs -f ${containerId}`);
    terminal.show();
  });
  context.subscriptions.push(showLogsCmd);

  // Periodic refresh
  const intervalId = setInterval(() => {
    provider.refresh();
  }, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

  vscode.window.showInformationMessage('Containerlab Extension is now active!');
}

export function deactivate() {}
