import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { getInspectHtml } from "../webview/inspectHtml";
import { ClabLabTreeNode } from "../treeView/common";
import { getSudo } from "../utils";
import { outputChannel } from "../extension"; // Import outputChannel for logging

const execAsync = promisify(exec);

// Store the current panel and context for refresh functionality
let currentPanel: vscode.WebviewPanel | undefined;
let currentContext: {
  type: 'all' | 'single';
  node?: ClabLabTreeNode;
  extensionUri: vscode.Uri;
} | undefined;

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
    const command = `${sudoPrefix}containerlab inspect -r ${runtime} --all --details --format json`;
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

    // Store context for refresh
    currentContext = {
      type: 'all',
      extensionUri: context.extensionUri
    };

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
    const command = `${sudoPrefix}containerlab inspect -r ${runtime} -t ${labPathEscaped} --details --format json`;
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

    // Store context for refresh
    currentContext = {
      type: 'single',
      node: node,
      extensionUri: context.extensionUri
    };

    showInspectWebview(normalizedContainers, `Inspect - ${node.label}`, context.extensionUri);

  } catch (err: any) {
    outputChannel.appendLine(`[Inspect Command]: Failed to inspect lab ${node.label}: ${err.message || err}`);
    vscode.window.showErrorMessage(`Failed to inspect lab ${node.label}: ${err.message || err}`);
    // Optionally show an empty webview on error
    // showInspectWebview([], `Inspect - ${node.label} (Error)`, context.extensionUri);
  }
}

// showInspectWebview now sets up message handling
function showInspectWebview(containers: any[], title: string, extensionUri: vscode.Uri) {
  if (currentPanel) {
    currentPanel.title = title;
    currentPanel.webview.html = getInspectHtml(currentPanel.webview, containers, extensionUri);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "clabInspect",
    title,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  currentPanel = panel;

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async message => {
      switch (message.command) {
        case 'refresh':
          outputChannel.appendLine('[Inspect Command]: Refresh requested');
          if (currentContext) {
            if (currentContext.type === 'all') {
              await inspectAllLabs({ extensionUri: currentContext.extensionUri } as vscode.ExtensionContext);
            } else if (currentContext.type === 'single' && currentContext.node) {
              await inspectOneLab(currentContext.node, { extensionUri: currentContext.extensionUri } as vscode.ExtensionContext);
            }
          }
          break;

        case 'openPort': {
          outputChannel.appendLine(`[Inspect Command]: Open port requested - ${message.containerName}:${message.port}`);
          const url = `http://localhost:${message.port}`;
          vscode.env.openExternal(vscode.Uri.parse(url));
          vscode.window.showInformationMessage(`Opening port ${message.port} in browser`);
          break;
        }
      }
    },
    undefined,
    []
  );

  // Clean up when panel is closed
  panel.onDidDispose(() => {
    if (currentPanel === panel) {
      currentPanel = undefined;
      currentContext = undefined;
    }
  });

  // The getInspectHtml function should work correctly as long as each container object
  // in the `containers` array has `lab_name` or `labPath`.
  panel.webview.html = getInspectHtml(panel.webview, containers, extensionUri);
}