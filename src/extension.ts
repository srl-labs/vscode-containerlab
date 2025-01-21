import * as vscode from 'vscode';
import { ContainerlabTreeDataProvider } from './containerlabTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  // Create an instance of our tree provider
  const provider = new ContainerlabTreeDataProvider();

  // Register the tree provider under the same ID as in package.json
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  // Register a "Refresh" command (manual)
  const refreshCmd = vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  // Register a command to open a lab file
  const openLabFileCmd = vscode.commands.registerCommand('containerlab.openLabFile', (labPath: string) => {
    if (labPath) {
      const fileUri = vscode.Uri.file(labPath);
      vscode.commands.executeCommand('vscode.open', fileUri);
    } else {
      vscode.window.showErrorMessage('No labPath available for this lab');
    }
  });
  context.subscriptions.push(openLabFileCmd);

  // PERIODIC REFRESH: Every 10 seconds, call provider.refresh()
  const intervalId = setInterval(() => {
    provider.refresh();
  }, 10000);

  // Ensure we clear the interval on deactivate
  context.subscriptions.push({
    dispose: () => clearInterval(intervalId)
  });

  vscode.window.showInformationMessage('Containerlab Extension is now active!');
}

export function deactivate() {
  // The interval is disposed automatically, thanks to our subscription
}
