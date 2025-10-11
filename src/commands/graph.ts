import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ClabCommand } from "./clabCommand";
import { ClabLabTreeNode } from "../treeView/common";

import { TopoViewer } from "../topoViewer";
import { getSelectedLabNode } from "../helpers/utils";


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

let currentTopoViewer: TopoViewer | undefined;
let currentTopoViewerPanel: vscode.WebviewPanel | undefined;
const activeTopoViewers: Set<TopoViewer> = new Set();

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

function findActiveViewer(labPath: string, labName: string): TopoViewer | undefined {
  for (const openViewer of activeTopoViewers) {
    if (openViewer.currentPanel &&
        (openViewer.lastYamlFilePath === labPath || openViewer.currentLabName === labName)) {
      return openViewer;
    }
  }
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

  // Derive the lab name for matching existing viewers
  const labName =
    node?.name ||
    (labPath
      ? path.basename(labPath).replace(/\.clab\.(yml|yaml)$/i, '')
      : 'Unknown Lab');

  // Check if a TopoViewer for this lab is already open
  const existingViewer = findActiveViewer(labPath, labName);
  if (existingViewer) {
    setCurrentTopoViewer(existingViewer);
    existingViewer.currentPanel!.reveal();
    vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);
    return;
  }

  // 1) create a new TopoViewer
  const viewer = new TopoViewer(context);

  // 2) store the viewer in the global variable
  setCurrentTopoViewer(viewer);

  try {
    await viewer.createWebviewPanel(
      context,
      labPath ? vscode.Uri.file(labPath) : vscode.Uri.parse(''),
      labName,
      isViewMode
    );
    currentTopoViewerPanel = (viewer as any).currentPanel;

    if (!currentTopoViewerPanel) {
      return;
    }

    // 5) Set context so reload button can appear
    vscode.commands.executeCommand('setContext', 'isTopoviewerActive', true);

    // 6) Track disposal
    currentTopoViewerPanel.onDidDispose(() => {
      setCurrentTopoViewer(undefined);
      vscode.commands.executeCommand('setContext', 'isTopoviewerActive', false);
    });

  } catch (error) {
    console.error(error);
  }
}


/**
 * Graph Lab (TopoViewer Reload)
 */
export async function graphTopoviewerReload() {
  // 1) If there's no panel, show an error
  if (!currentTopoViewerPanel) {
    vscode.window.showErrorMessage("No active TopoViewer panel to reload.");
    return;
  }

  // 2) If there's no viewer, also show an error
  if (!currentTopoViewer) {
    vscode.window.showErrorMessage("No active TopoViewer instance.");
    return;
  }

  // 3) Now call updatePanelHtml on the existing panel (don't bypass mode switch check for manual reload)
  await currentTopoViewer.updatePanelHtml(currentTopoViewerPanel);
}

/**
 * Get the current TopoViewer instance
 */
export function getCurrentTopoViewer(): TopoViewer | undefined {
  return currentTopoViewer;
}

export function setCurrentTopoViewer(viewer: TopoViewer | undefined) {
  currentTopoViewer = viewer;
  if (viewer) {
    currentTopoViewerPanel = (viewer as any).currentPanel;
    activeTopoViewers.add(viewer);

    // Set up disposal handler to remove from active set
    if (currentTopoViewerPanel) {
      currentTopoViewerPanel.onDidDispose(() => {
        activeTopoViewers.delete(viewer);
      });
    }
  } else {
    currentTopoViewerPanel = undefined;
  }
}

/**
 * Notifies the current active topoviewer about successful command completion
 * This should ONLY be called after a containerlab command has successfully completed
 */
export async function notifyCurrentTopoViewerOfCommandSuccess(commandType: 'deploy' | 'destroy' | 'redeploy') {
  // Only notify the current active TopoViewer
  if (!currentTopoViewer || !currentTopoViewerPanel) {
    return;
  }

  try {
    // Determine the new state based on the command
    const newDeploymentState = commandType === 'destroy' ? 'undeployed' : 'deployed';

    if (typeof (currentTopoViewer as any).refreshAfterExternalCommand === 'function') {
      await (currentTopoViewer as any).refreshAfterExternalCommand(newDeploymentState);
    } else if (currentTopoViewer.updatePanelHtml) {
      // Fallback to legacy behaviour
      currentTopoViewer.deploymentState = newDeploymentState;
      currentTopoViewer.isViewMode = newDeploymentState === 'deployed';
      await currentTopoViewer.updatePanelHtml(currentTopoViewerPanel);
    }
  } catch (error) {
    console.error(`Failed to update topoviewer after ${commandType}:`, error);
  }
}
