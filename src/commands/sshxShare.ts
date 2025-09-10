import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";
import { outputChannel, sshxSessions, runningLabsProvider, refreshSshxSessions } from "../extension";
import { runWithSudo } from "../helpers/utils";

function parseLink(output: string): string | undefined {
  const re = /(https?:\/\/\S+)/;
  const m = re.exec(output);
  return m ? m[1] : undefined;
}

async function sshxStart(action: "attach" | "reattach", node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage(`No lab selected for SSHX ${action}.`);
    return;
  }
  try {
    const out = await runWithSudo(`containerlab tools sshx ${action} -l ${node.name}`, `SSHX ${action}`, outputChannel, 'containerlab', true, true) as string;
    const link = parseLink(out || '');
    if (link) {
      sshxSessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('SSHX link copied to clipboard.', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      const msg = action === 'attach' ? 'SSHX session started but no link found.' : 'SSHX session reattached';
      vscode.window.showInformationMessage(msg);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to ${action} SSHX: ${err.message || err}`);
  }
  await refreshSshxSessions();
  if (action === 'attach') {
    runningLabsProvider.softRefresh();
  } else {
    runningLabsProvider.refresh();
  }
}

export async function sshxAttach(node: ClabLabTreeNode) {
  await sshxStart('attach', node);
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
  runningLabsProvider.refresh();
}

export async function sshxReattach(node: ClabLabTreeNode) {
  await sshxStart('reattach', node);
}

export function sshxCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage('SSHX link copied to clipboard');
}
