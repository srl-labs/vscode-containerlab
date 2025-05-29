import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClabLabTreeNode } from '../treeView/common';
import { favoriteLabs, extensionContext } from '../extension';

export async function deleteLab(node: ClabLabTreeNode) {
  const filePath = node?.labPath?.absolute;
  if (!filePath) {
    vscode.window.showErrorMessage('No lab file found.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete lab "${path.basename(filePath)}"? This action cannot be undone.`,
    { modal: true },
    'Delete'
  );
  if (confirm !== 'Delete') {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
    favoriteLabs.delete(filePath);
    if (extensionContext) {
      await extensionContext.globalState.update('favoriteLabs', Array.from(favoriteLabs));
    }
    vscode.window.showInformationMessage(`Deleted lab file ${node.label}`);
    vscode.commands.executeCommand('containerlab.refresh');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to delete lab: ${msg}`);
  }
}
