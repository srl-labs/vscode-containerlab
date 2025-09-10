import * as vscode from "vscode";
import { ClabLabTreeNode } from "../treeView/common";
import { outputChannel, gottySessions, runningLabsProvider, refreshGottySessions } from "../extension";
import { getHostname } from "./capture";
import { runWithSudo } from "../helpers/utils";

async function parseGottyLink(output: string): Promise<string | undefined> {
  try {
    const bracketedHost = await getBracketedHostname();
    const fromJson = tryParseLinkFromJson(output, bracketedHost);
    if (fromJson) return fromJson;
    const fromText = tryParseLinkFromText(output, bracketedHost);
    if (fromText) return fromText;
  } catch (error) {
    outputChannel.error(`Failed to parse GoTTY link: ${error}`);
  }
  return undefined;
}

function tryParseLinkFromJson(output: string, bracketedHost?: string): string | undefined {
  const start = output.indexOf('[');
  const end = output.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    const payload = output.slice(start, end + 1);
    const sessions = JSON.parse(payload);
    if (!Array.isArray(sessions) || sessions.length === 0) return undefined;
    const port = sessions[0]?.port;
    if (!port || !bracketedHost) return undefined;
    return `http://${bracketedHost}:${port}`;
  } catch {
    return undefined;
  }
}

function tryParseLinkFromText(output: string, bracketedHost?: string): string | undefined {
  const urlMatch = /(https?:\/\/\S+)/.exec(output);
  if (!urlMatch) return undefined;
  const url = urlMatch[1];
  if (url.includes('HOST_IP') && bracketedHost) {
    return url.replace('HOST_IP', bracketedHost);
  }
  return url;
}

async function getBracketedHostname(): Promise<string | undefined> {
  const hostname = await getHostname();
  if (!hostname) return undefined;
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

async function gottyStart(action: "attach" | "reattach", node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage(`No lab selected for GoTTY ${action}.`);
    return;
  }
  try {
    const port = vscode.workspace.getConfiguration('containerlab').get<number>('gotty.port', 8080);
    const out = await runWithSudo(`containerlab tools gotty ${action} -l ${node.name} --port ${port}`, `GoTTY ${action}`, outputChannel, 'containerlab', true, true) as string;
    const link = await parseGottyLink(out || '');
    if (link) {
      gottySessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage('GoTTY link copied to clipboard. Default credentials: admin/admin', 'Open Link');
      if (choice === 'Open Link') {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      const msg = action === 'attach' ? 'GoTTY session started but no link found.' : 'GoTTY session reattached';
      vscode.window.showInformationMessage(msg);
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to ${action} GoTTY: ${err.message || err}`);
  }
  await refreshGottySessions();
  if (action === 'attach') {
    runningLabsProvider.softRefresh();
  } else {
    runningLabsProvider.refresh();
  }
}

export async function gottyAttach(node: ClabLabTreeNode) {
  await gottyStart('attach', node);
}

export async function gottyDetach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for GoTTY detach.");
    return;
  }
  try {
    await runWithSudo(`containerlab tools gotty detach -l ${node.name}`, 'GoTTY detach', outputChannel, 'containerlab');
    gottySessions.delete(node.name);
    vscode.window.showInformationMessage('GoTTY session detached');
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to detach GoTTY: ${err.message || err}`);
  }
  await refreshGottySessions();
  runningLabsProvider.refresh();
}

export async function gottyReattach(node: ClabLabTreeNode) {
  await gottyStart('reattach', node);
}

export function gottyCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage('GoTTY link copied to clipboard');
}
