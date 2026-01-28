import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import {
  outputChannel,
  gottySessions,
  runningLabsProvider,
  containerlabBinaryPath
} from "../globals";
import { refreshGottySessions, refreshRunningLabsProvider } from "../services/sessionRefresh";
import { runCommand } from "../utils/utils";

import { getHostname } from "./capture";

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

interface GottySession {
  port?: number;
}

function tryParseLinkFromJson(output: string, bracketedHost?: string): string | undefined {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return undefined;
  try {
    const payload = output.slice(start, end + 1);
    const sessions = JSON.parse(payload) as GottySession[];
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
  if (url.includes("HOST_IP") && bracketedHost) {
    return url.replace("HOST_IP", bracketedHost);
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
    const port = vscode.workspace.getConfiguration("containerlab").get<number>("gotty.port", 8080);
    const command = `${containerlabBinaryPath} tools gotty ${action} -l ${node.name} --port ${port}`;
    const out = (await runCommand(command, `GoTTY ${action}`, outputChannel, true, true)) as string;
    const link = await parseGottyLink(out || "");
    if (link) {
      gottySessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage(
        "GoTTY link copied to clipboard. Default credentials: admin/admin",
        "Open Link"
      );
      if (choice === "Open Link") {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      const msg =
        action === "attach"
          ? "GoTTY session started but no link found."
          : "GoTTY session reattached";
      vscode.window.showInformationMessage(msg);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to ${action} GoTTY: ${message}`);
  }
  await refreshGottySessions();
  await refreshRunningLabsProvider(action);
}

export async function gottyAttach(node: ClabLabTreeNode) {
  await gottyStart("attach", node);
}

export async function gottyDetach(node: ClabLabTreeNode) {
  if (!node || !node.name) {
    vscode.window.showErrorMessage("No lab selected for GoTTY detach.");
    return;
  }
  try {
    const command = `${containerlabBinaryPath} tools gotty detach -l ${node.name}`;
    await runCommand(command, "GoTTY detach", outputChannel, false, false);
    gottySessions.delete(node.name);
    vscode.window.showInformationMessage("GoTTY session detached");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to detach GoTTY: ${message}`);
  }
  await refreshGottySessions();
  try {
    await runningLabsProvider.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.warn(`Failed to refresh running labs after GoTTY detach: ${message}`);
  }
}

export async function gottyReattach(node: ClabLabTreeNode) {
  await gottyStart("reattach", node);
}

export function gottyCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage("GoTTY link copied to clipboard");
}
