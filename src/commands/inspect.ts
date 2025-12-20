import * as vscode from "vscode";
import { getInspectHtml } from "../webview/inspectHtml";
import { ClabLabTreeNode } from "../treeView/common";
import { outputChannel } from "../globals";
import * as inspector from "../treeView/inspector";

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
    outputChannel.appendLine(`[Inspect Command]: Refreshing via containerlab events cache`);

    await inspector.update();
    const parsed = inspector.rawInspectData;

    const normalizedContainers = normalizeInspectOutput(parsed);

    // Store context for refresh
    currentContext = {
      type: 'all',
      extensionUri: context.extensionUri
    };

    showInspectWebview(normalizedContainers, "Inspect - All Labs", context.extensionUri);

  } catch (err: any) {
    outputChannel.appendLine(`[Inspect Command]: Failed to refresh inspect data: ${err.message || err}`);
    vscode.window.showErrorMessage(`Failed to refresh inspect data: ${err.message || err}`);
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
    outputChannel.appendLine(`[Inspect Command]: Refreshing lab ${node.label} via events cache`);

    await inspector.update();

    const parsed = inspector.rawInspectData || {};
    const filtered: Record<string, any> = {};

    for (const [labName, containers] of Object.entries(parsed)) {
      if (!Array.isArray(containers)) {
        continue;
      }
      const topoFile = (containers as any)['topo-file'];
      if ((node.name && labName === node.name) || topoFile === node.labPath.absolute) {
        filtered[labName] = containers;
        break;
      }
    }

    const normalizedContainers = normalizeInspectOutput(Object.keys(filtered).length ? filtered : []);

    currentContext = {
      type: 'single',
      node: node,
      extensionUri: context.extensionUri
    };

    showInspectWebview(normalizedContainers, `Inspect - ${node.label}`, context.extensionUri);

  } catch (err: any) {
    outputChannel.appendLine(`[Inspect Command]: Failed to refresh lab ${node.label}: ${err.message || err}`);
    vscode.window.showErrorMessage(`Failed to refresh lab ${node.label}: ${err.message || err}`);
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

  const iconUri = vscode.Uri.joinPath(
    extensionUri,
    'resources',
    'containerlab.svg'
  );
  panel.iconPath = iconUri;

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
