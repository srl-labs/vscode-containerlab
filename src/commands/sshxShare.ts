import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";
import { outputChannel, sshxSessions, runningLabsProvider, refreshSshxSessions } from "../extension";
import { runWithSudo } from "../helpers/containerlabUtils";

function parseLink(output: string): string | undefined {
  const match = output.match(/https?:\/\/\S+/);
  return match ? match[0] : undefined;
}

export async function sshxAttach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for SSHX attach.");
    return;
  }
  try {
    const out = await runWithSudo(`containerlab tools sshx attach -l ${node.name}`, 'SSHX attach', outputChannel, 'containerlab', true, true) as string;
    const link = parseLink(out || '');
    if (link) {
      sshxSessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('SSHX link copied to clipboard.', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      vscode.window.showInformationMessage('SSHX session started but no link found.');
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to attach SSHX: ${err.message || err}`);
  }
  await refreshSshxSessions();
  // Use refreshWithoutDiscovery to avoid clearing caches and triggering full re-discovery
  // The SSHX state should persist in the sshxSessions map for the next auto-refresh
  runningLabsProvider.refreshWithoutDiscovery();
}

export async function sshxDetach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for SSHX detach.");
    return;
  }
  try {
    await runWithSudo(`containerlab tools sshx detach -l ${node.name}`, 'SSHX detach', outputChannel);
    sshxSessions.delete(node.name);
    vscode.window.showInformationMessage('SSHX session detached');
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to detach SSHX: ${err.message || err}`);
  }
  await refreshSshxSessions();
  // Changed from refreshWithoutDiscovery() to refresh() to update SSHX icons
  runningLabsProvider.refresh();
}

export async function sshxReattach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for SSHX reattach.");
    return;
  }
  try {
    const out = await runWithSudo(`containerlab tools sshx reattach -l ${node.name}`, 'SSHX reattach', outputChannel, 'containerlab', true, true) as string;
    const link = parseLink(out || '');
    if (link) {
      sshxSessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('SSHX link copied to clipboard.', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      vscode.window.showInformationMessage('SSHX session reattached');
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to reattach SSHX: ${err.message || err}`);
  }
  await refreshSshxSessions();
  // Changed from refreshWithoutDiscovery() to refresh() to update SSHX icons
  runningLabsProvider.refresh();
}

export function sshxCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage('SSHX link copied to clipboard');
}