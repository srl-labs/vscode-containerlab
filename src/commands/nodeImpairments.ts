import * as vscode from "vscode";
import { ClabContainerTreeNode } from "../clabTreeDataProvider";
import { getNodeImpairmentsHtml } from "../webview/nodeImpairmentsHtml";
import { runWithSudo } from "../helpers/containerlabUtils";
import { exec } from "child_process";
import { promisify } from "util";
import { outputChannel } from "../extension";

const execAsync = promisify(exec);

/**
 * Strips ANSI escape sequences from a string.
 */
function stripAnsi(input: string): string {
  return input
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1B[@-Z\\-_]/g, "");
}

/**
 * If the value equals "N/A" (case insensitive) then return "0".
 */
function cleanValue(value: string): string {
  return value.trim().toUpperCase() === "N/A" ? "0" : value.trim();
}

/**
 * For percentage values (loss, corruption), remove any trailing "%" sign.
 */
function cleanPercentage(value: string): string {
  const cleaned = cleanValue(value);
  return cleaned.endsWith("%") ? cleaned.slice(0, -1).trim() : cleaned;
}

/**
 * Normalizes an interface name by removing any parenthesized content.
 * For example, "mgmt0-0 (mgmt0.0)" becomes "mgmt0-0".
 */
function normalizeInterfaceName(iface: string): string {
  return iface.replace(/\s*\(.*\)$/, "").trim();
}

/**
 * Parses the output of `containerlab tools netem show` (a text table) and returns
 * an object mapping each (normalized) interface name to its netem parameters.
 *
 * For the "loss" and "corruption" fields the trailing "%" sign is removed so that
 * the value can be used in an input field of type "number".
 *
 * @param output The raw stdout from the netem show command.
 */
function parseNetemShowOutput(
  output: string
): Record<
  string,
  { delay: string; jitter: string; loss: string; rate: string; corruption: string }
> {
  const cleanOutput = stripAnsi(output);
  outputChannel.appendLine("[DEBUG] Raw netem show output:");
  outputChannel.appendLine(output);
  outputChannel.appendLine("[DEBUG] Cleaned netem output:");
  outputChannel.appendLine(cleanOutput);

  // Select only lines beginning with the vertical bar "│"
  const tableRows = cleanOutput
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("│"));

  outputChannel.appendLine("[DEBUG] Table rows found:");
  tableRows.forEach((row, idx) =>
    outputChannel.appendLine(`${idx}: ${row}`)
  );

  if (tableRows.length < 2) {
    outputChannel.appendLine("[DEBUG] Not enough table rows found.");
    return {};
  }

  // Remove the header row (assumed to be the first row)
  const dataRows = tableRows.slice(1);
  const result: Record<
    string,
    { delay: string; jitter: string; loss: string; rate: string; corruption: string }
  > = {};

  dataRows.forEach((row) => {
    // Split the row by "│" and filter out empty strings.
    const cols = row.split("│").map((s) => s.trim()).filter((s) => s.length > 0);
    if (cols.length !== 6) {
      outputChannel.appendLine(
        `[DEBUG] Skipping row (expected 6 columns but got ${cols.length}): ${row}`
      );
      return;
    }
    const rawIface = cols[0];
    const iface = normalizeInterfaceName(rawIface);
    const parsed = {
      delay: cleanValue(cols[1]),
      jitter: cleanValue(cols[2]),
      loss: cleanPercentage(cols[3]),
      rate: cleanValue(cols[4]),
      corruption: cleanPercentage(cols[5]),
    };

    // If the interface key already exists, merge non-empty values.
    if (result[iface]) {
      for (const field of (["delay", "jitter", "loss", "rate", "corruption"] as Array<keyof typeof parsed>)) {
        if (!result[iface][field] && parsed[field]) {
          result[iface][field] = parsed[field];
        }
      }
      outputChannel.appendLine(
        `[DEBUG] Merged duplicate row for ${iface}: ${JSON.stringify(result[iface])}`
      );
    } else {
      result[iface] = parsed;
      outputChannel.appendLine(
        `[DEBUG] Parsed ${iface}: ${JSON.stringify(parsed)}`
      );
    }
  });

  outputChannel.appendLine("[DEBUG] Final parsed netem settings:");
  outputChannel.appendLine(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Manage link impairments for *all* interfaces of a node.
 * Includes a refresh button to re-read the netem settings.
 */
export async function manageNodeImpairments(
  node: ClabContainerTreeNode,
  context: vscode.ExtensionContext
) {
  // 1) Gather the node's interfaces.
  const allIfs = node.interfaces;

  // Function to re-read and update netem settings.
  async function refreshNetemSettings() {
    const showCmd = `containerlab tools netem show -n ${node.name}`;
    let netemMap: Record<string, any> = {};
    try {
      const { stdout } = await execAsync(showCmd);
      netemMap = parseNetemShowOutput(stdout);
    } catch (err: any) {
      vscode.window.showWarningMessage(
        `Failed to retrieve current netem settings: ${err.message}`
      );
      outputChannel.appendLine(`[DEBUG] Error executing "${showCmd}": ${err}`);
    }
    // Ensure every interface is represented; if not, default to "0".
    allIfs.forEach((ifNode) => {
      const norm = normalizeInterfaceName(ifNode.name);
      if (!netemMap[norm]) {
        netemMap[norm] = { delay: "0", jitter: "0", loss: "0", rate: "0", corruption: "0" };
        outputChannel.appendLine(`[DEBUG] Defaulting values for interface ${norm}`);
      }
    });
    return netemMap;
  }

  // Initially, get the settings.
  const netemMap = await refreshNetemSettings();

  // 2) Create the WebView with the pre-populated netem settings.
  const panel = vscode.window.createWebviewPanel(
    "clabNodeImpairments",
    `Link Impairments: ${node.label}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getNodeImpairmentsHtml(
    panel.webview,
    node.name, // or node.label as identifier
    netemMap,
    context.extensionUri
  );

  // 3) Listen for messages from the WebView.
  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.command) {
      case "apply": {
        // msg.data is an object mapping interface names to netem parameters.
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
            outputChannel.appendLine(`[DEBUG] Executing: ${cmd}`);
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
          vscode.window.showInformationMessage(
            "No netem parameters were specified; nothing to apply."
          );
          return;
        }

        try {
          await Promise.all(ops);
          vscode.window.showInformationMessage(
            `Applied netem parameters for node: ${node.label}`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to apply netem: ${err.message}`);
        }
        break;
      }
      case "clearAll": {
        // Clear all netem settings.
        const ops: Promise<any>[] = [];
        for (const ifNode of allIfs) {
          const norm = normalizeInterfaceName(ifNode.name);
          const cmd = `containerlab tools netem set -n ${node.name} -i ${norm}`;
          outputChannel.appendLine(`[DEBUG] Executing clear: ${cmd}`);
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
          vscode.window.showInformationMessage(
            `Cleared netem settings for node: ${node.name}`
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to clear netem: ${err.message}`);
        }
        break;
      }
      case "refresh": {
        // Refresh netem settings.
        const updated = await refreshNetemSettings();
        panel.webview.postMessage({ command: "updateFields", data: updated });
        vscode.window.showInformationMessage("Netem settings refreshed.");
        break;
      }
    }
  });
}
