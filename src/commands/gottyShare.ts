import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";
import { outputChannel, gottySessions, runningLabsProvider, refreshGottySessions } from "../extension";
import { execWithProgress } from "../helpers/utils";
import { getHostname } from "./capture";

async function parseGottyLink(output: string): Promise<string | undefined> {
  try {
    // Try to parse JSON from containerlab tools gotty list
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const sessions = JSON.parse(jsonMatch[0]);
      if (sessions.length > 0) {
        const session = sessions[0];
        if (session.port) {
          const hostname = await getHostname();
          if (hostname) {
            // If it's an IPv6 literal, bracket it
            const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
            return `http://${bracketed}:${session.port}`;
          }
        }
      }
    }

    // Fallback: try to extract URL directly from output
    const match = output.match(/https?:\/\/\S+/);
    if (match) {
      const url = match[0];
      // Replace HOST_IP placeholder with actual hostname
      if (url.includes('HOST_IP')) {
        const hostname = await getHostname();
        if (hostname) {
          const bracketed = hostname.includes(":") ? `[${hostname}]` : hostname;
          return url.replace('HOST_IP', bracketed);
        }
      }
      return url;
    }
  } catch (error) {
    outputChannel.appendLine(`[ERROR] Failed to parse GoTTY link: ${error}`);
  }

  return undefined;
}

export async function gottyAttach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for GoTTY attach.");
    return;
  }
  try {
    const port = vscode.workspace.getConfiguration('containerlab').get<number>('gotty.port', 8080);
    const out = await execWithProgress(`containerlab tools gotty attach -l ${node.name} --port ${port}`, 'Starting GoTTY session...', true);
    const link = await parseGottyLink(out || '');
    if (link) {
      gottySessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('GoTTY link copied to clipboard. Default credentials: admin/admin', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      vscode.window.showInformationMessage('GoTTY session started but no link found.');
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to attach GoTTY: ${err.message || err}`);
  }
  await refreshGottySessions();
  // Run a soft refresh so tree items are rebuilt while reusing existing inspect data
  // This ensures the GoTTY label updates without forcing a full inspect
  runningLabsProvider.softRefresh();
}

export async function gottyDetach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for GoTTY detach.");
    return;
  }
  try {
    await execWithProgress(`containerlab tools gotty detach -l ${node.name}`, 'Detaching GoTTY session...');
    gottySessions.delete(node.name);
    vscode.window.showInformationMessage('GoTTY session detached');
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to detach GoTTY: ${err.message || err}`);
  }
  await refreshGottySessions();
  // Changed from refreshWithoutDiscovery() to refresh() to update GoTTY icons
  runningLabsProvider.refresh();
}

export async function gottyReattach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for GoTTY reattach.");
    return;
  }
  try {
    const port = vscode.workspace.getConfiguration('containerlab').get<number>('gotty.port', 8080);
    const out = await execWithProgress(`containerlab tools gotty reattach -l ${node.name} --port ${port}`, 'Reattaching GoTTY session...', true);
    const link = await parseGottyLink(out || '');
    if (link) {
      gottySessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('GoTTY link copied to clipboard. Default credentials: admin/admin', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      vscode.window.showInformationMessage('GoTTY session reattached');
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to reattach GoTTY: ${err.message || err}`);
  }
  await refreshGottySessions();
  // Changed from refreshWithoutDiscovery() to refresh() to update GoTTY icons
  runningLabsProvider.refresh();
}

export function gottyCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage('GoTTY link copied to clipboard');
}