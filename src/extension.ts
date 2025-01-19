import * as vscode from 'vscode';
import { ContainerlabTreeDataProvider } from './containerlabTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new ContainerlabTreeDataProvider();

  // Register the provider with the EXACT same 'id' from package.json
  // i.e., "containerlabExplorer"
  vscode.window.registerTreeDataProvider('containerlabExplorer', provider);

  // Register a refresh command
  const refreshCmd = vscode.commands.registerCommand('containerlab.refresh', () => {
    provider.refresh();
  });
  context.subscriptions.push(refreshCmd);

  vscode.window.showInformationMessage('Containerlab Extension is active!');
}

export function deactivate() {}
