import * as vscode from "vscode";

import type { ClabLabTreeNode } from "../treeView/common";
import {
  outputChannel,
  sshxSessions,
  runningLabsProvider,
  containerlabBinaryPath,
} from "../globals";
import { refreshSshxSessions, refreshRunningLabsProvider } from "../services/sessionRefresh";
import { runCommand } from "../utils/utils";

function parseLink(output: string): string | undefined {
  const re = /(https?:\/\/\S+)/;
  const m = re.exec(output);
  return m ? m[1] : undefined;
}

async function sshxStart(action: "attach" | "reattach", node: ClabLabTreeNode) {
  if (node.name === undefined || node.name.length === 0) {
    vscode.window.showErrorMessage(`No lab selected for SSHX ${action}.`);
    return;
  }
  try {
    const outRaw = await runCommand(
      `${containerlabBinaryPath} tools sshx ${action} -l ${node.name}`,
      `SSHX ${action}`,
      outputChannel,
      true,
      true
    );
    const out = typeof outRaw === "string" ? outRaw : "";
    const link = parseLink(out);
    if (link !== undefined && link.length > 0) {
      sshxSessions.set(node.name, link);
      await vscode.env.clipboard.writeText(link);
      const choice = await vscode.window.showInformationMessage(
        "SSHX link copied to clipboard.",
        "Open Link"
      );
      if (choice === "Open Link") {
        vscode.env.openExternal(vscode.Uri.parse(link));
      }
    } else {
      const msg =
        action === "attach" ? "SSHX session started but no link found." : "SSHX session reattached";
      vscode.window.showInformationMessage(msg);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to ${action} SSHX: ${message}`);
  }
  await refreshSshxSessions();
  await refreshRunningLabsProvider(action);
}

export async function sshxAttach(node: ClabLabTreeNode) {
  await sshxStart("attach", node);
}

export async function sshxDetach(node: ClabLabTreeNode) {
  if (node.name === undefined || node.name.length === 0) {
    vscode.window.showErrorMessage("No lab selected for SSHX detach.");
    return;
  }
  try {
    await runCommand(
      `${containerlabBinaryPath} tools sshx detach -l ${node.name}`,
      "SSHX detach",
      outputChannel,
      false,
      false
    );
    sshxSessions.delete(node.name);
    vscode.window.showInformationMessage("SSHX session detached");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to detach SSHX: ${message}`);
  }
  await refreshSshxSessions();
  try {
    await runningLabsProvider.refresh();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outputChannel.warn(`Failed to refresh running labs after SSHX detach: ${message}`);
  }
}

export async function sshxReattach(node: ClabLabTreeNode) {
  await sshxStart("reattach", node);
}

export function sshxCopyLink(link: string) {
  vscode.env.clipboard.writeText(link);
  vscode.window.showInformationMessage("SSHX link copied to clipboard");
}
