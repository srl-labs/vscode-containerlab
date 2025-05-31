import * as vscode from "vscode";
import { ClabContainerTreeNode } from "../treeView/common";
import { getNodeImpairmentsHtml } from "../webview/nodeImpairmentsHtml";
import { runWithSudo } from "../helpers/containerlabUtils";
import { outputChannel } from "../extension";

/**
 * Normalizes an interface name by removing any parenthesized content.
 * For example, "mgmt0-0 (mgmt0.0)" becomes "mgmt0-0".
 */
function normalizeInterfaceName(iface: string): string {
  return iface.replace(/\s*\(.*\).*$/, "").trim();
}

/**
 * Converts a user-entered string like "5", "5%", "5.0%" into a numeric string
 * suitable for containerlab. Example: "5%", "5.0%" -> "5", "5.0" => means 5%.
 */
function stripPercentage(val: string): string {
  // Remove trailing % if present
  return val.replace(/\s*%$/, "").trim();
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
    vscode.window.showWarningMessage(
      "Link impairment options are not available for WSL connections."
    );
    return;
  }

  const allIfs = node.interfaces;

  // Function to re-read and update netem settings via JSON output.
  async function refreshNetemSettings() {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    const showCmd = `containerlab tools -r ${runtime} netem show -n ${node.name} --format json`;
    let netemMap: Record<
      string,
      {
        delay: string;
        jitter: string;
        loss: string;
        rate: string;
        corruption: string;
      }
    > = {};

    try {
      const stdoutResult = await runWithSudo(
        showCmd,
        `Retrieving netem settings for ${node.name}`,
        outputChannel,
        "containerlab",
        true
      );
      if (!stdoutResult) {
        throw new Error("No output from netem show command");
      }
      const stdout = stdoutResult as string;
      const rawData = JSON.parse(stdout);
      // The JSON format is an object keyed by the node's name.
      const interfacesData = rawData[node.name] || [];

      interfacesData.forEach((item: any) => {
        // Skip the "lo" interface entirely
        if (item.interface === "lo") {
          return;
        }

        const key = normalizeInterfaceName(item.interface);

        // Containerlab returns e.g. "1s" for delay/jitter or empty string if none
        const delayValue = item.delay && item.delay.trim() !== "" ? item.delay : "0ms";
        const jitterValue = item.jitter && item.jitter.trim() !== "" ? item.jitter : "0ms";

        // containerlab returns numeric packet_loss, rate, corruption
        const lossValue =
          typeof item.packet_loss === "number" && item.packet_loss > 0
            ? `${item.packet_loss}%`
            : "0.00%";

        const rateValue =
          typeof item.rate === "number" && item.rate > 0 ? String(item.rate) : "0";

        const corruptionValue =
          typeof item.corruption === "number" && item.corruption > 0
            ? `${item.corruption}%`
            : "0.00%";

        netemMap[key] = {
          delay: delayValue,
          jitter: jitterValue,
          loss: lossValue,
          rate: rateValue,
          corruption: corruptionValue,
        };
      });
      outputChannel.appendLine("[INFO] Netem settings refreshed via JSON.");
    } catch (err: any) {
      vscode.window.showWarningMessage(
        `Failed to retrieve netem settings: ${err.message}`
      );
      outputChannel.appendLine(`[INFO] Error executing "${showCmd}": ${err.message}`);
    }

    // Ensure every interface is represented (excluding "lo"); default baseline values if missing.
    allIfs.forEach((ifNode) => {
      const norm = normalizeInterfaceName(ifNode.name);
      if (norm === "lo") {
        return; // skip local loopback
      }
      if (!netemMap[norm]) {
        netemMap[norm] = {
          delay: "0ms",
          jitter: "0ms",
          loss: "0.00%",
          rate: "0",
          corruption: "0.00%",
        };
        outputChannel.appendLine(`[INFO] Defaulted values for ${norm}.`);
      }
    });
    return netemMap;
  }

  // Initial map
  const netemMap = await refreshNetemSettings();

  // Create a webview panel
  const panel = vscode.window.createWebviewPanel(
    "clabNodeImpairments",
    `Link Impairments: ${node.label}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  const iconUri = vscode.Uri.joinPath(
    context.extensionUri,
    'resources',
    'containerlab.svg'
  );
  panel.iconPath = iconUri;

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

          // Delay
          if (fields.delay) {
            netemArgs.push(`--delay ${fields.delay}`);
          }
          // Jitter
          if (fields.jitter) {
            netemArgs.push(`--jitter ${fields.jitter}`);
          }
          // Loss (strip out % if present)
          if (fields.loss) {
            const numericLoss = stripPercentage(fields.loss);
            // Only add if user actually set a positive or non-zero
            if (numericLoss !== "" && numericLoss !== "0") {
              netemArgs.push(`--loss ${numericLoss}`);
            }
          }
          // Rate
          if (fields.rate) {
            netemArgs.push(`--rate ${fields.rate}`);
          }
          // Corruption (strip out % if present)
          if (fields.corruption) {
            const numericCorruption = stripPercentage(fields.corruption);
            if (numericCorruption !== "" && numericCorruption !== "0") {
              netemArgs.push(`--corruption ${numericCorruption}`);
            }
          }

          if (netemArgs.length > 0) {
            // Minimal change: Append redirection to suppress command output.
            const cmd = `containerlab tools netem set -n ${node.name} -i ${intfName} ${netemArgs.join(" ")} > /dev/null 2>&1`;
            ops.push(
              runWithSudo(
                cmd,
                `Applying netem on ${node.name}/${intfName}`,
                outputChannel,
                "containerlab"
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
        // Refresh the settings in the webview after apply
        const updated = await refreshNetemSettings();
        panel.webview.postMessage({ command: "updateFields", data: updated });
        break;
      }

      case "clearAll": {
        const ops: Promise<any>[] = [];
        for (const ifNode of allIfs) {
          const norm = normalizeInterfaceName(ifNode.name);
          // Skip "lo"
          if (norm === "lo") {
            continue;
          }
          // Minimal change: Append output redirection.
          const cmd = `containerlab tools netem set -n ${node.name} -i ${norm} --delay 0s --jitter 0s --loss 0 --rate 0 --corruption 0.0000000000000001 > /dev/null 2>&1`;
          ops.push(
            runWithSudo(
              cmd,
              `Clearing netem on ${node.name}/${norm}`,
              outputChannel,
              "containerlab"
            )
          );
        }
        try {
          await Promise.all(ops);
          vscode.window.showInformationMessage(`Cleared netem settings for ${node.name}`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to clear settings: ${err.message}`);
        }
        // Refresh the settings in the webview after clear all
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
