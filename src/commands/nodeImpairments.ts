// ./src/commands/nodeImpairments.ts
import * as vscode from "vscode";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";
import { getNodeImpairmentsHtml } from "../webview/nodeImpairmentsHtml";
import { runWithSudo } from "../helpers/containerlabUtils";
import { exec } from "child_process";
import { promisify } from "util";
import { outputChannel } from "../extension";

const execAsync = promisify(exec);

/**
 * Normalizes an interface name by removing any parenthesized content.
 * For example, "mgmt0-0 (mgmt0.0)" becomes "mgmt0-0".
 */
function normalizeInterfaceName(iface: string): string {
  return iface.replace(/\s*\(.*\)$/, "").trim();
}

/**
 * Manage link impairments for all interfaces of a node.
 * Includes a refresh button to re-read the netem settings.
 */
export async function manageNodeImpairments(
  node: ClabContainerTreeNode,
  context: vscode.ExtensionContext
) {
  // Do not show impairment options in WSL connections.
  if (vscode.env.remoteName === "wsl") {
    vscode.window.showWarningMessage("Link impairment options are not available for WSL connections.");
    return;
  }

  const allIfs = node.interfaces;

  // Function to re-read and update netem settings via JSON output.
  async function refreshNetemSettings() {
    // Use JSON output instead of table format.
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    const showCmd = `containerlab tools -r ${runtime} netem show -n ${node.name} --format json`;
    let netemMap: Record<string, { delay: string; jitter: string; loss: string; rate: string; corruption: string }> = {};
    try {
      const { stdout } = await execAsync(showCmd);
      const rawData = JSON.parse(stdout);
      // The JSON format now is an object keyed by lab name.
      const interfacesData = rawData[node.name] || [];
      // Convert array to mapping keyed by normalized interface name.
      interfacesData.forEach((item: any) => {
        const key = normalizeInterfaceName(item.interface);
        netemMap[key] = {
          delay: !item.delay || item.delay === "N/A" ? "0s" : item.delay,
          jitter: !item.jitter || item.jitter === "N/A" ? "0s" : item.jitter,
          loss: !item.packet_loss || item.packet_loss === "N/A" ? "0.00%" : item.packet_loss,
          rate: !item.rate || item.rate === "N/A" ? "0" : item.rate,
          corruption: !item.corruption || item.corruption === "N/A" ? "0.00%" : item.corruption,
        };
      });
      outputChannel.appendLine("[INFO] Netem settings refreshed via JSON.");
    } catch (err: any) {
      vscode.window.showWarningMessage(
        `Failed to retrieve netem settings: ${err.message}`
      );
      outputChannel.appendLine(`[INFO] Error executing "${showCmd}".`);
    }
    // Ensure every interface is represented; default to default values if missing.
    allIfs.forEach((ifNode) => {
      const norm = normalizeInterfaceName(ifNode.name);
      if (!netemMap[norm]) {
        netemMap[norm] = { delay: "0s", jitter: "0s", loss: "0.00%", rate: "0", corruption: "0.00%" };
        outputChannel.appendLine(`[INFO] Defaulted values for ${norm}.`);
      }
    });
    return netemMap;
  }

  const netemMap = await refreshNetemSettings();

  const panel = vscode.window.createWebviewPanel(
    "clabNodeImpairments",
    `Link Impairments: ${node.label}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getNodeImpairmentsHtml(
    panel.webview,
    node.name,
    netemMap,
    context.extensionUri
  );

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case "apply": {
        const netemData = msg.data as Record<string, any>;
        const ops: Promise<any>[] = [];

        for (const [intfName, fields] of Object.entries(netemData)) {
          const netemArgs: string[] = [];
          if (fields.delay) netemArgs.push(`--delay ${fields.delay}`);
          if (fields.jitter) netemArgs.push(`--jitter ${fields.jitter}`);
          if (fields.loss) netemArgs.push(`--loss ${fields.loss}`);
          if (fields.rate) netemArgs.push(`--rate ${fields.rate}`);
          if (fields.corruption) netemArgs.push(`--corruption ${fields.corruption}`);

          if (netemArgs.length > 0) {
            const cmd = `containerlab tools netem set -n ${node.name} -i ${intfName} ${netemArgs.join(" ")}`;
            ops.push(
              runWithSudo(
                cmd,
                `Applying netem on ${node.name}/${intfName}`,
                vscode.window.createOutputChannel("Netem")
              )
            );
          }
        }

        if (ops.length === 0) {
          vscode.window.showInformationMessage("No parameters specified; nothing applied.");
          // Even if nothing was applied, refresh the webview.
          const updated = await refreshNetemSettings();
          panel.webview.postMessage({ command: "updateFields", data: updated });
          return;
        }

        try {
          await Promise.all(ops);
          vscode.window.showInformationMessage(`Applied netem settings for ${node.label}`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to apply settings: ${err.message}`);
        }
        // Refresh the settings in the webview after apply.
        const updated = await refreshNetemSettings();
        panel.webview.postMessage({ command: "updateFields", data: updated });
        break;
      }
      case "clearAll": {
        const ops: Promise<any>[] = [];
        for (const ifNode of allIfs) {
          const norm = normalizeInterfaceName(ifNode.name);
          const cmd = `containerlab tools netem set -n ${node.name} -i ${norm}`;
          ops.push(
            runWithSudo(
              cmd,
              `Clearing netem on ${node.name}/${norm}`,
              vscode.window.createOutputChannel("Netem")
            )
          );
        }
        try {
          await Promise.all(ops);
          vscode.window.showInformationMessage(`Cleared netem settings for ${node.name}`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to clear settings: ${err.message}`);
        }
        // Refresh the settings in the webview after clear all.
        const updated = await refreshNetemSettings();
        panel.webview.postMessage({ command: "updateFields", data: updated });
        break;
      }
      case "refresh": {
        const updated = await refreshNetemSettings();
        panel.webview.postMessage({ command: "updateFields", data: updated });
        vscode.window.showInformationMessage("Netem settings refreshed.");
        break;
      }
    }
  });
}
