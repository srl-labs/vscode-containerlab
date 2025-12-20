import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";


import { ClabLabTreeNode } from "../treeView/common";
import { ReactTopoViewer, ReactTopoViewerProvider } from "../reactTopoViewer";
import { getSelectedLabNode } from "../utils/utils";

import { ClabCommand } from "./clabCommand";


/**
 * Core routine for generating draw.io graphs.
 */
async function runGraphDrawIO(node: ClabLabTreeNode | undefined, layout: "horizontal" | "vertical") {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const graphCmd = new ClabCommand("graph", node);

  // Figure out the .drawio filename
  if (!node.labPath.absolute) {
    vscode.window.showErrorMessage("No lab path found. Cannot open .drawio file.");
    return;
  }
  const labPath = node.labPath.absolute;
  const drawioPath = labPath.replace(/\.(ya?ml)$/i, ".drawio");
  const drawioUri = vscode.Uri.file(drawioPath);

  // Read the default theme from configuration.
  const config = vscode.workspace.getConfiguration("containerlab");
  const drawioTheme = config.get<string>("drawioDefaultTheme", "nokia_modern");

  // Wait for containerlab to finish generating the .drawio file,
  // passing the theme argument.
    await graphCmd
      .run(["--drawio", "--drawio-args", `--theme ${drawioTheme} --layout ${layout}`])
      .then(() => {
        // Verify the file exists.
        if (!fs.existsSync(drawioPath)) {
          vscode.window.showErrorMessage(
            `Containerlab failed to generate .drawio file for lab: ${node.name}.`
          );
          return;
        }
        vscode.commands.executeCommand("vscode.open", drawioUri);
      });
}

export async function graphDrawIOHorizontal(node?: ClabLabTreeNode) {
  await runGraphDrawIO(node, "horizontal");
}

export async function graphDrawIOVertical(node?: ClabLabTreeNode) {
  await runGraphDrawIO(node, "vertical");
}

/**
 * Graph Lab (draw.io, Interactive) => always run in Terminal
 */
export async function graphDrawIOInteractive(node?: ClabLabTreeNode) {
  node = await getSelectedLabNode(node);
  if (!node) {
    return;
  }

  const graphCmd = new ClabCommand("graph", node, undefined, true, "Containerlab Graph");

  graphCmd.run(["--drawio", "--drawio-args", `"-I"`]);
}


/**
 * Graph Lab (TopoViewer)
 */

let currentTopoViewer: ReactTopoViewer | undefined;

type LifecycleCommandType = 'deploy' | 'destroy' | 'redeploy';

function resolveLabInfo(node?: ClabLabTreeNode): { labPath: string; isViewMode: boolean } | undefined {
  if (node && node.contextValue &&
      (node.contextValue === 'containerlabLabDeployed' ||
       node.contextValue === 'containerlabLabDeployedFavorite')) {
    return { labPath: node.labPath?.absolute || '', isViewMode: true };
  }

  if (node?.labPath?.absolute) {
    return { labPath: node.labPath.absolute, isViewMode: false };
  }

  const editor = vscode.window.activeTextEditor;
  const topoFileRegex = /\.clab\.(yaml|yml)$/;
  if (editor && topoFileRegex.test(editor.document.uri.fsPath)) {
    return { labPath: editor.document.uri.fsPath, isViewMode: false };
  }

  vscode.window.showErrorMessage('No lab node or topology file selected');
  return undefined;
}

export async function graphTopoviewer(node?: ClabLabTreeNode, context?: vscode.ExtensionContext) {
  // Get node if not provided
  node = await getSelectedLabNode(node);

  const labInfo = resolveLabInfo(node);
  if (!labInfo) {
    return;
  }
  const { labPath, isViewMode } = labInfo;

  if (!context) {
    vscode.window.showErrorMessage('Extension context not available');
    return;
  }

  // Derive the lab name
  const labName =
    node?.name ||
    (labPath
      ? path.basename(labPath).replace(/\.clab\.(yml|yaml)$/i, '')
      : 'Unknown Lab');

  // Use the provider to create/get the viewer
  const provider = ReactTopoViewerProvider.getInstance(context);
  const viewer = await provider.openViewer(labPath, labName, isViewMode);

  currentTopoViewer = viewer;

  // Set context for any UI state
  vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);

  // Handle disposal
  if (viewer.currentPanel) {
    viewer.currentPanel.onDidDispose(() => {
      currentTopoViewer = undefined;
      vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
    });
  }
}

export function getCurrentTopoViewer(): ReactTopoViewer | undefined {
  return currentTopoViewer;
}

async function postLifecycleStatus(
  commandType: LifecycleCommandType,
  status: 'success' | 'error',
  errorMessage?: string
): Promise<void> {
  if (!currentTopoViewer?.currentPanel) {
    return;
  }

  try {
    await currentTopoViewer.currentPanel.webview.postMessage({
      type: 'lab-lifecycle-status',
      data: { commandType, status, errorMessage }
    });
  } catch (err) {
    console.error(`Failed to publish lifecycle status (${status}) for ${commandType}:`, err);
  }
}

/**
 * Notifies the current active topoviewer about successful command completion
 * This should ONLY be called after a containerlab command has successfully completed
 */
export async function notifyCurrentTopoViewerOfCommandSuccess(commandType: LifecycleCommandType) {
  if (!currentTopoViewer?.currentPanel) {
    return;
  }

  // Determine the new state based on the command
  const newDeploymentState = commandType === 'destroy' ? 'undeployed' : 'deployed';

  try {
    if (typeof currentTopoViewer.refreshAfterExternalCommand === 'function') {
      await currentTopoViewer.refreshAfterExternalCommand(newDeploymentState);
    }
  } catch (error) {
    console.error(`Failed to update TopoViewer after ${commandType}:`, error);
  } finally {
    await postLifecycleStatus(commandType, 'success');
  }
}

export async function notifyCurrentTopoViewerOfCommandFailure(
  commandType: LifecycleCommandType,
  error: unknown
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  await postLifecycleStatus(commandType, 'error', errorMessage);
}
