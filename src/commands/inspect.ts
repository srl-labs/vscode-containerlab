import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { getInspectHtml } from "../webview/inspectHtml";
import { ClabLabTreeNode } from "../treeView/common";
import { getSudo } from "../utils";
import { outputChannel } from "../extension"; // Import outputChannel for logging

const execAsync = promisify(exec);

// Helper function to normalize inspect data to a flat container list
function normalizeInspectOutput(parsedData: any): any[] {
    let containers: any[] = [];
    if (parsedData && Array.isArray(parsedData.containers)) {
        // Old format: Top-level "containers" array
        outputChannel.appendLine("[Inspect Command]: Detected old inspect format.");
        containers = parsedData.containers;
    } else if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)) {
        // New format: Object with lab names as keys, or potentially single lab object
        outputChannel.appendLine("[Inspect Command]: Detected new inspect format (grouped or single lab object).");
        for (const key in parsedData) {
            // Check if the value associated with the key is an array (list of containers)
            if (Array.isArray(parsedData[key])) {
                containers.push(...parsedData[key]);
            } else {
                // Log if we find unexpected data structure
                outputChannel.appendLine(`[Inspect Command]: Found non-array value for key '${key}' in inspect output.`);
            }
        }
    } else {
        outputChannel.appendLine("[Inspect Command]: Inspect data is empty or in an unexpected format.");
    }
    return containers;
}


export async function inspectAllLabs(context: vscode.ExtensionContext) {
  try {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    const sudoPrefix = getSudo();
    const command = `${sudoPrefix}containerlab inspect -r ${runtime} --all --format json`;
    outputChannel.appendLine(`[Inspect Command]: Running: ${command}`);

    const { stdout, stderr } = await execAsync(command, { timeout: 15000 }); // Added timeout

    if (stderr) {
        outputChannel.appendLine(`[Inspect Command]: stderr from inspect --all: ${stderr}`);
    }
    if (!stdout) {
        outputChannel.appendLine(`[Inspect Command]: No stdout from inspect --all.`);
        showInspectWebview([], "Inspect - All Labs", context.extensionUri); // Show empty view
        return;
    }

    const parsed = JSON.parse(stdout);

    // Normalize the data (handles both old and new formats)
    const normalizedContainers = normalizeInspectOutput(parsed);

    showInspectWebview(normalizedContainers, "Inspect - All Labs", context.extensionUri);

  } catch (err: any) {
    outputChannel.appendLine(`[Inspect Command]: Failed to run containerlab inspect --all: ${err.message || err}`);
    vscode.window.showErrorMessage(`Failed to run containerlab inspect --all: ${err.message || err}`);
    // Optionally show an empty webview on error
    // showInspectWebview([], "Inspect - All Labs (Error)", context.extensionUri);
  }
}

export async function inspectOneLab(node: ClabLabTreeNode, context: vscode.ExtensionContext) {
  if (!node.labPath.absolute) {
    vscode.window.showErrorMessage("No lab path found for this lab.");
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");
    const sudoPrefix = getSudo();
    // Ensure lab path is quoted correctly for the shell
    const labPathEscaped = `"${node.labPath.absolute.replace(/"/g, '\\"')}"`;
    const command = `${sudoPrefix}containerlab inspect -r ${runtime} -t ${labPathEscaped} --format json`;
    outputChannel.appendLine(`[Inspect Command]: Running: ${command}`);

    const { stdout, stderr } = await execAsync(command, { timeout: 15000 }); // Added timeout

    if (stderr) {
        outputChannel.appendLine(`[Inspect Command]: stderr from inspect -t: ${stderr}`);
    }
    if (!stdout) {
        outputChannel.appendLine(`[Inspect Command]: No stdout from inspect -t.`);
        showInspectWebview([], `Inspect - ${node.label}`, context.extensionUri); // Show empty view
        return;
    }

    const parsed = JSON.parse(stdout);

    // Normalize the data (handles both old and new formats for single lab)
    // The normalization function should correctly handle the case where 'parsed'
    // might be {"lab_name": [...]} or potentially still {"containers": [...]}.
    const normalizedContainers = normalizeInspectOutput(parsed);

    showInspectWebview(normalizedContainers, `Inspect - ${node.label}`, context.extensionUri);

  } catch (err: any) {
    outputChannel.appendLine(`[Inspect Command]: Failed to inspect lab ${node.label}: ${err.message || err}`);
    vscode.window.showErrorMessage(`Failed to inspect lab ${node.label}: ${err.message || err}`);
    // Optionally show an empty webview on error
    // showInspectWebview([], `Inspect - ${node.label} (Error)`, context.extensionUri);
  }
}

// showInspectWebview remains unchanged as getInspectHtml already groups by lab_name/labPath
function showInspectWebview(containers: any[], title: string, extensionUri: vscode.Uri) {
  const panel = vscode.window.createWebviewPanel(
    "clabInspect",
    title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  // The getInspectHtml function should work correctly as long as each container object
  // in the `containers` array has `lab_name` or `labPath`.
  panel.webview.html = getInspectHtml(panel.webview, containers, extensionUri);
}