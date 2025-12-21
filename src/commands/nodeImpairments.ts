import * as vscode from "vscode";

import type { ClabContainerTreeNode } from "../treeView/common";
import { getNodeImpairmentsHtml } from "../webview/nodeImpairmentsHtml";
import { outputChannel, containerlabBinaryPath } from "../globals";
import { runCommand } from "../utils/utils";

type NetemFields = {
  delay: string;
  jitter: string;
  loss: string;
  rate: string;
  corruption: string;
};

/**
 * Raw netem item from CLI JSON output
 */
interface NetemRawItem {
  interface: string;
  delay?: string;
  jitter?: string;
  packet_loss?: number;
  rate?: number;
  corruption?: number;
}

/**
 * Parsed netem data by container name
 */
type NetemRawData = Record<string, NetemRawItem[]>;

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeInterfaceName(iface: string): string {
  const idx = iface.indexOf("(");
  const base = idx >= 0 ? iface.slice(0, idx) : iface;
  return base.trim();
}

function stripPercentage(val: string): string {
  let s = val.trimEnd();
  if (s.endsWith("%")) {
    s = s.slice(0, -1).trimEnd();
  }
  return s.trim();
}

function defaultNetemFields(): NetemFields {
  return {
    delay: "0ms",
    jitter: "0ms",
    loss: "0.00%",
    rate: "0",
    corruption: "0.00%",
  };
}

function parseNetemItem(item: NetemRawItem): [string, NetemFields] | null {
  if (item.interface === "lo") {
    return null;
  }
  const key = normalizeInterfaceName(item.interface);
  const fields: NetemFields = {
    delay: item.delay?.trim() ? item.delay : "0ms",
    jitter: item.jitter?.trim() ? item.jitter : "0ms",
    loss:
      typeof item.packet_loss === "number" && item.packet_loss > 0
        ? `${item.packet_loss}%`
        : "0.00%",
    rate:
      typeof item.rate === "number" && item.rate > 0 ? String(item.rate) : "0",
    corruption:
      typeof item.corruption === "number" && item.corruption > 0
        ? `${item.corruption}%`
        : "0.00%",
  };
  return [key, fields];
}

function ensureDefaults(map: Record<string, NetemFields>, node: ClabContainerTreeNode) {
  node.interfaces.forEach((ifNode) => {
    const norm = normalizeInterfaceName(ifNode.name);
    if (norm === "lo") {
      return;
    }
    if (!map[norm]) {
      map[norm] = defaultNetemFields();
      outputChannel.info(`Defaulted values for ${norm}.`);
    }
  });
}

async function refreshNetemSettings(node: ClabContainerTreeNode): Promise<Record<string, NetemFields>> {
  const config = vscode.workspace.getConfiguration("containerlab");
  const runtime = config.get<string>("runtime", "docker");
  const showCmd = `${containerlabBinaryPath} tools -r ${runtime} netem show -n ${node.name} --format json`;
  let netemMap: Record<string, NetemFields> = {};

  try {
    const stdout = await runCommand(
      showCmd,
      'Refresh netem settings',
      outputChannel,
      true,
      false
    ) as string;
    if (!stdout) {
      throw new Error("No output from netem show command");
    }
    const rawData = JSON.parse(stdout) as NetemRawData;
    const interfacesData = rawData[node.name] ?? [];
    for (const item of interfacesData) {
      const parsed = parseNetemItem(item);
      if (parsed) {
        const [key, fields] = parsed;
        netemMap[key] = fields;
      }
    }
    outputChannel.info("Netem settings refreshed via JSON.");
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    vscode.window.showWarningMessage(`Failed to retrieve netem settings: ${msg}`);
    outputChannel.info(`Error executing "${showCmd}": ${msg}`);
  }

  ensureDefaults(netemMap, node);
  return netemMap;
}

function buildNetemArgs(fields: Record<string, string>): string[] {
  const netemArgs: string[] = [];
  if (fields.delay) {
    netemArgs.push(`--delay ${fields.delay}`);
  }
  if (fields.jitter) {
    netemArgs.push(`--jitter ${fields.jitter}`);
  }
  if (fields.loss) {
    const numericLoss = stripPercentage(fields.loss);
    if (numericLoss !== "" && numericLoss !== "0") {
      netemArgs.push(`--loss ${numericLoss}`);
    }
  }
  if (fields.rate) {
    netemArgs.push(`--rate ${fields.rate}`);
  }
  if (fields.corruption) {
    const numericCorruption = stripPercentage(fields.corruption);
    if (numericCorruption !== "" && numericCorruption !== "0") {
      netemArgs.push(`--corruption ${numericCorruption}`);
    }
  }
  return netemArgs;
}

async function applyNetem(
  node: ClabContainerTreeNode,
  panel: vscode.WebviewPanel,
  netemData: Record<string, NetemFields>
) {
  const ops: Promise<unknown>[] = [];
  for (const [intfName, fields] of Object.entries(netemData)) {
    const netemArgs = buildNetemArgs(fields);
    if (netemArgs.length > 0) {
      const cmd = `${containerlabBinaryPath} tools netem set -n ${node.name} -i ${intfName} ${netemArgs.join(" ")} > /dev/null 2>&1`;
      ops.push(
        runCommand(
          cmd,
          `Apply netem to ${intfName}`,
          outputChannel,
          false,
          false
        )
      );
    }
  }
  if (ops.length === 0) {
    vscode.window.showInformationMessage("No parameters specified; nothing applied.");
  } else {
    try {
      await Promise.all(ops);
      vscode.window.showInformationMessage(`Applied netem settings for ${node.label}`);
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`Failed to apply settings: ${getErrorMessage(err)}`);
    }
  }
  const updated = await refreshNetemSettings(node);
  panel.webview.postMessage({ command: "updateFields", data: updated });
}

async function clearNetem(
  node: ClabContainerTreeNode,
  panel: vscode.WebviewPanel
) {
  const ops: Promise<unknown>[] = [];
  for (const ifNode of node.interfaces) {
    const norm = normalizeInterfaceName(ifNode.name);
    if (norm === "lo") {
      continue;
    }
    const cmd =
      `${containerlabBinaryPath} tools netem set -n ${node.name} -i ${norm} --delay 0s --jitter 0s --loss 0 --rate 0 --corruption 0.0000000000000001 > /dev/null 2>&1`;
    ops.push(
      runCommand(
        cmd,
        `Clear netem for ${norm}`,
        outputChannel,
        false,
        false
      )
    );
  }
  try {
    await Promise.all(ops);
    vscode.window.showInformationMessage(`Cleared netem settings for ${node.name}`);
  } catch (err: unknown) {
    vscode.window.showErrorMessage(`Failed to clear settings: ${getErrorMessage(err)}`);
  }
  const updated = await refreshNetemSettings(node);
  panel.webview.postMessage({ command: "updateFields", data: updated });
}

async function refreshPanel(
  node: ClabContainerTreeNode,
  panel: vscode.WebviewPanel
) {
  const updated = await refreshNetemSettings(node);
  panel.webview.postMessage({ command: "updateFields", data: updated });
  vscode.window.showInformationMessage("Netem settings refreshed.");
}

export async function manageNodeImpairments(
  node: ClabContainerTreeNode,
  context: vscode.ExtensionContext
) {
  if (vscode.env.remoteName === "wsl") {
    vscode.window.showWarningMessage(
      "Link impairment options are not available for WSL connections."
    );
    return;
  }

  const netemMap = await refreshNetemSettings(node);

  const panel = vscode.window.createWebviewPanel(
    "clabNodeImpairments",
    `Link Impairments: ${node.label}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const iconUri = vscode.Uri.joinPath(
    context.extensionUri,
    "resources",
    "containerlab.svg"
  );
  panel.iconPath = iconUri;

  panel.webview.html = getNodeImpairmentsHtml(
    panel.webview,
    node.name,
    netemMap,
    context.extensionUri
  );

  panel.webview.onDidReceiveMessage(async (msg: { command: string; data?: Record<string, NetemFields> }) => {
    switch (msg.command) {
      case "apply":
        if (msg.data) {
          await applyNetem(node, panel, msg.data);
        }
        break;
      case "clearAll":
        await clearNetem(node, panel);
        break;
      case "refresh":
        await refreshPanel(node, panel);
        break;
    }
  });
}

